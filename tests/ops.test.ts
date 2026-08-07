import { describe, expect, it } from 'vitest';

import { addBodyLine, addSibling, demote, moveDown, moveUp, promote } from '../src/core/ops';
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

	it('treats the cursor sitting just before a hidden id suffix as end-of-line', () => {
		// The id suffix renders as an atomic, hidden decoration in Live Preview
		// (livePreview.ts), so a cursor arriving via typing/navigation naturally
		// lands right before it — visually indistinguishable from true
		// end-of-line. Requiring an exact `line.length` match here used to fall
		// through to Obsidian's default Enter, splitting the line between the
		// text and the id and stranding `^o-xxxxxxxx` on its own line.
		const doc = '@@@ asdf ^o-01gjm3uo';
		const cursorBeforeId = '@@@ asdf'.length;
		const result = apply(doc, addSibling(doc, 0, cursorBeforeId));
		expect(result).toBe('@@@ asdf ^o-01gjm3uo\n@@@ ');
	});
});

describe('addBodyLine (Mod-Enter)', () => {
	it('opens a sigil-free line directly under the entry, above its children', () => {
		const doc = ['@ A', '@@ A.1', '@ B'].join('\n');
		const result = apply(doc, addBodyLine(doc, 0));
		expect(result).toBe(['@ A', '', '@@ A.1', '@ B'].join('\n'));
	});

	it('lands the new line ahead of body the entry already has', () => {
		const doc = ['@ A', 'existing body', '@ B'].join('\n');
		const result = apply(doc, addBodyLine(doc, 0));
		expect(result).toBe(['@ A', '', 'existing body', '@ B'].join('\n'));
	});

	it('inserts nothing but a newline regardless of the entry level', () => {
		const doc = '@@@@ Deep entry';
		expect(apply(doc, addBodyLine(doc, 0))).toBe('@@@@ Deep entry\n');
	});

	it('works at end of document', () => {
		const doc = '@ A';
		const splice = addBodyLine(doc, 0);
		expect(splice).toEqual({ from: 3, to: 3, insert: '\n' });
		expect(apply(doc, splice)).toBe('@ A\n');
	});

	it('leaves an empty entry intact rather than stripping its sigils like Enter does', () => {
		const doc = '@@ ';
		expect(apply(doc, addBodyLine(doc, 0))).toBe('@@ \n');
	});

	it('returns null off an outline line so Obsidian keeps its own Mod-Enter', () => {
		const doc = ['@ A', 'just prose'].join('\n');
		expect(addBodyLine(doc, 1)).toBeNull();
		expect(addBodyLine(doc, 9)).toBeNull();
	});

	it('honors a non-default sigil', () => {
		const doc = '~~ Entry';
		expect(apply(doc, addBodyLine(doc, 0, '~'))).toBe('~~ Entry\n');
		expect(addBodyLine(doc, 0, '@')).toBeNull();
	});
});
