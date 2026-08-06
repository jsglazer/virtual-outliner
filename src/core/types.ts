// Core data model. This module (like everything under src/core/) is pure:
// no imports from 'obsidian', no DOM, no I/O.

// One outline entry plus every body line beneath it, up to the next outline
// entry at the same or shallower level (its "subtree"). Node-to-body
// association is by document order (containment) — no anchors, so nothing
// can drift or orphan.
export interface OutlineNode {
	// 0-based line index of the entry line itself.
	entryLine: number;
	level: number; // 1..MAX_LEVEL
	// Entry text with the sigils, the required separating space, and any
	// trailing `^o-xxxxxxxx` id suffix all stripped.
	text: string;
	// null when the line carries no id yet, OR when it duplicates an id
	// already claimed earlier in document order (Decision #4) — such a node
	// is treated as id-less until the user's next metadata/collapse action
	// re-mints it; the raw line text is left untouched by the parser.
	id: string | null;
	// This node's 1-based position among siblings sharing the same parent,
	// used to derive numbered/lettered labels.
	siblingIndex: number;
	parent: OutlineNode | null;
	children: OutlineNode[];
	// [start, end) 0-based line range of this node's own body: the lines
	// directly under its entry, up to (but not including) the next entry at
	// ANY level.
	ownBodyStart: number;
	ownBodyEnd: number;
	// [start, end) 0-based line range of the FULL subtree: the entry line
	// itself plus every descendant entry and body line, up to (but not
	// including) the next entry at a level <= this node's own. This is the
	// unit of work for every structural operation (Decision #6).
	subtreeStart: number;
	subtreeEnd: number;
}

export interface ParsedOutline {
	// Top-level nodes (level 1 entries not nested under any other entry).
	roots: OutlineNode[];
	// Every node in document order, flat, for O(1) line -> node lookup.
	flat: OutlineNode[];
	// Total number of lines in the parsed text (body.split('\n').length).
	lineCount: number;
}

export type ViewState = 'outline' | 'body' | 'both';

export type LabelStyle = '1' | '1.1' | 'I' | 'A' | 'a' | 'i' | 'bullet' | 'none';

export interface LevelFormat {
	style: LabelStyle;
	// Inserted before this level's segment when composing a multi-segment
	// label (e.g. '.' for "I.B.3"). Ignored for a level-1 segment, which
	// never has anything before it.
	separator: string;
	fontSize: string; // CSS length, '' = inherit
	fontWeight: string; // CSS font-weight, '' = inherit
	color: string; // '#rrggbb' or '' = inherit
	italic: boolean;
	indentStep: string; // CSS length applied per level to body indentation
	spacing: string; // CSS length, extra vertical margin above the entry
}

export interface EditSplice {
	from: number;
	to: number;
	insert: string;
}
