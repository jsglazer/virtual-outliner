import { describe, expect, it } from 'vitest';

import {
	commentPrefixEnd,
	entryLevel,
	entrySegments,
	hasParagraphFlag,
	isCommentLine,
	isEntryLine,
	isOutlineLine,
	isRiskySigil,
	setComment,
	setParagraphFlag,
} from '../src/core/sigil';

describe('paragraph-break flag', () => {
	it('is part of the entry line and hides with the sigils', () => {
		expect(isEntryLine('@@p Focus', '@')).toBe(true);
		expect(entryLevel('@@p Focus', '@')).toBe(2);
		expect(hasParagraphFlag('@@p Focus', '@')).toBe(true);
		expect(hasParagraphFlag('@@ Focus', '@')).toBe(false);
		const segs = entrySegments('@@p Focus', '@');
		expect('@@p Focus'.slice(segs?.prefixEnd ?? 0)).toBe('Focus');
	});

	it('needs the space, like any entry', () => {
		expect(isEntryLine('@@pFocus', '@')).toBe(false);
		expect(isOutlineLine('@@p ', '@')).toBe(true);
	});

	it('toggles on and off, keeping the text and any id', () => {
		expect(setParagraphFlag('@@ Focus ^o-00az6fpc', '@', true)).toBe('@@p Focus ^o-00az6fpc');
		expect(setParagraphFlag('@@p Focus', '@', false)).toBe('@@ Focus');
		expect(setParagraphFlag('@@p Focus', '@', true)).toBe('@@p Focus');
		expect(setParagraphFlag('Prose', '@', true)).toBeNull();
	});

	it('is unavailable when the sigil character is p', () => {
		expect(entryLevel('ppp Three', 'p')).toBe(3);
		expect(hasParagraphFlag('ppp Three', 'p')).toBe(false);
		expect(setParagraphFlag('pp Two', 'p', true)).toBeNull();
	});
});

describe('entryLevel / isEntryLine', () => {
	it('requires the separating space (Decision #2 — no escape handler)', () => {
		expect(isEntryLine('@text', '@')).toBe(false);
		expect(isEntryLine('@ text', '@')).toBe(true);
	});

	it('requires non-empty text', () => {
		expect(isEntryLine('@ ', '@')).toBe(false);
		expect(isEntryLine('@', '@')).toBe(false);
	});

	it('caps at 6 sigils; a 7th makes it not match at line start cleanly', () => {
		expect(entryLevel('@@@@@@ six', '@')).toBe(6);
	});

	it('works with a regex-special sigil character', () => {
		expect(isEntryLine('* text', '*')).toBe(true);
		expect(entryLevel('** text', '*')).toBe(2);
	});
});

describe('isOutlineLine (keymap gate — looser than isEntryLine)', () => {
	it('still matches a blanked-out entry (sigils + space, no text)', () => {
		expect(isOutlineLine('@@ ', '@')).toBe(true);
		expect(isEntryLine('@@ ', '@')).toBe(false);
	});

	it('does not match without the required separating space', () => {
		expect(isOutlineLine('@@', '@')).toBe(false);
	});

	it('does not match a non-outline body line', () => {
		expect(isOutlineLine('Just some prose', '@')).toBe(false);
	});
});

describe('entrySegments', () => {
	it('locates the sigil+space prefix and the id-suffix boundary', () => {
		const line = '@@ Background ^o-a3f2k9pq';
		const segs = entrySegments(line, '@');
		expect(segs).not.toBeNull();
		if (!segs) return;
		expect(segs.level).toBe(2);
		expect(line.slice(0, segs.prefixEnd)).toBe('@@ ');
		expect(line.slice(segs.prefixEnd, segs.textEnd)).toBe('Background');
		expect(line.slice(segs.textEnd)).toBe(' ^o-a3f2k9pq');
	});

	it('has no id-suffix boundary when there is no id', () => {
		const line = '@ Background';
		const segs = entrySegments(line, '@');
		expect(segs?.textEnd).toBe(line.length);
	});

	it('returns null for a non-entry line', () => {
		expect(entrySegments('not an entry', '@')).toBeNull();
	});
});

describe('isRiskySigil', () => {
	it('flags characters that collide with existing block markdown', () => {
		expect(isRiskySigil('#')).toBe(true);
		expect(isRiskySigil('-')).toBe(true);
	});

	it('does not flag an ordinary letter/symbol', () => {
		expect(isRiskySigil('@')).toBe(false);
		expect(isRiskySigil('~')).toBe(false);
	});
});

describe('comment lines', () => {
	it('recognises sigils + % + space, at any depth', () => {
		expect(isCommentLine('@% a note', '@')).toBe(true);
		expect(isCommentLine('@@@% a note', '@')).toBe(true);
		expect(isCommentLine('@%', '@')).toBe(true); // an empty comment
		expect(isCommentLine('@ an entry', '@')).toBe(false);
		expect(isCommentLine('plain prose', '@')).toBe(false);
		expect(isCommentLine('100% of the time', '@')).toBe(false);
	});

	it('is unavailable when the sigil itself is %', () => {
		expect(isCommentLine('%% a note', '%')).toBe(false);
		expect(setComment('prose', '%', true)).toBeNull();
	});

	it('hides the prefix up to and including the space', () => {
		expect(commentPrefixEnd('@% a note', '@')).toBe(3);
		expect('@% a note'.slice(3)).toBe('a note');
		expect(commentPrefixEnd('plain', '@')).toBeNull();
	});

	it('comments and uncomments a body line, and refuses entries and blanks', () => {
		expect(setComment('Some prose.', '@', true)).toBe('@% Some prose.');
		expect(setComment('@% Some prose.', '@', false)).toBe('Some prose.');
		expect(setComment('@% Some prose.', '@', true)).toBe('@% Some prose.'); // idempotent
		expect(setComment('@@ An entry', '@', true)).toBeNull();
		expect(setComment('   ', '@', true)).toBeNull();
	});

	it('leaves an entry line parseable — a comment is never an outline entry', () => {
		expect(isOutlineLine('@% a note', '@')).toBe(false);
		expect(entryLevel('@% a note', '@')).toBeNull();
	});
});
