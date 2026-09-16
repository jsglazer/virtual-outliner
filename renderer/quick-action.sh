#!/bin/zsh
# quick-action.sh — Finder Quick Action entry point ("Convert Md to PDF").
#
# The installed .workflow is a two-line stub that execs this file from
# ~/Library/Application Support/virtual-outliner/renderer/current/, so the
# Quick Action's behaviour updates whenever the plugin does.
#
# For each selected .md file: find its vault (the folder holding .obsidian),
# load that vault's config written by the plugin (sigil, author, preamble,
# export defaults), refuse notes that carry a Virtual Outliner outline — only
# the plugin can strip one — and otherwise render next to the note (or to its
# pdf-output: frontmatter) with the same renderer the plugin uses.

emulate -L zsh
setopt no_nomatch
set -u

HERE=${0:A:h}
SUPPORT="$HOME/Library/Application Support/virtual-outliner"
export PATH=/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}
PY=python3
(( $+commands[python3] )) || PY=/usr/bin/python3

quoted() { print -r -- "\"${${1//\\/\\\\}//\"/\\\"}\"" }
notify() { osascript -e "display notification $(quoted "$2") with title $(quoted "$1")" >/dev/null 2>&1 }
alert() { osascript -e "display dialog $(quoted "$1") buttons {\"OK\"} default button \"OK\" with icon caution with title \"Convert Md to PDF\"" >/dev/null 2>&1 }

(( $# )) || exit 0

FONT_SIZE=$(osascript -e 'text returned of (display dialog "Font size (pt): 8, 9, 10, 11, 12, 14, 17 or 20" default answer "12" buttons {"Cancel","OK"} default button "OK" with title "Convert Md to PDF")' 2>/dev/null) || exit 0
FONT_SIZE=${FONT_SIZE%pt}
[[ -n $FONT_SIZE ]] || exit 0

vault_root() {
  local dir=${1:A:h}
  while [[ $dir != / ]]; do
    [[ -d "$dir/.obsidian" ]] && { print -r -- "$dir"; return 0 }
    dir=${dir:h}
  done
  return 1
}

WROTE=0
FAILS=0
for f in "$@"; do
  [[ -f $f && ${f:e:l} == md ]] || continue
  CONFIG=""
  if ROOT=$(vault_root "$f"); then
    CONFIG="$SUPPORT/vaults/${ROOT:t}/config.json"
    [[ -f $CONFIG ]] || CONFIG=""
  fi

  BUILD=$(mktemp -d "${TMPDIR:-/tmp}/vo-quick-action.XXXXXX") || { (( FAILS++ )); continue }
  OUT=$("$PY" "$HERE/job.py" qa "$f" "$CONFIG" "$FONT_SIZE" "$BUILD" 2>>"$BUILD/render.log")
  RC=$?
  if (( RC == 3 )); then
    alert "$OUT"
    rm -rf "$BUILD"
    continue
  elif (( RC != 0 )); then
    alert "Could not prepare ${f:t}: $(tail -3 "$BUILD/render.log")"
    (( FAILS++ ))
    continue
  fi

  # The PDF already exists: ask, defaulting to overwriting it (Save as
  # <name>-01.pdf is the alternative), matching the plugin's export dialog.
  TARGET=$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1]))["output"])' "$BUILD/job.json")
  if [[ -e $TARGET ]]; then
    NEXT=$("$PY" "$HERE/job.py" next-free "$TARGET")
    CHOICE=$(osascript -e "button returned of (display dialog $(quoted "${TARGET:t} already exists in ${TARGET:h}.") buttons {\"Skip\", $(quoted "Save as ${NEXT:t}"), \"Overwrite\"} default button 3 cancel button 1 with icon caution with title \"Convert Md to PDF\")" 2>/dev/null) || CHOICE=Skip
    case $CHOICE in
      Skip) rm -rf "$BUILD"; continue ;;
      Overwrite) "$PY" "$HERE/job.py" set-output "$BUILD/job.json" "$TARGET" 1 ;;
      *) "$PY" "$HERE/job.py" set-output "$BUILD/job.json" "$NEXT" 0 ;;
    esac
  fi

  STATUS=$(/bin/zsh "$HERE/render-pdf.sh" --job "$BUILD/job.json" | tail -1)
  if [[ $STATUS == '{"ok": true'* ]]; then
    (( WROTE++ ))
    rm -rf "$BUILD"
  else
    MESSAGE=$(print -r -- "$STATUS" | "$PY" -c 'import json,sys; print(json.load(sys.stdin).get("message",""))' 2>/dev/null)
    alert "${f:t} failed: ${MESSAGE:-$STATUS}

Build files kept in $BUILD"
    (( FAILS++ ))
  fi
done

if (( WROTE )); then
  notify "Convert Md to PDF" "Wrote $WROTE PDF$([[ $WROTE == 1 ]] || print s)"
fi
(( FAILS == 0 ))
