#!/usr/bin/env python3
"""Colour-coded highlights: `==🟢text==` prints with a green highlight.

A highlight whose text starts with a coloured circle emoji takes that colour
in the PDF and the emoji itself is dropped (the LaTeX font has no glyph for
it, so it would vanish anyway). A highlight with no emoji is left to pandoc's
own `==mark==` handling, which job.py tints to Obsidian's default yellow.

    ==🟢**Theory**==   ->  `\\vohl{vohlgreen}{`{=latex}**Theory**`}`{=latex}

The emoji's text is still Markdown, so pandoc converts it as usual between
the two raw LaTeX halves. Fenced code blocks and inline code spans (which
include every raw `...`{=latex} span the plugin wrote) are left untouched.
\\vohl and the vohl* colours are defined in job.py (HIGHLIGHT_TEX).

Usage: highlights.py <input.md> <output.md>
"""
import re
import sys

FENCE = re.compile(r"^\s*(```|~~~)")
COLOURS = {
    "\U0001F7E2": "vohlgreen",   # 🟢
    "\U0001F7E0": "vohlorange",  # 🟠
    "\U0001F7E3": "vohlpurple",  # 🟣
    "\U0001F534": "vohlred",     # 🔴
    "\U0001F535": "vohlblue",    # 🔵
    "\U0001F7E1": "vohlyellow",  # 🟡
    "\U0001F7E4": "vohlbrown",   # 🟤
}
EMOJI = "|".join(COLOURS)
# The opening == must not be part of a longer run of '=' (e.g. a ==== rule).
COLOURED = re.compile(r"(?<!=)==\s*(" + EMOJI + r")️?\s*(\S(?:.*?\S)?)\s*==(?!=)")
CODE_SPAN = re.compile(r"(`+)(?:.*?[^`])?\1(?!`)|(`+)")


def colour_segment(text):
    return COLOURED.sub(lambda m: "`\\vohl{%s}{`{=latex}%s`}`{=latex}" % (COLOURS[m.group(1)], m.group(2)), text)


def process_line(line):
    out, pos = [], 0
    for m in CODE_SPAN.finditer(line):
        if m.group(2) is not None:
            continue  # an unmatched backtick run is literal text
        out.append(colour_segment(line[pos:m.start()]))
        out.append(m.group(0))
        pos = m.end()
    out.append(colour_segment(line[pos:]))
    return "".join(out)


def process(text):
    out, fence = [], None
    for line in text.split("\n"):
        f = FENCE.match(line)
        if fence is not None:
            if f and f.group(1) == fence:
                fence = None
            out.append(line)
            continue
        if f:
            fence = f.group(1)
            out.append(line)
            continue
        out.append(process_line(line))
    return "\n".join(out)


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: highlights.py <input.md> <output.md>")
    with open(sys.argv[1], encoding="utf-8") as fh:
        text = fh.read()
    with open(sys.argv[2], "w", encoding="utf-8") as fh:
        fh.write(process(text))


if __name__ == "__main__":
    main()
