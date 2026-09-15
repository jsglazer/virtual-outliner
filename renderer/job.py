#!/usr/bin/env python3
"""Job helper for render-pdf.sh and quick-action.sh (Python 3.9+, stdlib only).

A job is a build folder holding job.json plus the files it names:

    {
      "version": 1,
      "source": "source.md",        # prepared Markdown, relative to the build folder
      "output": "/abs/path/Note.pdf",
      "fontsize": "12pt",           # 8 9 10 11 12 14 17 20 (extarticle sizes)
      "headnum": false,             # number body headings (pandoc -N)
      "toc": false,                 # table of contents from body headings
      "notes": "f",                 # "f" footnotes at page bottom, "e" endnotes at document end
      "preamble": "preamble.tex",   # relative to the build folder, or absolute
      "bibliography": "",           # CSL-JSON / .bib path; "" = no citation processing
      "cite": "MLA",                # MLA | APA | Chicago | Chicago-notes | path to a .csl
      "title": "Note",              # running header title
      "author": "…",                # running header author (\\DocAuthor)
      "resourcePath": "/abs/note/folder"
    }

Subcommands:
    env <job.json>                     shell assignments (JOB_*) for render-pdf.sh
    prepare <job.json> <work.md> <meta.tex>
    deliver <job.json> <pdf>           collision check + atomic move; prints status JSON
    latex-errors <doc.log>             the useful lines of a failed LaTeX log
    status-fail <stage> <message>      prints a failure status JSON line
    qa <note.md> <config.json|""> <fontsize> <build dir>
                                       Quick Action: refuse outline notes (exit 3),
                                       otherwise write source.md, preamble.tex, job.json
"""

import json
import os
import re
import shlex
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_SIZES = {"8", "9", "10", "11", "12", "14", "17", "20"}
# The PDF Creator stamp written by meta.tex. deliver() only overwrites an
# existing PDF that carries it, so an unrelated "Note.pdf" beside "Note.md"
# (a source document, a Zotero attachment) is never clobbered.
CREATOR = "Virtual Outliner"
STYLES = {
    "mla": ("mla.csl", "Works Cited"),
    "apa": ("apa.csl", "References"),
    "chicago": ("chicago.csl", "Bibliography"),
    "chicago-notes": ("chicago-notes.csl", "Bibliography"),
}
FENCE = re.compile(r"^\s*(```|~~~)")
FOOTNOTE = re.compile(r"\[\^[^\]\s]+\]|\^\[")


def status(obj):
    print(json.dumps(obj))


def fail(stage, message, code=1):
    status({"ok": False, "stage": stage, "message": message})
    sys.exit(code)


def load_job(path):
    with open(path, encoding="utf-8") as fh:
        job = json.load(fh)
    build = os.path.dirname(os.path.abspath(path))
    return job, build


def in_build(build, value):
    if not value:
        return ""
    value = os.path.expanduser(value)
    return value if os.path.isabs(value) else os.path.join(build, value)


def normalize_fontsize(value):
    size = str(value or "12").strip().lower()
    if size.endswith("pt"):
        size = size[:-2].strip()
    if size not in FONT_SIZES:
        raise ValueError("Font size %s is not available; choose one of %s pt."
                         % (value, ", ".join(sorted(FONT_SIZES, key=int))))
    return size + "pt"


def resolve_style(cite):
    """(csl path, reference-section title) for a style name or .csl path."""
    cite = (cite or "").strip()
    if not cite:
        cite = "mla"
    known = STYLES.get(cite.lower())
    if known:
        return os.path.join(HERE, "styles", known[0]), known[1]
    return os.path.expanduser(cite), "References"


def latex_escape(text):
    out = []
    for ch in text:
        if ch == "\\":
            out.append(r"\textbackslash{}")
        elif ch in "&%$#_{}":
            out.append("\\" + ch)
        elif ch == "~":
            out.append(r"\textasciitilde{}")
        elif ch == "^":
            out.append(r"\textasciicircum{}")
        else:
            out.append(ch)
    return "".join(out)


def outside_fences(text):
    """Yield (line, in_fence) pairs."""
    in_fence = False
    for line in text.split("\n"):
        if FENCE.match(line):
            in_fence = not in_fence
            yield line, True
            continue
        yield line, in_fence


ATX_HEADING = re.compile(r"^(#{1,6})[ \t]+\S")


def heading_shift(text):
    """How far to shift headings so the shallowest one used becomes a LaTeX
    \\section: a note whose headings start at ## would otherwise number its
    sections 0.1, 0.2, … and start its TOC one level in."""
    levels = [len(m.group(1)) for line, fenced in outside_fences(text)
              if not fenced for m in [ATX_HEADING.match(line)] if m]
    return 1 - min(levels) if levels else 0


def has_footnotes(text):
    return any(not fenced and FOOTNOTE.search(line) for line, fenced in outside_fences(text))


# --- subcommands -------------------------------------------------------------

def cmd_env(job_path):
    job, build = load_job(job_path)
    try:
        fontsize = normalize_fontsize(job.get("fontsize"))
    except ValueError as e:
        fail("job", str(e))
    preamble = in_build(build, job.get("preamble") or "preamble.tex")
    if not os.path.isfile(preamble):
        fail("job", "Preamble not found: %s" % preamble)
    bibliography = in_build(build, job.get("bibliography", ""))
    csl = ""
    if bibliography:
        if not os.path.isfile(bibliography):
            fail("job", "Bibliography not found: %s" % bibliography)
        csl, _ = resolve_style(job.get("cite"))
        if not os.path.isfile(csl):
            fail("job", "Citation style not found: %s" % csl)
    with open(in_build(build, job.get("source") or "source.md"), encoding="utf-8") as fh:
        shift = heading_shift(fh.read())
    values = {
        "JOB_FONTSIZE": fontsize,
        "JOB_HEADING_SHIFT": str(shift),
        "JOB_HEADNUM": "1" if job.get("headnum") else "0",
        "JOB_TOC": "1" if job.get("toc") else "0",
        "JOB_PREAMBLE": preamble,
        "JOB_BIBLIOGRAPHY": bibliography,
        "JOB_CSL": csl,
        "JOB_RESOURCE_PATH": job.get("resourcePath") or build,
    }
    for key, value in values.items():
        print("%s=%s" % (key, shlex.quote(value)))


def cmd_prepare(job_path, work_md, meta_tex):
    job, build = load_job(job_path)
    with open(in_build(build, job.get("source") or "source.md"), encoding="utf-8") as fh:
        text = fh.read().rstrip("\n")

    endnotes = job.get("notes") == "e"
    tail = []
    cite_makes_notes = bool(job.get("bibliography")) and "notes" in str(job.get("cite", "")).lower()
    if endnotes and (has_footnotes(text) or cite_makes_notes):
        tail.append("\\printendnotes")
    if job.get("bibliography"):
        _, heading = resolve_style(job.get("cite"))
        tail.append("# %s {.unnumbered}\n\n::: {#refs}\n:::" % heading)
    if tail:
        text += "\n\n" + "\n\n".join(tail)
    with open(work_md, "w", encoding="utf-8") as fh:
        fh.write(text + "\n")

    title = latex_escape(job.get("title") or "")
    author = latex_escape(job.get("author") or "")
    meta = [
        "% Written by job.py — per-export values, included BEFORE the preamble so the",
        "% preamble's \\providecommand defaults leave them alone.",
        # Object-stream level 1 keeps the /Info dictionary (and with it the
        # Creator stamp deliver() looks for) uncompressed and readable.
        "\\pdfvariable objcompresslevel=1",
        "\\def\\DocTitle{%s}" % title,
        "\\def\\DocAuthor{%s}" % author,
        "\\AtBeginDocument{\\hypersetup{pdfcreator={%s},pdftitle={%s},pdfauthor={%s}}}" % (CREATOR, title, author),
    ]
    if endnotes:
        meta += [
            "\\usepackage{enotez}",
            "\\setenotez{list-name=Notes,backref=true}",
            "\\let\\footnote\\endnote",
        ]
    with open(meta_tex, "w", encoding="utf-8") as fh:
        fh.write("\n".join(meta) + "\n")


PDF_STRING = re.compile(rb"/Creator\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)", re.S)
PDF_ESCAPES = {b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f"}


def decode_pdf_string(token):
    """Bytes of a PDF literal "(…)" or hex "<…>" string, decoded to text."""
    if token.startswith(b"<"):
        raw = bytes.fromhex(re.sub(rb"\s", b"", token[1:-1]).decode("ascii"))
    else:
        body, raw, i = token[1:-1], bytearray(), 0
        while i < len(body):
            c = body[i:i + 1]
            if c != b"\\":
                raw += c
                i += 1
                continue
            m = re.match(rb"[0-7]{1,3}", body[i + 1:i + 4])
            if m:
                raw.append(int(m.group(0), 8) & 0xFF)
                i += 1 + len(m.group(0))
            else:
                nxt = body[i + 1:i + 2]
                raw += PDF_ESCAPES.get(nxt, nxt)
                i += 2
        raw = bytes(raw)
    if raw.startswith(b"\xfe\xff"):
        return raw[2:].decode("utf-16-be", errors="replace")
    return raw.decode("latin-1")


def is_ours(pdf_path):
    """True when the PDF's /Info Creator is the Virtual Outliner stamp. meta.tex
    sets objcompresslevel=1 so the /Info dictionary is never compressed."""
    try:
        with open(pdf_path, "rb") as fh:
            data = fh.read()
    except OSError:
        return False
    return any(CREATOR in decode_pdf_string(m.group(1)) for m in PDF_STRING.finditer(data))


def cmd_deliver(job_path, pdf):
    job, build = load_job(job_path)
    src = in_build(build, pdf)
    out = os.path.expanduser(job.get("output") or "")
    if not out:
        fail("deliver", "The job has no output path.")
    if not os.path.isfile(src):
        fail("deliver", "LaTeX finished without producing a PDF.")
    if os.path.exists(out) and not is_ours(out):
        fail("collision", "%s already exists and was not made by Virtual Outliner, so it was left untouched. "
                          "Set pdf-output: in the note's frontmatter to write somewhere else." % out)
    try:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        tmp = out + ".vo-partial"
        shutil.copyfile(src, tmp)
        os.replace(tmp, out)
    except OSError as e:
        fail("deliver", "Could not write %s: %s" % (out, e))
    status({"ok": True, "output": out})


def cmd_latex_errors(log_path):
    try:
        with open(log_path, encoding="utf-8", errors="replace") as fh:
            lines = fh.read().split("\n")
    except OSError:
        print("LaTeX failed and left no log.")
        return
    picked = []
    for i, line in enumerate(lines):
        if line.startswith("!") or re.match(r"^\S+\.tex:\d+: ", line):
            picked.extend(lines[i:i + 4])
            picked.append("")
        if len(picked) > 30:
            break
    print("\n".join(picked).strip() or "\n".join(lines[-20:]).strip())


# --- Quick Action --------------------------------------------------------------

def parse_frontmatter(text):
    """({lowercased key: str}, body) — flat `key: value` lines only."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}, text
    for end in range(1, len(lines)):
        if lines[end].strip() in ("---", "..."):
            fields = {}
            for line in lines[1:end]:
                m = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*(.*)$", line)
                if m:
                    value = m.group(2).strip()
                    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                        value = value[1:-1]
                    fields[m.group(1).lower()] = value
            return fields, "\n".join(lines[end + 1:])
    return {}, text


def parse_bool(value, default):
    v = str(value).strip().lower()
    if v in ("y", "yes", "true", "1", "on"):
        return True
    if v in ("n", "no", "false", "0", "off"):
        return False
    return default


def parse_notes(value, default):
    v = str(value).strip().lower()
    if v.startswith("e"):
        return "e"
    if v.startswith("f"):
        return "f"
    return default


def resolve_output(pdf_output, note_path):
    note_dir = os.path.dirname(os.path.abspath(note_path))
    stem = os.path.splitext(os.path.basename(note_path))[0]
    value = (pdf_output or "").strip()
    if not value:
        return os.path.join(note_dir, stem + ".pdf")
    value = os.path.expanduser(value)
    if not os.path.isabs(value):
        value = os.path.join(note_dir, value)
    if value.lower().endswith(".pdf"):
        return os.path.normpath(value)
    return os.path.normpath(os.path.join(value, stem + ".pdf"))


def outline_reason(text, sigil):
    if re.search(r"^%%md-outline\s*$", text, re.M):
        return "it has a Virtual Outliner metadata block"
    entry = re.compile(r"^%s{1,6}[ \t]+\S" % re.escape(sigil))
    for line, fenced in outside_fences(text):
        if not fenced and entry.match(line):
            return "it has outline entries (lines starting with %s)" % sigil
    return None


def cmd_qa(note, config_path, fontsize, build):
    config = {}
    if config_path and os.path.isfile(config_path):
        with open(config_path, encoding="utf-8") as fh:
            config = json.load(fh)
    defaults = config.get("defaults", {})
    sigil = config.get("sigil") or "@"

    with open(note, encoding="utf-8") as fh:
        text = fh.read()
    front, body = parse_frontmatter(text)
    reason = outline_reason(body, sigil)
    if reason:
        print("%s can't be converted here because %s. Use Export to PDF in Obsidian instead."
              % (os.path.basename(note), reason))
        sys.exit(3)

    sys.path.insert(0, HERE)
    import wikilinks  # noqa: E402
    body, unresolved = wikilinks.rewrite(body, note)
    for u in unresolved:
        print("unresolved embed: %s" % u, file=sys.stderr)

    os.makedirs(build, exist_ok=True)
    with open(os.path.join(build, "source.md"), "w", encoding="utf-8") as fh:
        fh.write(body)

    preamble_src = config.get("preamblePath") or ""
    if not (preamble_src and os.path.isfile(preamble_src)):
        preamble_src = os.path.join(HERE, "default-preamble.tex")
    shutil.copyfile(preamble_src, os.path.join(build, "preamble.tex"))

    note_dir = os.path.dirname(os.path.abspath(note))
    bibliography = front.get("bibliography", "")
    if bibliography:
        bibliography = os.path.expanduser(bibliography)
        if not os.path.isabs(bibliography):
            bibliography = os.path.join(note_dir, bibliography)

    job = {
        "version": 1,
        "source": "source.md",
        "output": resolve_output(front.get("pdf-output"), note),
        "fontsize": fontsize or front.get("fontsize") or "12",
        "headnum": parse_bool(front.get("headnum", ""), bool(defaults.get("headnum", False))),
        "toc": parse_bool(front.get("toc", ""), bool(defaults.get("toc", False))),
        "notes": parse_notes(front.get("notes", ""), defaults.get("notes", "f")),
        "preamble": "preamble.tex",
        "bibliography": bibliography,
        "cite": front.get("cite") or defaults.get("cite") or "MLA",
        "title": front.get("title") or os.path.splitext(os.path.basename(note))[0],
        "author": front.get("author") or config.get("author", ""),
        "resourcePath": note_dir,
    }
    with open(os.path.join(build, "job.json"), "w", encoding="utf-8") as fh:
        json.dump(job, fh, indent=2)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, args = argv[1], argv[2:]
    if cmd == "env" and len(args) == 1:
        cmd_env(*args)
    elif cmd == "prepare" and len(args) == 3:
        cmd_prepare(*args)
    elif cmd == "deliver" and len(args) == 2:
        cmd_deliver(*args)
    elif cmd == "latex-errors" and len(args) == 1:
        cmd_latex_errors(*args)
    elif cmd == "status-fail" and len(args) == 2:
        status({"ok": False, "stage": args[0], "message": args[1]})
    elif cmd == "qa" and len(args) == 4:
        cmd_qa(*args)
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
