// "Generate filtered copy" — the normative v1 export path (Decision #15;
// PDF-via-Reading-view is best-effort and out of scope here). Pure and
// tested: strips the metadata block, removes whatever the current view
// state/collapse state hides, and materializes computed labels into literal
// text on every outline line that remains — labels are NEVER written into
// the source document (Forbidden architectural options), only into this
// generated copy.

import { parseMetaDocument } from './metadata';
import { computeRenderPlan, isLineHidden } from './render';
import type { LevelFormat, ViewState } from './types';

export function generateFilteredCopy(
	doc: string,
	sigilChar: string,
	levels: readonly LevelFormat[],
	viewState: ViewState,
	collapsedIds: ReadonlySet<string>,
): string {
	const { body } = parseMetaDocument(doc);
	const plan = computeRenderPlan(body, sigilChar, levels, viewState, collapsedIds);
	const lines = body.split('\n');

	const entryOutput = new Map<number, string>();
	for (const node of plan.parsed.flat) {
		if (isLineHidden(plan.hiddenLineRanges, node.entryLine)) continue;
		const label = plan.labels.get(node.entryLine);
		entryOutput.set(node.entryLine, label && label !== '' ? `${label} ${node.text}` : node.text);
	}

	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (isLineHidden(plan.hiddenLineRanges, i)) continue;
		const entryText = entryOutput.get(i);
		out.push(entryText !== undefined ? entryText : (lines[i] ?? ''));
	}
	return out.join('\n');
}
