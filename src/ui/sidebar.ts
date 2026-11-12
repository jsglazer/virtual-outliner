// Sidebar outline tree: collapsible, searchable, click to jump. The entry the
// caret is in is lightly shaded, and entries can be dragged to move their
// whole block (entry, body, sub-entries) — dropped on the top quarter of a row
// the block goes before it, on the bottom quarter after its section, in the
// middle as its last child.

import type { WorkspaceLeaf } from 'obsidian';
import { ItemView, setIcon } from 'obsidian';

import { computeLabel } from '../core/label';
import type { ParsedOutline, OutlineNode } from '../core/types';
import type { LevelFormat } from '../core/types';
import type { DropPosition } from '../core/ops';

export const SIDEBAR_VIEW_TYPE = 'virtual-outliner-sidebar';

export interface SidebarHost {
	activeOutlinePath(): string | null;
	getParsed(path: string): ParsedOutline | null;
	levels(path: string): readonly LevelFormat[];
	isCollapsed(path: string, nodeId: string): boolean;
	toggleCollapsed(path: string, node: OutlineNode): void;
	collapseAll(path: string): void;
	expandAll(path: string): void;
	jumpToNode(path: string, node: OutlineNode): void;
	onStateChange(listener: () => void): () => void;
	// 0-based line the caret is on in this note, null when unknown.
	currentLine(path: string): number | null;
	onCursorChange(listener: () => void): () => void;
	moveNode(path: string, dragged: OutlineNode, target: OutlineNode, position: DropPosition): void;
}

const DROP_CLASSES = ['vo-drop-before', 'vo-drop-after', 'vo-drop-child'];

export class OutlineSidebarView extends ItemView {
	private unsubscribe: (() => void) | null = null;
	private unsubscribeCursor: (() => void) | null = null;
	private searchQuery = '';
	// Rendered rows of the current tree, by node, for shading the caret's entry.
	private rows = new Map<OutlineNode, HTMLElement>();
	private currentRow: HTMLElement | null = null;
	private dragged: OutlineNode | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private host: SidebarHost,
	) {
		super(leaf);
	}

	getViewType(): string {
		return SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Outline (virtual)';
	}

	getIcon(): string {
		return 'list-tree';
	}

	onOpen(): Promise<void> {
		this.unsubscribe = this.host.onStateChange(() => this.render());
		this.unsubscribeCursor = this.host.onCursorChange(() => this.shadeCurrent());
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.unsubscribeCursor?.();
		this.unsubscribeCursor = null;
		return Promise.resolve();
	}

	private matchingAncestry(parsed: ParsedOutline, query: string): Set<OutlineNode> | null {
		const trimmed = query.trim().toLowerCase();
		if (trimmed === '') return null;
		const keep = new Set<OutlineNode>();
		for (const node of parsed.flat) {
			if (!node.text.toLowerCase().includes(trimmed)) continue;
			let cur: OutlineNode | null = node;
			while (cur) {
				keep.add(cur);
				cur = cur.parent;
			}
		}
		return keep;
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		this.rows.clear();
		this.currentRow = null;
		root.addClass('vo-sidebar');

		const searchWrap = root.createDiv({ cls: 'vo-sidebar-search' });
		const input = searchWrap.createEl('input', { type: 'search', placeholder: 'Search outline…' });
		input.value = this.searchQuery;
		input.addEventListener('input', () => {
			this.searchQuery = input.value;
			this.render();
		});

		const toolbar = root.createDiv({ cls: 'vo-sidebar-toolbar' });
		const foldAllBtn = toolbar.createEl('button', { text: 'Fold all' });
		foldAllBtn.addEventListener('click', () => {
			const path = this.host.activeOutlinePath();
			if (path) this.host.collapseAll(path);
		});
		const expandAllBtn = toolbar.createEl('button', { text: 'Expand all' });
		expandAllBtn.addEventListener('click', () => {
			const path = this.host.activeOutlinePath();
			if (path) this.host.expandAll(path);
		});

		const treeEl = root.createDiv({ cls: 'vo-sidebar-tree' });
		const path = this.host.activeOutlinePath();
		const parsed = path ? this.host.getParsed(path) : null;

		if (!path || !parsed || parsed.roots.length === 0) {
			treeEl.createDiv({
				cls: 'vo-sidebar-empty',
				text: path ? 'No outline entries in this note.' : 'Open a note to see its outline.',
			});
			return;
		}

		const levels = this.host.levels(path);
		const matches = this.matchingAncestry(parsed, this.searchQuery);
		const trimmedQuery = this.searchQuery.trim().toLowerCase();
		for (const node of parsed.roots) {
			this.renderNode(treeEl, path, node, levels, matches, trimmedQuery);
		}
		this.shadeCurrent();
	}

	// Shades the entry whose section holds the caret — the deepest entry at or
	// above its line — or, when that row is folded away, its nearest visible
	// ancestor.
	private shadeCurrent(): void {
		const path = this.host.activeOutlinePath();
		const line = path ? this.host.currentLine(path) : null;
		const parsed = path ? this.host.getParsed(path) : null;
		let node: OutlineNode | null = null;
		if (parsed && line !== null) {
			for (const n of parsed.flat) {
				if (n.entryLine > line) break;
				node = n;
			}
		}
		let row = node ? this.rows.get(node) : undefined;
		while (node && (!row || row.closest('.vo-collapsed'))) {
			node = node.parent;
			row = node ? this.rows.get(node) : undefined;
		}
		if (row === this.currentRow) return;
		this.currentRow?.removeClass('vo-node-current');
		this.currentRow = row ?? null;
		if (row) {
			row.addClass('vo-node-current');
			row.scrollIntoView({ block: 'nearest' });
		}
	}

	private dropPosition(row: HTMLElement, evt: DragEvent): DropPosition {
		const rect = row.getBoundingClientRect();
		const y = (evt.clientY - rect.top) / Math.max(rect.height, 1);
		return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'child';
	}

	private wireDrag(row: HTMLElement, path: string, node: OutlineNode): void {
		row.draggable = true;
		row.addEventListener('dragstart', (evt) => {
			this.dragged = node;
			row.addClass('vo-dragging');
			if (evt.dataTransfer) {
				evt.dataTransfer.effectAllowed = 'move';
				evt.dataTransfer.setData('text/plain', node.text);
			}
		});
		row.addEventListener('dragend', () => {
			this.dragged = null;
			row.removeClass('vo-dragging');
			for (const el of Array.from(this.contentEl.querySelectorAll('.vo-drop-before, .vo-drop-after, .vo-drop-child'))) {
				el.removeClasses(DROP_CLASSES);
			}
		});
		row.addEventListener('dragover', (evt) => {
			const dragged = this.dragged;
			// Not onto itself or anywhere inside its own block.
			if (!dragged || (node.entryLine >= dragged.subtreeStart && node.entryLine < dragged.subtreeEnd)) return;
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
			row.removeClasses(DROP_CLASSES);
			row.addClass(`vo-drop-${this.dropPosition(row, evt)}`);
		});
		row.addEventListener('dragleave', () => row.removeClasses(DROP_CLASSES));
		row.addEventListener('drop', (evt) => {
			evt.preventDefault();
			row.removeClasses(DROP_CLASSES);
			const dragged = this.dragged;
			this.dragged = null;
			if (dragged) this.host.moveNode(path, dragged, node, this.dropPosition(row, evt));
		});
	}

	private renderNode(
		container: HTMLElement,
		path: string,
		node: OutlineNode,
		levels: readonly LevelFormat[],
		matches: Set<OutlineNode> | null,
		trimmedQuery: string,
	): void {
		if (matches && !matches.has(node)) return;

		const row = container.createDiv({ cls: 'vo-node' });
		if (trimmedQuery !== '' && node.text.toLowerCase().includes(trimmedQuery)) {
			row.addClass('vo-node-match');
		}

		const hasChildren = node.children.length > 0;
		const hasOwnBody = node.ownBodyStart < node.ownBodyEnd;
		const canToggle = hasChildren || hasOwnBody;
		const collapsed = node.id !== null && this.host.isCollapsed(path, node.id);
		const toggle = row.createDiv({ cls: `vo-node-toggle${canToggle ? '' : ' vo-node-toggle-empty'}` });
		if (canToggle) {
			setIcon(toggle, collapsed ? 'chevron-right' : 'chevron-down');
			toggle.addEventListener('click', (evt) => {
				evt.stopPropagation();
				this.host.toggleCollapsed(path, node);
			});
		}

		row.createSpan({ cls: 'vo-node-label', text: computeLabel(levels, node) });
		row.createSpan({ cls: 'vo-node-text', text: node.text === '' ? '(empty)' : node.text });
		row.addEventListener('click', () => this.host.jumpToNode(path, node));
		this.rows.set(node, row);
		this.wireDrag(row, path, node);

		if (hasChildren) {
			// Search always shows the path to a match regardless of collapse state.
			const expanded = matches !== null || !collapsed;
			const childrenEl = container.createDiv({
				cls: `vo-node-children${expanded ? '' : ' vo-collapsed'}`,
			});
			for (const child of node.children) {
				this.renderNode(childrenEl, path, child, levels, matches, trimmedQuery);
			}
		}
	}
}
