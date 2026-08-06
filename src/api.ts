// Public JS API for query tools (Dataview / Datacore) — a read-only surface
// mirroring md-annotation's src/api.ts, per the Architecture note ("Per-node
// metadata... exposed to Dataview and Datacore the way md-annotation and
// annotation-manager already are").
//
//   const api = app.plugins.plugins['virtual-outliner'].api;
//   const nodes = await api.getOutline(dv.current().file.path);
//
// Example (dataviewjs) — table of the current note's outline:
//
//   ```dataviewjs
//   const api = app.plugins.plugins['virtual-outliner'].api;
//   const nodes = await api.getOutline(dv.current().file.path);
//   dv.table(['Label', 'Text', 'Status'],
//     nodes.map(n => [n.label, n.text, n.meta?.Status ?? '']));
//   ```
//
// Returned objects are deep copies — callers can mutate them freely without
// touching plugin state or note data.

import type { Vault } from 'obsidian';

import { computeLabel } from './core/label';
import { BLOCK_OPEN, parseMetaDocument } from './core/metadata';
import { parseOutline } from './core/parser';
import type { LevelFormat } from './core/types';

export interface OutlineNodeSummary {
	id: string | null;
	level: number;
	text: string;
	label: string;
	siblingIndex: number;
	// null when the node has no id yet (never touched by a metadata action)
	// or carries no metadata record.
	meta: Record<string, string> | null;
}

export interface FileOutline {
	path: string;
	nodes: OutlineNodeSummary[];
}

export interface VirtualOutlinerAPI {
	getOutline(path: string): Promise<OutlineNodeSummary[]>;
	getAllOutlines(): Promise<FileOutline[]>;
}

function clone<T>(v: T): T {
	return structuredClone(v);
}

function summarize(doc: string, sigilChar: string, levels: readonly LevelFormat[]): OutlineNodeSummary[] {
	const { body, records } = parseMetaDocument(doc);
	const parsed = parseOutline(body, sigilChar);
	const metaById = new Map(records.map((r) => [r.id, r.fields] as const));
	return parsed.flat.map((node) => ({
		id: node.id,
		level: node.level,
		text: node.text,
		label: computeLabel(levels, node),
		siblingIndex: node.siblingIndex,
		meta: node.id !== null ? clone(metaById.get(node.id) ?? null) : null,
	}));
}

export function createApi(
	vault: Vault,
	sigilChar: () => string,
	levels: () => readonly LevelFormat[],
): VirtualOutlinerAPI {
	return {
		async getOutline(path: string): Promise<OutlineNodeSummary[]> {
			const file = vault.getFileByPath(path);
			if (!file || file.extension !== 'md') return [];
			const doc = await vault.cachedRead(file);
			return summarize(doc, sigilChar(), levels());
		},

		async getAllOutlines(): Promise<FileOutline[]> {
			const out: FileOutline[] = [];
			const sigil = sigilChar();
			const lvls = levels();
			for (const file of vault.getMarkdownFiles()) {
				const doc = await vault.cachedRead(file);
				if (!doc.includes(sigil) && !doc.includes(BLOCK_OPEN)) continue;
				const nodes = summarize(doc, sigil, lvls);
				if (nodes.length > 0) out.push({ path: file.path, nodes });
			}
			return out;
		},
	};
}
