#!/usr/bin/env python3
"""Rewrite Obsidian embed and link syntax into plain Markdown.

Pandoc's Markdown reader has no idea what ``![[target]]`` means, so it passes it
through as literal text and the image silently never reaches the PDF. This turns
each embed into ``![](target)`` so the normal pandoc pipeline (including
--extract-media) can pick it up.

Two target flavours show up in these vaults:

* a percent-encoded remote URL (``https%3A%2F%2F...``), which just needs decoding
* a bare attachment name (``file-2026....jpg``), which has to be found on disk --
  Obsidian stores it by name, not by path

Plain page links (``[[Note]]`` / ``[[Note|Alias]]``) don't point at a file this
pipeline can typeset as a hyperlink, so instead of leaving the literal brackets
(which pandoc's writer escapes to ``\\[\\[Note\\]\\]`` in the PDF) they're
flattened to plain text using the alias when given, the bare target otherwise
(matching the Obsidian plugin's export).

Usage: wikilinks.py <input.md> <output.md>   (or import rewrite())
Prints one "unresolved: <target>" line per embed it could not locate.
"""

import os
import re
import sys
from urllib.parse import unquote

EMBED = re.compile(r"!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]")
WIKILINK = re.compile(r"(?<!!)\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".tif", ".bmp",
              ".svg", ".pdf", ".heic", ".avif"}


def find_attachment(name, doc_dir, doc_stem):
    """Locate an attachment by bare name, mirroring Obsidian's lookup order."""
    candidates = [
        os.path.join(doc_dir, name),
        os.path.join(doc_dir, "assets", doc_stem, name),
        os.path.join(doc_dir, "assets", name),
        os.path.join(doc_dir, "attachments", name),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return os.path.relpath(c, doc_dir)

    # Fall back to a bounded walk of the document's own directory tree.
    base = os.path.basename(name)
    for root, dirs, files in os.walk(doc_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        if base in files:
            return os.path.relpath(os.path.join(root, base), doc_dir)
    return None


def rewrite(text, src):
    """Return (rewritten_text, unresolved_targets) for a note at path `src`."""
    doc_dir = os.path.dirname(os.path.abspath(src)) or "."
    doc_stem = os.path.splitext(os.path.basename(src))[0]
    unresolved = []

    def replace(match):
        raw, suffix = match.group(1).strip(), (match.group(2) or "").strip()

        # A percent-encoded URL survives unquote into something with a scheme.
        decoded = unquote(raw)
        if decoded.startswith(("http://", "https://")):
            target = decoded
        elif raw.startswith(("http://", "https://")):
            target = raw
        else:
            # Non-image embeds (e.g. transcluded notes) are left untouched.
            if os.path.splitext(raw)[1].lower() not in IMAGE_EXTS:
                return match.group(0)
            found = find_attachment(raw, doc_dir, doc_stem)
            if found is None:
                unresolved.append(raw)
                return match.group(0)
            target = found

        # Obsidian's "|300" means width in pixels; anything else is alt text.
        attrs, alt = "", ""
        if suffix.isdigit():
            attrs = "{width=%spx}" % suffix
        elif suffix:
            alt = suffix

        link = "<%s>" % target if re.search(r"[ ()]", target) else target
        return "![%s](%s)%s" % (alt, link, attrs)

    def flatten_link(match):
        target, alias = match.group(1).strip(), (match.group(2) or "").strip()
        return alias or target

    text = EMBED.sub(replace, text)
    text = WIKILINK.sub(flatten_link, text)
    return text, unresolved


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as fh:
        text, unresolved = rewrite(fh.read(), src)

    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(text)

    for u in unresolved:
        print("unresolved: %s" % u)


if __name__ == "__main__":
    main()
