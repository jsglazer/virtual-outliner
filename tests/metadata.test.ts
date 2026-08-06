import { describe, expect, it } from 'vitest';

import {
	composeMetaDocument,
	parseMetaDocument,
	pruneOrphaned,
	removeRecord,
	removeUnparseableLine,
	updateRecord,
	upsertRecord,
} from '../src/core/metadata';

describe('parseMetaDocument', () => {
	it('returns the whole doc as body when there is no block', () => {
		const doc = 'Some prose.\n@ An entry';
		const parsed = parseMetaDocument(doc);
		expect(parsed.body).toBe(doc);
		expect(parsed.records).toEqual([]);
		expect(parsed.unparseable).toEqual([]);
	});

	it('parses records and leaves the body untouched', () => {
		const doc = [
			'@ Background ^o-a3f2k9pq',
			'',
			'%%md-outline',
			'{"id":"^o-a3f2k9pq","Status":"Open"}',
			'%%',
			'',
		].join('\n');
		const parsed = parseMetaDocument(doc);
		expect(parsed.body).toBe('@ Background ^o-a3f2k9pq\n');
		expect(parsed.records).toEqual([{ id: '^o-a3f2k9pq', fields: { Status: 'Open' } }]);
	});

	it('preserves a corrupt line without losing the rest of the block (manual edit resilience)', () => {
		const doc = [
			'%%md-outline',
			'{"id":"^o-a3f2k9pq","Status":"Open"}',
			'not even json',
			'{"missingId":"true"}', // valid JSON, but no id -> also unparseable
			'%%',
			'',
		].join('\n');
		const parsed = parseMetaDocument(doc);
		expect(parsed.records).toHaveLength(1);
		expect(parsed.unparseable).toEqual(['not even json', '{"missingId":"true"}']);
	});

	it('treats a non-string field value as corrupting only that line', () => {
		const doc = ['%%md-outline', '{"id":"^o-aaaaaaaa","Status":42}', '%%', ''].join('\n');
		const parsed = parseMetaDocument(doc);
		expect(parsed.records).toEqual([]);
		expect(parsed.unparseable).toEqual(['{"id":"^o-aaaaaaaa","Status":42}']);
	});

	it('treats an unclosed block as extending to end of file rather than dropping it', () => {
		const doc = ['%%md-outline', '{"id":"^o-aaaaaaaa"}'].join('\n');
		const parsed = parseMetaDocument(doc);
		expect(parsed.records).toHaveLength(1);
	});

	it('uses the LAST opening marker so a stray literal earlier cannot hijack the real block', () => {
		const doc = [
			'Some text mentioning %%md-outline in prose.',
			'%%md-outline',
			'{"id":"^o-aaaaaaaa"}',
			'%%',
			'',
		].join('\n');
		const parsed = parseMetaDocument(doc);
		expect(parsed.records).toHaveLength(1);
		expect(parsed.body).toContain('mentioning %%md-outline in prose');
	});
});

describe('round-trip', () => {
	it('upsert then parse recovers the same record', () => {
		const doc = upsertRecord('@ A\n', { id: '^o-aaaaaaaa', fields: { Status: 'Open' } });
		const parsed = parseMetaDocument(doc);
		expect(parsed.records).toEqual([{ id: '^o-aaaaaaaa', fields: { Status: 'Open' } }]);
	});

	it('update patches fields without touching unrelated records or unparseable lines', () => {
		const doc = [
			'@ A',
			'',
			'%%md-outline',
			'{"id":"^o-aaaaaaaa","Status":"Open"}',
			'{"id":"^o-bbbbbbbb","Status":"Open"}',
			'garbage line',
			'%%',
			'',
		].join('\n');
		const updated = updateRecord(doc, '^o-aaaaaaaa', { Status: 'Done' });
		const parsed = parseMetaDocument(updated);
		expect(parsed.records).toEqual([
			{ id: '^o-aaaaaaaa', fields: { Status: 'Done' } },
			{ id: '^o-bbbbbbbb', fields: { Status: 'Open' } },
		]);
		expect(parsed.unparseable).toEqual(['garbage line']);
	});

	it('remove drops only the targeted record', () => {
		const doc = composeMetaDocument(
			'@ A\n',
			[
				{ id: '^o-aaaaaaaa', fields: {} },
				{ id: '^o-bbbbbbbb', fields: {} },
			],
			[],
		);
		const removed = removeRecord(doc, '^o-aaaaaaaa');
		expect(parseMetaDocument(removed).records).toEqual([{ id: '^o-bbbbbbbb', fields: {} }]);
	});

	it('a deliberate delete of an unparseable line is the only path that drops data', () => {
		const doc = composeMetaDocument('@ A\n', [], ['garbage']);
		const cleaned = removeUnparseableLine(doc, 'garbage');
		expect(cleaned).toBe('@ A\n');
	});
});

describe('pruneOrphaned', () => {
	it('removes only records whose id is no longer live, and reports what it removed', () => {
		const doc = composeMetaDocument(
			'@ A ^o-aaaaaaaa\n',
			[
				{ id: '^o-aaaaaaaa', fields: {} },
				{ id: '^o-bbbbbbbb', fields: {} }, // orphaned: no matching entry line
			],
			[],
		);
		const result = pruneOrphaned(doc, new Set(['^o-aaaaaaaa']));
		expect(result.removedIds).toEqual(['^o-bbbbbbbb']);
		expect(parseMetaDocument(result.doc).records).toEqual([{ id: '^o-aaaaaaaa', fields: {} }]);
	});

	it('is a no-op when nothing is orphaned', () => {
		const doc = composeMetaDocument('@ A\n', [{ id: '^o-aaaaaaaa', fields: {} }], []);
		const result = pruneOrphaned(doc, new Set(['^o-aaaaaaaa']));
		expect(result.removedIds).toEqual([]);
		expect(result.doc).toBe(doc);
	});
});
