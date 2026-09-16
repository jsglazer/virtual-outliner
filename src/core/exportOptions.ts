// PDF export options: per-note frontmatter over settings defaults, plus the
// output-path rule. Pure — no 'obsidian', no Node. The shell hands in the
// parsed frontmatter object Obsidian already has, and absolute folder paths.
//
// Frontmatter keys (case-insensitive), as used in real notes:
//   pdf-output: "~/Dev/TEMP/Puzzle"   folder (or a path ending in .pdf)
//   headnum: y/n                      number body headings
//   TOC: y/n                          table of contents
//   cite: MLA                         MLA | APA | Chicago | Chicago-notes | path to a .csl
//   notes: e/f                        endnotes at document end / footnotes at page bottom
//   fontsize: 12                      default for the export dialog
//   title / author                    running header
//   bibliography: refs.json           used instead of Zotero when present
//   latex-preamble: Meta/x.tex        one-off preamble for this note

export type NotesMode = 'f' | 'e';

export const FONT_SIZES: readonly string[] = ['8', '9', '10', '11', '12', '14', '17', '20'];
export const CITE_STYLES: readonly string[] = ['MLA', 'APA', 'Chicago', 'Chicago-notes'];

export interface ExportDefaults {
	headnum: boolean;
	toc: boolean;
	notes: NotesMode;
	cite: string;
}

export interface ExportOptions {
	headnum: boolean;
	toc: boolean;
	notes: NotesMode;
	cite: string;
	pdfOutput: string;
	// null when the note doesn't say; the dialog then uses the last size used.
	fontsize: string | null;
	title: string;
	// null when the note doesn't say; the Author setting applies.
	author: string | null;
	bibliography: string;
	latexPreamble: string;
}

export function frontmatterValue(fm: Record<string, unknown> | null | undefined, key: string): unknown {
	if (!fm) return undefined;
	const wanted = key.toLowerCase();
	for (const [k, v] of Object.entries(fm)) {
		if (k.toLowerCase() === wanted) return v;
	}
	return undefined;
}

function text(v: unknown): string {
	if (typeof v === 'string') return v.trim();
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	return '';
}

export function parseYesNo(v: unknown, fallback: boolean): boolean {
	if (typeof v === 'boolean') return v;
	const s = text(v).toLowerCase();
	if (['y', 'yes', 'true', '1', 'on'].includes(s)) return true;
	if (['n', 'no', 'false', '0', 'off'].includes(s)) return false;
	return fallback;
}

export function parseNotes(v: unknown, fallback: NotesMode): NotesMode {
	const s = text(v).toLowerCase();
	if (s.startsWith('e')) return 'e';
	if (s.startsWith('f')) return 'f';
	return fallback;
}

// '12', '12pt', 12 → '12'; anything extarticle can't set → null.
export function normalizeFontSize(v: unknown): string | null {
	let s = text(v).toLowerCase();
	if (s.endsWith('pt')) s = s.slice(0, -2).trim();
	return FONT_SIZES.includes(s) ? s : null;
}

export function resolveExportOptions(
	fm: Record<string, unknown> | null | undefined,
	defaults: ExportDefaults,
	noteBasename: string,
): ExportOptions {
	const title = text(frontmatterValue(fm, 'title'));
	const author = text(frontmatterValue(fm, 'author'));
	const cite = text(frontmatterValue(fm, 'cite'));
	return {
		headnum: parseYesNo(frontmatterValue(fm, 'headnum'), defaults.headnum),
		toc: parseYesNo(frontmatterValue(fm, 'toc'), defaults.toc),
		notes: parseNotes(frontmatterValue(fm, 'notes'), defaults.notes),
		cite: cite !== '' ? cite : defaults.cite,
		pdfOutput: text(frontmatterValue(fm, 'pdf-output')),
		fontsize: normalizeFontSize(frontmatterValue(fm, 'fontsize')),
		title: title !== '' ? title : noteBasename,
		author: author !== '' ? author : null,
		bibliography: text(frontmatterValue(fm, 'bibliography')),
		latexPreamble: text(frontmatterValue(fm, 'latex-preamble')),
	};
}

// POSIX-only path normalization (the exporter is macOS-only): collapses `.`,
// `..` and repeated slashes without touching the filesystem.
export function normalizePosixPath(p: string): string {
	const absolute = p.startsWith('/');
	const out: string[] = [];
	for (const part of p.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
			else if (!absolute) out.push('..');
			continue;
		}
		out.push(part);
	}
	return (absolute ? '/' : '') + out.join('/');
}

// Where the PDF goes. Blank → beside the note as `<note>.pdf`. `~` expands to
// the home folder; a relative path is relative to the note's folder; a path
// ending in `.pdf` names the file itself, anything else is a folder that gets
// `<note>.pdf` inside it.
export function resolvePdfOutput(pdfOutput: string, noteDirAbs: string, noteStem: string, homeDir: string): string {
	let value = pdfOutput.trim();
	if (value === '') return normalizePosixPath(`${noteDirAbs}/${noteStem}.pdf`);
	if (value === '~') value = homeDir;
	else if (value.startsWith('~/')) value = `${homeDir}/${value.slice(2)}`;
	if (!value.startsWith('/')) value = `${noteDirAbs}/${value}`;
	if (value.toLowerCase().endsWith('.pdf')) return normalizePosixPath(value);
	return normalizePosixPath(`${value}/${noteStem}.pdf`);
}

// `Note.pdf` + `-Submit` -> `Note-Submit.pdf`. The suffix goes on the stem,
// never the extension, and is trimmed; an empty one gives the path back
// unchanged.
export function suffixedPdfPath(pdfPath: string, suffix: string): string {
	const clean = suffix.trim();
	if (clean === '') return pdfPath;
	const slash = pdfPath.lastIndexOf('/');
	const name = pdfPath.slice(slash + 1);
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : '';
	return `${pdfPath.slice(0, slash + 1)}${stem}${clean}${ext}`;
}

// The first free `<stem>-01.pdf`, `<stem>-02.pdf`, … beside `pdfPath`, offered
// instead of overwriting when `pdfPath` already exists. Numbers are at least
// two digits and grow past 99.
export function numberedPdfPath(pdfPath: string, exists: (path: string) => boolean): string {
	const slash = pdfPath.lastIndexOf('/');
	const dir = pdfPath.slice(0, slash + 1);
	const name = pdfPath.slice(slash + 1);
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : '';
	for (let n = 1; ; n++) {
		const candidate = `${dir}${stem}-${String(n).padStart(2, '0')}${ext}`;
		if (!exists(candidate)) return candidate;
	}
}

// Cheap sanity checks for the preamble editor. Not a LaTeX parser: it only
// catches the mistakes that make every export fail.
export function checkPreamble(preamble: string): string[] {
	const warnings: string[] = [];
	let depth = 0;
	let unbalanced = false;
	for (const rawLine of preamble.split('\n')) {
		let line = '';
		for (let i = 0; i < rawLine.length; i++) {
			const ch = rawLine[i];
			if (ch === '\\') {
				line += rawLine.slice(i, i + 2);
				i++;
				continue;
			}
			if (ch === '%') break;
			line += ch;
		}
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === '\\') {
				i++;
				continue;
			}
			if (ch === '{') depth++;
			else if (ch === '}') {
				depth--;
				if (depth < 0) unbalanced = true;
			}
		}
		if (/\\documentclass\b/.test(line)) warnings.push('Remove \\documentclass — this is a preamble include, not a full document.');
		if (/\\begin\{document\}/.test(line)) warnings.push('Remove \\begin{document} — the export adds it.');
	}
	if (unbalanced || depth !== 0) warnings.unshift('Braces { } are unbalanced.');
	return warnings;
}
