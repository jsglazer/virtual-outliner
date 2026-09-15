// Obsidian-flavoured Markdown → pandoc Markdown, for PDF export. Pure: every
// vault lookup goes through the injected resolver, which the shell backs with
// metadataCache (exact link resolution) and Vault reads.
//
// Handled here (fenced code and inline code spans are never touched):
//   %%comments%%            removed (inline or spanning lines)
//   > [!note]- Title        callout marker → bold title line in a plain quote
//   text ^block-id          trailing block id removed
//   ![[image.png|300]]      staged into the build folder, width kept
//   ![[Note]] / ![[Note#Heading]] / ![[Note#^id]]
//                           body of that note/section/block inlined, with its
//                           own outline stripped (recursively, cycle-safe)
//   [[Note#Heading|Alias]]  plain text (alias, else "Note > Heading")
//   ![alt](img.png)         vault-relative image staged like an embed
//   [text](Other.md)        plain text (no dead links in the PDF)

import { extractBody, nextFenceState } from './exportBody';

export interface ResolvedLink {
	path: string; // vault path
	kind: 'markdown' | 'image' | 'other';
}

export interface ExportResolver {
	resolveLink(linkpath: string, fromPath: string): ResolvedLink | null;
	readNote(path: string): Promise<string>;
	// Registers a vault image for copying and returns its build-relative path.
	stageImage(path: string): string;
}

export interface ConversionIssue {
	kind: 'unresolved' | 'unsupported' | 'cycle';
	target: string;
}

export interface ConversionResult {
	markdown: string;
	issues: ConversionIssue[];
}

const MAX_EMBED_DEPTH = 5;
const FENCE_START_RE = /^\s*(`{3,}|~{3,})/;
const EMBED_RE = /!\[\[([^\]]+)\]\]/g;
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
const MD_LINK_RE = /\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const CALLOUT_RE = /^(\s*(?:>\s*)+)\[!([^\]]+)\][+-]?\s*(.*)$/;
const BLOCK_ID_RE = /\s\^[A-Za-z0-9-]+\s*$/;
const REMOTE_RE = /^[a-z][a-z0-9+.-]*:/i;

// Removes %%comments%%, which may open on one line and close on a later one.
// A line that held nothing but comment disappears entirely, so it can't turn
// into a paragraph break.
export function stripComments(markdown: string): string {
	const out: string[] = [];
	let fence: string | null = null;
	let inComment = false;
	for (const line of markdown.split('\n')) {
		if (!inComment && (fence !== null || FENCE_START_RE.test(line))) {
			fence = nextFenceState(line, fence);
			out.push(line);
			continue;
		}
		if (!inComment && !line.includes('%%')) {
			out.push(line);
			continue;
		}
		let kept = '';
		let rest = line;
		while (rest.length > 0) {
			const idx = rest.indexOf('%%');
			if (idx === -1) {
				if (!inComment) kept += rest;
				break;
			}
			if (!inComment) kept += rest.slice(0, idx);
			inComment = !inComment;
			rest = rest.slice(idx + 2);
		}
		if (kept.trim() !== '' || line.trim() === '') out.push(kept.trimEnd());
	}
	return out.join('\n');
}

// Splits a line into alternating [text, code, text, code, …] segments so
// rewrites never reach inside `inline code`.
function splitCode(line: string): string[] {
	const parts: string[] = [];
	const re = /(`+)[\s\S]*?\1/g;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		parts.push(line.slice(last, m.index), m[0]);
		last = m.index + m[0].length;
	}
	parts.push(line.slice(last));
	return parts;
}

function splitTarget(inner: string): { linkpath: string; subpath: string; alias: string } {
	const bar = inner.indexOf('|');
	const target = (bar === -1 ? inner : inner.slice(0, bar)).trim();
	const alias = bar === -1 ? '' : inner.slice(bar + 1).trim();
	const hash = target.indexOf('#');
	return {
		linkpath: hash === -1 ? target : target.slice(0, hash),
		subpath: hash === -1 ? '' : target.slice(hash + 1),
		alias,
	};
}

export function wikilinkText(inner: string): string {
	const { linkpath, subpath, alias } = splitTarget(inner);
	if (alias !== '') return alias;
	const name = linkpath.replace(/\.md$/i, '');
	const sub = subpath.startsWith('^') ? '' : subpath.replace(/#/g, ' > ');
	if (name === '') return sub;
	return sub === '' ? name : `${name} > ${sub}`;
}

// The lines of the section under `heading` (through the next heading of the
// same or a shallower level), or of the block carrying `^id`.
export function extractSubpath(markdown: string, subpath: string): string | null {
	const lines = markdown.split('\n');
	if (subpath.startsWith('^')) {
		const id = subpath.slice(1);
		const idx = lines.findIndex((l) => new RegExp(`\\s\\^${id.replace(/[-]/g, '\\-')}\\s*$`).test(l));
		if (idx === -1) return null;
		let start = idx;
		while (start > 0 && (lines[start - 1] ?? '').trim() !== '') start--;
		return lines.slice(start, idx + 1).join('\n');
	}
	const wanted = subpath.split('#').pop()?.trim().toLowerCase() ?? '';
	let start = -1;
	let level = 0;
	for (let i = 0; i < lines.length; i++) {
		const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i] ?? '');
		if (!m) continue;
		const lvl = (m[1] ?? '').length;
		if (start === -1) {
			if ((m[2] ?? '').trim().toLowerCase() === wanted) {
				start = i;
				level = lvl;
			}
		} else if (lvl <= level) {
			return lines.slice(start, i).join('\n');
		}
	}
	return start === -1 ? null : lines.slice(start).join('\n');
}

function decodeTarget(raw: string): string {
	const t = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
	try {
		return decodeURIComponent(t);
	} catch {
		return t;
	}
}

function imageRef(rel: string): string {
	return /[\s()<>]/.test(rel) ? `<${rel}>` : rel;
}

function sizeAttr(alias: string): string {
	const m = /^(\d+)(?:x\d+)?$/.exec(alias.trim());
	return m ? `{width=${m[1]}px}` : '';
}

interface Context {
	sigilChar: string;
	resolver: ExportResolver;
	issues: ConversionIssue[];
	stack: string[];
}

async function convertEmbed(inner: string, fromPath: string, ctx: Context, standalone: boolean): Promise<string> {
	const { linkpath, subpath, alias } = splitTarget(inner);
	const decoded = decodeTarget(linkpath);
	if (REMOTE_RE.test(decoded)) return `![](${imageRef(decoded)})${sizeAttr(alias)}`;

	const resolved = linkpath === '' ? { path: fromPath, kind: 'markdown' as const } : ctx.resolver.resolveLink(decoded, fromPath);
	if (!resolved) {
		ctx.issues.push({ kind: 'unresolved', target: inner });
		return '';
	}
	if (resolved.kind === 'image') {
		const alt = sizeAttr(alias) === '' ? alias : '';
		return `![${alt}](${imageRef(ctx.resolver.stageImage(resolved.path))})${sizeAttr(alias)}`;
	}
	if (resolved.kind !== 'markdown') {
		ctx.issues.push({ kind: 'unsupported', target: inner });
		return '';
	}
	if (ctx.stack.includes(resolved.path) || ctx.stack.length >= MAX_EMBED_DEPTH) {
		ctx.issues.push({ kind: 'cycle', target: inner });
		return '';
	}
	let content = extractBody(await ctx.resolver.readNote(resolved.path), ctx.sigilChar).body;
	if (subpath !== '') {
		const section = extractSubpath(content, subpath);
		if (section === null) {
			ctx.issues.push({ kind: 'unresolved', target: inner });
			return '';
		}
		content = section;
	}
	ctx.stack.push(resolved.path);
	const converted = await convertText(content, resolved.path, ctx);
	ctx.stack.pop();
	return standalone ? `\n${converted.trim()}\n` : converted.trim().replace(/\n+/g, ' ');
}

async function convertSegment(segment: string, fromPath: string, ctx: Context, standalone: boolean): Promise<string> {
	let out = '';
	let last = 0;
	EMBED_RE.lastIndex = 0;
	const embeds: { index: number; length: number; inner: string }[] = [];
	let m: RegExpExecArray | null;
	while ((m = EMBED_RE.exec(segment)) !== null) embeds.push({ index: m.index, length: m[0].length, inner: m[1] ?? '' });
	for (const e of embeds) {
		out += segment.slice(last, e.index);
		out += await convertEmbed(e.inner, fromPath, ctx, standalone);
		last = e.index + e.length;
	}
	out += segment.slice(last);

	out = out.replace(MD_IMAGE_RE, (whole, alt: string, target: string, title: string) => {
		const decoded = decodeTarget(target);
		if (REMOTE_RE.test(decoded) || decoded.startsWith('/') || decoded.startsWith('assets/')) return whole;
		const resolved = ctx.resolver.resolveLink(decoded, fromPath);
		if (!resolved || resolved.kind !== 'image') {
			ctx.issues.push({ kind: 'unresolved', target: decoded });
			return '';
		}
		return `![${alt}](${imageRef(ctx.resolver.stageImage(resolved.path))}${title})`;
	});
	out = out.replace(WIKILINK_RE, (_whole, inner: string) => wikilinkText(inner));
	out = out.replace(MD_LINK_RE, (whole, label: string, target: string, offset: number, full: string) => {
		if (offset > 0 && full[offset - 1] === '!') return whole;
		const decoded = decodeTarget(target);
		if (REMOTE_RE.test(decoded) || decoded.startsWith('#')) return whole;
		return label;
	});
	return out;
}

async function convertText(markdown: string, fromPath: string, ctx: Context): Promise<string> {
	const out: string[] = [];
	let fence: string | null = null;
	for (const rawLine of stripComments(markdown).split('\n')) {
		if (fence !== null || FENCE_START_RE.test(rawLine)) {
			fence = nextFenceState(rawLine, fence);
			out.push(rawLine);
			continue;
		}
		let line = rawLine;
		const callout = CALLOUT_RE.exec(line);
		if (callout) {
			const type = (callout[2] ?? '').trim();
			const title = (callout[3] ?? '').trim() || type.charAt(0).toUpperCase() + type.slice(1);
			line = `${callout[1] ?? '> '}**${title}**`;
		}
		line = line.replace(BLOCK_ID_RE, '');
		const standalone = /^\s*!\[\[[^\]]+\]\]\s*$/.test(line);
		const parts = splitCode(line);
		let rebuilt = '';
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i] ?? '';
			rebuilt += i % 2 === 1 ? part : await convertSegment(part, fromPath, ctx, standalone);
		}
		out.push(rebuilt);
	}
	return out.join('\n');
}

export async function toPandocMarkdown(
	body: string,
	fromPath: string,
	sigilChar: string,
	resolver: ExportResolver,
): Promise<ConversionResult> {
	const ctx: Context = { sigilChar, resolver, issues: [], stack: [fromPath] };
	const markdown = await convertText(body, fromPath, ctx);
	return { markdown: collapseBlankRuns(markdown), issues: ctx.issues };
}

// Standalone embeds splice in blank-line-padded blocks; fold any resulting
// runs of blank lines back to one, outside fenced code only.
function collapseBlankRuns(markdown: string): string {
	const out: string[] = [];
	let fence: string | null = null;
	for (const line of markdown.split('\n')) {
		if (fence !== null || FENCE_START_RE.test(line)) {
			fence = nextFenceState(line, fence);
			out.push(line);
			continue;
		}
		if (line.trim() === '' && (out.length === 0 || (out[out.length - 1] ?? '').trim() === '')) continue;
		out.push(line.trim() === '' ? '' : line);
	}
	while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') out.pop();
	return out.join('\n');
}
