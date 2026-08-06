import { describe, expect, it } from 'vitest';

import { addSibling, demote, moveDown, moveUp, promote } from '../src/core/ops';
import { parseOutline } from '../src/core/parser';
import type { EditSplice } from '../src/core/types';

function apply(doc: string, splice: EditSplice | null): string {
	if (!splice) return doc;
	return doc.slice(0, splice.from) + splice.insert + doc.slice(splice.to);
}

describe('demote (Tab)', () => {
	it('demotes a node and shifts its whole subtree, carrying body without orphaning it', () => {
		const doc = ['@ A', '@ B', 'body of B', '@@ B.1', 'body of B.1'].join('\n');
		const result = apply(doc, demote(doc, 1));
		expect(result).toBe(['@ A', '@@ B', 'body of B', '@@@ B.1', 'body of B.1'].join('\n'));
		const parsed = parseOutline(result);
		const a = parsed.roots[0];
		expect(a?.children.map((n) => n.text)).toEqual(['B']);
		expect(a?.children[0]?.children.map((n) => n.text)).toEqual(['B.1']);
	});

	it('refuses to demote when it would create a level gap', () => {
		const doc = '@ A\n@ B';
		// B has no level-2 predecessor to attach under; demoting it straight
		// to level 2 as the very first entry is fine (case above), but
		// demoting it a second time (to level 3) with only a level-1
		// predecessor would skip level 2 — illegal.
		const once = apply(doc, demote(doc, 1));
		const twice = demote(once, 1);
		expect(twice).toBeNull();
	});

	it('refuses to demote past the max level, including when a descendant is already at max depth', () => {
		const maxed = '@@@@@@ Deepest'; // level 6
		expect(demote(maxed, 0)).toBeNull();

		const parentOfMax = ['@@@@@ Parent', '@@@@@@ Child'].join('\n');
		expect(demote(parentOfMax, 0)).toBeNull();
	});

	it('is a consumed no-op (null) rather than inserting a literal sigil', () => {
		const doc = '@ Only';
		expect(demote(doc, 0)).toBeNull();
	});
});

describe('promote (Shift-Tab)', () => {
	it('promotes a node and shifts its whole subtree', () => {
		const doc = ['@ A', '@@ B', 'body of B', '@@@ B.1'].join('\n');
		const result = apply(doc, promote(doc, 1));
		expect(result).toBe(['@ A', '@ B', 'body of B', '@@ B.1'].join('\n'));
	});

	it('refuses to promote a level-1 entry', () => {
		const doc = '@ A';
		expect(promote(doc, 0)).toBeNull();
	});
});

describe('moveUp / moveDown (Alt-Up / Alt-Down)', () => {
	const doc = ['@ A', 'A body', '@@ A.1', '@ B', 'B body', '@ C'].join('\n');

	it('swaps a node with its previous sibling, subtree and all', () => {
		const result = apply(doc, moveUp(doc, 3)); // B
		expect(result).toBe(['@ B', 'B body', '@ A', 'A body', '@@ A.1', '@ C'].join('\n'));
	});

	it('swaps a node with its next sibling, subtree and all', () => {
		const result = apply(doc, moveDown(doc, 0)); // A (with A.1 and its body)
		expect(result).toBe(['@ B', 'B body', '@ A', 'A body', '@@ A.1', '@ C'].join('\n'));
	});

	it('refuses to move past the first/last sibling', () => {
		expect(moveUp(doc, 0)).toBeNull(); // A is already first
		expect(moveDown(doc, 5)).toBeNull(); // C is already last
	});

	it('does not treat a child as a sibling to move past', () => {
		// A.1 is B's neighbor in the flat list but is A's CHILD, not B's sibling.
		expect(moveUp(doc, 3)).not.toBeNull();
		const result = apply(doc, moveUp(doc, 3));
		const parsed = parseOutline(result);
		expect(parsed.roots.map((n) => n.text)).toEqual(['B', 'A', 'C']);
		expect(parsed.roots[1]?.children.map((n) => n.text)).toEqual(['A.1']);
	});
});

describe('addSibling (Enter)', () => {
	it('inserts a new sibling after the entire subtree, not splitting body/children', () => {
		const doc = ['@ A', 'A body', '@@ A.1', '@ B'].join('\n');
		const cursorAtEnd = '@ A'.length;
		const result = apply(doc, addSibling(doc, 0, cursorAtEnd));
		expect(result).toBe(['@ A', 'A body', '@@ A.1', '@ ', '@ B'].join('\n'));
	});

	it('inserts at end of document when the node has no following content', () => {
		const doc = '@ A\nA body';
		const result = apply(doc, addSibling(doc, 0, '@ A'.length));
		expect(result).toBe('@ A\nA body\n@ ');
	});

	it('falls through (returns null) when the cursor is mid-line', () => {
		const doc = '@ Some entry text';
		expect(addSibling(doc, 0, 3)).toBeNull();
	});

	it('strips the sigils on an empty entry instead of creating another empty sibling', () => {
		const doc = '@@ ';
		const result = apply(doc, addSibling(doc, 0, doc.length));
		expect(result).toBe('');
	});

	it('preserves the level of the new sibling', () => {
		const doc = '@@@ Deep entry';
		const result = apply(doc, addSibling(doc, 0, doc.length));
		expect(result).toBe('@@@ Deep entry\n@@@ ');
	});
});
