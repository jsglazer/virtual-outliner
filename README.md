# Virtual Outliner

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/virtual-outliner?logo=github)](https://github.com/jsglazer/virtual-outliner/releases) [![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jsglazer/virtual-outliner/blob/main/LICENSE) [![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai) [![Gemini Flash Antigravity](https://img.shields.io/badge/Gemini%20Flash-Antigravity-4f86f7?logo=google-gemini&logoColor=white)](https://github.com/google-gemini) [![CI](https://github.com/jsglazer/virtual-outliner/actions/workflows/ci.yml/badge.svg)](https://github.com/jsglazer/virtual-outliner/actions/workflows/ci.yml) [![CodeQL](https://github.com/jsglazer/virtual-outliner/actions/workflows/codeql.yml/badge.svg)](https://github.com/jsglazer/virtual-outliner/actions/workflows/codeql.yml) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/jsglazer/virtual-outliner/badge)](https://securityscorecards.dev/viewer/?uri=github.com/jsglazer/virtual-outliner)

Outline-first authoring for Obsidian: lay down a full multi-level outline, then write headings and prose directly beneath each entry — without the outline and the body ever getting in each other's way.

> [!IMPORTANT]
> **Sync all file types.** Virtual Outliner assumes your vault sync carries **every file type plus plugin settings**, not just Markdown. In Obsidian Sync, turn on syncing for *all other file types* and for *installed community plugins* (which includes each plugin's settings). Plugin settings — and anything the plugin stores in them — are expected to be identical on every device, and files the plugin reads from the vault (not only `.md`) are expected to be present everywhere.

## What it does

- **Outline as a layer, not a filter.** One Markdown file, two views. An outline entry is just a line starting with a repeated sigil (`@`, `@@`, `@@@`, …, configurable); everything else — your own prose, headings, lists, tables, code — is the body. A **node** is one entry plus every body line beneath it, up to the next entry.
- **Computed labels, never written to disk.** `1`, `1.0`, `1.1`, `I`, `A`, bullets, or none — per level, composited into things like `I.B.3` — are rendered at edit/view time in both Live Preview and Reading View. The raw sigils are never visible. Nothing is ever renumbered on disk; there is no auto-renumber engine to fight your undo history or corrupt your file.
  - The `1.0` style is Word-style multilevel numbering: the trailing `.0` is a placeholder for the next level down, so a top-level entry reads `3.0` on its own and its first child reads `3.1` — not `3.0.1`.
- **Three view states** — outline only, body only, or both — by command, and remembered per note. **Text a view hides can't be deleted from it.** Backspace at the gap where a hidden run sits is refused rather than silently destroying prose you can't see; switch to a view that shows it, and it edits normally. Hidden runs that are only blank lines stay deletable, since there's nothing to lose.
- **A real outliner keymap**, scoped to outline lines only:
  - `Enter` at the end of an entry inserts a new sibling **after that node's entire subtree** — it never splits an existing node's body or children out from under it. Prefer the new entry **directly on the next line** instead? Set **Enter at the end of an entry** to *On the next line* in Settings (or run **Toggle new entry on next line vs after section**); the current entry's body and sub-entries then belong to the new entry. Either way Enter never adds a blank line: blank lines that close a section, or a file's trailing newline, stay where they are.
  - `Enter` in the **middle** of an entry splits it: the text after the cursor becomes a new entry at the same level directly below (the entry's hidden id stays with the first half). At the very start of the entry's text, it opens a blank entry above instead.
  - `Cmd-Enter` / `Ctrl-Enter` on an entry opens a plain **prose** line directly beneath it — that entry's own body, above its children — instead of another outline level. The cursor's column doesn't matter and the entry line is never split.
  - `Shift-Enter` at the end of an entry does the same, so a soft break there opens a body line instead of splitting the entry's hidden id onto a line of its own. Mid-text it falls through to Obsidian's normal soft break.
  - `Tab` / `Shift-Tab` demote/promote a node, carrying its whole subtree (body and descendants) with it — nothing is ever orphaned.
  - `Alt-↑` / `Alt-↓` move a whole block — the entry, its body, and every sub-entry — past its previous/next sibling. At the edge of its parent the block keeps going into the neighbouring section at the same level: a first child moving up becomes the last child of the previous section, a last child moving down becomes the first child of the next one. So `2.3` and all its `2.3.x` travel up or down the document as a group. The cursor stays on the same character.
  - Every operation is also available as a hotkey-less command, so it works on iPad without a hardware keyboard.
- **Collapse per entry** — fold an entry's child entries and body text together while keeping the entry itself visible, just like Obsidian folds a heading's section. Hover to the left of an entry's number for its fold chevron (always shown on touch devices and while folded), or run **Toggle collapse of current outline entry** from the entry or anywhere in its body. A folded entry shows a `…` marker; click it or the chevron to expand. Entries with nothing beneath them get no chevron. Folds are the same ones the sidebar toggles, are remembered per note, and are honored in Live Preview and Reading View alike, down to the individual source line. Folding the section the cursor is in moves the cursor up onto the entry.
- **Searchable, collapsible outline sidebar** — click any entry to jump straight to its prose. The ribbon icon and command toggle it: it closes when it's on screen, and opens (or comes forward) when it isn't.
- **Note Toolbar buttons that show their state.** If you use the [Note Toolbar](https://github.com/chrisgurney/obsidian-note-toolbar) plugin, Settings → **Note Toolbar buttons** lets you pick the toolbar button that runs the sidebar, indent-body, or Enter-on-next-line toggle and give it an **On** and an **Off** background colour, separately for light and dark themes — the same controls as md-annotation's. Off is unticked by default, so only "on" stands out.
- **One format, every level.** Number style, separator, italic, colour, font size, font weight, font family, indent step, space above, and label gap are set once in Settings and applied uniformly across all levels — no more editing the same ten fields six times. A level's font size sizes the whole line, so setting it below 1em tightens the leading to match rather than leaving full-size gaps around shrunken text. Indentation is cumulative: level 1 always stays flush left, and the shared indent step is how much further right each deeper level sits than the one above it. With **Indent body under its outline level** on (in Settings, or via the **Indent body with outline** command), body prose lines up exactly under its entry's text — past the number label, however wide that label renders (`3.1` or `3.1.10`, in any font) — in both Live Preview and Reading View, so body under a top-level entry is indented too. The position is measured from the rendered entry, and until an entry has been measured its body falls back to one indent step deeper than the entry. It is applied as a margin (one that overrides Obsidian's own reset of editor-line margins), so list items, quotes, and callouts indent along with plain paragraphs.
- **Per-node metadata** (Status, Note, or any fields you configure) stored out-of-band in a single `%%md-outline` block at the end of the file, exposed read-only to Dataview/Datacore.
- **Generate filtered copy** — a command that produces a new file containing only what the current view state shows, with labels materialized into literal text.
- Full desktop **and** mobile/iPad support.

## Syntax

```markdown
@ Background
This paragraph is body text — it belongs to "Background".

@@ Early history
More body text, nested under "Early history".

@@ Recent developments
@ Analysis
```

Renders (outline view), with the default per-level styles, as:

```
1.0 Background
    1.1 Early history
    1.2 Recent developments
2.0 Analysis
```

The sigil character, the label style per level, and everything else about how this renders is configurable in **Settings → Virtual Outliner**.

## Metadata & Dataview/Datacore

Per-node fields (Status, Note, or whatever you configure) live in one JSON-lines block at the true end of the file:

```
%%md-outline
{"id":"^o-a3f2k9pq","Status":"Open"}
%%
```

Read them from a `dataviewjs`/`datacorejs` block:

```dataviewjs
const api = app.plugins.plugins['virtual-outliner'].api;
const nodes = await api.getOutline(dv.current().file.path);
dv.table(['Label', 'Text', 'Status'], nodes.map(n => [n.label, n.text, n.meta?.Status ?? '']));
```

## Commands

- **Toggle outline sidebar** (formerly *Open outline sidebar* — same command id, so existing hotkeys and toolbar buttons keep working)
- **Show outline only** / **Show body only** / **Show outline and body**
- **Toggle collapse of current outline entry** — folds or unfolds the entry the cursor is on, or the entry whose body it is in
- **Collapse all outline entries** / **Expand all outline entries**
- **Indent body with outline** — toggles the same setting as **Indent body under its outline level** in Settings
- **Toggle new entry on next line vs after section** — toggles the same setting as **Enter at the end of an entry**
- **Move outline block up** / **Move outline block down** — the `Alt-↑` / `Alt-↓` moves, usable with the cursor anywhere in the block, including its body text
- **Generate filtered copy** — writes a new `.md` file with the current view honored and labels materialized
- **Prune orphaned outline metadata** — removes metadata records whose node no longer exists, after reporting what it's about to remove

## Development

```
npm install
npm run dev     # esbuild watch mode
npm run build   # typecheck + production bundle
npm test        # vitest, headless — src/core/ plus decoration geometry
npm run lint    # eslint
```

`src/core/` is a pure TypeScript engine (no `obsidian`, no CodeMirror, no DOM) covering parsing, structural operations, label computation, metadata serialization, and render planning — fully covered by headless tests. `src/editor/` and `src/ui/` are the CodeMirror 6 / Obsidian shell around it.

The editor layer is partly testable too: CodeMirror's `EditorState` needs no DOM, so `tests/livePreview.test.ts` exercises decoration *geometry* — which character ranges get hidden, how they survive an edit, and the boundary invariants that keep typing near hidden content from corrupting it. It reaches `src/editor/` through a one-line `obsidian` stub and a vitest alias. Anything depending on rendered layout (heights, caret placement) still needs the real app.

## License

[MIT](LICENSE)
