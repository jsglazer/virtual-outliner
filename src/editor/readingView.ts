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

import { computeRenderPlan, isLineHidden } from '../core/render';
import { entrySegments } from '../core/sigil';
import type { LevelFormat, ViewState } from '../core/types';

export interface ReadingHost {
	sigilChar(path: string): string;
	levels(path: string): readonly LevelFormat[];
	viewState(path: string): ViewState;
	collapsedIds(path: string): ReadonlySet<string>;
	// Synchronous cached body lookup (the shell keeps this warm from vault
	// events); null when nothing is cached yet for this path.
	getBody(path: string): string | null;
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
	if (idSuffixStr !== '' && last?.nodeValue?.endsWith(idSuffixStr)) {
		last.nodeValue = last.nodeValue.slice(0, -idSuffixStr.length);
	}
	if (first?.nodeValue?.startsWith(prefixStr)) {
		first.nodeValue = first.nodeValue.slice(prefixStr.length);
		const labelSpan = doc.createElement('span');
		labelSpan.className = `vo-label vo-l${level}`;
		labelSpan.textContent = label;
		first.parentNode?.insertBefore(labelSpan, first);
		wrapEntryText(first, last, level, doc);
	}
}

function materializeLabel(el: HTMLElement, line: string, sigilChar: string, label: string, level: number): void {
	materializeLabelIn(el.childNodes, line, sigilChar, label, level, el.ownerDocument);
}

// A section spanning multiple source lines (entries with no blank line
// between them, which Obsidian renders as ONE paragraph joined by <br>) has
// one segment of top-level child nodes per source line, `<br>` elements as
// the separators. Splitting on those lets each line's label/text be
// materialized independently instead of being skipped wholesale.
function splitByLineBreak(el: HTMLElement): Node[][] {
	const segments: Node[][] = [[]];
	for (const child of Array.from(el.childNodes)) {
		if (child.nodeName === 'BR') {
			segments.push([]);
		} else {
			segments[segments.length - 1]?.push(child);
		}
	}
	return segments;
}

function levelClasses(indentLevel: number | undefined, entryLevel: number | undefined): string[] {
	const classes: string[] = [];
	if (indentLevel !== undefined) classes.push(`vo-indent-l${indentLevel}`);
	if (entryLevel !== undefined) classes.push(`vo-entry-l${entryLevel}`);
	return classes;
}

export function createReadingPostProcessor(host: ReadingHost) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
		const body = host.getBody(ctx.sourcePath);
		if (body === null) return;
		const section = ctx.getSectionInfo(el);
		if (!section) return;

		const sigilChar = host.sigilChar(ctx.sourcePath);
		const levels = host.levels(ctx.sourcePath);
		const viewState = host.viewState(ctx.sourcePath);
		const collapsedIds = host.collapsedIds(ctx.sourcePath);
		const plan = computeRenderPlan(body, sigilChar, levels, viewState, collapsedIds);

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

		// Best-effort indent for a merged multi-line paragraph: apply the
		// first (visible) line's level to the whole block, since a single
		// block element can't carry different padding per visual sub-line.
		for (let line = lineStart; line <= lineEnd; line++) {
			if (isLineHidden(plan.hiddenLineRanges, line)) continue;
			const indent = plan.indentLevel.get(line);
			const entryLvl = plan.entryLevel.get(line);
			if (indent === undefined && entryLvl === undefined) continue;
			for (const cls of levelClasses(indent, entryLvl)) el.addClass(cls);
			break;
		}

		const segments = splitByLineBreak(el);
		if (segments.length === lineEnd - lineStart + 1) {
			const lines = body.split('\n');
			for (let i = 0; i < segments.length; i++) {
				const line = lineStart + i;
				if (isLineHidden(plan.hiddenLineRanges, line)) continue;
				const label = plan.labels.get(line);
				if (label === undefined) continue;
				const level = plan.entryLevel.get(line) ?? 1;
				const lineText = lines[line];
				if (lineText === undefined) continue;
				const segment = segments[i];
				if (!segment) continue;
				materializeLabelIn(segment, lineText, sigilChar, label, level, el.ownerDocument);
			}
		}
	};
}
