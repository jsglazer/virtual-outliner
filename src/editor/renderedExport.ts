// The DOM half of exporting through another plugin's renderer (see
// core/renderedExport.ts for the markdown half and why it exists). Given the
// element the exporter rendered the prepared markdown into, this does what the
// Reading-view post-processor does — labels, one block per source line,
// entry typography and indent, body indent — keyed by the anchors instead of
// by section info. Then, because the exporter prints in an isolated document
// that carries none of this plugin's stylesheet, it writes what that
// stylesheet resolved to onto each element as an inline style.
//
// Nothing interactive is added: no fold chevron, no `…` placeholder, no ¶ —
// they are editing aids, and a page cannot be clicked.
//
// Kept free of the 'obsidian' module (plain DOM only) so it runs anywhere the
// exporter's render host lives.

import { GHOST_ATTR, LINE_ATTR } from '../core/renderedExport';
import type { PreparedRenderedExport } from '../core/renderedExport';

const ANCHOR_SELECTOR = `span[${LINE_ATTR}]`;
// Rendered alongside the note but not part of its prose.
const SKIP_SELECTOR = '.frontmatter, .frontmatter-container, .metadata-container, section.footnotes, .footnotes';
// The scope every reading-view rule in styles.css hangs off.
const RENDERED_CLASS = 'markdown-rendered';
// Which entry line a block is, or which entry its body prose belongs to, and
// at what level — what the alignment and inline-style passes key off.
const ENTRY_ATTR = 'data-vo-entry-line';
const OWNER_ATTR = 'data-vo-owner-line';
const LEVEL_ATTR = 'data-vo-owner-level';
// A block of an outlined note, and one whose first line is an entry — the
// Reading-view classes that carry Line height and the paragraph-margin reset.
const OUTLINED_CLASS = 'vo-ol';
const LEAD_CLASS = 'vo-ol-lead';

interface Segment {
	nodes: ChildNode[];
	br: Element | null;
}

function isElement(node: Node): node is Element {
	return node.nodeType === Node.ELEMENT_NODE;
}

function anchorLine(el: Element): number {
	return Number(el.getAttribute(LINE_ATTR));
}

function isAnchor(node: Node): node is Element {
	return isElement(node) && node.matches(ANCHOR_SELECTOR);
}

function splitByLineBreak(host: Element): Segment[] {
	const segments: Segment[] = [{ nodes: [], br: null }];
	for (const child of Array.from(host.childNodes)) {
		const current = segments[segments.length - 1];
		if (!current) continue;
		if (child.nodeName === 'BR') {
			current.br = child as Element;
			segments.push({ nodes: [], br: null });
		} else {
			current.nodes.push(child);
		}
	}
	return segments;
}

function isBlankRun(nodes: readonly ChildNode[]): boolean {
	return nodes.every((node) => !isElement(node) && (node.textContent ?? '').trim() === '');
}

class Decorator {
	private owner: number | null = null;
	private readonly doc: Document;

	constructor(
		private readonly root: HTMLElement,
		private readonly prepared: PreparedRenderedExport,
	) {
		this.doc = root.ownerDocument;
	}

	run(): void {
		for (const child of Array.from(this.root.children)) {
			if (child.matches(SKIP_SELECTOR)) continue;
			const anchors = Array.from(child.querySelectorAll(ANCHOR_SELECTOR));
			if (anchors.length === 0) {
				// Paragraphs only: a heading or table keeps the exporter's margins.
				if (child.tagName === 'P') child.classList.add(OUTLINED_CLASS);
				this.markBody(child);
				continue;
			}
			const hosts: Element[] = [];
			for (const a of anchors) {
				const host = a.parentElement;
				if (host && !hosts.includes(host)) hosts.push(host);
			}
			for (const host of hosts) this.decorateHost(host);
		}
	}

	private decorateHost(host: Element): void {
		host.classList.add(OUTLINED_CLASS);
		const segments = splitByLineBreak(host);
		if (segments.length === 1) {
			const only = segments[0];
			const a = only?.nodes.find(isAnchor);
			if (!only || !a) return;
			if (a.hasAttribute(GHOST_ATTR)) {
				this.owner = anchorLine(a);
				a.remove();
				if (isBlankRun(Array.from(host.childNodes))) host.remove();
				return;
			}
			this.markEntry(host, a, only.nodes);
			return;
		}
		// A block that opens with an entry leaves its top margin to that entry's
		// line (see `.vo-ol-lead` in styles.css).
		for (const segment of segments) {
			if (segment.nodes.length === 0 || isBlankRun(segment.nodes)) continue;
			const a = segment.nodes.find(isAnchor);
			if (a?.hasAttribute(GHOST_ATTR)) continue;
			if (a) host.classList.add(LEAD_CLASS);
			break;
		}
		for (const segment of segments) {
			const a = segment.nodes.find(isAnchor);
			if (a?.hasAttribute(GHOST_ATTR)) {
				this.owner = anchorLine(a);
				for (const node of segment.nodes) node.remove();
				segment.br?.remove();
				continue;
			}
			if (segment.nodes.length === 0 || isBlankRun(segment.nodes)) continue;
			if (a) {
				this.markEntry(this.blockWrap(segment), a, segment.nodes);
			} else if (this.bodyClasses() !== null) {
				this.markBody(this.blockWrap(segment));
			}
		}
		if (isBlankRun(Array.from(host.childNodes)) && host !== this.root) host.remove();
	}

	// One source line's run of inline nodes as a block of its own, so it can
	// carry that line's indent and spacing. Its `<br>` goes: the block already
	// breaks the line.
	private blockWrap(segment: Segment): HTMLElement {
		const wrapper = this.doc.createElement('span');
		wrapper.classList.add('vo-line');
		const first = segment.nodes[0];
		first?.parentNode?.insertBefore(wrapper, first);
		for (const node of segment.nodes) wrapper.appendChild(node);
		segment.br?.remove();
		return wrapper;
	}

	private markEntry(block: Element, a: Element, nodes: readonly ChildNode[]): void {
		const line = anchorLine(a);
		const { plan } = this.prepared;
		const level = plan.entryLevel.get(line) ?? this.prepared.entryLevels.get(line) ?? 1;
		this.owner = line;
		block.classList.add(`vo-indent-l${level}`, `vo-entry-l${level}`);
		block.setAttribute(ENTRY_ATTR, String(line));
		block.setAttribute(LEVEL_ATTR, String(level));

		// Everything after the anchor on its line is the entry's text.
		const after = nodes.slice(nodes.indexOf(a) + 1);
		const text = this.doc.createElement('span');
		text.className = `vo-text vo-l${level}`;
		a.after(text);
		for (const node of after) text.appendChild(node);
		const label = plan.labels.get(line);
		if (label !== undefined) {
			const span = this.doc.createElement('span');
			span.className = `vo-label vo-l${level}`;
			span.textContent = label;
			text.before(span);
		}
		a.remove();
	}

	private bodyClasses(): number | null {
		if (!this.prepared.indentBody || this.owner === null) return null;
		return this.prepared.entryLevels.get(this.owner) ?? null;
	}

	private markBody(block: Element): void {
		const level = this.bodyClasses();
		if (level === null || this.owner === null) return;
		block.classList.add(`vo-body-indent-l${level}`);
		block.setAttribute(OWNER_ATTR, String(this.owner));
		block.setAttribute(LEVEL_ATTR, String(level));
	}
}

// Body prose lines up with where its entry's TEXT starts, past the label —
// a rendered width, so it is measured, exactly as the Reading-view shell does.
// An owner that is not on the page (Body-only view) falls back to the last
// offset measured at its level, then to the CSS level-based indent.

function entryTextOffset(entry: Element): number | null {
	const rect = entry.querySelector('.vo-text')?.getClientRects()[0];
	if (!rect) return null;
	return Math.round((rect.left - entry.getBoundingClientRect().left) * 10) / 10;
}

function alignBody(root: HTMLElement): void {
	const byLevel = new Map<string, number>();
	const byLine = new Map<string, number>();
	for (const entry of Array.from(root.querySelectorAll(`[${ENTRY_ATTR}]`))) {
		const offset = entryTextOffset(entry);
		if (offset === null) continue;
		byLine.set(entry.getAttribute(ENTRY_ATTR) ?? '', offset);
		byLevel.set(entry.getAttribute(LEVEL_ATTR) ?? '', offset);
	}
	for (const body of Array.from(root.querySelectorAll<HTMLElement>(`[${OWNER_ATTR}]`))) {
		const offset = byLine.get(body.getAttribute(OWNER_ATTR) ?? '') ?? byLevel.get(body.getAttribute(LEVEL_ATTR) ?? '');
		if (offset !== undefined) body.setCssProps({ '--vo-body-text-offset': `${offset}px` });
	}
}

// ── Inline styles ────────────────────────────────────────────────────────────
// Only what this plugin's stylesheet sets. The inherited font properties are
// written only where they differ from the parent's — where the outline level
// actually changed them — so everywhere else the exporter's own typography
// still decides; a size is written as a ratio of the parent's, so it scales
// with whatever size the exporter prints body text at.

const FONT_PROPERTIES = ['font-weight', 'font-family', 'font-style', 'color'] as const;

function px(value: string): number {
	return Number.parseFloat(value) || 0;
}

function plannedStyle(el: HTMLElement, view: Window): string[] {
	const own = view.getComputedStyle(el);
	const decls: string[] = [];
	const cls = el.classList;
	if (cls.contains('vo-line')) decls.push(`display: ${own.display}`);
	if (cls.contains('vo-label')) {
		decls.push(`margin-inline-end: ${own.getPropertyValue('margin-inline-end')}`, 'white-space: pre');
	}
	if (el.hasAttribute(ENTRY_ATTR)) {
		decls.push(
			`padding-inline-start: ${own.getPropertyValue('padding-inline-start')}`,
			`margin-top: ${own.marginTop}`,
			'box-sizing: border-box',
		);
		const parent = el.parentElement ? view.getComputedStyle(el.parentElement) : null;
		if (parent) {
			const ratio = px(own.fontSize) / (px(parent.fontSize) || 1);
			if (Math.abs(ratio - 1) > 0.001) decls.push(`font-size: ${Math.round(ratio * 10000) / 10000}em`);
			for (const prop of FONT_PROPERTIES) {
				const value = own.getPropertyValue(prop);
				if (value !== parent.getPropertyValue(prop)) decls.push(`${prop}: ${value}`);
			}
		}
	}
	if (cls.contains(OUTLINED_CLASS)) {
		// The bottom margin goes so an entry's margin-top is the whole gap
		// above it instead of collapsing into the paragraph spacing; a body
		// paragraph keeps the exporter's own top margin.
		decls.push('margin-bottom: 0');
		if (cls.contains(LEAD_CLASS)) decls.push('margin-top: 0');
		// Line height as a ratio of the font size, so it scales with whatever
		// size the exporter prints at; written only when the setting changed it.
		const parent = el.parentElement ? view.getComputedStyle(el.parentElement) : null;
		const lineHeight = px(own.lineHeight);
		if (parent && lineHeight > 0 && own.lineHeight !== parent.lineHeight) {
			decls.push(`line-height: ${Math.round((lineHeight / (px(own.fontSize) || 1)) * 1000) / 1000}`);
		}
	}
	if (el.hasAttribute(OWNER_ATTR)) decls.push(`margin-inline-start: ${own.getPropertyValue('margin-inline-start')}`);
	return decls;
}

function freezeStyles(root: HTMLElement): void {
	const view = root.ownerDocument.defaultView;
	if (!view) return;
	const selector = `.vo-line, .vo-label, .${OUTLINED_CLASS}, [${ENTRY_ATTR}], [${OWNER_ATTR}]`;
	// Read everything before writing anything: an inline style changes what
	// its descendants compute.
	const plans = Array.from(root.querySelectorAll<HTMLElement>(selector)).map((el) => [el, plannedStyle(el, view)] as const);
	for (const [el, decls] of plans) {
		const existing = (el.getAttribute('style') ?? '').trim();
		const joined = decls.join('; ');
		if (joined === '') continue;
		el.setAttribute('style', existing === '' ? joined : `${existing.replace(/;?$/, ';')} ${joined}`);
	}
}

export function decorateRenderedExport(root: HTMLElement, prepared: PreparedRenderedExport): void {
	const scoped = !root.classList.contains(RENDERED_CLASS);
	if (scoped) root.classList.add(RENDERED_CLASS);
	try {
		new Decorator(root, prepared).run();
		alignBody(root);
		freezeStyles(root);
	} finally {
		if (scoped) root.classList.remove(RENDERED_CLASS);
	}
}
