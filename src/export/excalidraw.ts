// Excalidraw drawings in PDF export. A `![[Drawing.excalidraw]]` embed
// resolves to a Markdown file (`Drawing.excalidraw.md`) holding the scene as
// JSON, which pandoc cannot print. The exporter treats it as an image instead
// and, when staging it, asks the Excalidraw plugin to render the scene to PNG
// — the same picture Obsidian shows. Without the plugin, an auto-exported
// `.png` beside the drawing is used; with neither, export fails with a
// message saying what to do.

import type { App, TFile } from 'obsidian';

interface ExcalidrawApi {
	createPNG(templatePath?: string, scale?: number, exportSettings?: { withBackground: boolean; withTheme: boolean; isMask: boolean }, loader?: unknown, theme?: string, padding?: number): Promise<Blob>;
	destroy?(): void;
}

interface ExcalidrawGlobal extends ExcalidrawApi {
	getAPI?(): ExcalidrawApi;
}

// Print resolution: the scene's own pixels × 3 is ~300 dpi at the sizes a
// drawing is usually embedded.
const SCALE = 3;
const PADDING = 10;

export function isExcalidraw(app: App, file: TFile): boolean {
	if (file.extension === 'excalidraw') return true;
	if (file.extension !== 'md') return false;
	if (file.name.toLowerCase().endsWith('.excalidraw.md')) return true;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	return fm !== undefined && 'excalidraw-plugin' in fm;
}

// The name a staged drawing gets: its file name with `.md` swapped for `.png`.
export function drawingImageName(file: TFile): string {
	return `${file.name.replace(/\.md$/i, '')}.png`;
}

// A fresh instance when the plugin offers one (it is ours to destroy), else
// the shared global, which must be left alone.
function excalidrawApi(): { api: ExcalidrawApi; owned: boolean } | null {
	const g = (window as unknown as { ExcalidrawAutomate?: ExcalidrawGlobal }).ExcalidrawAutomate;
	if (!g) return null;
	return typeof g.getAPI === 'function' ? { api: g.getAPI(), owned: true } : { api: g, owned: false };
}

// Exported images Excalidraw's "auto-export" settings write beside a drawing.
function exportedSibling(app: App, file: TFile): TFile | null {
	const dir = file.parent?.path ?? '';
	const stem = file.name.replace(/\.md$/i, '');
	const bare = stem.replace(/\.excalidraw$/i, '');
	for (const name of [`${stem}.png`, `${bare}.png`]) {
		const found = app.vault.getFileByPath(dir === '' || dir === '/' ? name : `${dir}/${name}`);
		if (found) return found;
	}
	return null;
}

export type DrawingImage = { ok: true; data: Uint8Array } | { ok: false; message: string };

export async function renderDrawing(app: App, file: TFile): Promise<DrawingImage> {
	const found = excalidrawApi();
	if (found) {
		const { api, owned } = found;
		try {
			const blob = await api.createPNG(file.path, SCALE, { withBackground: true, withTheme: false, isMask: false }, undefined, 'light', PADDING);
			return { ok: true, data: new Uint8Array(await blob.arrayBuffer()) };
		} catch (e) {
			const sibling = exportedSibling(app, file);
			if (sibling) return { ok: true, data: new Uint8Array(await app.vault.readBinary(sibling)) };
			return { ok: false, message: `Excalidraw couldn't render ${file.path}: ${e instanceof Error ? e.message : String(e)}` };
		} finally {
			if (owned) api.destroy?.();
		}
	}
	const sibling = exportedSibling(app, file);
	if (sibling) return { ok: true, data: new Uint8Array(await app.vault.readBinary(sibling)) };
	return { ok: false, message: `${file.path} is an Excalidraw drawing. Enable the Excalidraw plugin (or turn on its PNG auto-export) so it can be printed.` };
}
