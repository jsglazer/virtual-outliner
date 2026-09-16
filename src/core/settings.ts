// Settings model + settings -> CSS generation. Pure module: no 'obsidian',
// no DOM. Mirrors the settings->CSS pattern in md-annotation/annotation-manager
// (Architecture note: "the same idea as 'Format'"), generated into one
// regenerated <style> element by the shell rather than duplicated per
// decoration (Decision #12's per-level typography approach).

import type { NotesMode } from './exportOptions';
import { CITE_STYLES, FONT_SIZES } from './exportOptions';
import { DEFAULT_SIGIL_CHAR, MAX_LEVEL } from './sigil';
import type { EnterBehavior, LabelStyle, LevelFormat, ViewState } from './types';

export interface MetaFieldDef {
	name: string;
	type: 'text' | 'select';
	options: string[]; // used only when type === 'select'
}

// One colour plus its enable checkbox; a disabled colour is not applied.
export interface ColorOption {
	enabled: boolean;
	color: string; // '#rrggbb' or ''
}

export interface ThemedColorOption {
	light: ColorOption;
	dark: ColorOption;
}

// One Note Toolbar item recoloured with the state of the toggle it runs, so the
// button reads as pressed while that toggle is on — ported from md-annotation's
// setting of the same name, same shape, so both plugins' Note Toolbar tabs
// behave alike. The two uuids identify the item (toolbar → item); `on`/`off`
// are the background colours for each state. Background only: the icon and
// label colour stay Note Toolbar's own. A colour left switched off leaves the
// button to Note Toolbar for that state, which is what `off` defaults to.
export interface ToolbarHighlight {
	toolbarUuid: string;
	itemUuid: string;
	on: ThemedColorOption;
	off: ThemedColorOption;
}

export interface ToolbarHighlights {
	sidebar: ToolbarHighlight;
	indentBody: ToolbarHighlight;
	enterBehavior: ToolbarHighlight;
}

// PDF export. The LaTeX preamble lives here (so it syncs with the plugin's
// settings and is edited in the settings panel); '' means "use the bundled
// default", which the shell seeds on first load. headnum/toc/notes/cite are
// the defaults a note's own frontmatter overrides.
export interface PdfExportSettings {
	preamble: string;
	author: string;
	headnum: boolean;
	toc: boolean;
	notes: NotesMode;
	cite: string;
	lastFontSize: string;
	keepBuildFiles: boolean;
	openAfterExport: boolean;
}

export interface OutlineSettings {
	// The configurable depth sigil (Decision #1 — "keep as configurable").
	// Exactly one character; anything else is coerced back to the default by
	// normalizeSettings.
	sigil: string;
	defaultViewState: ViewState;
	indentBody: boolean;
	enterBehavior: EnterBehavior;
	levels: LevelFormat[]; // always exactly MAX_LEVEL entries, index 0 = level 1
	metaFields: MetaFieldDef[];
	toolbarHighlights: ToolbarHighlights;
	// The ¶ that marks a paragraph break, and the text of a comment line.
	// Both are '#rrggbb'; an empty or malformed value falls back to the
	// default, so the markers are never invisible.
	paragraphColor: string;
	commentColor: string;
	pdfExport: PdfExportSettings;
}

export const DEFAULT_PARAGRAPH_COLOR = '#9e9e9e';
export const DEFAULT_COMMENT_COLOR = '#b07d2b';

function readColor(v: unknown, fallback: string): string {
	return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

// The marker colours as CSS custom properties, alongside levelCssVars.
export function markerCssVars(settings: OutlineSettings): Record<string, string> {
	return {
		'--vo-paragraph-color': readColor(settings.paragraphColor, DEFAULT_PARAGRAPH_COLOR),
		'--vo-comment-color': readColor(settings.commentColor, DEFAULT_COMMENT_COLOR),
	};
}

export function defaultPdfExportSettings(): PdfExportSettings {
	return {
		preamble: '',
		author: 'Joshua S. Glazer',
		headnum: false,
		toc: false,
		notes: 'f',
		cite: 'MLA',
		lastFontSize: '12',
		keepBuildFiles: false,
		openAfterExport: false,
	};
}

export function colorOption(color = ''): ColorOption {
	return { enabled: color !== '', color };
}

export function makeToolbarHighlight(onLight = '#fff3a3', onDark = '#7a6f1f'): ToolbarHighlight {
	return {
		toolbarUuid: '',
		itemUuid: '',
		on: { light: colorOption(onLight), dark: colorOption(onDark) },
		off: { light: colorOption(), dark: colorOption() },
	};
}

export function defaultToolbarHighlights(): ToolbarHighlights {
	return {
		sidebar: makeToolbarHighlight(),
		indentBody: makeToolbarHighlight(),
		enterBehavior: makeToolbarHighlight(),
	};
}

const DEFAULT_LABEL_STYLES: LabelStyle[] = ['1.0', '1', '1', '1', '1', '1'];

export function defaultLevelFormat(level: number): LevelFormat {
	return {
		style: DEFAULT_LABEL_STYLES[level - 1] ?? '1',
		separator: level === 1 ? '' : '.',
		fontSize: '',
		fontWeight: level === 1 ? '600' : '',
		fontFamily: '',
		color: '',
		italic: false,
		// Cumulative: a level's own step is added to every step above it, so
		// level 1's step is the whole outline's base offset (0 = flush left)
		// and each deeper level's step is how much further right it sits than
		// its parent.
		indentStep: level === 1 ? '0px' : '1.5em',
		spacing: level === 1 ? '0.75em' : '0.25em',
		labelGap: '0.3em',
	};
}

export function defaultMetaFields(): MetaFieldDef[] {
	return [
		{ name: 'Status', type: 'select', options: ['', 'Open', 'In progress', 'Done'] },
		{ name: 'Note', type: 'text', options: [] },
	];
}

export function defaultSettings(): OutlineSettings {
	const levels: LevelFormat[] = [];
	for (let l = 1; l <= MAX_LEVEL; l++) levels.push(defaultLevelFormat(l));
	return {
		sigil: DEFAULT_SIGIL_CHAR,
		defaultViewState: 'both',
		indentBody: true,
		enterBehavior: 'section',
		levels,
		metaFields: defaultMetaFields(),
		toolbarHighlights: defaultToolbarHighlights(),
		paragraphColor: DEFAULT_PARAGRAPH_COLOR,
		commentColor: DEFAULT_COMMENT_COLOR,
		pdfExport: defaultPdfExportSettings(),
	};
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function readString(v: unknown, fallback: string): string {
	return typeof v === 'string' ? v : fallback;
}

function readBool(v: unknown, fallback: boolean): boolean {
	return typeof v === 'boolean' ? v : fallback;
}

const LABEL_STYLES: ReadonlySet<string> = new Set(['1', '1.0', '1.1', 'I', 'A', 'a', 'i', 'bullet', 'none']);

function readLabelStyle(v: unknown, fallback: LabelStyle): LabelStyle {
	return typeof v === 'string' && LABEL_STYLES.has(v) ? (v as LabelStyle) : fallback;
}

function normalizeLevelFormat(v: unknown, level: number): LevelFormat {
	const fallback = defaultLevelFormat(level);
	if (!isRecord(v)) return fallback;
	return {
		style: readLabelStyle(v.style, fallback.style),
		separator: readString(v.separator, fallback.separator),
		fontSize: readString(v.fontSize, fallback.fontSize),
		fontWeight: readString(v.fontWeight, fallback.fontWeight),
		fontFamily: readString(v.fontFamily, fallback.fontFamily),
		color: readString(v.color, fallback.color),
		italic: readBool(v.italic, fallback.italic),
		// Level 1's indent step is never exposed in the settings UI (it's the
		// outline's flush-left base offset, not a per-level user control), so
		// unlike every other field it is NOT read from persisted data — this
		// also self-heals data.json files saved before flush-left became the
		// fixed behavior.
		indentStep: level === 1 ? fallback.indentStep : readString(v.indentStep, fallback.indentStep),
		spacing: readString(v.spacing, fallback.spacing),
		labelGap: readString(v.labelGap, fallback.labelGap),
	};
}

function normalizeMetaField(v: unknown): MetaFieldDef | null {
	if (!isRecord(v)) return null;
	if (typeof v.name !== 'string' || v.name.trim() === '') return null;
	const type = v.type === 'select' ? 'select' : 'text';
	const options = Array.isArray(v.options) ? v.options.filter((o): o is string => typeof o === 'string') : [];
	return { name: v.name, type, options };
}

function readColorOption(v: unknown): ColorOption {
	if (!isRecord(v)) return colorOption();
	return { enabled: v.enabled === true, color: readString(v.color, '') };
}

function readThemedColorOption(v: unknown, fallback: ThemedColorOption): ThemedColorOption {
	if (!isRecord(v)) return fallback;
	return { light: readColorOption(v.light), dark: readColorOption(v.dark) };
}

// An unreadable value keeps the default colours but never a half-written
// target, so a corrupt entry leaves the highlight switched off rather than
// pointing at an arbitrary button.
function readToolbarHighlight(v: unknown, fallback: ToolbarHighlight): ToolbarHighlight {
	if (!isRecord(v)) return fallback;
	return {
		toolbarUuid: readString(v.toolbarUuid, ''),
		itemUuid: readString(v.itemUuid, ''),
		on: readThemedColorOption(v.on, fallback.on),
		off: readThemedColorOption(v.off, fallback.off),
	};
}

function readToolbarHighlights(v: unknown): ToolbarHighlights {
	const fallback = defaultToolbarHighlights();
	if (!isRecord(v)) return fallback;
	return {
		sidebar: readToolbarHighlight(v.sidebar, fallback.sidebar),
		indentBody: readToolbarHighlight(v.indentBody, fallback.indentBody),
		enterBehavior: readToolbarHighlight(v.enterBehavior, fallback.enterBehavior),
	};
}

function readPdfExport(v: unknown): PdfExportSettings {
	const fallback = defaultPdfExportSettings();
	if (!isRecord(v)) return fallback;
	const cite = readString(v.cite, fallback.cite).trim();
	const size = readString(v.lastFontSize, fallback.lastFontSize);
	return {
		preamble: readString(v.preamble, fallback.preamble),
		author: readString(v.author, fallback.author),
		headnum: readBool(v.headnum, fallback.headnum),
		toc: readBool(v.toc, fallback.toc),
		notes: v.notes === 'e' ? 'e' : 'f',
		cite: cite !== '' ? cite : CITE_STYLES[0] ?? 'MLA',
		lastFontSize: FONT_SIZES.includes(size) ? size : fallback.lastFontSize,
		keepBuildFiles: readBool(v.keepBuildFiles, fallback.keepBuildFiles),
		openAfterExport: readBool(v.openAfterExport, fallback.openAfterExport),
	};
}

const VIEW_STATES: ReadonlySet<string> = new Set(['outline', 'body', 'both']);

export function normalizeSettings(raw: unknown): OutlineSettings {
	const fallback = defaultSettings();
	if (!isRecord(raw)) return fallback;

	const sigilRaw = readString(raw.sigil, fallback.sigil);
	const sigil = sigilRaw.length === 1 && !/\s/.test(sigilRaw) ? sigilRaw : fallback.sigil;

	const defaultViewState =
		typeof raw.defaultViewState === 'string' && VIEW_STATES.has(raw.defaultViewState)
			? (raw.defaultViewState as ViewState)
			: fallback.defaultViewState;

	const levels: LevelFormat[] = [];
	const rawLevels = Array.isArray(raw.levels) ? raw.levels : [];
	for (let i = 0; i < MAX_LEVEL; i++) levels.push(normalizeLevelFormat(rawLevels[i], i + 1));

	const metaFields = Array.isArray(raw.metaFields)
		? raw.metaFields.map(normalizeMetaField).filter((f): f is MetaFieldDef => f !== null)
		: fallback.metaFields;

	return {
		sigil,
		defaultViewState,
		indentBody: readBool(raw.indentBody, fallback.indentBody),
		enterBehavior: raw.enterBehavior === 'line' ? 'line' : 'section',
		levels,
		metaFields: metaFields.length > 0 ? metaFields : fallback.metaFields,
		toolbarHighlights: readToolbarHighlights(raw.toolbarHighlights),
		paragraphColor: readColor(raw.paragraphColor, fallback.paragraphColor),
		commentColor: readColor(raw.commentColor, fallback.commentColor),
		pdfExport: readPdfExport(raw.pdfExport),
	};
}

// The background a highlighted toolbar item takes for the given toggle state and
// theme, '' when that colour is switched off or not a valid hex (the item is
// then left to Note Toolbar).
export function toolbarHighlightColor(highlight: ToolbarHighlight, active: boolean, dark: boolean): string {
	const themed = active ? highlight.on : highlight.off;
	const opt = dark ? themed.dark : themed.light;
	return opt.enabled && /^#[0-9a-fA-F]{6}$/.test(opt.color) ? opt.color : '';
}

// Per-level typography, driven entirely by settings, as CSS custom property
// VALUES that styles.css's static rules reference (`var(--vo-l1-color)`,
// …) — the shell (main.ts applyLevelCssVars) writes these into a dedicated
// `<style>` element rather than `body.setCssProps`, because Obsidian
// periodically rewrites `document.body.style.cssText` wholesale from its own
// appearance settings and silently drops anything a plugin added there.
// Decorations themselves carry only class names (`vo-l1`…`vo-l6`), never
// inline styles (Decision #12).
export function levelCssVars(levels: readonly LevelFormat[]): Record<string, string> {
	const vars: Record<string, string> = {};
	let cumulativeIndent = '';
	for (let i = 0; i < levels.length; i++) {
		const level = levels[i];
		if (!level) continue;
		const n = i + 1;
		vars[`--vo-l${n}-size`] = level.fontSize !== '' ? cssValue(level.fontSize) : 'inherit';
		vars[`--vo-l${n}-weight`] = level.fontWeight !== '' ? cssValue(level.fontWeight) : 'inherit';
		vars[`--vo-l${n}-family`] = level.fontFamily !== '' ? cssValue(level.fontFamily) : 'inherit';
		vars[`--vo-l${n}-color`] = level.color !== '' ? cssValue(level.color) : 'inherit';
		vars[`--vo-l${n}-style`] = level.italic ? 'italic' : 'normal';
		vars[`--vo-l${n}-spacing`] = level.spacing !== '' ? cssValue(level.spacing) : '0px';
		vars[`--vo-l${n}-gap`] = level.labelGap !== '' ? cssValue(level.labelGap) : '0px';
		const step = cssLength(level.indentStep);
		cumulativeIndent = cumulativeIndent === '' ? step : `calc(${cumulativeIndent} + ${step})`;
		vars[`--vo-l${n}-indent`] = cumulativeIndent;
	}
	// Body prose under a level-N entry sits one step further in than the entry
	// itself — where that entry's children start — so it visibly belongs to the
	// entry. Using the entry's OWN indent (as before Update005) left body under
	// every level-1 entry flush left, since level 1's indent is always 0, which
	// made "Indent body" look like it did nothing on a typical note. The deepest
	// level has no next step, so it reuses its own.
	for (let n = 1; n <= levels.length; n++) {
		const next = levels[n] ?? levels[n - 1];
		const step = next ? cssLength(next.indentStep) : '0px';
		vars[`--vo-l${n}-body-indent`] = `calc(${vars[`--vo-l${n}-indent`] ?? '0px'} + ${step})`;
	}
	return vars;
}

// Defensive: a free-text CSS value field could contain something that breaks
// out of the declaration (e.g. a stray `;` or `}`) once it lands in a custom
// property value.
function cssValue(v: string): string {
	return v.replace(/[;{}<>]/g, '').trim();
}

// A length destined for `calc(a + b)`, where a UNITLESS zero is invalid — CSS
// refuses to add a bare number to a length, which would silently invalidate
// the whole accumulated indent (and every level below it) the moment someone
// typed a plain "0". Blank means the same thing the user meant by "0".
function cssLength(v: string): string {
	const value = cssValue(v);
	if (value === '' || /^[+-]?0*(\.0*)?$/.test(value)) return '0px';
	return value;
}
