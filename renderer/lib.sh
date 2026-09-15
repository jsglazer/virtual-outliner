# lib.sh — media helpers for render-pdf.sh. Sourced, not run directly.
#
# Forked from ~/.claude/scripts/lib/md-convert-lib.sh (sanitize/optimize). This
# copy ships inside the Virtual Outliner plugin bundle and is written to
# ~/Library/Application Support/virtual-outliner/renderer/<version>/ on load,
# so every path here is relative to the renderer folder, never ~/.claude.

: ${IMG_MAX_WIDTH:=1600}
# `=` not `:=`: an explicitly empty PNGQUANT_QUALITY="" must disable pngquant.
: ${PNGQUANT_QUALITY=65-90}

log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" >>"${LOG:-/dev/null}" }

human_size() {
  local bytes=$1
  if (( bytes >= 1048576 )); then
    printf "%.1f MB" $(( bytes / 1048576.0 ))
  else
    printf "%d KB" $(( bytes / 1024 ))
  fi
}

# Real format of a file, as a bare extension ("png", "jpg", "webp", ...).
real_format() {
  local mime
  mime=$(file -b --mime-type -- "$1" 2>/dev/null)
  case $mime in
    image/png)             print png  ;;
    image/jpeg)            print jpg  ;;
    image/webp)            print webp ;;
    image/gif)             print gif  ;;
    image/tiff)            print tiff ;;
    image/svg+xml|text/*)  print svg  ;;
    application/pdf)       print pdf  ;;
    *)                     print ""   ;;
  esac
}

# Convert $1 to PNG at $2. Returns non-zero if no converter could handle it.
to_png() {
  local src=$1 dst=$2
  if [[ $(real_format "$src") == webp ]] && (( $+commands[dwebp] )); then
    dwebp -quiet "$src" -o "$dst" && return 0
  fi
  if (( $+commands[magick] )); then
    magick "$src" "$dst" && return 0
  fi
  sips -s format png "$src" --out "$dst" >/dev/null 2>&1
}

# Make every file under $1 actually be what its extension claims (CDNs lie).
# Files with an extension lualatex can use (png/jpg/pdf) are converted in place;
# files it cannot use at all (.webp, .gif, ...) get a new .png beside them and
# the rename is echoed as "old<TAB>new" for the caller to patch into doc.tex.
sanitize_media() {
  local dir=$1
  local f ext real png
  [[ -d $dir ]] || return 0

  for f in $dir/**/*(.N); do
    ext=${${f:e}:l}
    real=$(real_format "$f")

    [[ -z $real || $real == svg ]] && continue
    [[ $real == $ext ]] && continue
    [[ $real == jpg && $ext == jpeg ]] && continue

    case $ext in
      png|jpg|jpeg)
        if to_png "$f" "$f.tmp.png"; then
          mv -f "$f.tmp.png" "$f"
          log "  transcoded $real -> $ext: ${f:t}"
        else
          rm -f "$f.tmp.png"
          log "  WARNING: could not transcode ${f:t} ($real)"
        fi
        ;;
      *)
        png="${f:r}.png"
        if to_png "$f" "$png"; then
          rm -f "$f"
          print -r -- "${f:t}	${png:t}"
          log "  converted $real -> png (renamed): ${f:t} -> ${png:t}"
        else
          log "  WARNING: could not convert ${f:t} ($real)"
        fi
        ;;
    esac
  done
}

# Shrink every PNG under $1: cap width at IMG_MAX_WIDTH, then lossy-recompress
# with pngquant when it is installed. Never fatal, never makes a file bigger.
optimize_media() {
  local dir=$1
  local f width before after
  [[ -d $dir ]] || return 0

  for f in $dir/**/*.png(.N); do
    before=$(stat -f%z "$f")

    if (( IMG_MAX_WIDTH > 0 )); then
      width=$(sips -g pixelWidth "$f" 2>/dev/null | awk '/pixelWidth/{print $2}')
      if [[ -n $width ]] && (( width > IMG_MAX_WIDTH )); then
        sips --resampleWidth "$IMG_MAX_WIDTH" "$f" >/dev/null 2>&1
      fi
    fi

    if [[ -n $PNGQUANT_QUALITY ]] && (( $+commands[pngquant] )); then
      pngquant --quality="$PNGQUANT_QUALITY" --speed 1 --strip \
        --skip-if-larger --force --output "$f" -- "$f" 2>/dev/null
    fi

    after=$(stat -f%z "$f")
    (( after < before )) && log "  optimized ${f:t}: $(human_size $before) -> $(human_size $after)"
  done
}
