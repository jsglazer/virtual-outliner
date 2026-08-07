// Decoration GEOMETRY regression tests: which character ranges the hidden-body
// block replacements cover, and — critically — where those boundaries end up
// after the user types at one of them.
//
// The bug these exist for (Update004): in Outline-only view every run of body
// lines is hidden, and each hidden run's block replacement starts at the END of
// the entry line above it. That is exactly where the cursor sits while editing
// an entry's text. A CM6 block replacement is inclusive at both boundaries by
// DEFAULT (Decoration.replace's getInclusive falls back to `block`), so a
// character typed at that boundary was absorbed INTO the hidden range: it
// vanished from view, the mapped cursor landed strictly inside an atomic hidden
// range that has no rendered DOM position, and the browser dropped the caret at
// the next visible position — the start of the following entry line. Every
// subsequent keystroke was then inserted in front of THAT entry's sigils,
// corrupting it into a non-entry (`@@@ More detail` -> `en@@@ More detail`) and
// silently dropping it out of the outline.

import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { computeRenderPlan } from '../src/core/render';
import { defaultSettings } from '../src/core/settings';
import {
	buildHiddenContentGuard,
	buildOutlineDecorations,
	outlineDecoField,
	setOutlineDecorations,
} from '../src/editor/livePreview';

const SIGIL = '@';
const LEVELS = defaultSettings().levels;

const DOC = ['@ Thesis', 'body under thesis', '@@ Detail', 'more body'].join('\n');

// buildOutlineDecorations only ever reads view.state.doc.
function fakeView(state: EditorState): EditorView {
	return { state } as unknown as EditorView;
}

function decorate(state: EditorState): EditorState {
	const plan = computeRenderPlan(state.doc.toString(), SIGIL, LEVELS, 'outline', new Set(), false);
	const deco = buildOutlineDecorations(fakeView(state), plan, SIGIL);
	return state.update({ effects: setOutlineDecorations.of(deco) }).state;
}

// The block (whole-line) replacements only — the label widget and id-suffix
// replacements are point ranges on a single line and are not what hides body.
function blockRanges(state: EditorState): { from: number; to: number }[] {
	const out: { from: number; to: number }[] = [];
	const iter = state.field(outlineDecoField).iter();
	for (; iter.value !== null; iter.next()) {
		if (iter.value.spec?.block === true) out.push({ from: iter.from, to: iter.to });
	}
	return out;
}

function startState(): EditorState {
	return decorate(EditorState.create({ doc: DOC, extensions: [outlineDecoField] }));
}

describe('hidden-body block replacements (Outline-only view)', () => {
	it('covers whole hidden lines through their trailing break', () => {
		const state = startState();
		const ranges = blockRanges(state);
		expect(ranges.length).toBeGreaterThan(0);

		// Starts at the first hidden line's own start, NOT at the end of the
		// entry line above it, and runs to the start of the next visible line.
		// Leaving the last hidden line's break behind made CM6 render an empty
		// .cm-line in its place — a blank line after every hidden run.
		expect(ranges[0]?.from).toBe(state.doc.line(2).from); // "body under thesis"
		expect(ranges[0]?.to).toBe(state.doc.line(3).from); // "@@ Detail"
	});

	it('leaves the following entry line its own line decoration', () => {
		// Regression guard for the reason the old geometry existed: ending a
		// block replacement at the next line's start used to swallow that line's
		// Decoration.line, stripping its indent/colour classes.
		const state = startState();
		const entryStart = state.doc.line(3).from; // "@@ Detail"

		let found = false;
		const iter = state.field(outlineDecoField).iter();
		for (; iter.value !== null; iter.next()) {
			const cls: unknown = (iter.value.spec as { class?: unknown } | undefined)?.class;
			if (iter.from === entryStart && typeof cls === 'string' && cls.includes('vo-entry-l')) found = true;
		}
		expect(found).toBe(true);
	});

	it('does not swallow a character typed at the end of an entry line', () => {
		let state = startState();
		const cursor = state.doc.line(1).to; // end of "@ Thesis"
		// The cursor sits directly against a hidden block: only the line break
		// separates it from the block's start.
		expect(blockRanges(state).some((r) => r.from === cursor + 1)).toBe(true);

		state = state.update({
			changes: { from: cursor, to: cursor, insert: 'X' },
			selection: { anchor: cursor + 1 },
		}).state;

		// The typed character occupies [cursor, cursor + 1). If any hidden block
		// still covers it, it has been absorbed into the hidden range and the
		// user's own keystroke is invisible.
		const covering = blockRanges(state).filter((r) => r.from <= cursor && r.to > cursor);
		expect(covering).toEqual([]);

		// The entry line must actually contain the typed text.
		expect(state.doc.line(1).text).toBe('@ ThesisX');
	});

	it('leaves the mapped cursor at a position outside every hidden range', () => {
		let state = startState();
		const cursor = state.doc.line(1).to;

		state = state.update({
			changes: { from: cursor, to: cursor, insert: 'X' },
			selection: { anchor: cursor + 1 },
		}).state;

		// Strictly inside (from < pos < to) is the unrenderable case: an atomic
		// range with no DOM position for the caret, which is what sent the next
		// keystroke to the following entry line.
		const head = state.selection.main.head;
		const inside = blockRanges(state).filter((r) => r.from < head && r.to > head);
		expect(inside).toEqual([]);
	});

	it('keeps consecutive keystrokes on the entry line (the corruption repro)', () => {
		let state = startState();
		let cursor = state.doc.line(1).to;

		for (const ch of 'abc') {
			state = state.update({
				changes: { from: cursor, to: cursor, insert: ch },
				selection: { anchor: cursor + 1 },
			}).state;
			cursor = state.selection.main.head;
			// Re-running the resolve mid-typing (the 200ms debounce firing) must
			// not move the caret either.
			state = decorate(state);
			expect(state.selection.main.head).toBe(cursor);
		}

		expect(state.doc.line(1).text).toBe('@ Thesisabc');
		// The following entry must be untouched — this is the exact corruption
		// that was observed (`@@ Detail` -> `bc@@ Detail`).
		expect(state.doc.line(3).text).toBe('@@ Detail');
	});
});

// Second, worse failure mode of the same atomic hidden blocks: atomicRanges
// makes them atomic for DELETION too, so one Backspace at the gap between two
// entries took out an entire run of body prose that the user could not see.
// Live report: Test.md went from 43 lines to 15 while "removing extra line
// spaces between the outline lines" in Outline-only view.
describe('hidden-content delete guard (Outline-only view)', () => {
	let blocked = 0;

	function guarded(): EditorState {
		blocked = 0;
		const state = EditorState.create({
			doc: DOC,
			extensions: [
				outlineDecoField,
				buildHiddenContentGuard(() => {
					blocked++;
				}),
			],
		});
		return decorate(state);
	}

	it('rejects a delete that would remove an entire hidden body run', () => {
		const state = guarded();
		const block = blockRanges(state)[0];
		expect(block).toBeDefined();

		// Exactly what an atomic-range-expanded Backspace produced.
		const next = state.update({
			changes: { from: block!.from, to: block!.to, insert: '' },
			userEvent: 'delete.backward',
		}).state;

		expect(next.doc.toString()).toBe(DOC);
		expect(blocked).toBe(1);
	});

	it('still allows deleting the last character of an entry line', () => {
		const state = guarded();
		const cursor = state.doc.line(1).to; // end of "@ Thesis" == a block's `from`

		const next = state.update({
			changes: { from: cursor - 1, to: cursor, insert: '' },
			userEvent: 'delete.backward',
		}).state;

		expect(next.doc.line(1).text).toBe('@ Thesi');
		expect(blocked).toBe(0);
	});

	it('leaves the plugin’s own structural rewrites alone', () => {
		const state = guarded();
		const block = blockRanges(state)[0];

		// dispatchSplice carries no userEvent — moving a subtree legitimately
		// rewrites hidden lines and must not be filtered.
		const next = state.update({
			changes: { from: block!.from, to: block!.to, insert: '\nmoved body' },
		}).state;

		expect(next.doc.toString()).not.toBe(DOC);
		expect(blocked).toBe(0);
	});

	it('allows deleting a hidden run that is only blank lines', () => {
		blocked = 0;
		// Two blank lines between entries: hidden in Outline-only view, and
		// invisible everywhere the user might otherwise remove them.
		const doc = ['@ Thesis', '', '', '@@ Detail'].join('\n');
		let state = EditorState.create({
			doc,
			extensions: [
				outlineDecoField,
				buildHiddenContentGuard(() => {
					blocked++;
				}),
			],
		});
		state = decorate(state);

		const block = blockRanges(state)[0];
		expect(block).toBeDefined();
		expect(state.doc.sliceString(block!.from, block!.to).trim()).toBe('');

		const next = state.update({
			changes: { from: block!.from, to: block!.to, insert: '' },
			userEvent: 'delete.backward',
		}).state;

		expect(next.doc.toString()).toBe('@ Thesis\n@@ Detail');
		expect(blocked).toBe(0);
	});

	it('leaves undo alone', () => {
		const state = guarded();
		const block = blockRanges(state)[0];

		const next = state.update({
			changes: { from: block!.from, to: block!.to, insert: '' },
			userEvent: 'undo',
		}).state;

		expect(next.doc.toString()).not.toBe(DOC);
		expect(blocked).toBe(0);
	});
});
