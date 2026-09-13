import { describe, expect, it } from 'vitest';

import {
	defaultSettings,
	levelCssVars,
	makeToolbarHighlight,
	normalizeSettings,
	toolbarHighlightColor,
} from '../src/core/settings';

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

describe('normalizeSettings — Update005 fields', () => {
	it('defaults Enter to "after section" and reads "line" back', () => {
		expect(normalizeSettings({}).enterBehavior).toBe('section');
		expect(normalizeSettings({ enterBehavior: 'line' }).enterBehavior).toBe('line');
		expect(normalizeSettings({ enterBehavior: 'nonsense' }).enterBehavior).toBe('section');
	});

	it('reads Note Toolbar highlights and falls back per entry when one is corrupt', () => {
		const settings = normalizeSettings({
			toolbarHighlights: {
				sidebar: {
					toolbarUuid: 't1',
					itemUuid: 'i1',
					on: { light: { enabled: true, color: '#112233' }, dark: { enabled: false, color: '' } },
					off: { light: { enabled: true, color: '#445566' }, dark: {} },
				},
				indentBody: 'garbage',
			},
		});
		expect(settings.toolbarHighlights.sidebar.toolbarUuid).toBe('t1');
		expect(settings.toolbarHighlights.sidebar.on.light).toEqual({ enabled: true, color: '#112233' });
		expect(settings.toolbarHighlights.sidebar.off.dark).toEqual({ enabled: false, color: '' });
		expect(settings.toolbarHighlights.indentBody).toEqual(makeToolbarHighlight());
		expect(settings.toolbarHighlights.enterBehavior).toEqual(makeToolbarHighlight());
	});
});

describe('toolbarHighlightColor', () => {
	it('picks the colour for the toggle state and theme, and nothing for a disabled or invalid one', () => {
		const h = makeToolbarHighlight('#aaaaaa', '#bbbbbb');
		expect(toolbarHighlightColor(h, true, false)).toBe('#aaaaaa');
		expect(toolbarHighlightColor(h, true, true)).toBe('#bbbbbb');
		expect(toolbarHighlightColor(h, false, false)).toBe(''); // Off unticked by default
		h.on.light = { enabled: true, color: 'red' };
		expect(toolbarHighlightColor(h, true, false)).toBe('');
	});
});

describe('levelCssVars', () => {
	it('indents body one step deeper than its entry, so level-1 body is not flush left', () => {
		const vars = levelCssVars(defaultSettings().levels);
		expect(vars['--vo-l1-body-indent']).toBe('calc(0px + 1.5em)');
		expect(vars['--vo-l2-body-indent']).toBe('calc(calc(0px + 1.5em) + 1.5em)');
		expect(vars['--vo-l6-body-indent']).toContain('+ 1.5em)');
	});

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
		expect(vars['--vo-l1-indent']).toBe('0px');
		expect(vars['--vo-l2-indent']).toBe('calc(0px + 1.5em)');
		expect(vars['--vo-l3-indent']).toBe('calc(calc(0px + 1.5em) + 1.5em)');
	});

	it('gives a unitless or blank indent step a unit, since calc() rejects a bare 0', () => {
		const levels = defaultSettings().levels;
		const [first, second, third] = levels;
		if (!first || !second || !third) throw new Error('missing level');
		first.indentStep = '0';
		second.indentStep = '';
		third.indentStep = '0.00';
		const vars = levelCssVars(levels);
		expect(vars['--vo-l1-indent']).toBe('0px');
		expect(vars['--vo-l2-indent']).toBe('calc(0px + 0px)');
		expect(vars['--vo-l3-indent']).toBe('calc(calc(0px + 0px) + 0px)');
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
