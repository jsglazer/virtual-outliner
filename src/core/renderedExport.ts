// The markdown half of exporting an outlined note through ANOTHER plugin's
// renderer (multi-exporter's PDF export, which renders with Obsidian's own
// `MarkdownRenderer.render`). That render hands post-processors no section
// info, so the Reading-view processor cannot tell which source line a block
// came from and leaves every sigil on the page. Instead, the exporter asks for
// the note's markdown rewritten here, renders that, and hands the result to
// editor/renderedExport.ts, which finds its way back to the source lines by
// the anchors this inserts.
//
// Pure and tested. What the note's current view/collapse state hides is
// dropped; every visible entry line keeps its text but loses its sigils (and
// paragraph flag, and hidden id) to an empty anchor span carrying its source
// line; comment lines never print, the same rule as the pandoc export; and a
// bare entry with no text yet (`@@ `) is dropped rather than printed raw. A
// line inside a code fence is code, and is left exactly as written.
//
// An entry line hidden by Body-only view leaves a GHOST anchor behind when its
// own body is still showing: it prints nothing, but it is how the DOM pass
// knows whose body the following prose is, and so how far to indent it.

import { nextFenceState } from './exportBody';
import { parseMetaDocument } from './metadata';
import { computeRenderPlan, isLineHidden } from './render';
import type { RenderPlan } from './render';
import { entrySegments, isCommentLine, isOutlineLine } from './sigil';
import type { LevelFormat, ViewState } from './types';

export const LINE_ATTR = 'data-vo-line';
export const GHOST_ATTR = 'data-vo-ghost';

export interface PreparedRenderedExport {
	// What the exporter should render in place of the note's own text.
	markdown: string;
	plan: RenderPlan;
	// Entry line -> that entry's level, for every parsed entry, shown or not:
	// body prose indents by its owner's level even when the owner is hidden.
	entryLevels: Map<number, number>;
	indentBody: boolean;
}

function anchor(line: number, ghost: boolean): string {
	return `<span ${LINE_ATTR}="${line}"${ghost ? ` ${GHOST_ATTR}=""` : ''}></span>`;
}

// Null when the note has no outline at all, so the exporter renders it
// untouched.
export function prepareRenderedExport(
	doc: string,
	sigilChar: string,
	levels: readonly LevelFormat[],
	viewState: ViewState,
	collapsedIds: ReadonlySet<string>,
	indentBody: boolean,
): PreparedRenderedExport | null {
	const { body } = parseMetaDocument(doc);
	const lines = body.split('\n');
	if (!lines.some((line) => isOutlineLine(line, sigilChar) || isCommentLine(line, sigilChar))) return null;

	const plan = computeRenderPlan(body, sigilChar, levels, viewState, collapsedIds, indentBody);
	const nodeAt = new Map(plan.parsed.flat.map((node) => [node.entryLine, node] as const));
	const entryLevels = new Map(plan.parsed.flat.map((node) => [node.entryLine, node.level] as const));

	const out: string[] = [];
	let fence: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const inFence = fence !== null;
		fence = nextFenceState(line, fence);
		const node = nodeAt.get(i);

		if (isLineHidden(plan.hiddenLineRanges, i)) {
			if (node && !inFence) {
				let bodyShowing = false;
				for (let b = node.ownBodyStart; b < node.ownBodyEnd && !bodyShowing; b++) {
					bodyShowing = !isLineHidden(plan.hiddenLineRanges, b) && (lines[b] ?? '').trim() !== '';
				}
				if (bodyShowing) out.push(anchor(i, true));
			}
			continue;
		}
		if (inFence) {
			out.push(line);
			continue;
		}
		if (isCommentLine(line, sigilChar)) continue;
		if (node) {
			const segs = entrySegments(line, sigilChar);
			if (segs) {
				out.push(anchor(i, false) + line.slice(segs.prefixEnd, segs.textEnd).trimEnd());
				continue;
			}
		}
		if (isOutlineLine(line, sigilChar)) continue;
		out.push(line);
	}

	return { markdown: out.join('\n'), plan, entryLevels, indentBody };
}
