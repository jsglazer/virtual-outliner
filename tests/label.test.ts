import { describe, expect, it } from 'vitest';

import { computeLabel, toAlpha, toRoman } from '../src/core/label';
import { parseOutline } from '../src/core/parser';
import { defaultLevelFormat } from '../src/core/settings';
import type { LevelFormat } from '../src/core/types';

describe('toRoman / toAlpha', () => {
	it('converts small integers to Roman numerals', () => {
		expect(toRoman(1)).toBe('I');
		expect(toRoman(4)).toBe('IV');
		expect(toRoman(9)).toBe('IX');
		expect(toRoman(14)).toBe('XIV');
	});

	it('converts to Excel-style base-26 letters', () => {
		expect(toAlpha(1)).toBe('A');
		expect(toAlpha(26)).toBe('Z');
		expect(toAlpha(27)).toBe('AA');
		expect(toAlpha(28)).toBe('AB');
	});
});

describe('computeLabel', () => {
	function levels(overrides: Partial<Record<number, Partial<LevelFormat>>>): LevelFormat[] {
		const out: LevelFormat[] = [];
		for (let l = 1; l <= 6; l++) out.push({ ...defaultLevelFormat(l), ...overrides[l] });
		return out;
	}

	it('renders a simple decimal composite label ("1.2.1")', () => {
		const doc = '@ A\n@@ A.1\n@@ A.2\n@@@ A.2.a';
		const parsed = parseOutline(doc);
		const target = parsed.roots[0]?.children[1]?.children[0];
		if (!target) throw new Error('missing node');
		expect(computeLabel(levels({ 1: { style: '1' } }), target)).toBe('1.2.1');
	});

	it('renders the "1.0" style as a bare integer plus a trailing ".0"', () => {
		const doc = '@ A\n@ B';
		const parsed = parseOutline(doc);
		const b = parsed.roots[1];
		if (!b) throw new Error('missing node');
		expect(computeLabel(levels({ 1: { style: '1.0' } }), b)).toBe('2.0');
	});

	it('gives up the "1.0" placeholder to the child level ("3.1", never "3.0.1")', () => {
		const doc = '@ A\n@ B\n@ C\n@@ C.1';
		const parsed = parseOutline(doc);
		const target = parsed.roots[2]?.children[0];
		if (!target) throw new Error('missing node');
		expect(computeLabel(levels({ 1: { style: '1.0' } }), target)).toBe('3.1');
	});

	it('keeps the "1.0" placeholder when every deeper level renders nothing', () => {
		const doc = '@ A\n@@ A.1';
		const parsed = parseOutline(doc);
		const target = parsed.roots[0]?.children[0];
		if (!target) throw new Error('missing node');
		expect(computeLabel(levels({ 1: { style: '1.0' }, 2: { style: 'none' } }), target)).toBe('1.0');
	});

	it('drops the "1.0" placeholder three levels deep', () => {
		const doc = '@ A\n@@ A.1\n@@ A.2\n@@@ A.2.a';
		const parsed = parseOutline(doc);
		const target = parsed.roots[0]?.children[1]?.children[0];
		if (!target) throw new Error('missing node');
		expect(computeLabel(levels({ 1: { style: '1.0' } }), target)).toBe('1.2.1');
	});

	it('joins mixed per-level styles as in the "I.B.3" example', () => {
		const doc = '@ A\n@@ A.1\n@@ A.2\n@@@ A.2.a\n@@@ A.2.b\n@@@ A.2.c';
		const parsed = parseOutline(doc);
		const target = parsed.roots[0]?.children[1]?.children[2]; // 3rd child of A.2
		if (!target) throw new Error('missing node');
		const fmt = levels({ 1: { style: 'I', separator: '' }, 2: { style: 'A' }, 3: { style: '1' } });
		expect(computeLabel(fmt, target)).toBe('I.B.3');
	});

	it('omits a level whose style is "none" and its separator', () => {
		const doc = '@ A\n@@ A.1';
		const parsed = parseOutline(doc);
		const target = parsed.roots[0]?.children[0];
		if (!target) throw new Error('missing node');
		const fmt = levels({ 1: { style: 'none' } });
		expect(computeLabel(fmt, target)).toBe('1');
	});

	it('renders a bullet regardless of sibling position', () => {
		const doc = '@ A\n@ B\n@ C';
		const parsed = parseOutline(doc);
		const c = parsed.roots[2];
		if (!c) throw new Error('missing node');
		expect(computeLabel(levels({ 1: { style: 'bullet' } }), c)).toBe('•');
	});
});
