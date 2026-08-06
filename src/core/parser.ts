// Raw markdown -> outline node tree. Pure line-by-line regex parse, no
// Lezer, no CodeMirror, no Obsidian (Builder constraint §4 / Decision #11).
// Kept simple enough to stay well under the 2ms budget on a 60,000-word
// (~5,000 line) document: one pass to classify lines, one pass to link
// parent/child via a level stack.

import { DEFAULT_SIGIL_CHAR, entryLineRegex } from './sigil';
import { splitEntryId } from './id';
import type { OutlineNode, ParsedOutline } from './types';

export function parseOutline(body: string, sigilChar: string = DEFAULT_SIGIL_CHAR): ParsedOutline {
	const lines = body.split('\n');
	const flat: OutlineNode[] = [];
	const roots: OutlineNode[] = [];
	// One open node per level currently on the path from the root; index 0
	// unused (levels are 1-based).
	const stack: (OutlineNode | null)[] = new Array<OutlineNode | null>(7).fill(null);
	const siblingCounts: number[] = new Array<number>(7).fill(0);
	const seenIds = new Set<string>();
	const entryRe = entryLineRegex(sigilChar);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const match = entryRe.exec(line);
		if (!match) continue;

		const level = (match[1] ?? '').length;
		const rest = match[2] ?? '';
		const { text, id } = splitEntryId(rest);

		let claimedId: string | null = null;
		if (id !== null) {
			if (!seenIds.has(id)) {
				seenIds.add(id);
				claimedId = id;
			}
			// Else: a duplicate (copy-paste) — first in document order keeps
			// the id (Decision #4); this later node stays id-less until the
			// user's next metadata/collapse action re-mints it. The raw line
			// text is left untouched here; only a future rewrite changes it.
		}

		const parent = stack[level - 1] ?? null;
		siblingCounts[level] = (siblingCounts[level] ?? 0) + 1;
		// A new entry at this level invalidates any previously tracked
		// sibling count for deeper levels (a new subtree starts fresh).
		for (let l = level + 1; l <= 6; l++) siblingCounts[l] = 0;

		const node: OutlineNode = {
			entryLine: i,
			level,
			text: text.trimEnd(),
			id: claimedId,
			siblingIndex: siblingCounts[level] ?? 1,
			parent,
			children: [],
			ownBodyStart: i + 1,
			ownBodyEnd: lines.length, // patched below once the next entry is known
			subtreeStart: i,
			subtreeEnd: lines.length, // patched below
		};

		if (parent) parent.children.push(node);
		else roots.push(node);
		stack[level] = node;
		for (let l = level + 1; l <= 6; l++) stack[l] = null;
		flat.push(node);
	}

	// Second pass: close off ownBodyEnd (next entry at ANY level) and
	// subtreeEnd (next entry at a level <= this node's own level) by
	// scanning forward from each node — O(n) total since each node's scan
	// stops at the next entry, and entries partition the document.
	for (let idx = 0; idx < flat.length; idx++) {
		const node = flat[idx];
		if (!node) continue;
		const next = flat[idx + 1];
		node.ownBodyEnd = next ? next.entryLine : lines.length;

		let subtreeEndIdx = idx + 1;
		while (subtreeEndIdx < flat.length) {
			const candidate = flat[subtreeEndIdx];
			if (candidate && candidate.level <= node.level) break;
			subtreeEndIdx++;
		}
		const subtreeNext = flat[subtreeEndIdx];
		node.subtreeEnd = subtreeNext ? subtreeNext.entryLine : lines.length;
	}

	return { roots, flat, lineCount: lines.length };
}

export function nodeAtLine(parsed: ParsedOutline, line: number): OutlineNode | null {
	// Lines are few enough per document (one per outline entry, not per body
	// line) that a linear scan is simpler and fast enough than a line->node
	// index; callers that need this in a hot loop can build their own map.
	for (const node of parsed.flat) {
		if (node.entryLine === line) return node;
	}
	return null;
}

export function nodeById(parsed: ParsedOutline, id: string): OutlineNode | null {
	for (const node of parsed.flat) {
		if (node.id === id) return node;
	}
	return null;
}

// Previous/next SIBLING of `node` (same level, same parent scope) — null when
// `node` is the first/last child of its parent (or first/last root).
export function previousSibling(parsed: ParsedOutline, node: OutlineNode): OutlineNode | null {
	const idx = parsed.flat.indexOf(node);
	for (let i = idx - 1; i >= 0; i--) {
		const candidate = parsed.flat[i];
		if (!candidate || candidate.level < node.level) return null;
		if (candidate.level === node.level) return candidate;
	}
	return null;
}

export function nextSibling(parsed: ParsedOutline, node: OutlineNode): OutlineNode | null {
	const idx = parsed.flat.indexOf(node);
	for (let i = idx + 1; i < parsed.flat.length; i++) {
		const candidate = parsed.flat[i];
		if (!candidate || candidate.level < node.level) return null;
		if (candidate.level === node.level) return candidate;
	}
	return null;
}
