// The "hide tags" toggle (Update015) in the editor: every #tag, together with
// the %%comment%% attached to it (see core/tags.ts), is replaced by nothing —
// on every line, the cursor's included.
//
// A hidden tag behaves like one invisible character the caret steps over: its
// range is atomic, so arrows and clicks never land inside it, and the delete
// guard below makes Backspace/Delete next to it remove the visible character
// beyond it instead of the tag. Only a selection that spans a hidden tag
// deletes it, as it deletes everything else it covers.
//
// A StateField rather than a ViewPlugin because an attached comment may span
// lines, and CM6 only accepts line-break-replacing decorations from state.
// Scanning is debounced off `docChanged` like the outline resolve: between
// scans the known ranges are mapped through each edit, so a tag being typed
// stays visible until typing pauses.

import { EditorState, findClusterBreak, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { Extension, Text, Transaction, TransactionSpec } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';

import { findTagRanges } from '../core/tags';

export const TAG_SCAN_DEBOUNCE_MS = 200;

export const setTagsHidden = StateEffect.define<boolean>();
const rescanTags = StateEffect.define<null>();

interface TagHideValue {
	hidden: boolean;
	// Every tag range in the document (empty while not hidden).
	deco: DecorationSet;
}

const HIDE = Decoration.replace({});

export function scanTagDecorations(doc: Text): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	for (const r of findTagRanges(doc.toString())) {
		if (r.to > r.from) builder.add(r.from, r.to, HIDE);
	}
	return builder.finish();
}

const OFF: TagHideValue = { hidden: false, deco: Decoration.none };

// Read when an editor is created, so a note opened while the toggle is on
// starts hidden; later changes arrive as `setTagsHidden` effects.
let hiddenAtCreate: () => boolean = () => false;

export const tagHideField = StateField.define<TagHideValue>({
	create: (state) => (hiddenAtCreate() ? { hidden: true, deco: scanTagDecorations(state.doc) } : OFF),
	update(value, tr) {
		let hidden = value.hidden;
		let rescan = false;
		for (const effect of tr.effects) {
			if (effect.is(setTagsHidden)) {
				rescan = effect.value && !hidden;
				hidden = effect.value;
			} else if (effect.is(rescanTags)) {
				rescan = true;
			}
		}
		if (!hidden) return value.hidden ? OFF : value;
		if (rescan) return { hidden: true, deco: scanTagDecorations(tr.state.doc) };
		if (!tr.docChanged) return value;
		return { hidden: true, deco: value.deco.map(tr.changes) };
	},
	provide: (f) => [
		EditorView.decorations.from(f, (v) => v.deco),
		EditorView.atomicRanges.of((view) => view.state.field(f).deco),
	],
});

// Rewrites a caret Backspace/Delete that would remove only hidden tag text so
// it removes the visible character beyond the tag instead; a deletion that
// also reaches visible text keeps just its visible parts. A deletion from a
// real selection (or several cursors) passes untouched. Exported for tests.
export function guardTagDelete(tr: Transaction): TransactionSpec | readonly TransactionSpec[] {
	if (!tr.docChanged || !tr.isUserEvent('delete')) return tr;
	const value = tr.startState.field(tagHideField, false);
	if (!value?.hidden || value.deco.size === 0) return tr;
	const sel = tr.startState.selection;
	if (sel.ranges.length !== 1 || !sel.main.empty) return tr;

	let fromA = -1;
	let toA = -1;
	let count = 0;
	tr.changes.iterChanges((fa, ta) => {
		count++;
		fromA = fa;
		toA = ta;
	});
	if (count !== 1 || toA <= fromA) return tr;

	const hit: { from: number; to: number }[] = [];
	for (const it = value.deco.iter(); it.value !== null; it.next()) {
		if (fromA < it.to && toA > it.from) hit.push({ from: it.from, to: it.to });
	}
	if (hit.length === 0) return tr;

	const doc = tr.startState.doc;
	const head = sel.main.head;
	const backward = fromA < head;
	const parts: { from: number; to: number }[] = [];
	let p = fromA;
	for (const h of hit) {
		if (h.from > p) parts.push({ from: p, to: Math.min(h.from, toA) });
		p = Math.max(p, h.to);
	}
	if (p < toA) parts.push({ from: p, to: toA });

	if (parts.length === 0) {
		const at = backward ? (hit[0]?.from ?? fromA) : (hit[hit.length - 1]?.to ?? toA);
		const other = backward ? clusterBefore(doc, at) : clusterAfter(doc, at);
		if (other === null) return [];
		const span = backward ? { from: other, to: at } : { from: at, to: other };
		// The neighbour is itself hidden (two tags back to back): stop rather
		// than delete hidden text.
		let inside = false;
		value.deco.between(span.from, span.to, (f, t) => {
			if (span.from < t && span.to > f) inside = true;
		});
		if (inside) return [];
		parts.push(span);
	}

	return {
		changes: parts,
		selection: { anchor: backward ? (parts[0]?.from ?? head) : head },
		userEvent: backward ? 'delete.backward' : 'delete.forward',
		scrollIntoView: true,
	};
}

function clusterBefore(doc: Text, pos: number): number | null {
	if (pos <= 0) return null;
	const line = doc.lineAt(pos);
	if (pos === line.from) return pos - 1; // the line break
	return line.from + findClusterBreak(line.text, pos - line.from, false);
}

function clusterAfter(doc: Text, pos: number): number | null {
	if (pos >= doc.length) return null;
	const line = doc.lineAt(pos);
	if (pos === line.to) return pos + 1; // the line break
	return line.from + findClusterBreak(line.text, pos - line.from, true);
}

export function buildTagHideExtension(isHidden: () => boolean): Extension {
	hiddenAtCreate = isHidden;
	const scanner = ViewPlugin.fromClass(
		class {
			private timer: number | null = null;

			constructor(private view: EditorView) {}

			update(update: ViewUpdate): void {
				if (!update.docChanged || !update.state.field(tagHideField).hidden) return;
				if (this.timer !== null) window.clearTimeout(this.timer);
				this.timer = window.setTimeout(() => {
					this.timer = null;
					this.view.dispatch({ effects: rescanTags.of(null) });
				}, TAG_SCAN_DEBOUNCE_MS);
			}

			destroy(): void {
				if (this.timer !== null) window.clearTimeout(this.timer);
			}
		},
	);

	return [tagHideField, EditorState.transactionFilter.of(guardTagDelete), scanner];
}

// Brings one editor in line with the setting; a no-op when it already matches.
export function syncTagHiding(view: EditorView, hidden: boolean): void {
	const value = view.state.field(tagHideField, false);
	if (value === undefined || value.hidden === hidden) return;
	view.dispatch({ effects: setTagsHidden.of(hidden) });
}
