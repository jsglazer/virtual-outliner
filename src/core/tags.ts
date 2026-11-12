// Finds the Obsidian #tags in a note, each extended over the %%comment%% that
// belongs to it, so the "hide tags" toggle (Update015) can hide both together:
//
//   Check this #fix%%confirm accuracy%% before sending
//              └──────── one range ───────┘
//
// A comment belongs to the tag when it touches the tag or is separated from it
// only by spaces/tabs on the same line (`#fix %%note%%`). A comment elsewhere
// on the line is left alone. The comment itself may run onto later lines.
//
// What counts as a tag follows Obsidian: a `#` at the start of a line or after
// whitespace, followed by a run of non-terminator characters that is not all
// digits (`#123` is not a tag). Headings (`# Title`), `[[Note#Heading]]`,
// `[x](#anchor)` and `\#` therefore never match. Nothing inside YAML
// frontmatter, a fenced code block, an inline code span or a %%comment%%
// (including the %%md-outline metadata block) is a tag.
//
// Pure: offsets are UTF-16 indices into `doc`, i.e. CodeMirror positions.

import { nextFenceState } from './exportBody';

export interface TagRange {
	from: number;
	to: number;
}

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
// Characters that end a tag name (Obsidian stops a tag at whitespace and at
// these punctuation marks; letters, digits, _, -, / and emoji continue it).
const TAG_TERMINATOR_RE = /[\s!"#$%&'()*+,.:;<=>?@[\\\]^`{|}~]/;
const ALL_DIGITS_RE = /^\d+$/;

function lineEnd(doc: string, pos: number): number {
	const nl = doc.indexOf('\n', pos);
	return nl < 0 ? doc.length : nl;
}

// Offset where the note body starts: just past a closed YAML frontmatter
// block, else 0.
function frontmatterEnd(doc: string): number {
	const firstEnd = lineEnd(doc, 0);
	if (doc.slice(0, firstEnd).trimEnd() !== '---') return 0;
	let pos = firstEnd + 1;
	while (pos <= doc.length) {
		const end = lineEnd(doc, pos);
		const t = doc.slice(pos, end).trimEnd();
		if (t === '---' || t === '...') return Math.min(end + 1, doc.length);
		if (end >= doc.length) break;
		pos = end + 1;
	}
	return 0; // unclosed: Obsidian does not treat it as frontmatter
}

export function findTagRanges(doc: string): TagRange[] {
	const out: TagRange[] = [];
	const n = doc.length;
	let pos = frontmatterEnd(doc);
	let atLineStart = true;
	let fence: string | null = null;
	let inComment = false;

	while (pos < n) {
		if (inComment) {
			const close = doc.indexOf('%%', pos);
			if (close < 0) break; // an unclosed comment runs to the end of the note
			inComment = false;
			pos = close + 2;
			atLineStart = false;
			continue;
		}

		if (atLineStart) {
			atLineStart = false;
			const end = lineEnd(doc, pos);
			const line = doc.slice(pos, end);
			if (fence !== null || FENCE_RE.test(line)) {
				fence = nextFenceState(line, fence);
				pos = end + 1;
				atLineStart = true;
				continue;
			}
		}

		const ch = doc[pos];
		if (ch === '\n') {
			pos++;
			atLineStart = true;
			continue;
		}

		if (ch === '`') {
			let run = 1;
			while (doc[pos + run] === '`') run++;
			const ticks = '`'.repeat(run);
			const close = doc.indexOf(ticks, pos + run);
			// An inline code span closes on the same line; an unmatched run is
			// literal backticks.
			pos = close >= 0 && close < lineEnd(doc, pos) ? close + run : pos + run;
			continue;
		}

		if (ch === '%' && doc[pos + 1] === '%') {
			inComment = true;
			pos += 2;
			continue;
		}

		if (ch === '#' && (pos === 0 || /\s/.test(doc[pos - 1] ?? ''))) {
			let k = pos + 1;
			while (k < n && !TAG_TERMINATOR_RE.test(doc[k] ?? '')) k++;
			const name = doc.slice(pos + 1, k);
			if (name === '' || ALL_DIGITS_RE.test(name)) {
				pos = k > pos + 1 ? k : pos + 1;
				continue;
			}
			let m = k;
			while (doc[m] === ' ' || doc[m] === '\t') m++;
			if (doc[m] === '%' && doc[m + 1] === '%') {
				const close = doc.indexOf('%%', m + 2);
				if (close >= 0) {
					out.push({ from: pos, to: close + 2 });
					pos = close + 2;
					continue;
				}
				// Unclosed: the comment swallows the rest of the note, so only
				// the tag itself is a hideable range.
				out.push({ from: pos, to: k });
				pos = m;
				continue;
			}
			out.push({ from: pos, to: k });
			pos = k;
			continue;
		}

		pos++;
	}
	return out;
}
