// Settings model + settings -> CSS generation. Pure module: no 'obsidian',
// no DOM. Mirrors the settings->CSS pattern in md-annotation/annotation-manager
// (Architecture note: "the same idea as 'Format'"), generated into one
// regenerated <style> element by the shell rather than duplicated per
// decoration (Decision #12's per-level typography approach).

import { DEFAULT_SIGIL_CHAR, MAX_LEVEL } from './sigil';
import type { LabelStyle, LevelFormat, ViewState } from './types';

export interface MetaFieldDef {
	name: string;
	type: 'text' | 'select';
	options: string[]; // used only when type === 'select'
}

export interface OutlineSettings {
	// The configurable depth sigil (Decision #1 — "keep as configurable").
	// Exactly one character; anything else is coerced back to the default by
	// normalizeSettings.
	sigil: string;
	defaultViewState: ViewState;
	indentBody: boolean;
	levels: LevelFormat[]; // always exactly MAX_LEVEL entries, index 0 = level 1
	metaFields: MetaFieldDef[];
}

const DEFAULT_LABEL_STYLES: LabelStyle[] = ['1', '1', '1', '1', '1', '1'];

export function defaultLevelFormat(level: number): LevelFormat {
	return {
		style: DEFAULT_LABEL_STYLES[level - 1] ?? '1',
		separator: level === 1 ? '' : '.',
		fontSize: '',
		fontWeight: level === 1 ? '600' : '',
		color: '',
		italic: false,
		indentStep: '1.5em',
		spacing: level === 1 ? '0.75em' : '0.25em',
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
		levels,
		metaFields: defaultMetaFields(),
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

const LABEL_STYLES: ReadonlySet<string> = new Set(['1', '1.1', 'I', 'A', 'a', 'i', 'bullet', 'none']);

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
		color: readString(v.color, fallback.color),
		italic: readBool(v.italic, fallback.italic),
		indentStep: readString(v.indentStep, fallback.indentStep),
		spacing: readString(v.spacing, fallback.spacing),
	};
}

function normalizeMetaField(v: unknown): MetaFieldDef | null {
	if (!isRecord(v)) return null;
	if (typeof v.name !== 'string' || v.name.trim() === '') return null;
	const type = v.type === 'select' ? 'select' : 'text';
	const options = Array.isArray(v.options) ? v.options.filter((o): o is string => typeof o === 'string') : [];
	return { name: v.name, type, options };
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
		levels,
		metaFields: metaFields.length > 0 ? metaFields : fallback.metaFields,
	};
}

// Per-level typography, driven entirely by settings, as CSS custom property
// VALUES rather than a generated <style> element — Obsidian plugins apply
// dynamic CSS by setting custom properties on a root element (via
// `setCssProps`) that styles.css's static rules already reference
// (`var(--vo-l1-color)`, …), never by injecting `<style>` elements.
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
		vars[`--vo-l${n}-color`] = level.color !== '' ? cssValue(level.color) : 'inherit';
		vars[`--vo-l${n}-style`] = level.italic ? 'italic' : 'normal';
		vars[`--vo-l${n}-spacing`] = level.spacing !== '' ? cssValue(level.spacing) : '0px';
		cumulativeIndent =
			cumulativeIndent === ''
				? cssValue(level.indentStep)
				: `calc(${cumulativeIndent} + ${cssValue(level.indentStep)})`;
		vars[`--vo-l${n}-indent`] = cumulativeIndent !== '' ? cumulativeIndent : '0px';
	}
	return vars;
}

// Defensive: a free-text CSS value field could contain something that breaks
// out of the declaration (e.g. a stray `;` or `}`) once it lands in a custom
// property value.
function cssValue(v: string): string {
	return v.replace(/[;{}<>]/g, '').trim();
}
