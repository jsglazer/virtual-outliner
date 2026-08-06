// Reading View rendering: a markdown post-processor that hides whatever the
// current view/collapse state hides and materializes computed labels into
// literal text at the front of each visible entry line. Runs FULLY
// SYNCHRONOUSLY — no async/await anywhere in this file — resolving lines via
// `ctx.getSectionInfo(el)` and rendering the element unchanged when that
// returns null, exactly as the reviewer criterion requires (compatibility
// with Obsidian's off-screen PDF print render depends on this).
//
// Precision is only attempted for a section that is EXACTLY one source line
// (`lineStart === lineEnd`) — by far the common case, since every entry the
// plugin itself creates (via Enter) lands on its own line. A section
// spanning multiple source lines (entries and body merged into one rendered
// paragraph because the user typed them with no blank line between) is only
// hidden wholesale when every line in it is hidden; otherwise it is left
// untouched rather than risk mis-splicing rendered DOM the plugin doesn't
// fully control. This is a deliberate v1 scope boundary — see the build
// manifest — on the "hidden-region editing edge cases" question the audit
// left open.
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

function collectFirstAndLastTextNode(root: HTMLElement): { first: Text | null; last: Text | null } {
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let first: Text | null = null;
	let last: Text | null = null;
	let node = walker.nextNode();
	while (node) {
		if (!first) first = node as Text;
		last = node as Text;
		node = walker.nextNode();
	}
	return { first, last };
}

function materializeLabel(el: HTMLElement, line: string, sigilChar: string, label: string, level: number): void {
	const segs = entrySegments(line, sigilChar);
	if (!segs) return;
	const prefixStr = line.slice(0, segs.prefixEnd);
	const idSuffixStr = segs.textEnd < line.length ? line.slice(segs.textEnd) : '';

	const { first, last } = collectFirstAndLastTextNode(el);
	if (idSuffixStr !== '' && last?.nodeValue?.endsWith(idSuffixStr)) {
		last.nodeValue = last.nodeValue.slice(0, -idSuffixStr.length);
	}
	if (first?.nodeValue?.startsWith(prefixStr)) {
		first.nodeValue = first.nodeValue.slice(prefixStr.length);
		const labelSpan = el.ownerDocument.createElement('span');
		labelSpan.className = `vo-label vo-l${level}`;
		labelSpan.textContent = label;
		first.parentNode?.insertBefore(labelSpan, first);
	}
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
		if (allHidden) el.addClass('vo-hidden');
	};
}
