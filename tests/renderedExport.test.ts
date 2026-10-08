import { describe, expect, it } from 'vitest';

import { prepareRenderedExport } from '../src/core/renderedExport';
import { defaultLevelFormat } from '../src/core/settings';
import type { LevelFormat } from '../src/core/types';

const levels: LevelFormat[] = [1, 2, 3, 4, 5, 6].map((l) => defaultLevelFormat(l));
const none = new Set<string>();

function prep(doc: string, view: 'outline' | 'body' | 'both' = 'both', collapsed: ReadonlySet<string> = none) {
	return prepareRenderedExport(doc, '@', levels, view, collapsed, true);
}

describe('prepareRenderedExport', () => {
	it('returns null for a note with no outline', () => {
		expect(prep('# Title\n\nJust prose.\n')).toBeNull();
	});

	it('swaps sigils, paragraph flag and hidden id for an anchor carrying the source line', () => {
		const out = prep('@ Background ^o-a3f2k9pq\nBody one.\n@@p Early\n');
		expect(out?.markdown).toBe(
			'<span data-vo-line="0"></span>Background\nBody one.\n<span data-vo-line="2"></span>Early\n',
		);
	});

	it('keeps the labels and levels the Reading view would show', () => {
		const out = prep('@ A\n@@ B\n@ C');
		expect(out?.plan.labels.size).toBe(3);
		expect(out?.entryLevels.get(1)).toBe(2);
		expect(out?.plan.entryLevel.get(2)).toBe(1);
	});

	it('drops comment lines and bare entries with no text yet', () => {
		const out = prep('@ A\n@% a note to self\n@@ \nBody');
		expect(out?.markdown).toBe('<span data-vo-line="0"></span>A\nBody');
	});

	it('leaves lines inside a code fence exactly as written', () => {
		const out = prep('@ A\n```\n@ not an entry here\n```\n');
		expect(out?.markdown).toBe('<span data-vo-line="0"></span>A\n```\n@ not an entry here\n```\n');
	});

	it('drops body in Outline-only view', () => {
		const out = prep('@ A\nBody\n@@ B\nMore', 'outline');
		expect(out?.markdown).toBe('<span data-vo-line="0"></span>A\n<span data-vo-line="2"></span>B');
	});

	it('leaves a ghost anchor for a hidden entry whose body still shows in Body-only view', () => {
		const out = prep('@ A\nBody\n@@ B\n@ C\nMore', 'body');
		expect(out?.markdown).toBe(
			'<span data-vo-line="0" data-vo-ghost=""></span>\nBody\n<span data-vo-line="3" data-vo-ghost=""></span>\nMore',
		);
	});

	it('drops a folded subtree but keeps its entry', () => {
		const out = prep('@ A ^o-aaaaaaaa\nBody\n@@ B\n@ C', 'both', new Set(['^o-aaaaaaaa']));
		expect(out?.markdown).toBe('<span data-vo-line="0"></span>A\n<span data-vo-line="3"></span>C');
	});

	it('leaves the metadata block out', () => {
		const out = prep('@ A\n\n%%md-outline\n{"id":"^o-aaaaaaaa","Status":"Open"}\n%%\n');
		expect(out?.markdown).not.toContain('md-outline');
	});
});
