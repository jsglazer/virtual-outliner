// Shared per-file state shape, kept in its own module so the editor/UI
// layers can type against it without importing main.ts.

import type { ParsedOutline, ViewState } from './core/types';

export interface OutlineFileState {
	// Body text (everything above the metadata block) the tree was parsed
	// from. Body offsets equal document offsets (the block sits at
	// end-of-file), so entry lines/splices are usable directly in the editor.
	body: string;
	parsed: ParsedOutline;
	viewState: ViewState;
	// Node ids currently collapsed, per file (Decision #14 — view/collapse
	// state lives in plugin data, never written into the document).
	collapsedIds: Set<string>;
}
