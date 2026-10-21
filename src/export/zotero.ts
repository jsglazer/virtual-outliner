// Citation data from the Zotero Manager plugin's public API
// (app.plugins.plugins['zotero-manager'].api, version 1), which already owns
// the Better BibTeX connection. getCSLJSON returns CSL-JSON keyed by citekey,
// which is what pandoc --citeproc reads. (The older getItemJSON returns
// BetterBibTeX JSON — Zotero-native fields citeproc can't read — so it is not
// used here; getCSLJSON arrived in Zotero Manager 1.1.15.)

import type { App } from 'obsidian';

import type { LibraryKey } from '../core/exportBody';
import { groupKeysByLibrary } from '../core/exportBody';

interface ZoteroManagerApi {
	version: number;
	isAvailable(): Promise<boolean>;
	getCSLJSON(keys: { key: string; library: number }[], libraryID: number): Promise<unknown[] | null>;
	getAllCiteKeys(force?: boolean): Promise<LibraryKey[]>;
}

export type CitationFetch =
	| { ok: true; items: unknown[]; unknownKeys: string[] }
	| { ok: false; reason: 'not-installed' | 'outdated' | 'not-running' | 'failed'; message: string };

function zoteroManager(app: App): ZoteroManagerApi | null {
	const plugins = (app as unknown as { plugins?: { plugins?: Record<string, { api?: unknown }> } }).plugins?.plugins;
	const api = plugins?.['zotero-manager']?.api as Partial<ZoteroManagerApi> | undefined;
	if (!api || typeof api.version !== 'number' || api.version < 1) return null;
	if (typeof api.isAvailable !== 'function' || typeof api.getAllCiteKeys !== 'function') return null;
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
	if (typeof api.getCSLJSON !== 'function') {
		return {
			ok: false,
			reason: 'outdated',
			message: 'This note cites sources, but the installed Zotero Manager is too old to export CSL-JSON. Update it to 1.1.15 or later.',
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
		const got = await api.getCSLJSON(
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
