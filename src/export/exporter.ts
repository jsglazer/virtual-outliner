// PDF export orchestration (desktop only): stage a build folder from the note,
// resolve citations and the preamble, run the bundled renderer, and report.
//
//   $TMPDIR/virtual-outliner-export/<vault hash>/<note hash>/
//     source.md      the note's body, outline stripped, Obsidian syntax converted
//     assets/        vault images the note embeds
//     preamble.tex   the resolved preamble
//     refs.json      CSL-JSON from Zotero (only when the note cites)
//     job.json       everything else the renderer needs (see renderer/job.py)
//
// The folder is wiped at the start of each export of that note, removed after
// a success unless "Keep build files" is on, and always kept after a failure.

import type { App, TFile } from 'obsidian';
import { FileSystemAdapter, TFolder } from 'obsidian';

import type { BodyExtraction } from '../core/exportBody';
import { collectCiteKeys, extractBody } from '../core/exportBody';
import type { ExportOptions } from '../core/exportOptions';
import { resolveExportOptions, resolvePdfOutput } from '../core/exportOptions';
import type { ConversionIssue, ExportResolver } from '../core/obsidianMarkdown';
import { toPandocMarkdown } from '../core/obsidianMarkdown';
import type { PdfExportSettings } from '../core/settings';
import { buildRoot, ensureRenderer, missingTools, SEARCH_PATH } from './installer';
import { node } from './node';
import { DEFAULT_PREAMBLE } from './rendererFiles';
import { fetchCitations } from './zotero';

const RENDER_TIMEOUT_MS = 5 * 60 * 1000;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff', 'bmp', 'svg', 'heic', 'avif']);

export interface ExporterHost {
	app: App;
	pluginVersion: string;
	sigilChar(): string;
	settings(): PdfExportSettings;
}

// What the export dialog shows and edits before anything is written.
export interface ExportPlan {
	file: TFile;
	extraction: BodyExtraction;
	options: ExportOptions;
	fontsize: string;
	outputPath: string;
	preambleSource: string;
}

export type ExportOutcome =
	| { ok: true; output: string; issues: ConversionIssue[]; unknownKeys: string[] }
	| { ok: false; stage: string; message: string; buildDir: string | null; logPath: string | null };

export function vaultBasePath(app: App): string | null {
	const adapter = app.vault.adapter;
	return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
}

function sha(text: string): string {
	return node().crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
}

export class PdfExporter {
	constructor(private host: ExporterHost) {}

	async plan(file: TFile, doc: string): Promise<ExportPlan | string> {
		const base = vaultBasePath(this.host.app);
		if (base === null) return 'PDF export needs a vault stored on this computer.';
		const { path, os } = node();
		const settings = this.host.settings();
		const extraction = extractBody(doc, this.host.sigilChar());
		if (extraction.isEmpty) return `${file.basename} has no body text to export yet — only outline entries.`;
		const fm = this.host.app.metadataCache.getFileCache(file)?.frontmatter;
		const options = resolveExportOptions(
			fm,
			{ headnum: settings.headnum, toc: settings.toc, notes: settings.notes, cite: settings.cite },
			file.basename,
		);
		const noteDir = path.join(base, file.parent?.path ?? '');
		return {
			file,
			extraction,
			options,
			fontsize: options.fontsize ?? settings.lastFontSize,
			outputPath: resolvePdfOutput(options.pdfOutput, noteDir, file.basename, os.homedir()),
			preambleSource: (await this.resolvePreamble(file, options)).label,
		};
	}

	// Frontmatter latex-preamble → Pre*.tex beside the note → settings → bundled.
	private async resolvePreamble(file: TFile, options: ExportOptions): Promise<{ text: string; label: string }> {
		const { vault, metadataCache } = this.host.app;
		if (options.latexPreamble !== '') {
			const target = metadataCache.getFirstLinkpathDest(options.latexPreamble, file.path) ?? vault.getFileByPath(options.latexPreamble);
			if (target) return { text: await vault.read(target), label: target.path };
		}
		const parent = file.parent;
		if (parent instanceof TFolder) {
			const local = parent.children
				.filter((c): c is TFile => 'extension' in c && c.name.startsWith('Pre') && c.name.endsWith('.tex'))
				.sort((a, b) => a.name.localeCompare(b.name))[0];
			if (local) return { text: await vault.read(local), label: local.path };
		}
		const fromSettings = this.host.settings().preamble;
		if (fromSettings.trim() !== '') return { text: fromSettings, label: 'Settings → LaTeX preamble' };
		return { text: DEFAULT_PREAMBLE, label: 'Built-in default preamble' };
	}

	async run(plan: ExportPlan, progress: (msg: string) => void): Promise<ExportOutcome> {
		const { fs, path } = node();
		const { app } = this.host;
		const base = vaultBasePath(app);
		if (base === null) return { ok: false, stage: 'vault', message: 'PDF export needs a vault stored on this computer.', buildDir: null, logPath: null };

		const missing = missingTools();
		if (missing.length > 0) {
			return {
				ok: false,
				stage: 'tools',
				message: `Missing ${missing.join(', ')}. PDF export needs pandoc, MacTeX (latexmk, lualatex) and python3.`,
				buildDir: null,
				logPath: null,
			};
		}

		progress('Preparing renderer…');
		const renderer = await ensureRenderer(this.host.pluginVersion);

		const buildDir = path.join(buildRoot(), sha(base), sha(plan.file.path));
		await fs.promises.rm(buildDir, { recursive: true, force: true });
		await fs.promises.mkdir(path.join(buildDir, 'assets'), { recursive: true });
		const fail = (stage: string, message: string): ExportOutcome => ({ ok: false, stage, message, buildDir, logPath: null });

		progress('Converting note…');
		const staged = new Map<string, string>();
		const resolver: ExportResolver = {
			resolveLink: (linkpath, fromPath) => {
				const target = app.metadataCache.getFirstLinkpathDest(linkpath, fromPath);
				if (!target) return null;
				const ext = target.extension.toLowerCase();
				return { path: target.path, kind: ext === 'md' ? 'markdown' : IMAGE_EXTENSIONS.has(ext) ? 'image' : 'other' };
			},
			readNote: async (notePath) => {
				const f = app.vault.getFileByPath(notePath);
				return f ? app.vault.cachedRead(f) : '';
			},
			stageImage: (imagePath) => {
				let rel = staged.get(imagePath);
				if (rel === undefined) {
					rel = `assets/${staged.size + 1}-${path.basename(imagePath)}`;
					staged.set(imagePath, rel);
				}
				return rel;
			},
		};
		const converted = await toPandocMarkdown(plan.extraction.body, plan.file.path, this.host.sigilChar(), resolver);
		for (const [vaultPath, rel] of staged) {
			await fs.promises.copyFile(path.join(base, vaultPath), path.join(buildDir, rel));
		}

		let bibliography = '';
		let unknownKeys: string[] = [];
		const keys = collectCiteKeys(converted.markdown);
		if (keys.length > 0) {
			if (plan.options.bibliography !== '') {
				const bib = app.metadataCache.getFirstLinkpathDest(plan.options.bibliography, plan.file.path);
				const abs = bib ? path.join(base, bib.path) : path.resolve(path.join(base, plan.file.parent?.path ?? ''), plan.options.bibliography);
				if (!fs.existsSync(abs)) return fail('citations', `The bibliography file in this note's frontmatter wasn't found: ${plan.options.bibliography}`);
				bibliography = abs;
			} else {
				progress('Fetching citations from Zotero…');
				const fetched = await fetchCitations(app, keys);
				if (!fetched.ok) return fail('citations', `${fetched.message} (${keys.length} cited source${keys.length === 1 ? '' : 's'}).`);
				unknownKeys = fetched.unknownKeys;
				await fs.promises.writeFile(path.join(buildDir, 'refs.json'), JSON.stringify(fetched.items, null, 2), 'utf8');
				bibliography = 'refs.json';
			}
		}

		const preamble = await this.resolvePreamble(plan.file, plan.options);
		const settings = this.host.settings();
		await fs.promises.writeFile(path.join(buildDir, 'preamble.tex'), preamble.text, 'utf8');
		await fs.promises.writeFile(path.join(buildDir, 'source.md'), `${converted.markdown}\n`, 'utf8');
		const job = {
			version: 1,
			source: 'source.md',
			output: plan.outputPath,
			fontsize: plan.fontsize,
			headnum: plan.options.headnum,
			toc: plan.options.toc,
			notes: plan.options.notes,
			preamble: 'preamble.tex',
			bibliography,
			cite: plan.options.cite,
			title: plan.options.title,
			author: plan.options.author ?? settings.author,
			resourcePath: path.join(base, plan.file.parent?.path ?? ''),
		};
		const jobPath = path.join(buildDir, 'job.json');
		await fs.promises.writeFile(jobPath, JSON.stringify(job, null, 2), 'utf8');

		progress('Typesetting PDF…');
		const status = await runRenderer(path.join(renderer, 'render-pdf.sh'), jobPath, buildDir);
		if (!status.ok) {
			const log = ['doc.log', 'render.log'].map((f) => path.join(buildDir, f)).find((f) => fs.existsSync(f)) ?? null;
			return { ok: false, stage: status.stage, message: status.message, buildDir, logPath: log };
		}
		if (!settings.keepBuildFiles) await fs.promises.rm(buildDir, { recursive: true, force: true });
		return { ok: true, output: status.output, issues: converted.issues, unknownKeys };
	}
}

type RendererStatus = { ok: true; output: string } | { ok: false; stage: string; message: string };

function runRenderer(script: string, jobPath: string, cwd: string): Promise<RendererStatus> {
	const { childProcess, process } = node();
	return new Promise((resolve) => {
		const env = { ...process.env, PATH: [...SEARCH_PATH, '/usr/sbin', '/sbin', process.env.PATH ?? ''].join(':') };
		const child = childProcess.execFile(
			'/bin/zsh',
			[script, '--job', jobPath],
			{ cwd, env, timeout: RENDER_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
			(error, stdout, stderr) => {
				const last = stdout.trim().split('\n').pop() ?? '';
				try {
					const parsed = JSON.parse(last) as { ok?: boolean; output?: string; stage?: string; message?: string };
					if (parsed.ok === true && typeof parsed.output === 'string') {
						resolve({ ok: true, output: parsed.output });
						return;
					}
					resolve({ ok: false, stage: parsed.stage ?? 'render', message: parsed.message ?? 'The renderer failed.' });
				} catch {
					const detail = error?.killed ? 'The renderer timed out.' : (stderr || stdout || error?.message || '').trim().slice(-2000);
					resolve({ ok: false, stage: 'render', message: detail || 'The renderer failed without a message.' });
				}
			},
		);
		child.stdin?.end();
	});
}
