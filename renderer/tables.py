#!/usr/bin/env python3
"""Rewrite pipe-table separator rows so column widths are proportional to
real cell content, instead of whatever pandoc defaults to.

Pandoc's pipe-table reader takes each column's *relative* width straight
from the dash-run length in the header/body separator row -- it never looks
at actual cell content to size columns. Verified experimentally: a table
whose separator is a minimal "|---|---|---|" renders every column at an
equal 1/3 width in LaTeX, no matter how long the cells are. A table whose
separator dashes are already padded to match each column's widest cell (as
Obsidian's own table formatter does) renders with sane proportional widths.
That's the whole difference between a table that looks right after
conversion and one that doesn't -- this script does that padding
mechanically for every pipe table in a file, without touching cell content,
so it doesn't matter whether the source table was ever run through a
formatter.

Usage: tables.py <input.md> <output.md>
"""
import re
import sys

SEP_CELL = re.compile(r'^\s*(:?)-+(:?)\s*$')
FENCE = re.compile(r'^\s*(```|~~~)')


def split_row(line):
    line = line.rstrip('\n')
    stripped = line.strip()
    if stripped.startswith('|'):
        stripped = stripped[1:]
    if stripped.endswith('|') and not stripped.endswith('\\|'):
        stripped = stripped[:-1]
    return re.split(r'(?<!\\)\|', stripped)


def is_separator_row(cells):
    return len(cells) > 0 and all(SEP_CELL.match(c) for c in cells)


def rebuild_separator(cells, widths):
    out = []
    for cell, width in zip(cells, widths):
        m = SEP_CELL.match(cell)
        left, right = (m.group(1), m.group(2)) if m else ('', '')
        dash_len = max(3, width) - len(left) - len(right)
        dash_len = max(1, dash_len)
        out.append(left + '-' * dash_len + right)
    return '| ' + ' | '.join(out) + ' |'


def process(text):
    lines = text.split('\n')
    n = len(lines)
    out = []
    i = 0
    in_fence = False
    while i < n:
        line = lines[i]

        if FENCE.match(line):
            in_fence = not in_fence
            out.append(line)
            i += 1
            continue

        if (not in_fence and '|' in line and i + 1 < n and '|' in lines[i + 1]):
            header_cells = split_row(line)
            sep_cells = split_row(lines[i + 1])
            if len(sep_cells) == len(header_cells) and is_separator_row(sep_cells):
                j = i + 2
                body = []
                while j < n and lines[j].strip() != '' and '|' in lines[j]:
                    body.append(split_row(lines[j]))
                    j += 1

                ncols = len(header_cells)
                widths = [len(c.strip()) for c in header_cells]
                for row in body:
                    for c in range(min(ncols, len(row))):
                        widths[c] = max(widths[c], len(row[c].strip()))

                out.append(line)
                out.append(rebuild_separator(sep_cells, widths))
                out.extend(lines[i + 2:j])
                i = j
                continue

        out.append(line)
        i += 1

    return '\n'.join(out)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding='utf-8') as fh:
        text = fh.read()
    with open(dst, 'w', encoding='utf-8') as fh:
        fh.write(process(text))


if __name__ == '__main__':
    main()
