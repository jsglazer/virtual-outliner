import { describe, expect, it } from 'vitest';

import { nextSibling, nodeAtLine, parseOutline, previousSibling } from '../src/core/parser';

describe('parseOutline', () => {
	it('parses a flat single-level outline', () => {
		const doc = '@ First\n@ Second\n@ Third';
		const parsed = parseOutline(doc);
		expect(parsed.roots).toHaveLength(3);
		expect(parsed.flat.map((n) => n.text)).toEqual(['First', 'Second', 'Third']);
		expect(parsed.flat.map((n) => n.siblingIndex)).toEqual([1, 2, 3]);
	});

	it('nests children under their parent by sigil depth', () => {
		const doc = '@ A\n@@ A.1\n@@ A.2\n@ B\n@@ B.1';
		const parsed = parseOutline(doc);
		expect(parsed.roots).toHaveLength(2);
		const a = parsed.roots[0];
		const b = parsed.roots[1];
		expect(a?.children.map((n) => n.text)).toEqual(['A.1', 'A.2']);
		expect(a?.children.map((n) => n.siblingIndex)).toEqual([1, 2]);
		expect(b?.children.map((n) => n.text)).toEqual(['B.1']);
		expect(b?.children[0]?.siblingIndex).toBe(1);
	});

	it('attaches body lines to the correct owning node by document order', () => {
		const doc = ['@ A', 'body of A', '@@ A.1', 'body of A.1', 'more A.1 body', '@ B', 'body of B'].join(
			'\n',
		);
		const parsed = parseOutline(doc);
		const a = parsed.roots[0];
		const a1 = a?.children[0];
		const b = parsed.roots[1];
		expect(a?.ownBodyStart).toBe(1);
		expect(a?.ownBodyEnd).toBe(2); // stops at the next entry (A.1), any level
		expect(a1?.ownBodyStart).toBe(3);
		expect(a1?.ownBodyEnd).toBe(5);
		expect(a?.subtreeEnd).toBe(5); // A's subtree includes all of A.1
		expect(b?.ownBodyStart).toBe(6);
		expect(b?.ownBodyEnd).toBe(7);
	});

	it('does not classify a sigil with no trailing space as an entry', () => {
		const doc = '@NoSpace this is body text\n@ Real entry';
		const parsed = parseOutline(doc);
		expect(parsed.flat).toHaveLength(1);
		expect(parsed.flat[0]?.text).toBe('Real entry');
	});

	it('requires non-empty text after the sigil', () => {
		const doc = '@   \n@ Real entry';
		const parsed = parseOutline(doc);
		expect(parsed.flat).toHaveLength(1);
	});

	it('honors a custom configured sigil character', () => {
		const doc = '~ A\n~~ A.1';
		const parsed = parseOutline(doc, '~');
		expect(parsed.roots).toHaveLength(1);
		expect(parsed.roots[0]?.children).toHaveLength(1);
		expect(parseOutline(doc, '@').flat).toHaveLength(0);
	});

	it('assigns the id from the trailing block-ref suffix', () => {
		const doc = '@ Background ^o-a3f2k9pq';
		const parsed = parseOutline(doc);
		expect(parsed.flat[0]?.id).toBe('^o-a3f2k9pq');
		expect(parsed.flat[0]?.text).toBe('Background');
	});

	it('gives the first duplicate id to the earlier node and leaves the later one id-less', () => {
		const doc = '@ First ^o-aaaaaaaa\n@ Second ^o-aaaaaaaa';
		const parsed = parseOutline(doc);
		expect(parsed.flat[0]?.id).toBe('^o-aaaaaaaa');
		expect(parsed.flat[1]?.id).toBeNull();
	});

	it('finds previous/next siblings, stopping at a shallower ancestor', () => {
		const doc = '@ A\n@@ A.1\n@@ A.2\n@@@ A.2.a\n@ B';
		const parsed = parseOutline(doc);
		const a2 = nodeAtLine(parsed, 2);
		const b = nodeAtLine(parsed, 4);
		expect(a2).not.toBeNull();
		if (!a2 || !b) throw new Error('missing node');
		expect(previousSibling(parsed, a2)?.text).toBe('A.1');
		expect(nextSibling(parsed, a2)).toBeNull(); // A.2.a is a child, not a sibling
		expect(previousSibling(parsed, b)?.text).toBe('A'); // both are level-1 roots
	});
});
