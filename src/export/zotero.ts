// Citation data from the Zotero Manager plugin's public API
// (app.plugins.plugins['zotero-manager'].api, version 1), which already owns
// the Better BibTeX connection. Items come back as CSL-JSON keyed by citekey,
// which is what pandoc --citeproc reads.

import type { App } from 'obsidian';

import type { LibraryKey } from '../core/exportBody';
import { groupKeysByLibrary } from '../core/exportBody';

interface ZoteroManagerApi {
	version: number;
	isAvailable(): Promise<boolean>;
	getItemJSON(keys: { key: string; library: number }[], libraryID: number): Promise<unknown[] | null>;
	getAllCiteKeys(force?: boolean): Promise<LibraryKey[]>;
}

export type CitationFetch =
	| { ok: true; items: unknown[]; unknownKeys: string[] }
	| { ok: false; reason: 'not-installed' | 'not-running' | 'failed'; message: string };

function zoteroManager(app: App): ZoteroManagerApi | null {
	const plugins = (app as unknown as { plugins?: { plugins?: Record<string, { api?: unknown }> } }).plugins?.plugins;
	const api = plugins?.['zotero-manager']?.api as Partial<ZoteroManagerApi> | undefined;
	if (!api || typeof api.version !== 'number' || api.version < 1) return null;
	if (typeof api.isAvailable !== 'function' || typeof api.getItemJSON !== 'function' || typeof api.getAllCiteKeys !== 'function') {
		return null;
	}
	return api as ZoteroManagerApi;
}

export async function fetchCitations(app: App, keys: readonly string[]): Promise<CitationFetch> {
	const api = zoteroManager(app);
	if (!api) {
		return {
			ok: false,
			reason: 'not-installed',
			message: 'This note cites sources, but the Zotero Manager plugin is not installed or enabled.',
		};
	}
	if (!(await api.isAvailable())) {
		return {
			ok: false,
			reason: 'not-running',
			message: "Zotero isn't running. Start Zotero (with Better BibTeX) and export again.",
		};
	}
	const { byLibrary, unknown } = groupKeysByLibrary(keys, await api.getAllCiteKeys(true));
	const items: unknown[] = [];
	for (const [library, libKeys] of byLibrary) {
		const got = await api.getItemJSON(
			libKeys.map((key) => ({ key, library })),
			library,
		);
		if (got === null) {
			return { ok: false, reason: 'failed', message: 'Zotero Manager could not export citation data from Zotero.' };
		}
		items.push(...got);
	}
	return { ok: true, items, unknownKeys: unknown };
}
