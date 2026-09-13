import { describe, expect, it } from 'vitest';

import { addBodyLine, addSibling, demote, moveDown, moveUp, ownerNodeAtLine, promote } from '../src/core/ops';
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

	it('moves the last block of the note without merging lines or leaving a blank line', () => {
		const eof = '@ A\nA body\n@ B';
		expect(apply(eof, moveDown(eof, 0))).toBe('@ B\n@ A\nA body');
		expect(apply(eof, moveUp(eof, 2))).toBe('@ B\n@ A\nA body');
		const trailing = '@ A\n@ B\n';
		expect(apply(trailing, moveDown(trailing, 0))).toBe('@ B\n@ A\n');
	});

	it('reports where the moved block now starts', () => {
		const down = moveDown(doc, 0);
		expect(down?.movedTo).toBe(apply(doc, down).indexOf('@ A'));
		const up = moveUp(doc, 3);
		expect(up?.movedTo).toBe(0);
	});

	it('moves a first child up out of its parent, to the end of the previous section', () => {
		const nested = ['@ One', '@@ One.1', '@ Two', 'Two body', '@@ Two.1', 'Two.1 body', '@@@ Two.1.1', '@@ Two.2'].join('\n');
		const splice = moveUp(nested, 4); // Two.1 (with Two.1.1)
		const result = apply(nested, splice);
		expect(result).toBe(
			['@ One', '@@ One.1', '@@ Two.1', 'Two.1 body', '@@@ Two.1.1', '@ Two', 'Two body', '@@ Two.2'].join('\n'),
		);
		expect(splice?.movedTo).toBe(result.indexOf('@@ Two.1'));
		const parsed = parseOutline(result);
		expect(parsed.roots[0]?.children.map((n) => n.text)).toEqual(['One.1', 'Two.1']);
	});

	it('moves a last child down out of its parent, to the start of the next section', () => {
		const nested = ['@ One', '@@ One.1', '@@ One.2', 'One.2 body', '@ Two', 'Two body', '@@ Two.1'].join('\n');
		const splice = moveDown(nested, 2); // One.2
		const result = apply(nested, splice);
		expect(result).toBe(['@ One', '@@ One.1', '@ Two', 'Two body', '@@ One.2', 'One.2 body', '@@ Two.1'].join('\n'));
		expect(splice?.movedTo).toBe(result.indexOf('@@ One.2'));
		const parsed = parseOutline(result);
		expect(parsed.roots[1]?.children.map((n) => n.text)).toEqual(['One.2', 'Two.1']);
	});

	it('stops at the edge when there is no neighbouring section to cross into', () => {
		const nested = ['@ One', '@@ One.1', '@ Two'].join('\n');
		expect(moveUp(nested, 1)).toBeNull(); // One has no previous sibling
		const last = ['@ One', '@ Two', '@@ Two.1'].join('\n');
		expect(moveDown(last, 2)).toBeNull(); // Two has no next sibling
	});

	it('finds the owning entry for a body line', () => {
		expect(ownerNodeAtLine(doc, 1)?.text).toBe('A');
		expect(ownerNodeAtLine(doc, 4)?.text).toBe('B');
		expect(ownerNodeAtLine('preamble\n@ A', 0)).toBeNull();
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

	it('splits the entry when the cursor is mid-text, the tail becoming a same-level entry below', () => {
		const doc = ['@ A', '@@ Some entry text', '@ B'].join('\n');
		const splice = addSibling(doc, 1, '@@ Some entry'.length);
		const result = apply(doc, splice);
		expect(result).toBe(['@ A', '@@ Some entry', '@@ text', '@ B'].join('\n'));
		expect(splice?.cursor).toBe(result.indexOf('@@ text') + '@@ '.length);
	});

	it('keeps the id suffix on the original entry when splitting', () => {
		const doc = '@ one two ^o-abcdefgh';
		const result = apply(doc, addSibling(doc, 0, '@ one'.length));
		expect(result).toBe('@ one ^o-abcdefgh\n@ two');
	});

	it('opens a blank entry above when Enter is pressed at the start of the text', () => {
		const doc = '@ A\n@@ Text ^o-abcdefgh';
		const splice = addSibling(doc, 1, '@@ '.length);
		const result = apply(doc, splice);
		expect(result).toBe('@ A\n@@ \n@@ Text ^o-abcdefgh');
		expect(splice?.cursor).toBe(result.indexOf('@@ Text') + '@@ '.length);
	});

	it('treats trailing whitespace after the caret as end of line', () => {
		const doc = '@ A   ';
		const result = apply(doc, addSibling(doc, 0, '@ A'.length));
		expect(result).toBe('@ A   \n@ ');
	});

	it('does not put a blank line between entries when the section ends in blank lines', () => {
		const doc = ['@ A', 'body', '', '', '@ B'].join('\n');
		const splice = addSibling(doc, 0, '@ A'.length);
		const result = apply(doc, splice);
		expect(result).toBe(['@ A', 'body', '@ ', '', '', '@ B'].join('\n'));
		expect(splice?.cursor).toBe(result.indexOf('@ \n') + '@ '.length);
	});

	it('does not put a blank line before the new entry when the file ends with a newline', () => {
		const doc = '@ A\n@ B\n';
		const result = apply(doc, addSibling(doc, 1, '@ B'.length));
		expect(result).toBe('@ A\n@ B\n@ \n');
	});

	it('"line" behavior opens the sibling on the very next line, ahead of body and children', () => {
		const doc = ['@ A', 'A body', '@@ A.1', '@ B'].join('\n');
		const splice = addSibling(doc, 0, '@ A'.length, '@', 'line');
		const result = apply(doc, splice);
		expect(result).toBe(['@ A', '@ ', 'A body', '@@ A.1', '@ B'].join('\n'));
		expect(splice?.cursor).toBe('@ A\n@ '.length);
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
