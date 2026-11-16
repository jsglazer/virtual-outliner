// Per-note opt-in (Update016): Virtual Outliner acts only on notes whose
// frontmatter says `voutline: true`. Every other note is left as plain
// Markdown — no outline rendering, keymap, sidebar, or tag hiding.

import { frontmatterValue } from './exportOptions';

export const OPT_IN_KEY = 'voutline';

// YAML `true` arrives as a boolean; a quoted "true"/"yes" (or a Properties
// checkbox written by hand) is accepted too. Anything else, or no key, is off.
export function isOutlineEnabled(fm: Record<string, unknown> | null | undefined): boolean {
	const v = frontmatterValue(fm, OPT_IN_KEY);
	if (typeof v === 'boolean') return v;
	if (typeof v === 'string') return ['true', 'yes', 'on'].includes(v.trim().toLowerCase());
	return false;
}
