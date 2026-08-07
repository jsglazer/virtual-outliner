// Computed labels. Never stored in the file — derived at render time from the
// node's position in the tree plus the per-level Format settings, so there is
// no renumbering engine and nothing to keep in sync (Architecture, Forbidden
// architectural options).
//
// A composite label ("I.B.3") joins one segment per ancestor level, each
// segment styled by that level's own `style`, separated by that level's own
// `separator` (a level-1 segment never has a leading separator).

import type { LabelStyle, LevelFormat, OutlineNode } from './types';

const ROMAN_TABLE: Array<[number, string]> = [
	[1000, 'M'],
	[900, 'CM'],
	[500, 'D'],
	[400, 'CD'],
	[100, 'C'],
	[90, 'XC'],
	[50, 'L'],
	[40, 'XL'],
	[10, 'X'],
	[9, 'IX'],
	[5, 'V'],
	[4, 'IV'],
	[1, 'I'],
];

export function toRoman(n: number): string {
	if (n <= 0) return String(n);
	let value = n;
	let out = '';
	for (const [amount, numeral] of ROMAN_TABLE) {
		while (value >= amount) {
			out += numeral;
			value -= amount;
		}
	}
	return out;
}

// Excel-style base-26 letters: 1=A, 26=Z, 27=AA, 28=AB, …
export function toAlpha(n: number): string {
	if (n <= 0) return String(n);
	let value = n;
	let out = '';
	while (value > 0) {
		const rem = (value - 1) % 26;
		out = String.fromCharCode(65 + rem) + out;
		value = Math.floor((value - 1) / 26);
	}
	return out;
}

// The ancestor chain's own numeric path up to and including this level, e.g.
// depth-3 node with indices [1,2,1] -> "1.2.1". Used by the '1.1' style.
function dottedPath(indices: readonly number[]): string {
	return indices.join('.');
}

function segmentFor(style: LabelStyle, ownIndex: number, pathIndices: readonly number[]): string {
	switch (style) {
		case '1':
			return String(ownIndex);
		case '1.0':
			return `${ownIndex}.0`;
		case '1.1':
			return dottedPath(pathIndices);
		case 'I':
			return toRoman(ownIndex);
		case 'i':
			return toRoman(ownIndex).toLowerCase();
		case 'A':
			return toAlpha(ownIndex);
		case 'a':
			return toAlpha(ownIndex).toLowerCase();
		case 'bullet':
			return '•';
		case 'none':
			return '';
	}
}

// Ancestor chain from root to `node`, inclusive, root first.
export function ancestorChain(node: OutlineNode): OutlineNode[] {
	const chain: OutlineNode[] = [];
	let cur: OutlineNode | null = node;
	while (cur) {
		chain.unshift(cur);
		cur = cur.parent;
	}
	return chain;
}

// `levelFormats[level]` (1-based) is this level's Format; levels beyond the
// array's configured range fall back to `levelFormats[levelFormats.length]`
// (the deepest configured level) so a document nested past what the user
// bothered to configure still renders something sane.
export function computeLabel(levelFormats: readonly LevelFormat[], node: OutlineNode): string {
	const chain = ancestorChain(node);
	const pathIndices = chain.map((n) => n.siblingIndex);
	const segments: string[] = [];
	for (let i = 0; i < chain.length; i++) {
		const ancestor = chain[i];
		if (!ancestor) continue;
		const format = levelFormats[ancestor.level - 1] ?? levelFormats[levelFormats.length - 1];
		if (!format) continue;
		const segment = segmentFor(format.style, ancestor.siblingIndex, pathIndices.slice(0, i + 1));
		if (segment === '') continue;
		const prefix = i === 0 || segments.length === 0 ? '' : format.separator;
		segments.push(prefix + segment);
	}
	return segments.join('');
}
