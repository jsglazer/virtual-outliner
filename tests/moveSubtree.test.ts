// Sidebar drag-and-drop: moveSubtreeTo carries an entry's whole block (entry,
// body, descendants) to before/after/inside another entry, re-levelled.

import { describe, expect, it } from 'vitest';

import { moveSubtreeTo } from '../src/core/ops';
import type { DropPosition } from '../src/core/ops';

const DOC = ['@ A', 'a body', '@@ A1', 'a1 body', '@ B', 'b body', '@ C', 'c body'].join('\n');
const line = (doc: string, text: string): number => doc.split('\n').indexOf(text);

function drop(doc: string, from: string, onto: string, position: DropPosition): string | null {
	const splice = moveSubtreeTo(doc, line(doc, from), line(doc, onto), position);
	return splice ? doc.slice(0, splice.from) + splice.insert + doc.slice(splice.to) : null;
}

describe('moveSubtreeTo', () => {
	it('moves a block up, before another entry, with its body and children', () => {
		expect(drop(DOC, '@ B', '@ A', 'before')).toBe(
			['@ B', 'b body', '@ A', 'a body', '@@ A1', 'a1 body', '@ C', 'c body'].join('\n'),
		);
		expect(drop(DOC, '@ A', '@ C', 'before')).toBe(
			['@ B', 'b body', '@ A', 'a body', '@@ A1', 'a1 body', '@ C', 'c body'].join('\n'),
		);
	});

	it('moves the last block of the note without gluing lines together', () => {
		expect(drop(DOC, '@ C', '@ A', 'before')).toBe(
			['@ C', 'c body', '@ A', 'a body', '@@ A1', 'a1 body', '@ B', 'b body'].join('\n'),
		);
		expect(drop(DOC, '@ A', '@ C', 'after')).toBe(
			['@ B', 'b body', '@ C', 'c body', '@ A', 'a body', '@@ A1', 'a1 body'].join('\n'),
		);
	});

	it('re-levels the whole block to the drop target', () => {
		// A1 (level 2) after C becomes a level-1 sibling of C.
		expect(drop(DOC, '@@ A1', '@ C', 'after')).toBe(
			['@ A', 'a body', '@ B', 'b body', '@ C', 'c body', '@ A1', 'a1 body'].join('\n'),
		);
		// A (with child A1) into B becomes B's child, A1 one deeper too.
		expect(drop(DOC, '@ A', '@ B', 'child')).toBe(
			['@ B', 'b body', '@@ A', 'a body', '@@@ A1', 'a1 body', '@ C', 'c body'].join('\n'),
		);
	});

	it('refuses drops into its own block and no-op drops', () => {
		expect(drop(DOC, '@ A', '@@ A1', 'before')).toBeNull();
		expect(drop(DOC, '@ A', '@ A', 'child')).toBeNull();
		expect(drop(DOC, '@ A', '@ B', 'before')).toBeNull(); // already there
		expect(drop(DOC, '@ B', '@ A', 'after')).toBeNull(); // already there
	});

	it('refuses nesting past the deepest level', () => {
		const deep = ['@ A', '@@ B', '@@@ C', '@@@@ D', '@@@@@ E', '@@@@@@ F', '@ G', '@@ H'].join('\n');
		expect(drop(deep, '@ G', '@@@@@@ F', 'child')).toBeNull();
		expect(drop(deep, '@ G', '@@@@@ E', 'child')).toBeNull(); // H would be level 7
	});
});
