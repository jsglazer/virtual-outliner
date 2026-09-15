#!/usr/bin/env python3
"""Insert a blank line before a top-level list that starts immediately
after a paragraph line, with no blank line between them.

Pandoc's markdown reader (unlike CommonMark) never lets a list interrupt
a paragraph -- a list item with no blank line before it is read as a lazy
continuation of the preceding paragraph's text, numbers and all. Verified
experimentally: round-tripping a file through `pandoc -t markdown` turns

    **Assumptions**
    1. All five questions are relevant...
    2. Necessary data is available.

into a single run-on paragraph ("**Assumptions** 1. All five questions
are relevant... 2. Necessary data is available."), silently destroying
the list. This is the exact "number conversion failed" failure mode seen
in the Md-PDF/Md-Tex output. Obsidian (and CommonMark generally) renders
the same source as a proper list, so the source files are never wrong --
only pandoc's stricter blank-line requirement needs satisfying, and a
blank line before the list is invisible to every other renderer.

This only touches column-0 (top-level) list markers preceded by a
non-blank, non-list line, and leaves fenced code blocks alone. Indented
sub-list items are never touched -- they nest under an already-recognized
list item, so the interruption ambiguity doesn't apply to them.

Usage: lists.py <input.md> <output.md>
"""
import re
import sys

FENCE = re.compile(r'^\s*(```|~~~)')
TOP_LIST_ITEM = re.compile(r'^(\d+[.)]|[-*+])\s')
ANY_LIST_ITEM = re.compile(r'^\s*(\d+[.)]|[-*+])\s')


def process(text):
    lines = text.split('\n')
    out = []
    in_fence = False
    prev = None

    for line in lines:
        if FENCE.match(line):
            in_fence = not in_fence
            out.append(line)
            prev = line
            continue

        if (not in_fence and TOP_LIST_ITEM.match(line)
                and prev is not None and prev.strip() != ''
                and not ANY_LIST_ITEM.match(prev)):
            out.append('')

        out.append(line)
        prev = line

    return '\n'.join(out)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding='utf-8') as fh:
        text = fh.read()
    with open(dst, 'w', encoding='utf-8') as fh:
        fh.write(process(text))


if __name__ == '__main__':
    main()
