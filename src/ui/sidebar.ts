// Sidebar outline tree: collapsible, searchable, click to jump — v1's scope
// is deliberately navigation-only (Interview capture: "Sidebar v1 needs
// navigation only with collapse/expand, search, and jump to prose");
// drag-to-reorder / rename-in-place are nice-to-haves explicitly out of v1.

import type { WorkspaceLeaf } from 'obsidian';
import { ItemView, setIcon } from 'obsidian';

import { computeLabel } from '../core/label';
import type { ParsedOutline, OutlineNode } from '../core/types';
import type { LevelFormat } from '../core/types';

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
}

export class OutlineSidebarView extends ItemView {
	private unsubscribe: (() => void) | null = null;
	private searchQuery = '';

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
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
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
