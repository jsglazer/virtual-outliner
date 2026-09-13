// The outliner keymap: Enter / Tab / Shift-Tab / Alt-ArrowUp / Alt-ArrowDown
// at Prec.highest. Every binding's FIRST action is the active-line context
// check — cursor on an outline line, empty selection — and an immediate
// `false` (fall through to Obsidian's normal handling) when it fails
// (Decision #18; Reviewer criterion: "keymap handler has an early-exit
// return of false for non-outline contexts"). Once past that check, the
// binding calls a pure src/core/ops function on the document's BODY text
// (the metadata block is stripped first — see bodyOf below) and turns
// whatever splice comes back into exactly one CM6 transaction. No undocumented
// Obsidian internals are touched here; only CM6's own public transaction API.

import { Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { EditorView, KeyBinding } from '@codemirror/view';
import { keymap } from '@codemirror/view';

import { ID_SUFFIX_RE } from '../core/id';
import { parseMetaDocument } from '../core/metadata';
import { addBodyLine, addSibling, demote, moveDown, moveUp, ownerNodeAtLine, promote } from '../core/ops';
import { isEntryLine, isOutlineLine } from '../core/sigil';
import type { EditSplice, EnterBehavior } from '../core/types';

export interface KeymapHost {
	sigilChar(view: EditorView): string;
	enterBehavior(): EnterBehavior;
	// Recompute and apply outline decorations synchronously, bypassing the
	// docChanged debounce (livePreview.ts's EDITOR_RESOLVE_DEBOUNCE_MS). Every
	// binding below inserts or moves text right at a hidden-range boundary
	// (a sibling entry after a collapsed/hidden body run, a promoted/demoted
	// line crossing one, …) — leaving the stale pre-edit decoration set in
	// place for 200ms after one of these edits let the still-hidden run's
	// atomic block decoration swallow the new caret position, so the raw
	// sigil characters briefly rendered as literal text instead of the new
	// line appearing to have been created at all.
	resolveNow(view: EditorView): void;
}

interface ActiveLine {
	lineIndex: number;
	lineText: string;
	col: number;
}

// The metadata block always sits at true end-of-file, so `body` is always a
// leading prefix of the full document text — splices computed against body
// offsets are valid document offsets unchanged (same trick md-annotation
// uses for its end-of-file block; see src/core/metadata.ts's module doc).
function bodyOf(view: EditorView): string {
	return parseMetaDocument(view.state.doc.toString()).body;
}

// Returns null when the selection is non-empty (Decision #18 requires an
// empty selection) — every binding's first check.
function activeLine(view: EditorView): ActiveLine | null {
	const sel = view.state.selection.main;
	if (!sel.empty) return null;
	const line = view.state.doc.lineAt(sel.head);
	return { lineIndex: line.number - 1, lineText: line.text, col: sel.head - line.from };
}

// True document end (line.length) or the "visible" end — right before a
// hidden ` ^o-xxxxxxxx` id suffix — both read as end-of-line to the user,
// since nothing renders after either position (mirrors addSibling's own
// `visibleEnd` check in core/ops.ts, which exists for the same reason: any
// edit landing at the raw cursor offset instead of past the id suffix
// strands the id on its own line, visible as literal text).
function isAtVisibleEnd(line: ActiveLine): boolean {
	const idMatch = ID_SUFFIX_RE.exec(line.lineText);
	const visibleEnd = idMatch ? idMatch.index : line.lineText.length;
	return line.col === line.lineText.length || line.col === visibleEnd;
}

function dispatchSplice(view: EditorView, host: KeymapHost, splice: EditSplice, selection?: number): boolean {
	view.dispatch({
		changes: { from: splice.from, to: splice.to, insert: splice.insert },
		selection: selection !== undefined ? { anchor: selection } : undefined,
		scrollIntoView: true,
	});
	host.resolveNow(view);
	return true;
}

// Tab / Shift-Tab share the same shape (and Alt-ArrowUp/Down follow it too):
// early-exit false off an entry line, otherwise consume the key regardless
// of whether the op finds something legal to do (Decision #7 — an illegal
// demote or a boundary move is a no-op, not a leak to default key handling).
function structuralBinding(
	host: KeymapHost,
	op: (body: string, lineIndex: number, sigil: string) => EditSplice | null,
): (view: EditorView) => boolean {
	return (view: EditorView): boolean => {
		const line = activeLine(view);
		if (!line) return false;
		const sigil = host.sigilChar(view);
		if (!isOutlineLine(line.lineText, sigil)) return false;

		const splice = op(bodyOf(view), line.lineIndex, sigil);
		if (!splice) return true; // consumed no-op
		return dispatchSplice(view, host, splice);
	};
}

// Enter anywhere on an entry line: a new sibling at the end, a split mid-text
// (the tail keeps the entry's level — see addSibling), a blank entry above at
// the start of the text.
function enterBinding(host: KeymapHost): (view: EditorView) => boolean {
	return (view: EditorView): boolean => {
		const line = activeLine(view);
		if (!line) return false;
		const sigil = host.sigilChar(view);
		if (!isOutlineLine(line.lineText, sigil)) return false;

		const splice = addSibling(bodyOf(view), line.lineIndex, line.col, sigil, host.enterBehavior());
		if (!splice) return false;
		return dispatchSplice(view, host, splice, splice.cursor);
	};
}

// Moves the whole outline block (entry, body, every descendant) containing the
// caret one position up or down, keeping the caret on the same character. Works
// from a body line too, acting on the entry that body belongs to — this is what
// the "Move outline block up/down" commands call. Returns false when the caret
// is outside any block or the selection is not empty; true when the move was
// consumed, including a no-op at the edge of the outline.
export function moveBlock(view: EditorView, host: KeymapHost, direction: 'up' | 'down'): boolean {
	const line = activeLine(view);
	if (!line) return false;
	const sigil = host.sigilChar(view);
	const body = bodyOf(view);
	const node = ownerNodeAtLine(body, line.lineIndex, sigil);
	if (!node) return false;

	const splice = (direction === 'up' ? moveUp : moveDown)(body, node.entryLine, sigil);
	if (!splice) return true;
	const blockStart = view.state.doc.line(node.subtreeStart + 1).from;
	const offsetInBlock = view.state.selection.main.head - blockStart;
	const cursor = splice.movedTo !== undefined ? splice.movedTo + offsetInBlock : undefined;
	return dispatchSplice(view, host, splice, cursor);
}

// Alt-ArrowUp / Alt-ArrowDown: only on an entry line, so body text keeps
// whatever those keys do elsewhere — the commands cover moving from body.
function moveBinding(host: KeymapHost, direction: 'up' | 'down'): (view: EditorView) => boolean {
	return (view: EditorView): boolean => {
		const line = activeLine(view);
		if (!line) return false;
		const sigil = host.sigilChar(view);
		if (!isOutlineLine(line.lineText, sigil)) return false;
		// A blank entry (`@@ ` with no text yet) is not a node of its own, so the
		// block it sits in belongs to the entry above — moving that from here
		// would carry off a different block than the one the caret is on.
		if (isEntryLine(line.lineText, sigil)) moveBlock(view, host, direction);
		return true;
	};
}

// Mod-Enter (Cmd-Return on macOS, Ctrl-Return elsewhere): a plain prose line
// under the current entry instead of another entry beside it. Same early-exit
// contract as everything else here — off an outline line it returns false, so
// Obsidian's own Mod-Enter handling is untouched outside the outline.
function bodyLineBinding(host: KeymapHost): (view: EditorView) => boolean {
	return (view: EditorView): boolean => {
		const line = activeLine(view);
		if (!line) return false;
		const sigil = host.sigilChar(view);
		if (!isOutlineLine(line.lineText, sigil)) return false;

		const splice = addBodyLine(bodyOf(view), line.lineIndex, sigil);
		if (!splice) return true; // consumed no-op
		// The caret goes to the start of the line just opened, i.e. one past
		// the inserted newline.
		return dispatchSplice(view, host, splice, splice.from + splice.insert.length);
	};
}

// Shift-Enter at the end of an entry line (including its visible end, right
// before a hidden id suffix): default newline insertion has no id-suffix
// awareness and would split the line right through ` ^o-xxxxxxxx`, stranding
// it on its own visible line (the same hazard addSibling already guards
// against for plain Enter — see core/ops.ts). With nothing after the cursor
// but the id, the correctly-split result IS exactly addBodyLine's own output
// (an empty line opened right after the full entry), so this reuses it
// rather than duplicating the splice math. Anywhere else on the line — mid-
// text, or off an outline line entirely — falls through to Obsidian's normal
// Shift-Enter handling, unchanged.
function shiftEnterBinding(host: KeymapHost): (view: EditorView) => boolean {
	return (view: EditorView): boolean => {
		const line = activeLine(view);
		if (!line) return false;
		const sigil = host.sigilChar(view);
		if (!isOutlineLine(line.lineText, sigil)) return false;
		if (!isAtVisibleEnd(line)) return false; // mid-line: fall through to a normal soft break

		const splice = addBodyLine(bodyOf(view), line.lineIndex, sigil);
		if (!splice) return true; // consumed no-op
		return dispatchSplice(view, host, splice, splice.from + splice.insert.length);
	};
}

export function buildOutlineKeymap(host: KeymapHost): Extension {
	const bindings: KeyBinding[] = [
		{ key: 'Enter', run: enterBinding(host) },
		{ key: 'Shift-Enter', run: shiftEnterBinding(host) },
		{ key: 'Mod-Enter', run: bodyLineBinding(host) },
		{ key: 'Tab', run: structuralBinding(host, demote) },
		{ key: 'Shift-Tab', run: structuralBinding(host, promote) },
		{ key: 'Alt-ArrowUp', run: moveBinding(host, 'up') },
		{ key: 'Alt-ArrowDown', run: moveBinding(host, 'down') },
	];

	return Prec.highest(keymap.of(bindings));
}
