// Structural operations: demote/promote (Tab/Shift-Tab), add sibling (Enter),
// and node movement (Alt-Up/Alt-Down). Every op is a pure function of the
// current body text plus the active entry line; it returns `null` (nothing
// to do) or a single line-range splice `{from, to, insert}` in body/document
// character offsets — the shell's only job is to turn that into one CM6
// transaction (Decision #9). Each op's unit of work is the node's FULL
// subtree — entry + body + every descendant and its body — so demoting,
// promoting, or moving a node always carries its hidden prose with it
// (Decision #6); nothing is ever orphaned.

import {
	DEFAULT_SIGIL_CHAR,
	MAX_LEVEL,
	entryLevel,
	isEntryLine,
	isOutlineLine,
	outlineLineRegex,
} from './sigil';
import { ID_SUFFIX_RE, splitEntryId } from './id';
import { lineRangeToOffsets, lineStartOffsets } from './lines';
import { nextSibling, nodeAtLine, parseOutline, previousSibling } from './parser';
import type { EditSplice, OutlineNode } from './types';

function sliceRange(lines: readonly string[], start: number, end: number): { from: number; to: number } {
	return lineRangeToOffsets(lineStartOffsets(lines), start, end);
}

function subtreeText(body: string, lines: readonly string[], node: OutlineNode): string {
	const { from, to } = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
	return body.slice(from, to);
}

// Deepest entry level anywhere within a node's own subtree (>= node.level).
function deepestLevelInSubtree(lines: readonly string[], node: OutlineNode, sigilChar: string): number {
	let max = node.level;
	for (let i = node.subtreeStart; i < node.subtreeEnd; i++) {
		const level = entryLevel(lines[i] ?? '', sigilChar);
		if (level !== null && level > max) max = level;
	}
	return max;
}

function shiftSubtreeLevels(text: string, delta: 1 | -1, sigilChar: string): string {
	const lines = text.split('\n');
	const shifted = lines.map((line) => {
		if (!isEntryLine(line, sigilChar)) return line;
		return delta === 1 ? sigilChar + line : line.slice(sigilChar.length);
	});
	return shifted.join('\n');
}

export function demote(
	body: string,
	entryLine: number,
	sigilChar: string = DEFAULT_SIGIL_CHAR,
): EditSplice | null {
	const lines = body.split('\n');
	const parsed = parseOutline(body, sigilChar);
	const node = nodeAtLine(parsed, entryLine);
	if (!node) return null;
	if (node.level >= MAX_LEVEL) return null;
	if (deepestLevelInSubtree(lines, node, sigilChar) >= MAX_LEVEL) return null;

	const idx = parsed.flat.indexOf(node);
	const prev = idx > 0 ? parsed.flat[idx - 1] : null;
	if (!prev || prev.level < node.level) return null; // no-gap rule

	const { from, to } = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
	const insert = shiftSubtreeLevels(subtreeText(body, lines, node), 1, sigilChar);
	return { from, to, insert };
}

export function promote(
	body: string,
	entryLine: number,
	sigilChar: string = DEFAULT_SIGIL_CHAR,
): EditSplice | null {
	const lines = body.split('\n');
	const parsed = parseOutline(body, sigilChar);
	const node = nodeAtLine(parsed, entryLine);
	if (!node) return null;
	if (node.level <= 1) return null;

	const { from, to } = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
	const insert = shiftSubtreeLevels(subtreeText(body, lines, node), -1, sigilChar);
	return { from, to, insert };
}

export function moveUp(
	body: string,
	entryLine: number,
	sigilChar: string = DEFAULT_SIGIL_CHAR,
): EditSplice | null {
	const lines = body.split('\n');
	const parsed = parseOutline(body, sigilChar);
	const node = nodeAtLine(parsed, entryLine);
	if (!node) return null;
	const prev = previousSibling(parsed, node);
	if (!prev) return null;

	const prevRange = sliceRange(lines, prev.subtreeStart, prev.subtreeEnd);
	const nodeRange = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
	const prevText = body.slice(prevRange.from, prevRange.to);
	const nodeText = body.slice(nodeRange.from, nodeRange.to);
	return { from: prevRange.from, to: nodeRange.to, insert: nodeText + prevText };
}

export function moveDown(
	body: string,
	entryLine: number,
	sigilChar: string = DEFAULT_SIGIL_CHAR,
): EditSplice | null {
	const lines = body.split('\n');
	const parsed = parseOutline(body, sigilChar);
	const node = nodeAtLine(parsed, entryLine);
	if (!node) return null;
	const next = nextSibling(parsed, node);
	if (!next) return null;

	const nodeRange = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
	const nextRange = sliceRange(lines, next.subtreeStart, next.subtreeEnd);
	const nodeText = body.slice(nodeRange.from, nodeRange.to);
	const nextText = body.slice(nextRange.from, nextRange.to);
	return { from: nodeRange.from, to: nextRange.to, insert: nextText + nodeText };
}

// `cursorCol` is the cursor's character offset within `lines[entryLine]`
// (its CURRENT, pre-edit content). Returns null when the caller should fall
// through to normal Enter behavior (cursor is mid-line, not at end of the
// entry) — every other case is consumed.
//
// A trailing ` ^o-xxxxxxxx` id suffix is rendered as an atomic, hidden
// decoration in Live Preview (livePreview.ts), so the cursor can sit right
// before it — which LOOKS and FEELS like "end of line" to the user, since
// there is nothing rendered after it to move past — without matching
// `line.length`. Treating only the true document end as "end of line" left
// that position's Enter falling through to Obsidian's default newline
// insertion, which splits the line right between the visible text and the id
// suffix, stranding `^o-xxxxxxxx` on its own line (Update003 bug report).
export function addSibling(
	body: string,
	entryLine: number,
	cursorCol: number,
	sigilChar: string = DEFAULT_SIGIL_CHAR,
): EditSplice | null {
	const lines = body.split('\n');
	const line = lines[entryLine] ?? '';
	const idMatch = ID_SUFFIX_RE.exec(line);
	const visibleEnd = idMatch ? idMatch.index : line.length;
	if (cursorCol !== line.length && cursorCol !== visibleEnd) return null; // mid-line: fall through

	const match = outlineLineRegex(sigilChar).exec(line);
	if (!match) return null;
	const level = (match[1] ?? '').length;
	const rest = match[2] ?? '';
	const { text } = splitEntryId(rest);

	const offsets = lineStartOffsets(lines);

	if (text.trim() === '') {
		// Empty entry: strip the sigils — the documented exit from outline mode.
		const from = offsets[entryLine] ?? 0;
		const to = from + line.length;
		return { from, to, insert: '' };
	}

	const parsed = parseOutline(body, sigilChar);
	const node = nodeAtLine(parsed, entryLine);
	if (!node) return null;
	const insertAt = offsets[node.subtreeEnd] ?? body.length;
	const atEof = node.subtreeEnd >= parsed.lineCount;
	const newEntry = sigilChar.repeat(level) + ' ';
	const insert = atEof ? '\n' + newEntry : newEntry + '\n';
	return { from: insertAt, to: insertAt, insert };
}

// Mod-Enter on an entry line: open a PLAIN prose line — no sigils, no label,
// no new outline level — as the first line of that entry's OWN body, directly
// beneath the entry. Deliberately different from addSibling in three ways:
//
//  - it inserts right after the entry line rather than after the whole
//    subtree, because body prose belongs to the entry it sits under, not
//    after that entry's children (which is where a SIBLING goes);
//  - the cursor column is irrelevant and the current line is never split, so
//    there is no mid-line fall-through — "give me a body line here" means the
//    same thing wherever the caret happens to be in the entry;
//  - an empty entry is left alone rather than being stripped of its sigils
//    (that exit belongs to Enter — see addSibling — and stripping here would
//    make Mod-Enter silently destroy the entry the user was standing on).
export function addBodyLine(
	body: string,
	entryLine: number,
	sigilChar: string = DEFAULT_SIGIL_CHAR,
): EditSplice | null {
	const lines = body.split('\n');
	const line = lines[entryLine];
	if (line === undefined) return null;
	if (!isOutlineLine(line, sigilChar)) return null;

	const offsets = lineStartOffsets(lines);
	const insertAt = (offsets[entryLine] ?? 0) + line.length;
	return { from: insertAt, to: insertAt, insert: '\n' };
}
