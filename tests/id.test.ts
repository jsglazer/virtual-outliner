import { describe, expect, it } from 'vitest';

import { ID_SUFFIX_RE, appendId, mintId, splitEntryId } from '../src/core/id';

describe('mintId', () => {
	it('is deterministic for the same seeds', () => {
		expect(mintId(1700000000000, 0.42)).toBe(mintId(1700000000000, 0.42));
	});

	it('always produces the `^o-` + 8 base36 char shape', () => {
		const id = mintId(Date.now(), Math.random());
		expect(id).toMatch(/^\^o-[0-9a-z]{8}$/);
	});

	it('differs for different seeds (collision resistance, not a hard guarantee)', () => {
		expect(mintId(1, 0.1)).not.toBe(mintId(2, 0.9));
	});
});

describe('splitEntryId / appendId', () => {
	it('extracts a trailing block-ref id and the text before it', () => {
		expect(splitEntryId('Background ^o-a3f2k9pq')).toEqual({ text: 'Background', id: '^o-a3f2k9pq' });
	});

	it('returns a null id when there is no suffix', () => {
		expect(splitEntryId('Background')).toEqual({ text: 'Background', id: null });
	});

	it('round-trips through appendId', () => {
		const text = 'Background';
		const id = '^o-a3f2k9pq';
		expect(splitEntryId(appendId(text, id))).toEqual({ text, id });
	});

	it('does not match an id-shaped string that is not anchored at the end', () => {
		expect(ID_SUFFIX_RE.test('^o-a3f2k9pq trailing text')).toBe(false);
	});
});
