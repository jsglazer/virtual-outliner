// Pure decision logic shared by the CM6 StateField/ViewPlugin and the
// Reading-view post-processor: given a parsed document, the current view
// state, and which node ids are collapsed, decide what to hide, what label
// to show on each visible entry line, and how each visible line should be
// indented. Isolating this from CodeMirror/DOM is what keeps it headlessly
// testable (Operating Constraint #3) — the shell's job on both sides is only
// to turn this plan into decorations or DOM edits.
//
// Collapsing a node hides everything strictly after its own entry line
// through the end of its subtree (children and all their body) while
// leaving the entry line itself visible — the standard "fold" behavior: a
// leaf's collapse hides only its own body, a parent's collapse hides its
// whole subtree, which is the same mechanism at different tree positions.

import { computeLabel } from './label';
import { parseOutline } from './parser';
import { hasParagraphFlag, isOutlineLine } from './sigil';
import type { LevelFormat, OutlineNode, ParsedOutline, ViewState } from './types';

export interface LineRange {
	from: number;
	to: number;
}

export interface RenderPlan {
	parsed: ParsedOutline;
	// Entry line index -> computed label text, for entries that are visible
	// AND the view state shows labels for (outline/both).
	labels: Map<number, string>;
	// Entry line index -> its own 1-based level, for visible entry lines.
	indentLevel: Map<number, number>;
	// Visible entry lines carrying the paragraph-break flag (`@@p text`), so
	// both views can mark the label with a ¶ — the flag itself hides with the
	// sigils, and only PDF export acts on it.
	paragraphBreak: Set<number>;
	// Body lines that OPEN a flagged entry whose own entry line is hidden —
	// Body-only view, or a collapsed ancestor. The label (and its ¶) is not on
	// screen there, so the break is marked on the first body line instead;
	// without this, Body-only view shows no sign of where the paragraphs fall.
	paragraphBreakBody: Set<number>;
	// Body line index -> its owning node's 1-based level, for body lines that
	// should be indented under their entry (only when "Indent body" is on).
	// Kept apart from indentLevel because body sits one step deeper than its
	// entry (see levelCssVars' --vo-lN-body-indent).
	bodyIndentLevel: Map<number, number>;
	// Body line index -> the line index of the entry it belongs to, for the same
	// lines as bodyIndentLevel. The shells use it to line body prose up with
	// where that entry's TEXT starts (after its label), which is only known once
	// the entry has been laid out and measured.
	bodyOwnerLine: Map<number, number>;
	// Entry line index -> its own level, for lines that are visible entries
	// (used for per-level spacing above the entry).
	entryLevel: Map<number, number>;
	// Entry line index -> whether it is currently collapsed, for visible entries
	// that have something to fold: at least one non-blank line (child entry or
	// body prose) inside their subtree. Drives the per-entry fold chevron; an
	// entry with nothing beneath it gets no chevron at all, since folding it
	// would visibly do nothing.
	foldable: Map<number, boolean>;
	// Merged, sorted, non-overlapping 0-based LINE ranges to hide entirely.
	hiddenLineRanges: LineRange[];
}

function mergeRanges(ranges: LineRange[]): LineRange[] {
	if (ranges.length === 0) return [];
	const sorted = [...ranges].sort((a, b) => a.from - b.from);
	const merged: LineRange[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (last && range.from <= last.to) {
			last.to = Math.max(last.to, range.to);
		} else {
			merged.push({ ...range });
		}
	}
	return merged;
}

export function isLineHidden(hidden: readonly LineRange[], line: number): boolean {
	// Linear scan is fine: hidden ranges are few relative to document size,
	// and this is only called during plan construction, not per keypress.
	for (const range of hidden) {
		if (line >= range.from && line < range.to) return true;
	}
	return false;
}

export function computeRenderPlan(
	body: string,
	sigilChar: string,
	levels: readonly LevelFormat[],
	viewState: ViewState,
	collapsedIds: ReadonlySet<string>,
	// The "Indent body under its outline level" setting. When false, only
	// entry lines are indented and body prose stays flush left.
	indentBody = true,
): RenderPlan {
	const parsed = parseOutline(body, sigilChar);
	const lines = body.split('\n');
	const collapseRanges: LineRange[] = [];
	for (const node of parsed.flat) {
		if (node.id !== null && collapsedIds.has(node.id) && node.subtreeEnd > node.entryLine + 1) {
			collapseRanges.push({ from: node.entryLine + 1, to: node.subtreeEnd });
		}
	}

	const viewStateRanges: LineRange[] = [];
	if (viewState === 'outline') {
		// Hide every run of non-entry (body) lines, including any preamble
		// before the first entry.
		//
		// Visibility is decided by `isOutlineLine` (sigils + the required space,
		// text OPTIONAL) rather than by the parsed nodes, which exist only for
		// entries that already have text. Enter opens a new sibling as bare
		// `@@@ ` — no text yet — so keying off `parsed.flat` classified the line
		// the user was about to type into as BODY and hid it instantly. The
		// caret was then inside an atomic hidden block with no rendered DOM
		// position, so the browser dropped it at the next visible line and the
		// following keystrokes were inserted in front of THAT entry's sigils
		// (typing "add" after an entry produced `a@@ And here` and
		// `dd@ This is level 6`, with the new `@@@` stranded).
		//
		// A blank entry has no node, so it gets no label widget or indent class
		// until its first character lands — it shows its raw sigils for that one
		// keystroke. That is the deliberate trade: visible and editable beats
		// invisible and corrupting.
		let runStart: number | null = null;
		for (let i = 0; i < parsed.lineCount; i++) {
			if (isOutlineLine(lines[i] ?? '', sigilChar)) {
				if (runStart !== null) viewStateRanges.push({ from: runStart, to: i });
				runStart = null;
			} else if (runStart === null) {
				runStart = i;
			}
		}
		if (runStart !== null) viewStateRanges.push({ from: runStart, to: parsed.lineCount });
	} else if (viewState === 'body') {
		// Hide every entry line individually (its body stays visible).
		for (const node of parsed.flat) {
			viewStateRanges.push({ from: node.entryLine, to: node.entryLine + 1 });
		}
	}

	const hiddenLineRanges = mergeRanges([...collapseRanges, ...viewStateRanges]);

	const labels = new Map<number, string>();
	const entryLevel = new Map<number, number>();
	const indentLevel = new Map<number, number>();
	const bodyIndentLevel = new Map<number, number>();
	const bodyOwnerLine = new Map<number, number>();
	const foldable = new Map<number, boolean>();
	const paragraphBreak = new Set<number>();
	const paragraphBreakBody = new Set<number>();

	const showLabels = viewState === 'outline' || viewState === 'both';
	for (const node of parsed.flat) {
		if (isLineHidden(hiddenLineRanges, node.entryLine)) {
			if (hasParagraphFlag(lines[node.entryLine] ?? '', sigilChar)) {
				for (let line = node.entryLine + 1; line < node.subtreeEnd; line++) {
					if (isLineHidden(hiddenLineRanges, line) || (lines[line] ?? '').trim() === '') continue;
					paragraphBreakBody.add(line);
					break;
				}
			}
			continue;
		}
		entryLevel.set(node.entryLine, node.level);
		if (showLabels) labels.set(node.entryLine, computeLabel(levels, node));
		indentLevel.set(node.entryLine, node.level);
		if (hasParagraphFlag(lines[node.entryLine] ?? '', sigilChar)) paragraphBreak.add(node.entryLine);
		if (hasFoldableContent(lines, node)) {
			foldable.set(node.entryLine, node.id !== null && collapsedIds.has(node.id));
		}
	}

	if (indentBody) {
		for (const node of parsed.flat) {
			for (let line = node.ownBodyStart; line < node.ownBodyEnd; line++) {
				if (isLineHidden(hiddenLineRanges, line)) continue;
				bodyIndentLevel.set(line, node.level);
				bodyOwnerLine.set(line, node.entryLine);
			}
		}
	}

	return { parsed, labels, indentLevel, bodyIndentLevel, bodyOwnerLine, entryLevel, foldable, paragraphBreak, paragraphBreakBody, hiddenLineRanges };
}

export function hasFoldableContent(lines: readonly string[], node: OutlineNode): boolean {
	for (let i = node.entryLine + 1; i < node.subtreeEnd; i++) {
		if ((lines[i] ?? '').trim() !== '') return true;
	}
	return false;
}

export function collapsibleAncestorIds(node: OutlineNode): string[] {
	const ids: string[] = [];
	let cur: OutlineNode | null = node.parent;
	while (cur) {
		if (cur.id !== null) ids.push(cur.id);
		cur = cur.parent;
	}
	return ids;
}
