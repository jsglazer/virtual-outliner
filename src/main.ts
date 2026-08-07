// Plugin shell: wires the pure core (parsing, structural ops, metadata,
// render planning) to Obsidian. All decision logic lives in src/core/; this
// file only injects App/Vault/Workspace, timers, and randomness at the
// boundary. Every document write goes through a CM6 transaction on an
// editor that is actually open for that file — never a background
// Vault.process/modify call — satisfying the reviewer criterion "zero direct
// writes to the vault... outside of standard CM6 transaction updates on the
// active file." The one exception is "Generate filtered copy", which
// creates a brand-new export file and never touches the source document.

import type { TFile } from 'obsidian';
import { MarkdownView, Notice, Plugin } from 'obsidian';
import type { EditorView } from '@codemirror/view';

import type { VirtualOutlinerAPI } from './api';
import { createApi } from './api';
import { lineStartOffsets } from './core/lines';
import { appendId, mintId } from './core/id';
import { parseMetaDocument, pruneOrphaned } from './core/metadata';
import { parseOutline } from './core/parser';
import { computeRenderPlan } from './core/render';
import { generateFilteredCopy } from './core/exportFilter';
import type { OutlineSettings } from './core/settings';
import { levelCssVars, normalizeSettings } from './core/settings';
import type { OutlineNode, ViewState } from './core/types';
import {
	buildEditorExtension,
	buildOutlineDecorations,
	editorViewPath,
	setOutlineDecorations,
} from './editor/livePreview';
import { buildOutlineKeymap } from './editor/keymap';
import { createReadingPostProcessor } from './editor/readingView';
import { VirtualOutlinerSettingTab } from './settingsTab';
import type { OutlineFileState } from './state';
import { OutlineSidebarView, SIDEBAR_VIEW_TYPE } from './ui/sidebar';

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

export default class VirtualOutlinerPlugin extends Plugin {
	settings: OutlineSettings = normalizeSettings(null);
	api!: VirtualOutlinerAPI;

	private states = new Map<string, OutlineFileState>();
	private fileState = new Map<string, { viewState: ViewState; collapsedIds: Set<string> }>();
	private editors = new Set<EditorView>();
	private editorTimers = new Map<EditorView, number>();
	private diskTimers = new Map<string, number>();
	private changeListeners = new Set<() => void>();
	private cssVarStyleEl: HTMLStyleElement | null = null;

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

		this.registerEditorExtension([
			buildOutlineKeymap({ sigilChar: () => this.settings.sigil }),
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
			}),
		);

		this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new OutlineSidebarView(leaf, this.sidebarHost()));
		this.addSettingTab(new VirtualOutlinerSettingTab(this.app, this));
		this.addRibbonIcon('list-tree', 'Open outline sidebar', () => void this.activateSidebar());

		this.addCommand({
			id: 'open-sidebar',
			name: 'Open outline sidebar',
			callback: () => void this.activateSidebar(),
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
		this.cssVarStyleEl?.remove();
		this.cssVarStyleEl = null;
	}

	async saveSettings(): Promise<void> {
		await this.persist();
		this.applyLevelCssVars();
		for (const view of this.editors) this.decorate(view);
		this.rerenderPreviews(null);
		this.notifyChange();
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
	private applyLevelCssVars(): void {
		const vars = levelCssVars(this.settings.levels);
		const body = Object.entries(vars)
			.map(([key, value]) => `\t${key}: ${value};`)
			.join('\n');
		// A toggle-off/on cycle instantiates a brand new plugin object, so
		// `this.cssVarStyleEl` (an instance field) starts null again even
		// though a PREVIOUS instance's element may still be sitting in
		// `<head>` — its `onunload()` removes its own node by direct
		// reference, but that only works if onunload actually ran, and if it
		// hasn't (yet), `!this.cssVarStyleEl` alone would create a second,
		// possibly-conflicting element rather than reusing the orphan. Look
		// the element up by id first — reuse it if it's still attached
		// (covers a slow/pending unload), or drop the orphan and start fresh
		// if it somehow got detached.
		const existing = activeDocument.getElementById('virtual-outliner-level-vars');
		if (existing instanceof HTMLStyleElement && existing.isConnected) {
			this.cssVarStyleEl = existing;
		} else {
			existing?.remove();
			this.cssVarStyleEl = activeDocument.createElement('style');
			this.cssVarStyleEl.id = 'virtual-outliner-level-vars';
			activeDocument.head.appendChild(this.cssVarStyleEl);
		}
		this.cssVarStyleEl.textContent = `:root {\n${body}\n}`;
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

	toggleCollapsed(path: string, node: OutlineNode): void {
		if (node.id !== null) {
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
		view.dispatch({ changes: { from: lineEnd, to: lineEnd, insert: withId } });
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
			if (changes.length > 0) view.dispatch({ changes });
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
		this.editorTimers.set(
			view,
			window.setTimeout(() => {
				this.editorTimers.delete(view);
				this.resolveEditor(view);
			}, delayMs || RESOLVE_DEBOUNCE_MS),
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
		const decorations = buildOutlineDecorations(view, plan, this.settings.sigil);
		view.dispatch({ effects: setOutlineDecorations.of(decorations) });
	}

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
