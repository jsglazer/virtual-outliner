import { describe, expect, it } from 'vitest';

import { defaultSettings, levelCssVars, normalizeSettings } from '../src/core/settings';

describe('normalizeSettings', () => {
	it('returns sane defaults for garbage input', () => {
		const settings = normalizeSettings(null);
		expect(settings).toEqual(defaultSettings());
	});

	it('falls back to the default sigil when given something invalid', () => {
		expect(normalizeSettings({ sigil: '##' }).sigil).toBe('@');
		expect(normalizeSettings({ sigil: ' ' }).sigil).toBe('@');
		expect(normalizeSettings({ sigil: '~' }).sigil).toBe('~');
	});

	it('always returns exactly 6 level formats even from a short array', () => {
		const settings = normalizeSettings({ levels: [{ style: 'I' }] });
		expect(settings.levels).toHaveLength(6);
		expect(settings.levels[0]?.style).toBe('I');
		expect(settings.levels[1]?.style).toBe('1');
	});

	it('drops a corrupt meta field but keeps valid ones', () => {
		const settings = normalizeSettings({
			metaFields: [{ name: 'Status', type: 'text', options: [] }, { name: '' }, 'not an object'],
		});
		expect(settings.metaFields).toEqual([{ name: 'Status', type: 'text', options: [] }]);
	});
});

describe('levelCssVars', () => {
	it('emits a custom-property value per level', () => {
		const levels = defaultSettings().levels;
		const first = levels[0];
		if (!first) throw new Error('missing level');
		first.color = '#ff0000';
		const vars = levelCssVars(levels);
		expect(vars['--vo-l1-color']).toBe('#ff0000');
		expect(vars['--vo-l2-color']).toBe('inherit');
	});

	it('accumulates indent step across levels, with level 1 flush by default', () => {
		const levels = defaultSettings().levels;
		const vars = levelCssVars(levels);
		expect(vars['--vo-l1-indent']).toBe('0');
		expect(vars['--vo-l2-indent']).toBe('calc(0 + 1.5em)');
		expect(vars['--vo-l3-indent']).toBe('calc(calc(0 + 1.5em) + 1.5em)');
	});

	it('treats a blank indent step as zero rather than an empty length', () => {
		const levels = defaultSettings().levels;
		const second = levels[1];
		if (!second) throw new Error('missing level');
		second.indentStep = '';
		const vars = levelCssVars(levels);
		expect(vars['--vo-l2-indent']).toBe('calc(0 + 0px)');
	});

	it('strips characters that could break out of the custom-property value', () => {
		const levels = defaultSettings().levels;
		const first = levels[0];
		if (!first) throw new Error('missing level');
		first.color = 'red; } .evil { color: blue';
		const vars = levelCssVars(levels);
		expect(vars['--vo-l1-color']).not.toContain('{');
		expect(vars['--vo-l1-color']).not.toContain(';');
	});
});
