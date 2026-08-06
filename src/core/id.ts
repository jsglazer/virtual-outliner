// Node identity: a stable id carried on the outline line itself in Obsidian's
// native block-ref form, e.g. `@@ Background ^o-a3f2k9pq`. Ids are minted
// LAZILY — only on the first metadata/collapse action touching a node
// (Decision #3) — and this module never mints randomly on its own; the shell
// supplies the entropy (Date.now()/Math.random()) so this stays pure and
// testable (mirrors md-annotation's generateAnnotationId(seed1, seed2)).

const ID_PREFIX = '^o-';
const ID_LENGTH = 8;
const BASE36 = 36;

// Trailing ` ^o-xxxxxxxx` (8 lowercase base36 chars) at end of line.
export const ID_SUFFIX_RE = / \^o-([0-9a-z]{8})$/;

export function mintId(seed1: number, seed2: number): string {
	const mixed = (Math.abs(Math.floor(seed1)) * 2654435761 + Math.floor(seed2 * 2 ** 32)) >>> 0;
	return ID_PREFIX + mixed.toString(BASE36).padStart(ID_LENGTH, '0');
}

// Splits an entry line's text (the part after the sigils + required space)
// into { text, id }: `id` is null when no id suffix is present.
export function splitEntryId(text: string): { text: string; id: string | null } {
	const match = ID_SUFFIX_RE.exec(text);
	if (!match) return { text, id: null };
	const digits = match[1] ?? '';
	return { text: text.slice(0, match.index), id: ID_PREFIX + digits };
}

export function appendId(text: string, id: string): string {
	return `${text} ${id}`;
}
