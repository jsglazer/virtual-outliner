// Writes the bundled PDF renderer to a fixed local folder on this Mac:
//
//   ~/Library/Application Support/virtual-outliner/
//     renderer/<pluginVersion>-<hash>/   one folder per bundled renderer
//     renderer/current -> <newest>       what the Quick Action runs
//     vaults/<vault name>/config.json    sigil, author, export defaults
//     vaults/<vault name>/preamble.tex   the settings preamble
//
// main.js carries the renderer, so it reaches every Mac that syncs the plugin
// with no deploy step. Each plugin instance runs its OWN versioned folder, so
// a dev build in one vault and a release in another never trade files.
// Scripts are run as `/bin/zsh file` / `python3 file`, never via their
// executable bit, which sync services drop.

import type { PdfExportSettings } from '../core/settings';
import { node } from './node';
import { QUICK_ACTION_TEMPLATE, RENDERER_FILES } from './rendererFiles';

const KEEP_VERSIONS = 3;
const BUILD_DIR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const QUICK_ACTION_NAME = 'Convert Md to PDF (Virtual Outliner)';

export function supportDir(): string {
	const { path, os } = node();
	return path.join(os.homedir(), 'Library', 'Application Support', 'virtual-outliner');
}

export function buildRoot(): string {
	const { path, os } = node();
	return path.join(os.tmpdir(), 'virtual-outliner-export');
}

function rendererHash(): string {
	const hash = node().crypto.createHash('sha256');
	for (const name of Object.keys(RENDERER_FILES).sort()) {
		hash.update(name).update('\0').update(RENDERER_FILES[name] ?? '').update('\0');
	}
	return hash.digest('hex').slice(0, 8);
}

// Installs this plugin version's renderer if it isn't there yet and returns
// its folder. Written to a temp sibling first and renamed into place, so a
// Quick Action running at the same moment never sees half-written files.
export async function ensureRenderer(pluginVersion: string): Promise<string> {
	const { fs, path } = node();
	const root = path.join(supportDir(), 'renderer');
	const name = `${pluginVersion}-${rendererHash()}`;
	const dir = path.join(root, name);
	await fs.promises.mkdir(root, { recursive: true });

	if (!fs.existsSync(path.join(dir, 'render-pdf.sh'))) {
		const tmp = `${dir}.partial-${node().crypto.randomBytes(4).toString('hex')}`;
		for (const [rel, content] of Object.entries(RENDERER_FILES)) {
			const file = path.join(tmp, rel);
			await fs.promises.mkdir(path.dirname(file), { recursive: true });
			await fs.promises.writeFile(file, content, 'utf8');
		}
		try {
			await fs.promises.rename(tmp, dir);
		} catch {
			// Another window installed the same version first; theirs is identical.
			await fs.promises.rm(tmp, { recursive: true, force: true });
		}
	}

	const link = path.join(root, 'current');
	const tmpLink = `${link}.partial-${node().crypto.randomBytes(4).toString('hex')}`;
	await fs.promises.symlink(name, tmpLink);
	await fs.promises.rename(tmpLink, link);

	await pruneVersions(root, name);
	return dir;
}

async function pruneVersions(root: string, keep: string): Promise<void> {
	const { fs, path } = node();
	const entries = await fs.promises.readdir(root, { withFileTypes: true });
	const dirs: { name: string; mtime: number }[] = [];
	for (const e of entries) {
		if (!e.isDirectory()) continue;
		const full = path.join(root, e.name);
		if (e.name.includes('.partial-')) {
			const stat = await fs.promises.stat(full);
			if (Date.now() - stat.mtimeMs > 60 * 60 * 1000) await fs.promises.rm(full, { recursive: true, force: true });
			continue;
		}
		dirs.push({ name: e.name, mtime: (await fs.promises.stat(full)).mtimeMs });
	}
	dirs.sort((a, b) => b.mtime - a.mtime);
	const survivors = new Set([keep, ...dirs.slice(0, KEEP_VERSIONS).map((d) => d.name)]);
	for (const d of dirs) {
		if (!survivors.has(d.name)) await fs.promises.rm(path.join(root, d.name), { recursive: true, force: true });
	}
}

export interface VaultConfig {
	sigil: string;
	export: PdfExportSettings;
	defaultPreamble: string;
}

// What the Quick Action needs to behave like the plugin without Obsidian
// running: the sigil (to refuse outline notes), author, defaults, preamble.
export async function writeVaultConfig(vaultName: string, config: VaultConfig): Promise<void> {
	const { fs, path } = node();
	const dir = path.join(supportDir(), 'vaults', vaultName.replace(/[/:]/g, '_'));
	await fs.promises.mkdir(dir, { recursive: true });
	const preamblePath = path.join(dir, 'preamble.tex');
	const preamble = config.export.preamble.trim() !== '' ? config.export.preamble : config.defaultPreamble;
	await fs.promises.writeFile(preamblePath, preamble, 'utf8');
	const json = {
		sigil: config.sigil,
		author: config.export.author,
		preamblePath,
		defaults: {
			headnum: config.export.headnum,
			toc: config.export.toc,
			notes: config.export.notes,
			cite: config.export.cite,
		},
	};
	await fs.promises.writeFile(path.join(dir, 'config.json'), JSON.stringify(json, null, 2), 'utf8');
}

export const SEARCH_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/Library/TeX/texbin', '/usr/bin', '/bin'];

export function findTool(name: string): string | null {
	const { fs, path } = node();
	for (const dir of SEARCH_PATH) {
		const candidate = path.join(dir, name);
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return candidate;
		} catch {
			// keep looking
		}
	}
	return null;
}

export const REQUIRED_TOOLS = ['pandoc', 'latexmk', 'lualatex', 'python3'] as const;

export function missingTools(): string[] {
	return REQUIRED_TOOLS.filter((t) => findTool(t) === null);
}

export async function pruneBuildDirs(): Promise<void> {
	const { fs, path } = node();
	const root = buildRoot();
	if (!fs.existsSync(root)) return;
	for (const vault of await fs.promises.readdir(root)) {
		const vaultDir = path.join(root, vault);
		for (const note of await fs.promises.readdir(vaultDir).catch(() => [] as string[])) {
			const dir = path.join(vaultDir, note);
			const stat = await fs.promises.stat(dir).catch(() => null);
			if (stat && Date.now() - stat.mtimeMs > BUILD_DIR_MAX_AGE_MS) {
				await fs.promises.rm(dir, { recursive: true, force: true });
			}
		}
	}
}

function xmlEscape(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The installed .workflow is a stub that execs renderer/current/quick-action.sh,
// so its behaviour follows the plugin and it never needs reinstalling for an
// update. Written fresh each time (Services don't sync, so once per Mac).
export async function installQuickAction(): Promise<string> {
	const { fs, path, os, childProcess } = node();
	const command = [
		'#!/bin/zsh',
		'R="$HOME/Library/Application Support/virtual-outliner/renderer/current/quick-action.sh"',
		'if [[ ! -f "$R" ]]; then',
		`  osascript -e 'display dialog "Open Obsidian with Virtual Outliner enabled once to install the PDF renderer." buttons {"OK"} default button "OK" with icon caution'`,
		'  exit 1',
		'fi',
		'exec /bin/zsh "$R" "$@"',
		'',
	].join('\n');
	const dir = path.join(os.homedir(), 'Library', 'Services', `${QUICK_ACTION_NAME}.workflow`, 'Contents');
	await fs.promises.mkdir(dir, { recursive: true });
	await fs.promises.writeFile(
		path.join(dir, 'Info.plist'),
		QUICK_ACTION_TEMPLATE.info.replace('@@NAME@@', xmlEscape(QUICK_ACTION_NAME)),
		'utf8',
	);
	await fs.promises.writeFile(
		path.join(dir, 'document.wflow'),
		QUICK_ACTION_TEMPLATE.document.replace('@@COMMAND@@', xmlEscape(command)),
		'utf8',
	);
	// Refresh the Services menu; harmless if it fails (it refreshes on login).
	childProcess.execFile('/System/Library/CoreServices/pbs', ['-update'], () => undefined);
	return path.dirname(dir);
}
