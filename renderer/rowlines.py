#!/usr/bin/env python3
"""Insert a light grey \\hline after every body row of every pandoc-generated
longtable, so tables get a rule between rows instead of just top/mid/bottom.

Pandoc's longtable output always has the shape:
    \\begin{longtable}[]{...}
    \\toprule\\noalign{}
    <header row> \\\\
    \\midrule\\noalign{}
    \\endhead
    \\bottomrule\\noalign{}
    \\endlastfoot
    <body row> \\\\
    <body row> \\\\
    ...
    \\end{longtable}
\\bottomrule is a "last page footer" (\\endlastfoot) — longtable defers it and
actually renders it right after the final body row, so the last row is left
alone here to avoid a double line right on top of that rule.

A row may wrap across several physical lines (pandoc wraps at ~80 cols); only
the line ending the row actually ends in "\\\\", so matching on that is safe.

Requires \\usepackage{colortbl} and \\definecolor{rowline}{...} in the preamble
(see default-preamble.tex) — this script only touches the table body.

Usage: rowlines.py FILE [FILE ...]
Edits in place; prints a count of insertions per file.
"""
import re
import sys

ROW_END = re.compile(r'\\\\\s*$')
RULE_LINE = '\\arrayrulecolor{rowline}\\hline'


def fix(path):
    with open(path, encoding='utf-8') as fh:
        lines = fh.read().split('\n')

    # Pass 1: find every body-row-ending line index, per longtable block.
    row_end_indices = []
    in_body = False
    rows_this_table = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('\\begin{longtable}'):
            in_body = False
        elif stripped == '\\endlastfoot':
            in_body = True
            rows_this_table = 0
        elif stripped.startswith('\\end{longtable}'):
            if rows_this_table and row_end_indices[-1][1] == 'pending':
                # last row of this table: don't mark it, drop the pending tag
                row_end_indices[-1][1] = 'skip'
            in_body = False
        elif in_body and ROW_END.search(line):
            row_end_indices.append([i, 'pending'])
            rows_this_table += 1

    # Anything still 'pending' after the scan is a genuine row to rule under;
    # only the row immediately preceding \end{longtable} was downgraded above.
    insert_after = {idx for idx, tag in row_end_indices if tag == 'pending'}

    out = []
    inserted = 0
    for i, line in enumerate(lines):
        out.append(line)
        if i in insert_after:
            out.append(RULE_LINE)
            inserted += 1

    if inserted:
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(out))
    print(f"{inserted} row line(s) inserted: {path}")


if __name__ == '__main__':
    for p in sys.argv[1:]:
        fix(p)
