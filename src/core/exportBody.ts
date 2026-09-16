// Body-only extraction for PDF export. Pure — no 'obsidian', no DOM.
//
// The PDF is the prose alone: every outline entry line (any level, including a
// bare `@@ ` still awaiting text), the entry ids that live on those lines, the
// `%%md-outline` metadata block and the YAML frontmatter are all dropped. View
// and collapse state are ignored on purpose, so a note always exports the same
// document whatever happens to be folded.
//
// Deliberately separate from generateFilteredCopy (exportFilter.ts), which
// mirrors what the editor currently shows and simply deletes hidden lines.
//
// Paragraphs: an entry's body normally CONTINUES the paragraph above it, since
// a subsection is often just the next sentence or two. A new paragraph starts
// where the entry carries the paragraph-break flag (`@@p text`), where the note
// has a blank line, or where either side of the seam is not plain prose — a
// heading, list, table, quote or code fence, which pandoc would otherwise
// misread as lazy continuation of the block before it.

import { parseMetaDocument } from './metadata';
import { hasParagraphFlag, isOutlineLine, outlineLineRegex } from './sigil';

export type LostKind = 'footnote' | 'citation' | 'link' | 'embed';

// Something written ON an entry line that disappears with it.
export interface LostContent {
	line: number; // 0-based line in the frontmatter-free body
	text: string; // the entry's text, sigils stripped
	kinds: LostKind[];
}

export interface BodyExtraction {
	body: string;
	lost: LostContent[];
	isEmpty: boolean;
}

const FENCE_RE = /^\s*(`{3,}|~{3,})/;

// A code fence opens with ``` or ~~~ and closes with the same character run
// at least as long. Returns the open fence marker, or null outside a fence.
export function nextFenceState(line: string, open: string | null): string | null {
	const m = FENCE_RE.exec(line);
	if (!m) return open;
	const marker = m[1] ?? '';
	if (open === null) return marker;
	return marker[0] === open[0] && marker.length >= open.length ? null : open;
}

export function stripFrontmatter(doc: string): string {
	const lines = doc.split('\n');
	if ((lines[0] ?? '').trimEnd() !== '---') return doc;
	for (let i = 1; i < lines.length; i++) {
		const t = (lines[i] ?? '').trimEnd();
		if (t === '---' || t === '...') return lines.slice(i + 1).join('\n');
	}
	return doc;
}

const FOOTNOTE_RE = /\[\^[^\]\s]+\]|\^\[/;
const EMBED_RE = /!\[\[/;
const WIKILINK_RE = /(^|[^!])\[\[/;
const MD_LINK_RE = /(^|[^!])\[[^\]]*\]\([^)]+\)/;

export function lostKinds(entryText: string): LostKind[] {
	const kinds: LostKind[] = [];
	if (FOOTNOTE_RE.test(entryText)) kinds.push('footnote');
	if (collectCiteKeys(entryText).length > 0) kinds.push('citation');
	if (WIKILINK_RE.test(entryText) || MD_LINK_RE.test(entryText)) kinds.push('link');
	if (EMBED_RE.test(entryText)) kinds.push('embed');
	return kinds;
}

// Line starts that open their own block, so a seam next to one must keep its
// blank line: heading, list item, blockquote, fence, table row, thematic
// break, indented code, and pandoc's `:::` divs and `:` definitions.
const BLOCK_START_RE = /^(?:\s{4,}|\t|#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||:{1,3}(?:\s|$)|`{3,}|~{3,}|(?:[-*_]\s*){3,}$)/;

function isPlainProse(line: string): boolean {
	return line.trim() !== '' && !BLOCK_START_RE.test(line);
}

export function extractBody(doc: string, sigilChar: string): BodyExtraction {
	const lines = stripFrontmatter(parseMetaDocument(doc).body).split('\n');
	const entryRe = outlineLineRegex(sigilChar);
	const out: string[] = [];
	const lost: LostContent[] = [];
	let fence: string | null = null;
	let lastBlank = true; // suppresses leading blank lines too
	let lastText = ''; // the last non-blank line emitted
	let dropped = false; // an entry line was removed since the last body line
	let forceBreak = false; // …and at least one of them carried the flag

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (fence === null && isOutlineLine(line, sigilChar)) {
			const entryText = (entryRe.exec(line)?.[2] ?? '').trim();
			const kinds = lostKinds(entryText);
			if (kinds.length > 0) lost.push({ line: i, text: entryText, kinds });
			dropped = true;
			if (hasParagraphFlag(line, sigilChar)) forceBreak = true;
			continue;
		}
		const blank = fence === null && line.trim() === '';
		if (dropped && !blank && !lastBlank && (forceBreak || !isPlainProse(lastText) || !isPlainProse(line))) {
			out.push('');
			lastBlank = true;
		}
		dropped = false;
		forceBreak = false;
		if (fence !== null || FENCE_RE.test(line)) {
			fence = nextFenceState(line, fence);
			out.push(line);
			lastBlank = false;
			lastText = line;
			continue;
		}
		if (blank && lastBlank) continue;
		out.push(blank ? '' : line);
		lastBlank = blank;
		if (!blank) lastText = line;
	}
	while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') out.pop();

	const body = out.join('\n');
	return { body, lost, isEmpty: body.trim() === '' };
}

// --- citations ------------------------------------------------------------

// Pandoc citation keys: `[@key]`, `[-@key, p. 3]`, `[see @a; @b]`, bare
// `@key`, and `@{key with spaces}`. A key starts with a letter, digit or `_`,
// may contain internal punctuation `:.#$%&-+?<>~/`, and ends in a letter,
// digit or `_`. The `@` must not follow a letter/digit (that's an email
// address). Fenced code and inline code spans are skipped.
const CITE_RE = /(^|[^A-Za-z0-9_@.\\])-?@(\{[^}]+\}|[A-Za-z0-9_À-ɏ][A-Za-z0-9_À-ɏ:.#$%&+?<>~/-]*)/g;

function trimKey(raw: string): string {
	if (raw.startsWith('{')) return raw.slice(1, -1).trim();
	return raw.replace(/[^A-Za-z0-9_À-ɏ]+$/, '');
}

export function stripInlineCode(line: string): string {
	return line.replace(/(`+)[\s\S]*?\1/g, ' ');
}

export function collectCiteKeys(markdown: string): string[] {
	const keys: string[] = [];
	const seen = new Set<string>();
	let fence: string | null = null;
	for (const line of markdown.split('\n')) {
		if (fence !== null || FENCE_RE.test(line)) {
			fence = nextFenceState(line, fence);
			continue;
		}
		const scan = stripInlineCode(line);
		CITE_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = CITE_RE.exec(scan)) !== null) {
			const key = trimKey(m[2] ?? '');
			if (key !== '' && !seen.has(key)) {
				seen.add(key);
				keys.push(key);
			}
		}
	}
	return keys;
}

export interface LibraryKey {
	citekey: string;
	libraryID: number;
}

// Groups cite keys by the Zotero library that holds them (the first library
// wins when a key exists in several); keys no library knows come back apart.
export function groupKeysByLibrary(
	keys: readonly string[],
	known: readonly LibraryKey[],
): { byLibrary: Map<number, string[]>; unknown: string[] } {
	const libraryOf = new Map<string, number>();
	for (const k of known) if (!libraryOf.has(k.citekey)) libraryOf.set(k.citekey, k.libraryID);
	const byLibrary = new Map<number, string[]>();
	const unknown: string[] = [];
	for (const key of keys) {
		const lib = libraryOf.get(key);
		if (lib === undefined) {
			unknown.push(key);
			continue;
		}
		const list = byLibrary.get(lib) ?? [];
		list.push(key);
		byLibrary.set(lib, list);
	}
	return { byLibrary, unknown };
}
