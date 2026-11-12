// Reading-view half of the "hide tags" toggle (Update015). Hiding itself is
// pure CSS under `body.vo-hide-tags`, so switching the toggle needs no
// re-render; this post-processor only marks what that CSS should hide:
//
//   - the spaces before a rendered tag (`a.tag`), as `span.vo-tag-space`, so
//     `public #cite and` reads `public and` rather than `public  and`;
//   - a tag Obsidian leaves as plain text because punctuation, not a space,
//     sits before it (`("polarization").#cite`), as `span.vo-loose-tag`.
//
// Attached %%comments%% need nothing: the renderer already drops them. The
// editor side, which also hides the comments, is editor/tagHide.ts.

const LOOSE_TAG_RE = /([.,;:!?)\]}"'\u2019\u201d*~>])(#[^\s!"#$%&'()*+,.:;<=>?@[\\\]^`{|}~]+)/g;
const ALL_DIGITS_RE = /^#\d+$/;
const SKIP_SELECTOR = 'code, pre, a, .vo-loose-tag, .vo-tag-space';

function wrap(doc: Document, text: string, cls: string): HTMLSpanElement {
	const span = doc.createElement('span');
	span.className = cls;
	span.textContent = text;
	return span;
}

function markTagSpaces(el: HTMLElement): void {
	for (const tag of Array.from(el.querySelectorAll('a.tag'))) {
		const prev = tag.previousSibling;
		if (prev === null || prev.nodeType !== 3) continue;
		const text = prev.textContent ?? '';
		const m = /[ \t\u00a0]+$/.exec(text);
		// Only spaces that follow text: a tag starting the block keeps its place.
		if (m === null || m.index === 0) continue;
		prev.textContent = text.slice(0, m.index);
		tag.before(wrap(el.ownerDocument, m[0], 'vo-tag-space'));
	}
}

function markLooseTags(el: HTMLElement): void {
	const doc = el.ownerDocument;
	const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
	const nodes: Text[] = [];
	for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
		if (!n.parentElement?.closest(SKIP_SELECTOR) && n.textContent?.includes('#')) nodes.push(n as Text);
	}
	for (const node of nodes) {
		const text = node.textContent ?? '';
		const parts: (string | HTMLSpanElement)[] = [];
		let last = 0;
		for (const m of text.matchAll(LOOSE_TAG_RE)) {
			const tag = m[2] ?? '';
			if (ALL_DIGITS_RE.test(tag)) continue;
			const at = (m.index ?? 0) + (m[1] ?? '').length;
			parts.push(text.slice(last, at), wrap(doc, tag, 'vo-loose-tag'));
			last = at + tag.length;
		}
		if (parts.length === 0) continue;
		parts.push(text.slice(last));
		node.replaceWith(...parts);
	}
}

export function markHideableTags(el: HTMLElement): void {
	markTagSpaces(el);
	markLooseTags(el);
}
