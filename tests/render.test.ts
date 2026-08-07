import { describe, expect, it } from 'vitest';

import { computeRenderPlan, isLineHidden } from '../src/core/render';
import { defaultLevelFormat } from '../src/core/settings';
import type { LevelFormat } from '../src/core/types';

function levels(): LevelFormat[] {
	const out: LevelFormat[] = [];
	for (let l = 1; l <= 6; l++) out.push(defaultLevelFormat(l));
	return out;
}

const DOC = ['Preamble body.', '@ A', 'A body', '@@ A.1', 'A.1 body', '@ B'].join('\n');

describe('computeRenderPlan', () => {
	it('"both": nothing hidden, every entry gets a label', () => {
		const plan = computeRenderPlan(DOC, '@', levels(), 'both', new Set());
		expect(plan.hiddenLineRanges).toEqual([]);
		expect(plan.labels.get(1)).toBe('1.0'); // "@ A"
		expect(plan.labels.get(3)).toBe('1.0.1'); // "@@ A.1"
	});

	it('"outline": hides every body run, including the preamble, but not entries', () => {
		const plan = computeRenderPlan(DOC, '@', levels(), 'outline', new Set());
		expect(isLineHidden(plan.hiddenLineRanges, 0)).toBe(true); // preamble
		expect(isLineHidden(plan.hiddenLineRanges, 1)).toBe(false); // "@ A"
		expect(isLineHidden(plan.hiddenLineRanges, 2)).toBe(true); // "A body"
		expect(isLineHidden(plan.hiddenLineRanges, 3)).toBe(false); // "@@ A.1"
		expect(isLineHidden(plan.hiddenLineRanges, 5)).toBe(false); // "@ B"
	});

	it('"body": hides every entry line but not the prose around it', () => {
		const plan = computeRenderPlan(DOC, '@', levels(), 'body', new Set());
		expect(isLineHidden(plan.hiddenLineRanges, 0)).toBe(false); // preamble stays
		expect(isLineHidden(plan.hiddenLineRanges, 1)).toBe(true); // "@ A"
		expect(isLineHidden(plan.hiddenLineRanges, 2)).toBe(false); // "A body"
		expect(plan.labels.size).toBe(0);
	});

	it('collapsing a node hides its body and descendants but keeps its own entry line', () => {
		const doc = '@ A ^o-aaaaaaaa\nA body\n@@ A.1\nA.1 body\n@ B';
		const plan = computeRenderPlan(doc, '@', levels(), 'both', new Set(['^o-aaaaaaaa']));
		expect(isLineHidden(plan.hiddenLineRanges, 0)).toBe(false); // "@ A" itself stays
		expect(isLineHidden(plan.hiddenLineRanges, 1)).toBe(true); // "A body"
		expect(isLineHidden(plan.hiddenLineRanges, 2)).toBe(true); // "@@ A.1"
		expect(isLineHidden(plan.hiddenLineRanges, 3)).toBe(true); // "A.1 body"
		expect(isLineHidden(plan.hiddenLineRanges, 4)).toBe(false); // "@ B" unaffected
	});

	it('indents body lines to their owning node\'s level', () => {
		const plan = computeRenderPlan(DOC, '@', levels(), 'both', new Set());
		expect(plan.indentLevel.get(2)).toBe(1); // "A body" under level-1 "A"
		expect(plan.indentLevel.get(4)).toBe(2); // "A.1 body" under level-2 "A.1"
		expect(plan.indentLevel.get(0)).toBeUndefined(); // preamble has no owning node
	});
});
