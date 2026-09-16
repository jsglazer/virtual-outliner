// The outline syntax: depth is a repeated sigil character at line start. The
// character itself is a SETTING (Developer Decision #1 — "keep as
// configurable", confirming the audit's own builder constraint #2 of
// "starting with configured sigils" over an earlier hardcode proposal that
// was rejected at sign-off), default `@`. A required space after the sigil
// run is the disambiguator (Decision #2) — there is no escape handler, since
// CommonMark does not treat these characters specially and a backslash
// escape would leak into the body and every export.
//
// Every function here takes the configured sigil character explicitly rather
// than reading it from settings itself, so this module stays a pure function
// of its arguments (Pure-core rule) — the settings object is a shell/UI
// concern, not something core parsing logic reaches for.

import { ID_SUFFIX_RE } from './id';

export const DEFAULT_SIGIL_CHAR = '@';

// The paragraph-break flag: one optional character between the sigil run and
// the required space (`@@p Focus on failure`). PDF export joins each entry's
// body into the paragraph above it; a flagged entry starts a new paragraph
// instead. It sits inside the prefix both views already hide, so it is never
// visible — the label shows a ¶ instead. Disabled when it IS the sigil
// character, since `pp ` would then be ambiguous with level 2.
export const PARAGRAPH_FLAG = 'p';

function flagPattern(sigilChar: string): string {
	return sigilChar === PARAGRAPH_FLAG ? '' : `${PARAGRAPH_FLAG}?`;
}

// True for `@@p text` (and `@@p `), false for `@@ text`. Non-entry lines are
// false.
export function hasParagraphFlag(line: string, sigilChar: string): boolean {
	const match = outlineLineRegex(sigilChar).exec(line);
	if (!match) return false;
	const sigils = match[1] ?? '';
	return line.slice(sigils.length, sigils.length + PARAGRAPH_FLAG.length) === PARAGRAPH_FLAG && sigilChar !== PARAGRAPH_FLAG;
}

// The same line with the flag added or removed, or null when the line is not
// an outline line (or the flag is unavailable for this sigil).
export function setParagraphFlag(line: string, sigilChar: string, on: boolean): string | null {
	const match = outlineLineRegex(sigilChar).exec(line);
	if (!match || sigilChar === PARAGRAPH_FLAG) return null;
	const sigils = match[1] ?? '';
	const rest = line.slice(sigils.length + (hasParagraphFlag(line, sigilChar) ? PARAGRAPH_FLAG.length : 0));
	return sigils + (on ? PARAGRAPH_FLAG : '') + rest;
}
export const MAX_LEVEL = 6;

function escapeForRegex(char: string): string {
	return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One to `MAX_LEVEL` sigil characters at line start, then whitespace, then
// non-empty text. The text group is everything after the required space,
// which may itself still carry a trailing `^o-xxxxxxxx` block-ref id
// (stripped separately — see id.ts) — this regex only establishes "is this
// line an outline entry".
export function entryLineRegex(sigilChar: string): RegExp {
	const escaped = escapeForRegex(sigilChar);
	return new RegExp(`^(${escaped}{1,${MAX_LEVEL}})(?:${flagPattern(sigilChar)})[ \\t]+(\\S.*)$`);
}

// Level (1-based) of a line, or null if it is not an outline entry.
export function entryLevel(line: string, sigilChar: string): number | null {
	const match = entryLineRegex(sigilChar).exec(line);
	if (!match) return null;
	const sigils = match[1] ?? '';
	return sigils.length;
}

export function isEntryLine(line: string, sigilChar: string): boolean {
	return entryLineRegex(sigilChar).test(line);
}

// Looser than entryLineRegex: sigils + the required separating space, but
// text after it is OPTIONAL. This is the keymap's shared gate (Decision
// #18's "cursor is on an entry line" check) — it must still engage on a
// blanked-out entry (sigils + space, no text left) so Enter's "empty entry
// strips the sigils" exit (Decision #8) can fire; parseOutline deliberately
// does NOT create a tree node for such a line (a blank entry isn't yet a
// real outline node), so Tab/Alt-arrow ops on one are safe no-ops via their
// own `node === null` guard rather than a special case here.
export function outlineLineRegex(sigilChar: string): RegExp {
	const escaped = escapeForRegex(sigilChar);
	return new RegExp(`^(${escaped}{1,${MAX_LEVEL}})(?:${flagPattern(sigilChar)})[ \\t]+(.*)$`);
}

export function isOutlineLine(line: string, sigilChar: string): boolean {
	return outlineLineRegex(sigilChar).test(line);
}

// A comment line: sigils, then `%`, then a space — `@% check this figure`.
// The whole line is left out of every PDF (Dev and Submit alike) while staying
// visible and editable in the note, styled in the comment colour. Its sigil
// count is not a level: a comment is never an outline entry, so `@%` and `@@%`
// behave identically and the parser sees neither as one. Disabled when the
// sigil character IS `%`, where `%%` would be ambiguous.
export const COMMENT_MARK = '%';

export function commentLineRegex(sigilChar: string): RegExp {
	const escaped = escapeForRegex(sigilChar);
	return new RegExp(`^(${escaped}{1,${MAX_LEVEL}}${escapeForRegex(COMMENT_MARK)})(?:[ \\t]+(.*))?$`);
}

export function isCommentLine(line: string, sigilChar: string): boolean {
	return sigilChar !== COMMENT_MARK && commentLineRegex(sigilChar).test(line);
}

// Offset where the hidden `@%` prefix (and the space after it) ends, or null
// when the line is not a comment.
export function commentPrefixEnd(line: string, sigilChar: string): number | null {
	if (!isCommentLine(line, sigilChar)) return null;
	const match = commentLineRegex(sigilChar).exec(line);
	const rest = match?.[2];
	return rest === undefined ? line.length : line.length - rest.length;
}

// The same line commented or uncommented, or null when it cannot be: a blank
// line, an outline entry (those never reach the PDF anyway), or a sigil of `%`.
export function setComment(line: string, sigilChar: string, on: boolean): string | null {
	if (sigilChar === COMMENT_MARK || line.trim() === '') return null;
	const commented = isCommentLine(line, sigilChar);
	if (!commented && isOutlineLine(line, sigilChar)) return null;
	if (on === commented) return line;
	if (on) return `${sigilChar}${COMMENT_MARK} ${line}`;
	const end = commentPrefixEnd(line, sigilChar);
	return end === null ? line : line.slice(end);
}

export interface EntrySegments {
	level: number;
	// Offset within the line where the sigils + required space end and the
	// visible entry text begins — the shell replaces [0, prefixEnd) with the
	// computed label widget so raw sigils are never visible (Architecture:
	// "`@` characters are never visible in live preview or reading mode").
	prefixEnd: number;
	// Offset where the visible text ends, i.e. before any trailing
	// `^o-xxxxxxxx` id suffix (or line end, when there is none) — the shell
	// hides [textEnd, line.length) the same way (Decision #3: id decoration-
	// hidden in both views).
	textEnd: number;
}

// Pure line-structure lookup shared by the CM6 decoration layer and the
// Reading-view post-processor, so neither has to re-derive sigil/id
// boundaries with its own ad hoc string slicing.
export function entrySegments(line: string, sigilChar: string): EntrySegments | null {
	const match = entryLineRegex(sigilChar).exec(line);
	if (!match) return null;
	const sigils = match[1] ?? '';
	const rest = match[2] ?? '';
	const prefixEnd = line.length - rest.length;
	const idSuffixMatch = ID_SUFFIX_RE.exec(rest);
	const textEnd = idSuffixMatch ? prefixEnd + idSuffixMatch.index : line.length;
	return { level: sigils.length, prefixEnd, textEnd };
}

// Characters that already open a CommonMark/Obsidian block construct at line
// start (heading, list, blockquote, code fence, thematic break, table). A
// sigil drawn from this set would be ambiguous with existing markdown and is
// flagged by the settings UI as a warning — core parsing itself stays
// agnostic and accepts whatever single character it is given.
const RISKY_SIGILS = new Set(['#', '-', '*', '+', '>', '`', '=', '|', '_']);

export function isRiskySigil(char: string): boolean {
	return RISKY_SIGILS.has(char) || /[0-9]/.test(char) || /\s/.test(char);
}
