import { describe, expect, it } from 'vitest';

import { generateFilteredCopy } from '../src/core/exportFilter';
import { defaultLevelFormat } from '../src/core/settings';
import type { LevelFormat } from '../src/core/types';

function levels(): LevelFormat[] {
	const out: LevelFormat[] = [];
	for (let l = 1; l <= 6; l++) out.push(defaultLevelFormat(l));
	return out;
}

describe('generateFilteredCopy', () => {
	const doc = [
		'@ Background ^o-aaaaaaaa',
		'Some prose about the background.',
		'@@ Details',
		'More prose.',
		'%%md-outline',
		'{"id":"^o-aaaaaaaa","Status":"Open"}',
		'%%',
		'',
	].join('\n');

	it('strips the metadata block unconditionally', () => {
		const out = generateFilteredCopy(doc, '@', levels(), 'both', new Set());
		expect(out).not.toContain('%%md-outline');
		expect(out).not.toContain('Status');
	});

	it('"both" materializes computed labels into the entry text', () => {
		const out = generateFilteredCopy(doc, '@', levels(), 'both', new Set());
		expect(out).toBe(
			['1 Background', 'Some prose about the background.', '1.1 Details', 'More prose.'].join('\n'),
		);
	});

	it('"outline" keeps only labeled entries', () => {
		const out = generateFilteredCopy(doc, '@', levels(), 'outline', new Set());
		expect(out).toBe(['1 Background', '1.1 Details'].join('\n'));
	});

	it('"body" keeps only prose, with no labels', () => {
		const out = generateFilteredCopy(doc, '@', levels(), 'body', new Set());
		expect(out).toBe(['Some prose about the background.', 'More prose.'].join('\n'));
	});

	it('respects collapse state, matching "print what is currently visible"', () => {
		const out = generateFilteredCopy(doc, '@', levels(), 'both', new Set(['^o-aaaaaaaa']));
		expect(out).toBe('1 Background');
	});
});
