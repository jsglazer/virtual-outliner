// Matching Reading View's rendered lines back to source lines. Pure module —
// no 'obsidian', no DOM.
//
// A multi-line paragraph renders as one run of inline nodes per source line,
// `<br>`-separated, so normally run i is source line i. That breaks when an
// inline construct spans a line break: an unclosed `$` (e.g. `$\sigma^2}`
// with the closing `$` forgotten) makes Obsidian run the math on into the
// NEXT line's first `$`, swallowing the `<br>` between them. One fewer run
// than lines, and matching by index would put every later label on the
// wrong line — so the reading view used to give up on the whole paragraph,
// and a single typo left an entire outline as raw sigils (Update009).
//
// Instead each run is matched to a source line by its leading text: the
// literal start of the source line (up to the first character that markdown
// could turn into something else) must be where the run's text starts. A run
// whose next source line doesn't match is taken to have swallowed it, and the
// lines it swallowed simply get no wrapper of their own.

// Characters that can make the rendered text differ from the source from
// that point on: links, emphasis, code, math, HTML/entities, escapes,
// highlights, comments, embeds, block ids.
const MARKUP = /[[\]*_`$<>&\\=~%!^|]/;

// The part of a source line that renders verbatim. Empty when the line opens
// with markup — such a line can't be checked and matches any run.
export function literalLead(line: string): string {
	const trimmed = line.trimStart();
	const cut = trimmed.search(MARKUP);
	return (cut < 0 ? trimmed : trimmed.slice(0, cut)).replace(/\s+/g, ' ').trimEnd();
}

function normalizeRunText(text: string): string {
	return text.replace(/\s+/g, ' ').trimStart();
}

// `runTexts[i]` is the text content of rendered run i; `lines` the source
// lines of the section. Returns, for each run, the index into `lines` of the
// source line it starts, or null when the runs can't be matched with
// confidence (more runs than lines, or a run whose start matches none of the
// lines it could be).
export function alignRunsToLines(runTexts: readonly string[], lines: readonly string[]): number[] | null {
	if (runTexts.length > lines.length) return null;
	if (runTexts.length === lines.length) return runTexts.map((_, i) => i);
	if (runTexts.length === 0) return null;

	const leads = lines.map(literalLead);
	const matches = (run: string, line: number): 'strong' | 'weak' | false => {
		const lead = leads[line];
		if (lead === undefined) return false;
		if (lead === '') return 'weak';
		return run.startsWith(lead) ? 'strong' : false;
	};

	const deficit = lines.length - runTexts.length;
	const out: number[] = [0];
	let skipped = 0;
	for (let i = 1; i < runTexts.length; i++) {
		const prev = out[i - 1] ?? 0;
		const run = normalizeRunText(runTexts[i] ?? '');
		const next = prev + 1;
		// An empty run (two breaks in a row) has no text to match: it is the
		// very next line.
		if (run === '') {
			out.push(next);
			continue;
		}
		const lastCandidate = Math.min(next + (deficit - skipped), lines.length - (runTexts.length - i));
		let chosen: number | null = null;
		if (matches(run, next) === 'strong') chosen = next;
		for (let line = next + 1; chosen === null && line <= lastCandidate; line++) {
			if (matches(run, line) === 'strong') chosen = line;
		}
		if (chosen === null && matches(run, next) === 'weak') chosen = next;
		if (chosen === null) return null;
		skipped += chosen - next;
		out.push(chosen);
	}
	return out;
}
