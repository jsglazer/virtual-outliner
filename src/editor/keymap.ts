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

import { parseMetaDocument } from '../core/metadata';
import { addBodyLine, addSibling, demote, moveDown, moveUp, promote } from '../core/ops';
import { isOutlineLine } from '../core/sigil';
import type { EditSplice } from '../core/types';

export interface KeymapHost {
	sigilChar(view: EditorView): string;
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

function dispatchSplice(view: EditorView, host: KeymapHost, splice: EditSplice, selection?: number): boolean {
	view.dispatch({
		changes: { from: splice.from, to: splice.to, insert: splice.insert },
		selection: selection !== undefined ? { anchor: selection } : undefined,
		scrollIntoView: true,
	});
	host.resolveNow(view);
	return true;
}

// Tab / Shift-Tab / Alt-ArrowUp / Alt-ArrowDown all share the same shape:
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

function enterBinding(host: KeymapHost): (view: EditorView) => boolean {
	return (view: EditorView): boolean => {
		const line = activeLine(view);
		if (!line) return false;
		const sigil = host.sigilChar(view);
		if (!isOutlineLine(line.lineText, sigil)) return false;

		const splice = addSibling(bodyOf(view), line.lineIndex, line.col, sigil);
		if (!splice) return false; // mid-line: fall through to a normal newline

		const trailingNewline = splice.insert.endsWith('\n') ? 1 : 0;
		const cursor = splice.from + splice.insert.length - trailingNewline;
		return dispatchSplice(view, host, splice, cursor);
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

export function buildOutlineKeymap(host: KeymapHost): Extension {
	const bindings: KeyBinding[] = [
		{ key: 'Enter', run: enterBinding(host) },
		{ key: 'Mod-Enter', run: bodyLineBinding(host) },
		{ key: 'Tab', run: structuralBinding(host, demote) },
		{ key: 'Shift-Tab', run: structuralBinding(host, promote) },
		{ key: 'Alt-ArrowUp', run: structuralBinding(host, moveUp) },
		{ key: 'Alt-ArrowDown', run: structuralBinding(host, moveDown) },
	];

	return Prec.highest(keymap.of(bindings));
}
