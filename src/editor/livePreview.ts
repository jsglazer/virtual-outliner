// CodeMirror 6 integration: block-replace decorations that hide whatever the
// current view state/collapse state hides, label widgets that replace raw
// sigils with the computed label, and line decorations that carry indent/
// spacing class names only (never inline styles). Nothing here writes to the
// document — decorations exist purely as a rendering layer that maps through
// edits, matching the reviewer criterion "no undocumented internal fold API
// (use CM6 replacement decorations instead)".
//
// Parsing/decoration-building is debounced off `docChanged` rather than run
// synchronously on every keystroke (the §2 hurdle: "running a full-document
// regex parser... on every keypress... can cause lag") — the same external-
// resolve pattern already proven in md-annotation's src/editor/livePreview.ts.
// The ViewPlugin below is also how the plugin obtains EditorView handles: no
// undocumented Obsidian internals are needed to reach the editor.

import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { editorInfoField } from 'obsidian';

import { entrySegments } from '../core/sigil';
import type { RenderPlan } from '../core/render';

export const setOutlineDecorations = StateEffect.define<DecorationSet>({
	map: (value, mapping) => value.map(mapping),
});

export const outlineDecoField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		let next = deco.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setOutlineDecorations)) next = effect.value;
		}
		return next;
	},
	provide: (field) => [
		EditorView.decorations.from(field),
		// A block-replace range must also be atomic so the cursor can never
		// land inside it (Decision #16) — the same DecorationSet doubles as
		// the atomic-ranges source.
		EditorView.atomicRanges.of((view) => view.state.field(field)),
	],
});

export interface EditorHost {
	attachEditor(view: EditorView): void;
	detachEditor(view: EditorView): void;
	scheduleEditorResolve(view: EditorView, delayMs: number): void;
}

export const EDITOR_RESOLVE_DEBOUNCE_MS = 200;

export function buildEditorExtension(host: EditorHost): Extension {
	const watcher = ViewPlugin.fromClass(
		class {
			constructor(private view: EditorView) {
				host.attachEditor(view);
				host.scheduleEditorResolve(view, 0);
			}

			update(update: { docChanged: boolean; view: EditorView }): void {
				if (update.docChanged) host.scheduleEditorResolve(update.view, EDITOR_RESOLVE_DEBOUNCE_MS);
			}

			destroy(): void {
				host.detachEditor(this.view);
			}
		},
	);
	return [outlineDecoField, watcher];
}

export function editorViewPath(view: EditorView): string | null {
	return view.state.field(editorInfoField, false)?.file?.path ?? null;
}

class LabelWidget extends WidgetType {
	constructor(
		private label: string,
		private levelClass: string,
	) {
		super();
	}

	eq(other: LabelWidget): boolean {
		return other.label === this.label && other.levelClass === this.levelClass;
	}

	toDOM(view: EditorView): HTMLElement {
		const span = view.dom.ownerDocument.createElement('span');
		span.className = `vo-label ${this.levelClass}`;
		span.textContent = this.label;
		return span;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

// Body offsets equal document offsets (the metadata block sits at true
// end-of-file — see core/metadata.ts), so `plan` computed against `body` can
// be applied directly to `view.state.doc` without translation.
export function buildOutlineDecorations(
	view: EditorView,
	plan: RenderPlan,
	sigilChar: string,
): DecorationSet {
	const doc = view.state.doc;
	const lineCount = doc.lines;
	const builder = new RangeSetBuilder<Decoration>();

	// Widgets/inline replacements first (document order within a line),
	// merged with block-replace hidden ranges and line-class decorations —
	// RangeSetBuilder requires additions in ascending position order, so
	// everything is collected then sorted once rather than interleaved by
	// hand across three independent maps.
	interface Item {
		from: number;
		to: number;
		deco: Decoration;
	}
	const items: Item[] = [];

	for (const range of plan.hiddenLineRanges) {
		// `range` is a LINE range [from, to); translate to a CHARACTER range
		// spanning whole lines, which is what a block replacement requires.
		//
		// The line break taken is the one BEFORE the block, not after it.
		// Ending at the next line's start puts that line's own
		// `Decoration.line` inside the replaced range, and CM6 drops it — so
		// the first body line under any hidden entry silently lost its indent
		// class while its siblings kept theirs, which read as indentation
		// working only intermittently. A block starting at line 0 has no
		// preceding break to take, so it USED to fall back to the trailing one
		// instead — reintroducing the exact bug above for whatever line
		// follows a hidden leading preamble (Update003: the first outline
		// entry in a note with body text above it lost its colour/weight/gap
		// entirely in Outline-only view, because that entry's own line sat
		// right at the swallowed boundary). Always ending at `lastLine.to`
		// avoids the collision in every case, accepting a blank leading line
		// in the doc-start case as the lesser problem — nothing currently
		// hides a leading preamble AND needs it visually gapless.
		if (range.from >= lineCount || range.to > lineCount) continue;
		const lastLineNo = Math.min(range.to, lineCount);
		const lastLine = doc.line(lastLineNo);
		const atDocStart = range.from === 0;
		const from = atDocStart ? doc.line(1).from : doc.line(range.from).to;
		const to = lastLine.to;
		if (from >= to) continue;
		items.push({ from, to, deco: Decoration.replace({ block: true }) });
	}

	for (const [lineIndex, label] of plan.labels) {
		if (lineIndex >= lineCount) continue;
		const line = doc.line(lineIndex + 1);
		const segs = entrySegments(line.text, sigilChar);
		if (!segs) continue;
		const level = plan.entryLevel.get(lineIndex) ?? segs.level;
		if (segs.prefixEnd > 0) {
			items.push({
				from: line.from,
				to: line.from + segs.prefixEnd,
				deco: Decoration.replace({ widget: new LabelWidget(label, `vo-l${level}`) }),
			});
		}
		if (segs.textEnd > segs.prefixEnd) {
			items.push({
				from: line.from + segs.prefixEnd,
				to: line.from + segs.textEnd,
				deco: Decoration.mark({ class: `vo-text vo-l${level}` }),
			});
		}
		if (segs.textEnd < line.text.length) {
			items.push({ from: line.from + segs.textEnd, to: line.to, deco: Decoration.replace({}) });
		}
	}

	for (const [lineIndex, level] of plan.indentLevel) {
		if (lineIndex >= lineCount) continue;
		const line = doc.line(lineIndex + 1);
		items.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `vo-indent-l${level}` }) });
	}
	for (const [lineIndex, level] of plan.entryLevel) {
		if (lineIndex >= lineCount) continue;
		const line = doc.line(lineIndex + 1);
		items.push({
			from: line.from,
			to: line.from,
			deco: Decoration.line({ class: `vo-entry-l${level}` }),
		});
	}

	items.sort((a, b) => a.from - b.from || (a.deco.startSide ?? 0) - (b.deco.startSide ?? 0));
	for (const item of items) builder.add(item.from, item.to, item.deco);
	return builder.finish();
}
