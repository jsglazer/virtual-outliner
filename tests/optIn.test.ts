// Update016: the `voutline` frontmatter key that turns the plugin on per note.

import { describe, expect, it } from 'vitest';

import { isOutlineEnabled } from '../src/core/optIn';

describe('isOutlineEnabled', () => {
	it('is off without frontmatter or without the key', () => {
		expect(isOutlineEnabled(undefined)).toBe(false);
		expect(isOutlineEnabled(null)).toBe(false);
		expect(isOutlineEnabled({ tags: ['x'] })).toBe(false);
	});

	it('is on for voutline: true, in any key case', () => {
		expect(isOutlineEnabled({ voutline: true })).toBe(true);
		expect(isOutlineEnabled({ VOutline: true })).toBe(true);
	});

	it('accepts quoted true/yes/on', () => {
		expect(isOutlineEnabled({ voutline: 'true' })).toBe(true);
		expect(isOutlineEnabled({ voutline: ' Yes ' })).toBe(true);
		expect(isOutlineEnabled({ voutline: 'on' })).toBe(true);
	});

	it('is off for false, empty or other values', () => {
		expect(isOutlineEnabled({ voutline: false })).toBe(false);
		expect(isOutlineEnabled({ voutline: '' })).toBe(false);
		expect(isOutlineEnabled({ voutline: null })).toBe(false);
		expect(isOutlineEnabled({ voutline: 1 })).toBe(false);
		expect(isOutlineEnabled({ voutline: 'no' })).toBe(false);
	});
});
