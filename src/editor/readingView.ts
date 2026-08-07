// Reading View rendering: a markdown post-processor that hides whatever the
// current view/collapse state hides and materializes computed labels into
// literal text at the front of each visible entry line. Runs FULLY
// SYNCHRONOUSLY — no async/await anywhere in this file — resolving lines via
// `ctx.getSectionInfo(el)` and rendering the element unchanged when that
// returns null, exactly as the reviewer criterion requires (compatibility
// with Obsidian's off-screen PDF print render depends on this).
//
// A section that is EXACTLY one source line (`lineStart === lineEnd`) is the
// common case, since every entry the plugin itself creates (via Enter) lands
// on its own line — labels materialize directly against the section
// element's own child nodes. A section spanning multiple source lines
// (entries typed with no blank line between them, which Obsidian renders as
// ONE paragraph joined by `<br>`) is split back into per-line node segments
// on those `<br>` boundaries so each line still gets its own label; if that
// split doesn't land exactly one segment per line (an Obsidian rendering
// shape this module doesn't recognize), the section is left untouched rather
// than risk mis-splicing DOM the plugin doesn't fully control — it is still
// hidden wholesale when every line in it is hidden.
//
// Unlike md-annotation's overlay decorations, nothing here needs teardown on
// unload: this is one-shot text materialization baked into a single render
// pass, not a persistent decoration that could leak across re-renders.

import type { MarkdownPostProcessorContext } from 'obsidian';

import { parseMetaDocument } from '../core/metadata';
import { computeRenderPlan, isLineHidden } from '../core/render';
import { entrySegments } from '../core/sigil';
import type { LevelFormat, ViewState } from '../core/types';

export interface ReadingHost {
	sigilChar(path: string): string;
	levels(path: string): readonly LevelFormat[];
	viewState(path: string): ViewState;
	collapsedIds(path: string): ReadonlySet<string>;
	indentBody(path: string): boolean;
}

function collectFirstAndLastTextNode(nodes: Iterable<Node>): { first: Text | null; last: Text | null } {
	let first: Text | null = null;
	let last: Text | null = null;
	for (const root of nodes) {
		if (root.nodeType === Node.TEXT_NODE) {
			if (!first) first = root as Text;
			last = root as Text;
			continue;
		}
		if (!root.instanceOf(HTMLElement)) continue;
		const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node = walker.nextNode();
		while (node) {
			if (!first) first = node as Text;
			last = node as Text;
			node = walker.nextNode();
		}
	}
	return { first, last };
}

// Moves every sibling from `first` through `last` (inclusive, same parent)
// into a new wrapper span so the entry's visible TEXT — not just its number
// label — carries the level's typography classes (font size/weight/family/
// color/italic all key off `vo-lN`, same as the label span).
function wrapEntryText(first: Text, last: Text | null, level: number, doc: Document): void {
	const wrapper = doc.createElement('span');
	wrapper.className = `vo-text vo-l${level}`;
	first.parentNode?.insertBefore(wrapper, first);
	let node: ChildNode | null = first;
	while (node) {
		const next: ChildNode | null = node.nextSibling;
		wrapper.appendChild(node);
		if (node === last) break;
		node = next;
	}
}

// Obsidian emits a multi-line paragraph as `…<br>\n@ Thesis<br>\n…`, so the
// text node for every line after the first BEGINS WITH THAT NEWLINE. A strict
// `startsWith(prefix)` test misses on all of them, which is precisely the
// document shape this plugin exists for — consecutive entry lines. Only
// whitespace is allowed to precede the sigil run; anything else means this
// text node isn't the start of the entry and is left alone.
function stripLinePrefix(node: Text, prefix: string): boolean {
	const raw = node.nodeValue ?? '';
	const index = raw.indexOf(prefix);
	if (index < 0 || raw.slice(0, index).trim() !== '') return false;
	node.nodeValue = raw.slice(index + prefix.length);
	return true;
}

// Trailing-whitespace tolerant for the same reason. A no-op when the id was
// already stripped by Obsidian itself (which it does for a block id that
// lands at the end of a block, but not for one mid-paragraph).
function stripIdSuffix(node: Text, suffix: string): boolean {
	const raw = node.nodeValue ?? '';
	const trimmed = raw.trimEnd();
	if (!trimmed.endsWith(suffix)) return false;
	node.nodeValue = trimmed.slice(0, -suffix.length);
	return true;
}

function materializeLabelIn(
	nodes: Iterable<Node>,
	line: string,
	sigilChar: string,
	label: string,
	level: number,
	doc: Document,
): void {
	const segs = entrySegments(line, sigilChar);
	if (!segs) return;
	const prefixStr = line.slice(0, segs.prefixEnd);
	const idSuffixStr = segs.textEnd < line.length ? line.slice(segs.textEnd) : '';

	const { first, last } = collectFirstAndLastTextNode(nodes);
	if (!first) return;
	if (idSuffixStr !== '' && last) stripIdSuffix(last, idSuffixStr);
	if (!stripLinePrefix(first, prefixStr)) return;

	const labelSpan = doc.createElement('span');
	labelSpan.className = `vo-label vo-l${level}`;
	labelSpan.textContent = label;
	first.parentNode?.insertBefore(labelSpan, first);
	wrapEntryText(first, last, level, doc);
}

function materializeLabel(el: HTMLElement, line: string, sigilChar: string, label: string, level: number): void {
	materializeLabelIn(el.childNodes, line, sigilChar, label, level, el.ownerDocument);
}

// A section spanning multiple source lines (entries with no blank line
// between them, which Obsidian renders as ONE paragraph joined by <br>) has
// one run of top-level child nodes per source line, `<br>` elements as the
// separators. `br` is the break that TERMINATES the run (null on the last
// one) — kept so a run can be turned into a block of its own and its now
// redundant break removed from the flow.
interface LineSegment {
	nodes: Node[];
	br: HTMLElement | null;
}

// The element a post-processor is handed is Obsidian's per-section wrapper
// (`div.el-p`, `div.el-h2`, …), one level ABOVE the `<p>` that actually holds
// the `<br>`-separated lines. Splitting the wrapper finds no breaks at all —
// just one opaque child — so every multi-line section looked like a shape
// this module didn't recognize and fell through to the block-level fallback,
// leaving raw sigils on screen. Descend past any chain of single-element
// wrappers to the node whose own children are the inline content.
function inlineHost(el: HTMLElement): HTMLElement {
	let host = el;
	for (;;) {
		const children = Array.from(host.childNodes);
		const only = children.length === 1 ? children[0] : null;
		if (!only || !only.instanceOf(HTMLElement)) return host;
		host = only;
	}
}

function splitByLineBreak(el: HTMLElement): LineSegment[] {
	const segments: LineSegment[] = [{ nodes: [], br: null }];
	for (const child of Array.from(el.childNodes)) {
		const current = segments[segments.length - 1];
		if (!current) continue;
		if (child.nodeName === 'BR') {
			current.br = child as HTMLElement;
			segments.push({ nodes: [], br: null });
		} else {
			current.nodes.push(child);
		}
	}
	return segments;
}

// Turns one source line's run of inline nodes into its own block element so
// it can carry that line's indent/spacing (a `<span>` shared with five other
// lines inside one `<p>` cannot). The terminating `<br>` is dropped: with the
// run now `display: block` it would add a second line break.
function blockWrapSegment(segment: LineSegment, classes: readonly string[], doc: Document): HTMLElement | null {
	const first = segment.nodes[0];
	if (!first) return null;
	const wrapper = doc.createElement('span');
	wrapper.className = classes.join(' ');
	first.parentNode?.insertBefore(wrapper, first);
	for (const node of segment.nodes) wrapper.appendChild(node);
	segment.br?.remove();
	return wrapper;
}

function levelClasses(indentLevel: number | undefined, entryLevel: number | undefined): string[] {
	const classes: string[] = [];
	if (indentLevel !== undefined) classes.push(`vo-indent-l${indentLevel}`);
	if (entryLevel !== undefined) classes.push(`vo-entry-l${entryLevel}`);
	return classes;
}

export function createReadingPostProcessor(host: ReadingHost) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
		const section = ctx.getSectionInfo(el);
		if (!section) return;

		// `section.text` is the WHOLE current file — the same string
		// `lineStart`/`lineEnd` index into. Deriving the body from it rather
		// than from a plugin-side cache is what makes this correct on the
		// very first render: a note already open when the plugin loads never
		// fires `file-open`, so a cache lookup would come back empty and the
		// raw sigils would render through untouched.
		const { body } = parseMetaDocument(section.text);

		const sigilChar = host.sigilChar(ctx.sourcePath);
		const levels = host.levels(ctx.sourcePath);
		const viewState = host.viewState(ctx.sourcePath);
		const collapsedIds = host.collapsedIds(ctx.sourcePath);
		const plan = computeRenderPlan(
			body,
			sigilChar,
			levels,
			viewState,
			collapsedIds,
			host.indentBody(ctx.sourcePath),
		);

		const { lineStart, lineEnd } = section;

		if (lineStart === lineEnd) {
			if (isLineHidden(plan.hiddenLineRanges, lineStart)) {
				el.addClass('vo-hidden');
				return;
			}
			for (const cls of levelClasses(plan.indentLevel.get(lineStart), plan.entryLevel.get(lineStart))) {
				el.addClass(cls);
			}
			const label = plan.labels.get(lineStart);
			if (label === undefined) return;
			const level = plan.entryLevel.get(lineStart) ?? 1;
			const lines = body.split('\n');
			const lineText = lines[lineStart];
			if (lineText === undefined) return;
			materializeLabel(el, lineText, sigilChar, label, level);
			return;
		}

		let allHidden = true;
		for (let line = lineStart; line <= lineEnd; line++) {
			if (!isLineHidden(plan.hiddenLineRanges, line)) {
				allHidden = false;
				break;
			}
		}
		if (allHidden) {
			el.addClass('vo-hidden');
			return;
		}

		const doc = el.ownerDocument;
		const segments = splitByLineBreak(inlineHost(el));

		if (segments.length !== lineEnd - lineStart + 1) {
			// An Obsidian rendering shape this module doesn't recognize —
			// leave the DOM alone rather than risk mis-splicing it, and fall
			// back to indenting the whole block by its first visible line.
			for (let line = lineStart; line <= lineEnd; line++) {
				if (isLineHidden(plan.hiddenLineRanges, line)) continue;
				const indent = plan.indentLevel.get(line);
				const entryLvl = plan.entryLevel.get(line);
				if (indent === undefined && entryLvl === undefined) continue;
				for (const cls of levelClasses(indent, entryLvl)) el.addClass(cls);
				break;
			}
			return;
		}

		const lines = body.split('\n');
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			if (!segment) continue;
			const line = lineStart + i;
			const hidden = isLineHidden(plan.hiddenLineRanges, line);

			if (segment.nodes.length === 0) {
				// Nothing to wrap (an empty visual line) — only its break is
				// left to suppress when the line is hidden.
				if (hidden) segment.br?.remove();
				continue;
			}

			const classes = hidden
				? ['vo-hidden']
				: ['vo-line', ...levelClasses(plan.indentLevel.get(line), plan.entryLevel.get(line))];
			const wrapper = blockWrapSegment(segment, classes, doc);
			if (!wrapper || hidden) continue;

			const label = plan.labels.get(line);
			if (label === undefined) continue;
			const lineText = lines[line];
			if (lineText === undefined) continue;
			const level = plan.entryLevel.get(line) ?? 1;
			materializeLabelIn(Array.from(wrapper.childNodes), lineText, sigilChar, label, level, doc);
		}
	};
}
