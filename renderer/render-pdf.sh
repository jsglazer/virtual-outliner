#!/bin/zsh
# render-pdf.sh — typeset one prepared Markdown source into a PDF.
#
#   zsh render-pdf.sh --job /path/to/build/job.json
#
# The build folder is the folder holding job.json. Whoever calls this (the
# Obsidian plugin, or quick-action.sh) has already written the source Markdown
# and the preamble there; job.py documents every job.json field.
#
# Pipeline: job.py prepare (endnote/reference tail + meta.tex) -> table widths
# -> list breaks -> pandoc to .tex (extracting media) -> sanitize/optimize media
# -> table row lines -> latexmk -> job.py deliver (collision check, atomic move).
#
# The LAST line on stdout is always one JSON status object, which is what the
# plugin parses: {"ok":true,"output":…} or {"ok":false,"stage":…,"message":…}.
# Everything else goes to render.log in the build folder.
#
# Run with /bin/zsh explicitly: sync services drop the executable bit, so
# nothing here relies on it.

emulate -L zsh
setopt no_nomatch pipe_fail
set -u

HERE=${0:A:h}
export PATH=/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}

JOB=""
while (( $# )); do
  case $1 in
    --job) JOB=${2:-}; shift 2 ;;
    *) shift ;;
  esac
done

PY=python3
(( $+commands[python3] )) || PY=/usr/bin/python3

fail_json() {
  # stage, message
  "$PY" "$HERE/job.py" status-fail "$1" "$2" 2>/dev/null \
    || print -r -- '{"ok":false,"stage":"'"$1"'","message":"renderer failure"}'
  exit 1
}

[[ -n $JOB && -f $JOB ]] || fail_json args "No job file given (expected --job <job.json>)."
JOB=${JOB:A}
BUILD=${JOB:h}
cd "$BUILD" || fail_json args "Cannot enter build folder $BUILD"

LOG="$BUILD/render.log"
source "$HERE/lib.sh"
# Leftovers from an earlier run in the same folder (e.g. an .aux written with
# enotez loaded) break the next compile when the options change.
rm -rf media doc.aux doc.toc doc.out doc.log doc.pdf doc.fls doc.fdb_latexmk doc.tex work*.md meta.tex pandoc.out latexmk.out
log "=== render $JOB"

for tool in pandoc latexmk lualatex; do
  (( $+commands[$tool] )) || fail_json tools "$tool was not found. Install pandoc and MacTeX (pandoc, latexmk, lualatex)."
done

# Shell assignments for the job's fields (values shell-quoted by job.py).
ENV_OUT=$("$PY" "$HERE/job.py" env "$JOB" 2>>"$LOG") || fail_json job "$(tail -3 "$LOG")"
eval "$ENV_OUT"

"$PY" "$HERE/job.py" prepare "$JOB" work.md meta.tex 2>>"$LOG" || fail_json job "$(tail -3 "$LOG")"
"$PY" "$HERE/tables.py" work.md work-tables.md 2>>"$LOG" || cp work.md work-tables.md
"$PY" "$HERE/lists.py" work-tables.md work-final.md 2>>"$LOG" || cp work-tables.md work-final.md

args=(
  -f markdown+hard_line_breaks+mark
  -t latex -s -o doc.tex
  --extract-media=media
  --resource-path="$BUILD:$JOB_RESOURCE_PATH"
  -H meta.tex -H "$JOB_PREAMBLE"
  -V documentclass=extarticle -V fontsize="$JOB_FONTSIZE" -V papersize=letter
)
(( JOB_HEADING_SHIFT )) && args+=(--shift-heading-level-by="$JOB_HEADING_SHIFT")
(( JOB_HEADNUM )) && args+=(-N)
(( JOB_TOC )) && args+=(--toc)
if [[ -n $JOB_BIBLIOGRAPHY ]]; then
  args+=(--citeproc --bibliography="$JOB_BIBLIOGRAPHY")
  [[ -n $JOB_CSL ]] && args+=(--csl="$JOB_CSL")
fi

log "  pandoc ${args[*]}"
if ! pandoc work-final.md "${args[@]}" >pandoc.out 2>&1; then
  cat pandoc.out >>"$LOG"
  fail_json pandoc "$(tail -15 pandoc.out)"
fi
[[ -s pandoc.out ]] && cat pandoc.out >>"$LOG"

renames=$(sanitize_media media)
if [[ -n $renames ]]; then
  while IFS=$'\t' read -r old new; do
    [[ -n $old ]] || continue
    LC_ALL=C sed -i '' "s|media/${old}|media/${new}|g" doc.tex
  done <<< "$renames"
fi
optimize_media media
"$PY" "$HERE/rowlines.py" doc.tex >>"$LOG" 2>&1

log "  latexmk"
if ! latexmk -lualatex -interaction=nonstopmode -halt-on-error -file-line-error doc.tex >latexmk.out 2>&1; then
  fail_json latex "$("$PY" "$HERE/job.py" latex-errors doc.log 2>/dev/null)"
fi

"$PY" "$HERE/job.py" deliver "$JOB" doc.pdf 2>>"$LOG"
