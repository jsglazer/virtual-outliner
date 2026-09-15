// Plugin shell: wires the pure core (parsing, structural ops, metadata,
// render planning) to Obsidian. All decision logic lives in src/core/; this
// file only injects App/Vault/Workspace, timers, and randomness at the
// boundary. Every document write goes through a CM6 transaction on an
// editor that is actually open for that file — never a background
// Vault.process/modify call — satisfying the reviewer criterion "zero direct
// writes to the vault... outside of standard CM6 transaction updates on the
// active file." The one exception is "Generate filtered copy", which
// creates a brand-new export file and never touches the source document.

import type { TFile, WorkspaceLeaf } from 'obsidian';
import { MarkdownView, Notice, Plugin } from 'obsidian';
import type { EditorView } from '@codemirror/view';

import type { VirtualOutlinerAPI } from './api';
import { createApi } from './api';
import { lineStartOffsets } from './core/lines';
import { appendId, ID_SUFFIX_RE, mintId } from './core/id';
import { parseMetaDocument, pruneOrphaned } from './core/metadata';
import { parseOutline } from './core/parser';
import { ownerNodeAtLine } from './core/ops';
import { computeRenderPlan, hasFoldableContent } from './core/render';
import { generateFilteredCopy } from './core/exportFilter';
import type { OutlineSettings } from './core/settings';
import { levelCssVars, normalizeSettings } from './core/settings';
import type { OutlineNode, ViewState } from './core/types';
import {
	buildEditorExtension,
	buildHiddenContentGuard,
	buildOutlineDecorations,
	editorViewPath,
	setOutlineDecorations,
} from './editor/livePreview';
import type { KeymapHost } from './editor/keymap';
import { buildOutlineKeymap, moveBlock } from './editor/keymap';
import { createReadingPostProcessor } from './editor/readingView';
import { VirtualOutlinerSettingTab } from './settingsTab';
import type { OutlineFileState } from './state';
import { OutlineSidebarView, SIDEBAR_VIEW_TYPE } from './ui/sidebar';
import { ToolbarHighlighter } from './ui/toolbarHighlight';

interface PersistedFileState {
	viewState: ViewState;
	collapsedIds: string[];
}

function normalizeFileStateEntry(v: unknown, fallback: ViewState): PersistedFileState {
	if (v === null || typeof v !== 'object') return { viewState: fallback, collapsedIds: [] };
	const rec = v as Record<string, unknown>;
	const viewState =
		rec.viewState === 'outline' || rec.viewState === 'body' || rec.viewState === 'both'
			? rec.viewState
			: fallback;
	const collapsedIds = Array.isArray(rec.collapsedIds)
		? rec.collapsedIds.filter((id): id is string => typeof id === 'string')
		: [];
	return { viewState, collapsedIds };
}

const RESOLVE_DEBOUNCE_MS = 200;
const CSS_VAR_STYLE_ID = 'virtual-outliner-level-vars';
// Note Toolbar renders its own DOM per leaf/file/mode; a short delay lets that
// land before the toggle colours are re-applied (same value as md-annotation).
const TOOLBAR_HIGHLIGHT_DELAY_MS = 50;

export default class VirtualOutlinerPlugin extends Plugin {
	settings: OutlineSettings = normalizeSettings(null);
	api!: VirtualOutlinerAPI;

	private states = new Map<string, OutlineFileState>();
	private fileState = new Map<string, { viewState: ViewState; collapsedIds: Set<string> }>();
	private editors = new Set<EditorView>();
	private editorTimers = new Map<EditorView, number>();
	private diskTimers = new Map<string, number>();
	private changeListeners = new Set<() => void>();
	private toolbarHighlighter: ToolbarHighlighter | null = null;
	private toolbarTimer: number | null = null;
	private keymapHost!: KeymapHost;

	async onload(): Promise<void> {
		const raw: unknown = await this.loadData();
		this.settings = normalizeSettings(raw);
		this.loadFileState(raw);
		this.api = createApi(
			this.app.vault,
			() => this.settings.sigil,
			() => this.settings.levels,
		);

		this.applyLevelCssVars();

		this.keymapHost = {
			sigilChar: () => this.settings.sigil,
			enterBehavior: () => this.settings.enterBehavior,
			resolveNow: (view) => this.resolveEditor(view),
		};

		this.registerEditorExtension([
			buildHiddenContentGuard(() => {
				new Notice('Hidden text is not deleted from this view — switch to outline and body to edit it.');
			}),
			buildOutlineKeymap(this.keymapHost),
			buildEditorExtension({
				attachEditor: (view) => this.editors.add(view),
				detachEditor: (view) => {
					this.editors.delete(view);
					const timer = this.editorTimers.get(view);
					if (timer !== undefined) {
						window.clearTimeout(timer);
						this.editorTimers.delete(view);
					}
				},
				scheduleEditorResolve: (view, delayMs) => this.scheduleEditorResolve(view, delayMs),
			}),
		]);

		this.registerMarkdownPostProcessor(
			createReadingPostProcessor({
				sigilChar: () => this.settings.sigil,
				levels: () => this.settings.levels,
				viewState: (path) => this.viewStateFor(path),
				collapsedIds: (path) => this.collapsedIdsFor(path),
				indentBody: () => this.settings.indentBody,
				toggleFold: (path, lineIndex) => this.toggleFoldAtLine(path, lineIndex, null),
			}),
		);

		this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new OutlineSidebarView(leaf, this.sidebarHost()));
		this.addSettingTab(new VirtualOutlinerSettingTab(this.app, this));
		this.addRibbonIcon('list-tree', 'Toggle outline sidebar', () => void this.toggleSidebar());

		// The id stays `open-sidebar` so hotkeys and Note Toolbar buttons already
		// bound to the old "Open outline sidebar" command keep working.
		this.addCommand({
			id: 'open-sidebar',
			name: 'Toggle outline sidebar',
			callback: () => void this.toggleSidebar(),
		});

		const viewStateCommand = (id: string, name: string, viewState: ViewState): void => {
			this.addCommand({
				id,
				name,
				checkCallback: (checking) => {
					const file = this.activeMarkdownFile();
					if (!file) return false;
					if (checking) return true;
					this.setViewState(file.path, viewState);
					return true;
				},
			});
		};
		viewStateCommand('view-outline-only', 'Show outline only', 'outline');
		viewStateCommand('view-body-only', 'Show body only', 'body');
		viewStateCommand('view-both', 'Show outline and body', 'both');

		this.addCommand({
			id: 'toggle-indent-body',
			name: 'Indent body with outline',
			callback: () => {
				this.settings.indentBody = !this.settings.indentBody;
				void this.saveSettings();
				new Notice(this.settings.indentBody ? 'Indent body with outline: on' : 'Indent body with outline: off');
			},
		});

		// Fold/unfold the entry the caret is in — its child entries and all body
		// text beneath it — like Obsidian's own heading fold. From a body line it
		// acts on the entry that body belongs to.
		this.addCommand({
			id: 'toggle-fold-entry',
			name: 'Toggle collapse of current outline entry',
			checkCallback: (checking) => {
				const view = this.activeEditorView();
				const path = view ? editorViewPath(view) : null;
				if (!view || path === null) return false;
				if (checking) return true;
				const line = view.state.doc.lineAt(view.state.selection.main.head).number - 1;
				this.toggleFoldAtLine(path, line, view);
				return true;
			},
		});

		const foldAllCommand = (id: string, name: string, run: (path: string) => void): void => {
			this.addCommand({
				id,
				name,
				checkCallback: (checking) => {
					const file = this.activeMarkdownFile();
					if (!file) return false;
					if (checking) return true;
					run(file.path);
					return true;
				},
			});
		};
		foldAllCommand('collapse-all-entries', 'Collapse all outline entries', (path) => this.collapseAll(path));
		foldAllCommand('expand-all-entries', 'Expand all outline entries', (path) => this.expandAll(path));

		this.addCommand({
			id: 'toggle-enter-behavior',
			name: 'Toggle new entry on next line vs after section',
			callback: () => {
				this.settings.enterBehavior = this.settings.enterBehavior === 'line' ? 'section' : 'line';
				void this.saveSettings();
				new Notice(
					this.settings.enterBehavior === 'line'
						? 'Enter adds the new entry on the next line'
						: 'Enter adds the new entry after the whole section',
				);
			},
		});

		const moveCommand = (id: string, name: string, direction: 'up' | 'down'): void => {
			this.addCommand({
				id,
				name,
				checkCallback: (checking) => {
					const view = this.activeEditorView();
					if (!view) return false;
					if (checking) return true;
					moveBlock(view, this.keymapHost, direction);
					return true;
				},
			});
		};
		moveCommand('move-block-up', 'Move outline block up', 'up');
		moveCommand('move-block-down', 'Move outline block down', 'down');

		this.addCommand({
			id: 'generate-filtered-copy',
			name: 'Generate filtered copy',
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (checking) return true;
				void this.generateFilteredCopyFor(file);
				return true;
			},
		});

		this.addCommand({
			id: 'prune-orphaned-metadata',
			name: 'Prune orphaned outline metadata',
			editorCallback: (_editor, ctx) => {
				const path = ctx.file?.path;
				const view = path !== undefined ? this.editorFor(path) : null;
				if (!view || path === undefined) return;
				this.pruneOrphanedIn(view, path);
			},
		});

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!this.states.has(file.path)) return;
				this.scheduleDiskRefresh(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				const state = this.states.get(oldPath);
				this.states.delete(oldPath);
				if (state) this.states.set(file.path, state);
				const fs = this.fileState.get(oldPath);
				this.fileState.delete(oldPath);
				if (fs) this.fileState.set(file.path, fs);
				this.notifyChange();
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.states.delete(file.path);
				this.fileState.delete(file.path);
				this.notifyChange();
			}),
		);
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file && file.extension === 'md') void this.ensureFileState(file.path);
				this.notifyChange();
			}),
		);

		// A note already open when the plugin loads never fires `file-open`,
		// so the sidebar would sit empty until the user switched away and
		// back. (Reading view no longer depends on this cache — it reads the
		// document out of the section info it is handed.)
		//
		// Toggling the plugin off then on (Update003) keeps existing panes'
		// CM6 EditorViews and rendered Reading View DOM alive across the
		// reload — unlike a full close/reopen of the vault, which recreates
		// them from scratch against the freshly (re)registered extension and
		// post-processor. Labels/indentation self-heal on their own (each
		// editor's own attach hook schedules its own decoration resolve), but
		// the injected `--vo-lN-*` CSS variables come from a SINGLE style
		// element this instance owns — a second, defensive re-apply here
		// (on top of the one at the top of onload) covers the disabled
		// instance's element still being mid-removal, or any other race in
		// exactly when a hot re-enable's onload runs relative to the old
		// instance's onunload. Rendered entries otherwise keep their labels
		// and indentation but lose colour/weight/gap — `1.0Thesis` with no
		// space, no colour — until something else forces a re-render (closing
		// and reopening the vault). onLayoutReady runs immediately when the
		// layout is already settled — the common case for a hot re-enable —
		// so this reaches both the cold-start and the re-enable path.
		this.toolbarHighlighter = new ToolbarHighlighter(this.app, () => [
			{ highlight: this.settings.toolbarHighlights.sidebar, active: this.isSidebarShown() },
			{ highlight: this.settings.toolbarHighlights.indentBody, active: this.settings.indentBody },
			{
				highlight: this.settings.toolbarHighlights.enterBehavior,
				active: this.settings.enterBehavior === 'line',
			},
		]);
		const onWorkspaceChange = (): void => this.scheduleToolbarRefresh();
		this.registerEvent(this.app.workspace.on('layout-change', onWorkspaceChange));
		this.registerEvent(this.app.workspace.on('active-leaf-change', onWorkspaceChange));
		this.registerEvent(this.app.workspace.on('css-change', onWorkspaceChange));
		this.app.workspace.onLayoutReady(onWorkspaceChange);

		this.app.workspace.onLayoutReady(() => {
			const file = this.app.workspace.getActiveFile();
			if (file && file.extension === 'md') void this.ensureFileState(file.path);
			this.applyLevelCssVars();
			for (const view of this.editors) this.decorate(view);
			this.rerenderPreviews(null);
		});
	}

	onunload(): void {
		for (const timer of this.editorTimers.values()) window.clearTimeout(timer);
		this.editorTimers.clear();
		for (const timer of this.diskTimers.values()) window.clearTimeout(timer);
		this.diskTimers.clear();
		for (const doc of this.cssVarTargetDocuments()) doc.getElementById(CSS_VAR_STYLE_ID)?.remove();
		if (this.toolbarTimer !== null) window.clearTimeout(this.toolbarTimer);
		this.toolbarTimer = null;
		this.toolbarHighlighter?.clear();
	}

	scheduleToolbarRefresh(): void {
		if (this.toolbarTimer !== null) window.clearTimeout(this.toolbarTimer);
		this.toolbarTimer = window.setTimeout(() => {
			this.toolbarTimer = null;
			this.toolbarHighlighter?.refresh();
		}, TOOLBAR_HIGHLIGHT_DELAY_MS);
	}

	async saveSettings(): Promise<void> {
		await this.persist();
		this.applyLevelCssVars();
		for (const view of this.editors) this.decorate(view);
		this.rerenderPreviews(null);
		this.notifyChange();
		this.scheduleToolbarRefresh();
	}

	// Reading view is a one-shot post-processor render, so anything that
	// changes what it should draw (settings, view state, a collapse) has to
	// ask Obsidian to run it again — the editor's decoration path has no
	// equivalent effect on it. `path === null` means every open preview.
	private rerenderPreviews(path: string | null): void {
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) continue;
			if (view.getMode() !== 'preview') continue;
			if (path !== null && view.file?.path !== path) continue;
			view.previewMode.rerender(true);
		}
	}

	private async persist(): Promise<void> {
		const fileState: Record<string, PersistedFileState> = {};
		for (const [path, fs] of this.fileState) {
			fileState[path] = { viewState: fs.viewState, collapsedIds: [...fs.collapsedIds] };
		}
		await this.saveData({ ...this.settings, fileState });
	}

	private loadFileState(raw: unknown): void {
		if (raw === null || typeof raw !== 'object') return;
		const rec = raw as Record<string, unknown>;
		if (rec.fileState === null || typeof rec.fileState !== 'object') return;
		for (const [path, value] of Object.entries(rec.fileState as Record<string, unknown>)) {
			const entry = normalizeFileStateEntry(value, this.settings.defaultViewState);
			this.fileState.set(path, { viewState: entry.viewState, collapsedIds: new Set(entry.collapsedIds) });
		}
	}

	// A <style> element rather than `body.setCssProps` (Decision superseded —
	// see core/settings.ts levelCssVars doc comment): Obsidian periodically
	// rewrites `document.body.style.cssText` wholesale from its own
	// appearance settings (zoom, font overrides, indent-size), which silently
	// drops any custom property a plugin added via setCssProps on body. A
	// dedicated stylesheet is never touched by that rewrite.
	//
	// Every open markdown leaf's own document, rather than a single "the
	// current" document — `activeDocument` (Obsidian's "whichever window last
	// had focus" global) was the actual Update003 bug, caught by temporary
	// diagnostic logging: right after a plugin off/on toggle it can resolve to
	// an unrelated `about:blank` document instead of any real app window, so
	// the element was created and connected successfully every time — just in
	// a document nobody renders. Targeting every leaf's own document sidesteps
	// that "which window is active right now" question entirely, and as a
	// side effect correctly supports a note popped out into its own window
	// too (each Electron window has its own separate DOM).
	private cssVarTargetDocuments(): Set<Document> {
		const docs = new Set<Document>();
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) docs.add(leaf.view.containerEl.ownerDocument);
		docs.add(activeDocument); // covers the case of zero open markdown leaves
		return docs;
	}

	private applyLevelCssVars(): void {
		const vars = levelCssVars(this.settings.levels);
		const body = Object.entries(vars)
			.map(([key, value]) => `\t${key}: ${value};`)
			.join('\n');
		const css = `:root {\n${body}\n}`;
		for (const doc of this.cssVarTargetDocuments()) {
			let el = doc.getElementById(CSS_VAR_STYLE_ID);
			if (!(el instanceof HTMLStyleElement)) {
				el = doc.createElement('style');
				el.id = CSS_VAR_STYLE_ID;
				doc.head.appendChild(el);
			}
			el.textContent = css;
		}
	}

	// ── Per-file view/collapse state ─────────────────────────────────────────

	viewStateFor(path: string): ViewState {
		return this.fileState.get(path)?.viewState ?? this.settings.defaultViewState;
	}

	private collapsedIdsFor(path: string): Set<string> {
		return this.fileState.get(path)?.collapsedIds ?? new Set();
	}

	private fileStateEntry(path: string): { viewState: ViewState; collapsedIds: Set<string> } {
		let entry = this.fileState.get(path);
		if (!entry) {
			entry = { viewState: this.settings.defaultViewState, collapsedIds: new Set() };
			this.fileState.set(path, entry);
		}
		return entry;
	}

	setViewState(path: string, viewState: ViewState): void {
		this.fileStateEntry(path).viewState = viewState;
		void this.persist();
		this.decorateAllFor(path);
		this.notifyChange();
	}

	private flipCollapse(path: string, id: string): void {
		const entry = this.fileStateEntry(path);
		if (entry.collapsedIds.has(id)) entry.collapsedIds.delete(id);
		else entry.collapsedIds.add(id);
		void this.persist();
		this.decorateAllFor(path);
		this.notifyChange();
	}

	// Folds or unfolds one entry from a click on its chevron (either view) or
	// the toggle command. `lineIndex` may be the entry line or any body line
	// under it; `caretView` is the editor the command ran in, if any. Collapsing
	// the section the caret is sitting in would leave the caret inside a hidden
	// atomic block with no rendered position, so it is first moved to the end
	// of the entry's visible text.
	toggleFoldAtLine(path: string, lineIndex: number, caretView: EditorView | null): void {
		const view = caretView ?? this.editorFor(path);
		const body = view ? parseMetaDocument(view.state.doc.toString()).body : this.states.get(path)?.body;
		if (body === undefined) return;
		const node = ownerNodeAtLine(body, lineIndex, this.settings.sigil);
		if (!node) {
			new Notice('Put the cursor on an outline entry or its body to collapse it.');
			return;
		}
		if (!hasFoldableContent(body.split('\n'), node)) {
			new Notice('Nothing to collapse under this entry.');
			return;
		}
		const collapsing = node.id === null || !this.collapsedIdsFor(path).has(node.id);
		let moveCaret = false;
		if (collapsing && caretView) {
			const caretLine = caretView.state.doc.lineAt(caretView.state.selection.main.head).number - 1;
			moveCaret = caretLine > node.entryLine && caretLine < node.subtreeEnd;
		}
		this.toggleCollapsed(path, node, moveCaret ? caretView : null);
	}

	toggleCollapsed(path: string, node: OutlineNode, caretView: EditorView | null = null): void {
		if (node.id !== null) {
			if (caretView) {
				const line = caretView.state.doc.line(node.entryLine + 1);
				const idMatch = ID_SUFFIX_RE.exec(line.text);
				const visibleEnd = line.from + (idMatch ? idMatch.index : line.text.length);
				caretView.dispatch({ selection: { anchor: visibleEnd } });
			}
			this.flipCollapse(path, node.id);
			return;
		}
		const view = this.editorFor(path);
		if (!view) {
			new Notice("Open this note to collapse an entry that doesn't have a stable ID yet.");
			return;
		}
		const doc = view.state.doc.toString();
		const { body } = parseMetaDocument(doc);
		const lines = body.split('\n');
		const lineText = lines[node.entryLine] ?? '';
		const offsets = lineStartOffsets(lines);
		const lineStart = offsets[node.entryLine] ?? 0;
		const lineEnd = lineStart + lineText.length;
		const id = mintId(Date.now(), Math.random());
		const withId = appendId('', id); // ' ^o-xxxxxxxx'
		// The selection is in post-change coordinates, where `lineEnd` is still
		// just in front of the id that was inserted there.
		view.dispatch({
			changes: { from: lineEnd, to: lineEnd, insert: withId },
			selection: caretView === view ? { anchor: lineEnd } : undefined,
		});
		// Re-parse now so the new id is known when the collapse is applied, rather
		// than only after the 200ms edit debounce — without this the first click
		// on an id-less entry did nothing visible until the next resolve.
		this.setStateFromDoc(path, view.state.doc.toString());
		this.flipCollapse(path, id);
	}

	collapseAll(path: string): void {
		const state = this.states.get(path);
		if (!state) return;
		const entry = this.fileStateEntry(path);
		const eligible = state.parsed.flat.filter((n) => n.children.length > 0 || n.ownBodyStart < n.ownBodyEnd);
		const view = this.editorFor(path);
		let missingIdSkipped = false;

		if (view) {
			const doc = view.state.doc.toString();
			const { body } = parseMetaDocument(doc);
			const lines = body.split('\n');
			const offsets = lineStartOffsets(lines);
			const changes: { from: number; to: number; insert: string }[] = [];
			const mintedIds: string[] = [];
			for (const node of eligible) {
				if (node.id !== null) {
					entry.collapsedIds.add(node.id);
					continue;
				}
				const lineText = lines[node.entryLine] ?? '';
				const lineStart = offsets[node.entryLine] ?? 0;
				const lineEnd = lineStart + lineText.length;
				const id = mintId(Date.now(), Math.random());
				changes.push({ from: lineEnd, to: lineEnd, insert: appendId('', id) });
				mintedIds.push(id);
			}
			if (changes.length > 0) {
				view.dispatch({ changes });
				this.setStateFromDoc(path, view.state.doc.toString());
			}
			for (const id of mintedIds) entry.collapsedIds.add(id);
		} else {
			for (const node of eligible) {
				if (node.id !== null) entry.collapsedIds.add(node.id);
				else missingIdSkipped = true;
			}
		}

		void this.persist();
		this.decorateAllFor(path);
		this.notifyChange();
		if (missingIdSkipped) new Notice("Open this note to fold every entry — some don't have a stable ID yet.");
	}

	expandAll(path: string): void {
		this.fileStateEntry(path).collapsedIds.clear();
		void this.persist();
		this.decorateAllFor(path);
		this.notifyChange();
	}

	// ── Per-file parse/decoration state ──────────────────────────────────────

	async ensureFileState(path: string): Promise<OutlineFileState | null> {
		const cached = this.states.get(path);
		if (cached) return cached;
		const file = this.app.vault.getFileByPath(path);
		if (!file || file.extension !== 'md') return null;
		const doc = await this.app.vault.cachedRead(file);
		return this.setStateFromDoc(path, doc);
	}

	private setStateFromDoc(path: string, doc: string): OutlineFileState {
		const { body } = parseMetaDocument(doc);
		const parsed = parseOutline(body, this.settings.sigil);
		const entry = this.fileStateEntry(path);
		const state: OutlineFileState = {
			body,
			parsed,
			viewState: entry.viewState,
			collapsedIds: entry.collapsedIds,
		};
		this.states.set(path, state);
		this.notifyChange();
		return state;
	}

	private scheduleDiskRefresh(path: string): void {
		const existing = this.diskTimers.get(path);
		if (existing !== undefined) window.clearTimeout(existing);
		this.diskTimers.set(
			path,
			window.setTimeout(() => {
				this.diskTimers.delete(path);
				if (this.editorFor(path)) return; // an open editor is the source of truth
				void (async () => {
					const file = this.app.vault.getFileByPath(path);
					if (!file) return;
					const doc = await this.app.vault.cachedRead(file);
					this.setStateFromDoc(path, doc);
				})();
			}, 400),
		);
	}

	// ── Editor attachment / decoration ───────────────────────────────────────

	private scheduleEditorResolve(view: EditorView, delayMs: number): void {
		const existing = this.editorTimers.get(view);
		if (existing !== undefined) window.clearTimeout(existing);
		// `0` is a deliberate caller value (the initial resolve on editor
		// attach wants to run on the very next tick, not debounced) — `||`
		// treats 0 as "no delay given" and silently substitutes the full
		// 200ms debounce instead, so a freshly opened/reactivated editor's
		// FIRST decoration resolve was delayed a full 200ms rather than
		// firing immediately. That put decorations one recompute cycle
		// behind for however long it took the user to start typing —
		// exactly the class of window where a decoration recompute (and the
		// DOM redraw it causes around any hidden-block boundary) can land in
		// the middle of the user's first few keystrokes after reopening a
		// note, rather than before them.
		this.editorTimers.set(
			view,
			window.setTimeout(() => {
				this.editorTimers.delete(view);
				this.resolveEditor(view);
			}, delayMs === 0 ? 0 : delayMs || RESOLVE_DEBOUNCE_MS),
		);
	}

	private resolveEditor(view: EditorView): void {
		const path = editorViewPath(view);
		if (path === null) return;
		this.setStateFromDoc(path, view.state.doc.toString());
		this.decorate(view);
	}

	private editorFor(path: string): EditorView | null {
		for (const view of this.editors) {
			if (editorViewPath(view) === path) return view;
		}
		return null;
	}

	private decorate(view: EditorView): void {
		const path = editorViewPath(view);
		if (path === null) return;
		const state = this.states.get(path);
		if (!state) return;
		const plan = computeRenderPlan(
			state.body,
			this.settings.sigil,
			this.settings.levels,
			state.viewState,
			state.collapsedIds,
			this.settings.indentBody,
		);
		const decorations = buildOutlineDecorations(view, plan, this.settings.sigil, this.onFoldClick);
		// Reasserting the (unchanged) selection alongside the decoration effect
		// makes CM6 rewrite the DOM selection after the update, rather than
		// trusting whatever contentEditable left behind. This was originally
		// added to chase the "typed text lands on the wrong line" corruption;
		// that turned out to be a decoration-boundary bug instead — see the
		// inclusiveStart/inclusiveEnd note in editor/livePreview.ts, which is
		// the actual fix. It stays only as a cheap caret resync.
		//
		// Skipped while an IME composition is active: dispatching a selection
		// mid-composition aborts it, which would break CJK and dead-key input
		// for the sake of a defensive no-op.
		view.dispatch({
			effects: setOutlineDecorations.of(decorations),
			selection: view.composing ? undefined : view.state.selection,
		});
	}

	// One stable handler for every editor's fold chevrons (a fresh closure per
	// decorate would be harmless but pointless).
	private onFoldClick = (view: EditorView, lineIndex: number): void => {
		const path = editorViewPath(view);
		if (path !== null) this.toggleFoldAtLine(path, lineIndex, view);
	};

	private decorateAllFor(path: string): void {
		const state = this.states.get(path);
		if (state) {
			const entry = this.fileStateEntry(path);
			state.viewState = entry.viewState;
			state.collapsedIds = entry.collapsedIds;
		}
		for (const view of this.editors) {
			if (editorViewPath(view) === path) this.decorate(view);
		}
		this.rerenderPreviews(path);
	}

	// ── Commands ──────────────────────────────────────────────────────────────

	private async generateFilteredCopyFor(file: TFile): Promise<void> {
		const doc = await this.app.vault.cachedRead(file);
		const path = file.path;
		const viewState = this.viewStateFor(path);
		const collapsedIds = this.collapsedIdsFor(path);
		const filtered = generateFilteredCopy(doc, this.settings.sigil, this.settings.levels, viewState, collapsedIds);
		const base = file.basename;
		const dir = file.parent ? file.parent.path : '';
		let target = `${dir ? dir + '/' : ''}${base} (filtered).md`;
		let n = 2;
		while (this.app.vault.getAbstractFileByPath(target)) {
			target = `${dir ? dir + '/' : ''}${base} (filtered ${n}).md`;
			n++;
		}
		const created = await this.app.vault.create(target, filtered);
		await this.app.workspace.getLeaf(true).openFile(created);
		new Notice(`Generated ${target}`);
	}

	private pruneOrphanedIn(view: EditorView, path: string): void {
		const doc = view.state.doc.toString();
		const { body } = parseMetaDocument(doc);
		const parsed = parseOutline(body, this.settings.sigil);
		const liveIds = new Set<string>();
		for (const node of parsed.flat) if (node.id !== null) liveIds.add(node.id);
		const result = pruneOrphaned(doc, liveIds);
		if (result.removedIds.length === 0) {
			new Notice('Virtual Outliner: nothing to prune.');
			return;
		}
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result.doc } });
		new Notice(`Virtual Outliner: pruned ${result.removedIds.length} orphaned record(s).`);
	}

	// ── Sidebar ───────────────────────────────────────────────────────────────

	private sidebarHost() {
		return {
			activeOutlinePath: (): string | null => {
				const file = this.app.workspace.getActiveFile();
				return file && file.extension === 'md' ? file.path : null;
			},
			getParsed: (path: string) => this.states.get(path)?.parsed ?? null,
			levels: () => this.settings.levels,
			isCollapsed: (path: string, id: string) => this.collapsedIdsFor(path).has(id),
			toggleCollapsed: (path: string, node: OutlineNode) => this.toggleCollapsed(path, node),
			collapseAll: (path: string) => this.collapseAll(path),
			expandAll: (path: string) => this.expandAll(path),
			jumpToNode: (path: string, node: OutlineNode) => void this.jumpToNode(path, node),
			onStateChange: (listener: () => void) => this.onStateChange(listener),
		};
	}

	private async jumpToNode(path: string, node: OutlineNode): Promise<void> {
		let view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== path) {
			await this.app.workspace.openLinkText(path, '', false);
			view = this.app.workspace.getActiveViewOfType(MarkdownView);
		}
		if (!view || view.file?.path !== path) return;
		const targetLine = node.ownBodyStart < node.ownBodyEnd ? node.ownBodyStart : node.entryLine;
		const pos = { line: targetLine, ch: 0 };
		view.editor.setCursor(pos);
		view.editor.scrollIntoView({ from: pos, to: pos }, true);
	}

	async activateSidebar(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
		if (existing) {
			await this.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	// Close when the outline is on screen; otherwise open it, or bring an
	// existing one forward (a tab behind another in its group, or a collapsed
	// sidebar). "On screen" rather than "exists" so a press never closes an
	// outline the user could not see — that would read as the button doing
	// nothing.
	async toggleSidebar(): Promise<void> {
		const shown = this.shownSidebarLeaves();
		if (shown.length > 0) {
			for (const leaf of shown) leaf.detach();
		} else {
			await this.activateSidebar();
		}
		this.scheduleToolbarRefresh();
	}

	private shownSidebarLeaves(): WorkspaceLeaf[] {
		return this.app.workspace
			.getLeavesOfType(SIDEBAR_VIEW_TYPE)
			.filter((leaf) => {
				// A collapsed side dock can keep its tabs laid out at zero width,
				// so it is checked explicitly rather than trusted to isShown().
				const root = leaf.getRoot();
				const { leftSplit, rightSplit } = this.app.workspace;
				if ((root === rightSplit && rightSplit.collapsed) || (root === leftSplit && leftSplit.collapsed)) {
					return false;
				}
				return leaf.view.containerEl.isShown();
			});
	}

	private isSidebarShown(): boolean {
		return this.shownSidebarLeaves().length > 0;
	}

	// The CM6 EditorView inside the active Markdown pane (not merely one open
	// on the same file — the same note can be open in two panes). Obsidian's
	// Editor wrapper exposes no public handle to it, so it is matched from the
	// views the editor extension has already registered.
	private activeEditorView(): EditorView | null {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView || markdownView.getMode() !== 'source') return null;
		for (const view of this.editors) {
			if (markdownView.containerEl.contains(view.dom)) return view;
		}
		return null;
	}

	activeMarkdownFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		return file && file.extension === 'md' ? file : null;
	}

	// ── Change notification (sidebar refresh) ────────────────────────────────

	onStateChange(listener: () => void): () => void {
		this.changeListeners.add(listener);
		return () => this.changeListeners.delete(listener);
	}

	private notifyChange(): void {
		for (const listener of this.changeListeners) listener();
	}
}
