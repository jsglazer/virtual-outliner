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
import type { EditSplice, EnterBehavior, OutlineNode } from './types';

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

// Re-joins whole-line chunks taken from `body[from, to)` in a new order.
//
// A line range that runs to the end of the text has no trailing newline on
// its last line (see lineRangeToOffsets), so concatenating raw slices glued
// that chunk's last line onto the first line of whatever followed it — moving
// the last block of a note down or up produced `@ B@ A` plus a stray blank
// line at the end. Every chunk is given its newline here, and the one extra
// newline is taken back off the end when the original range had none.
function rejoinChunks(body: string, from: number, to: number, chunks: readonly string[]): string[] {
	const withBreaks = chunks.filter((c) => c !== '').map((c) => (c.endsWith('\n') ? c : c + '\n'));
	const last = withBreaks.length - 1;
	const originalHadBreak = body.slice(from, to).endsWith('\n');
	if (last >= 0 && !originalHadBreak) withBreaks[last] = (withBreaks[last] ?? '').slice(0, -1);
	return withBreaks;
}

// The outline node an arbitrary line belongs to: the entry on that line, or
// the nearest entry above it when the line is body text. null for preamble
// above the first entry.
export function ownerNodeAtLine(body: string, line: number, sigilChar: string = DEFAULT_SIGIL_CHAR): OutlineNode | null {
	const parsed = parseOutline(body, sigilChar);
	let owner: OutlineNode | null = null;
	for (const node of parsed.flat) {
		if (node.entryLine > line) break;
		owner = node;
	}
	return owner;
}

// Alt-Up / "Move outline block up": the node's whole subtree (entry, body,
// every descendant) trades places with the previous sibling's subtree. As the
// first child of its parent it instead leaves that parent and becomes the LAST
// child of the parent's previous sibling — the same depth, one section up — so
// a block can keep travelling up the document instead of stopping at its
// parent's edge. Only when no such section exists is it a no-op.
export function moveUp(
	body: string,
	entryLine: number,
	sigilChar: string = DEFAULT_SIGIL_CHAR,
): EditSplice | null {
	const lines = body.split('\n');
	const parsed = parseOutline(body, sigilChar);
	const node = nodeAtLine(parsed, entryLine);
	if (!node) return null;
	const nodeRange = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
	const nodeText = body.slice(nodeRange.from, nodeRange.to);

	const prev = previousSibling(parsed, node);
	if (prev) {
		const prevRange = sliceRange(lines, prev.subtreeStart, prev.subtreeEnd);
		const prevText = body.slice(prevRange.from, prevRange.to);
		const chunks = rejoinChunks(body, prevRange.from, nodeRange.to, [nodeText, prevText]);
		return { from: prevRange.from, to: nodeRange.to, insert: chunks.join(''), movedTo: prevRange.from };
	}

	const parent = node.parent;
	if (!parent || !previousSibling(parsed, parent)) return null;
	// Everything from the parent's entry line down to this node: the parent's
	// own entry and body. The node moves above it, which lands it at the end
	// of the previous sibling's section.
	const headRange = sliceRange(lines, parent.entryLine, node.subtreeStart);
	const headText = body.slice(headRange.from, headRange.to);
	const chunks = rejoinChunks(body, headRange.from, nodeRange.to, [nodeText, headText]);
	return { from: headRange.from, to: nodeRange.to, insert: chunks.join(''), movedTo: headRange.from };
}

// Alt-Down / "Move outline block down": mirror of moveUp. As the last child of
// its parent, the block becomes the FIRST child of the parent's next sibling
// (placed after that sibling's own body, before its existing children).
export function moveDown(
	body: string,
	entryLine: number,
	sigilChar: string = DEFAULT_SIGIL_CHAR,
): EditSplice | null {
	const lines = body.split('\n');
	const parsed = parseOutline(body, sigilChar);
	const node = nodeAtLine(parsed, entryLine);
	if (!node) return null;
	const nodeRange = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
	const nodeText = body.slice(nodeRange.from, nodeRange.to);

	const next = nextSibling(parsed, node);
	if (next) {
		const nextRange = sliceRange(lines, next.subtreeStart, next.subtreeEnd);
		const nextText = body.slice(nextRange.from, nextRange.to);
		const chunks = rejoinChunks(body, nodeRange.from, nextRange.to, [nextText, nodeText]);
		return {
			from: nodeRange.from,
			to: nextRange.to,
			insert: chunks.join(''),
			movedTo: nodeRange.from + (chunks[0] ?? '').length,
		};
	}

	const parent = node.parent;
	const parentNext = parent ? nextSibling(parsed, parent) : null;
	if (!parentNext) return null;
	// The next section's entry line and own body, which the node jumps over.
	const headRange = sliceRange(lines, node.subtreeEnd, parentNext.ownBodyEnd);
	const headText = body.slice(headRange.from, headRange.to);
	const chunks = rejoinChunks(body, nodeRange.from, headRange.to, [headText, nodeText]);
	return {
		from: nodeRange.from,
		to: headRange.to,
		insert: chunks.join(''),
		movedTo: nodeRange.from + (chunks[0] ?? '').length,
	};
}

// `cursorCol` is the cursor's character offset within `lines[entryLine]`
// (its CURRENT, pre-edit content). Returns null only when the line is not an
// outline line at all; every Enter on an entry is consumed.
//
// A trailing ` ^o-xxxxxxxx` id suffix is rendered as an atomic, hidden
// decoration in Live Preview (livePreview.ts), so the cursor can sit right
// before it — which LOOKS and FEELS like "end of line" to the user, since
// there is nothing rendered after it to move past — without matching
// `line.length`. Treating only the true document end as "end of line" left
// that position's Enter falling through to Obsidian's default newline
// insertion, which splits the line right between the visible text and the id
// suffix, stranding `^o-xxxxxxxx` on its own line (Update003 bug report).
//
// Mid-line (Update005) the entry is SPLIT instead of falling through to a
// plain newline: the text after the caret moves to a new entry at the same
// level directly beneath, so it stays part of the outline rather than
// becoming body prose. The id suffix, if any, stays with the original entry.
// At the very start of the text, a blank entry opens ABOVE instead, so the
// text keeps its id (and with it any collapse state and metadata).
//
// `behavior` only affects Enter at the END of an entry — see EnterBehavior.
// Either way no blank line is ever introduced: in 'section' mode the new
// entry goes after the section's last non-blank line, so blank lines that
// already close a section (or a file's trailing newline) stay below it
// rather than ending up between the two entries.
export function addSibling(
	body: string,
	entryLine: number,
	cursorCol: number,
	sigilChar: string = DEFAULT_SIGIL_CHAR,
	behavior: EnterBehavior = 'section',
): EditSplice | null {
	const lines = body.split('\n');
	const line = lines[entryLine];
	if (line === undefined) return null;

	const match = outlineLineRegex(sigilChar).exec(line);
	if (!match) return null;
	const sigils = match[1] ?? '';
	const rest = match[2] ?? '';
	const { text } = splitEntryId(rest);
	const prefixEnd = line.length - rest.length;
	const idMatch = ID_SUFFIX_RE.exec(line);
	const visibleEnd = idMatch ? idMatch.index : line.length;
	const newEntry = sigils + ' ';

	const offsets = lineStartOffsets(lines);
	const lineStart = offsets[entryLine] ?? 0;
	const lineEnd = lineStart + line.length;

	if (text.trim() === '') {
		// Empty entry: strip the sigils — the documented exit from outline mode.
		return { from: lineStart, to: lineEnd, insert: '', cursor: lineStart };
	}

	// The caret can only sit inside the sigil prefix while the label widget is
	// not drawn yet; it means the same thing as the start of the text.
	const col = Math.max(cursorCol, prefixEnd);
	const atVisibleEnd = col >= visibleEnd || line.slice(col, visibleEnd).trim() === '';

	if (!atVisibleEnd) {
		if (line.slice(prefixEnd, col).trim() === '') {
			const insert = newEntry + '\n';
			return { from: lineStart, to: lineStart, insert, cursor: lineStart + insert.length + prefixEnd };
		}
		const head = line.slice(0, col).trimEnd() + line.slice(visibleEnd);
		const insert = head + '\n' + newEntry + line.slice(col, visibleEnd).trimStart();
		return { from: lineStart, to: lineEnd, insert, cursor: lineStart + head.length + 1 + newEntry.length };
	}

	if (behavior === 'line') {
		const insert = '\n' + newEntry;
		return { from: lineEnd, to: lineEnd, insert, cursor: lineEnd + insert.length };
	}

	const parsed = parseOutline(body, sigilChar);
	const node = nodeAtLine(parsed, entryLine);
	if (!node) return null;
	let lastLine = node.subtreeEnd - 1;
	while (lastLine > entryLine && (lines[lastLine] ?? '').trim() === '') lastLine--;
	if (lastLine + 1 < lines.length) {
		const insertAt = offsets[lastLine + 1] ?? body.length;
		return { from: insertAt, to: insertAt, insert: newEntry + '\n', cursor: insertAt + newEntry.length };
	}
	const insert = '\n' + newEntry;
	return { from: body.length, to: body.length, insert, cursor: body.length + insert.length };
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
