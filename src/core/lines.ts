// Line <-> character-offset helpers shared by the parser, structural ops, and
// render planner. Kept separate so none of them re-derive this by hand.

// Character offset of the start of each line. `offsets[i]` is where line `i`
// begins; `offsets[lines.length]` is `text.length` (one past the last line),
// which makes "end of subtree" ranges expressible without a special case.
export function lineStartOffsets(lines: readonly string[]): number[] {
	const offsets: number[] = [0];
	let pos = 0;
	for (let i = 0; i < lines.length; i++) {
		pos += (lines[i] ?? '').length;
		if (i < lines.length - 1) pos += 1; // '\n' before the next line
		offsets.push(pos);
	}
	return offsets;
}

// Character range [from, to) covering lines [startLine, endLine) INCLUDING
// each line's own trailing newline, except that the very last line of the
// text never has a trailing newline to include (offsets[lines.length] is
// text.length exactly, not text.length + 1).
export function lineRangeToOffsets(
	offsets: readonly number[],
	startLine: number,
	endLine: number,
): { from: number; to: number } {
	const from = offsets[startLine] ?? 0;
	const to = offsets[endLine] ?? offsets[offsets.length - 1] ?? 0;
	return { from, to };
}
