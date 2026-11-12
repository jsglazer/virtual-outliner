// The "hide tags" toggle (Update015) in the editor: every #tag, together with
// the %%comment%% attached to it (see core/tags.ts), is replaced by nothing.
// Like Live Preview's own markup, the tags on the line(s) holding the cursor
// or selection are shown again — so text is only ever edited, or deleted,
// where it can be seen.
//
// A StateField rather than a ViewPlugin because an attached comment may span
// lines, and CM6 only accepts line-break-replacing decorations from state.
// Scanning is debounced off `docChanged` like the outline resolve: between
// scans the known ranges are mapped through each edit, and a tag typed in the
// meantime is on the cursor line, where it would be shown anyway.

import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { Extension, Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';

import { findTagRanges } from '../core/tags';

export const TAG_SCAN_DEBOUNCE_MS = 200;

export const setTagsHidden = StateEffect.define<boolean>();
const rescanTags = StateEffect.define<null>();

interface TagHideValue {
	hidden: boolean;
	// Every tag range in the document (empty while not hidden).
	ranges: DecorationSet;
	// What is actually drawn: `ranges` minus the cursor lines.
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

// Drops every range that touches a line holding part of the selection.
export function withoutSelectionLines(state: EditorState, ranges: DecorationSet): DecorationSet {
	const spans = state.selection.ranges.map((r) => ({
		from: state.doc.lineAt(r.from).from,
		to: state.doc.lineAt(r.to).to,
	}));
	return ranges.update({
		filter: (from, to) => !spans.some((s) => from <= s.to && to >= s.from),
	});
}

const OFF: TagHideValue = {
	hidden: false,
	ranges: Decoration.none,
	deco: Decoration.none,
};

function makeValue(state: EditorState, ranges: DecorationSet): TagHideValue {
	return { hidden: true, ranges, deco: withoutSelectionLines(state, ranges) };
}

// Read when an editor is created, so a note opened while the toggle is on
// starts hidden; later changes arrive as `setTagsHidden` effects.
let hiddenAtCreate: () => boolean = () => false;

export const tagHideField = StateField.define<TagHideValue>({
	create: (state) => (hiddenAtCreate() ? makeValue(state, scanTagDecorations(state.doc)) : OFF),
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
		if (rescan) return makeValue(tr.state, scanTagDecorations(tr.state.doc));
		if (!tr.docChanged && !tr.selection) return value;
		return makeValue(tr.state, tr.docChanged ? value.ranges.map(tr.changes) : value.ranges);
	},
	provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

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

	return [tagHideField, scanner];
}

// Brings one editor in line with the setting; a no-op when it already matches.
export function syncTagHiding(view: EditorView, hidden: boolean): void {
	const value = view.state.field(tagHideField, false);
	if (value === undefined || value.hidden === hidden) return;
	view.dispatch({ effects: setTagsHidden.of(hidden) });
}
