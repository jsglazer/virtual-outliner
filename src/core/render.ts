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
	// Line index (entry or body) -> its owning node's 1-based level, for
	// lines that should receive indentation.
	indentLevel: Map<number, number>;
	// Entry line index -> its own level, for lines that are visible entries
	// (used for per-level spacing above the entry).
	entryLevel: Map<number, number>;
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
		let runStart: number | null = null;
		const entryLines = new Set(parsed.flat.map((n) => n.entryLine));
		for (let i = 0; i < parsed.lineCount; i++) {
			if (entryLines.has(i)) {
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

	const showLabels = viewState === 'outline' || viewState === 'both';
	for (const node of parsed.flat) {
		if (isLineHidden(hiddenLineRanges, node.entryLine)) continue;
		entryLevel.set(node.entryLine, node.level);
		if (showLabels) labels.set(node.entryLine, computeLabel(levels, node));
		indentLevel.set(node.entryLine, node.level);
	}

	if (indentBody) {
		for (const node of parsed.flat) {
			for (let line = node.ownBodyStart; line < node.ownBodyEnd; line++) {
				if (isLineHidden(hiddenLineRanges, line)) continue;
				indentLevel.set(line, node.level);
			}
		}
	}

	return { parsed, labels, indentLevel, entryLevel, hiddenLineRanges };
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
