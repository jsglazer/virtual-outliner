# Virtual Outliner

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/virtual-outliner?logo=github)](https://github.com/jsglazer/virtual-outliner/releases) [![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jsglazer/virtual-outliner/blob/main/LICENSE) [![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai) [![Gemini Flash Antigravity](https://img.shields.io/badge/Gemini%20Flash-Antigravity-4f86f7?logo=google-gemini&logoColor=white)](https://github.com/google-gemini) [![CI](https://github.com/jsglazer/virtual-outliner/actions/workflows/ci.yml/badge.svg)](https://github.com/jsglazer/virtual-outliner/actions/workflows/ci.yml) [![CodeQL](https://github.com/jsglazer/virtual-outliner/actions/workflows/codeql.yml/badge.svg)](https://github.com/jsglazer/virtual-outliner/actions/workflows/codeql.yml) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/jsglazer/virtual-outliner/badge)](https://securityscorecards.dev/viewer/?uri=github.com/jsglazer/virtual-outliner)

Outline-first authoring for Obsidian: lay down a full multi-level outline, then write headings and prose directly beneath each entry — without the outline and the body ever getting in each other's way.

## What it does

- **Outline as a layer, not a filter.** One Markdown file, two views. An outline entry is just a line starting with a repeated sigil (`@`, `@@`, `@@@`, …, configurable); everything else — your own prose, headings, lists, tables, code — is the body. A **node** is one entry plus every body line beneath it, up to the next entry.
- **Computed labels, never written to disk.** `1`, `1.0`, `1.1`, `I`, `A`, bullets, or none — per level, composited into things like `I.B.3` — are rendered at edit/view time in both Live Preview and Reading View. The raw sigils are never visible. Nothing is ever renumbered on disk; there is no auto-renumber engine to fight your undo history or corrupt your file.
  - The `1.0` style is Word-style multilevel numbering: the trailing `.0` is a placeholder for the next level down, so a top-level entry reads `3.0` on its own and its first child reads `3.1` — not `3.0.1`.
- **Three view states** — outline only, body only, or both — by command, and remembered per note.
- **A real outliner keymap**, scoped to outline lines only:
  - `Enter` at the end of an entry inserts a new sibling **after that node's entire subtree** — it never splits an existing node's body or children out from under it.
  - `Cmd-Enter` / `Ctrl-Enter` on an entry opens a plain **prose** line directly beneath it — that entry's own body, above its children — instead of another outline level. The cursor's column doesn't matter and the entry line is never split.
  - `Tab` / `Shift-Tab` demote/promote a node, carrying its whole subtree (body and descendants) with it — nothing is ever orphaned.
  - `Alt-↑` / `Alt-↓` move a node past its previous/next sibling, subtree and all.
  - Every operation is also available as a hotkey-less command, so it works on iPad without a hardware keyboard.
- **Collapse per node** — hide a node's body and descendants while keeping its entry visible, from the sidebar. Honored in Live Preview and Reading View alike, down to the individual source line.
- **Searchable, collapsible outline sidebar** — click any entry to jump straight to its prose.
- **One format, every level.** Number style, separator, italic, colour, font size, font weight, font family, indent step, space above, and label gap are set once in Settings and applied uniformly across all levels — no more editing the same ten fields six times. A level's font size sizes the whole line, so setting it below 1em tightens the leading to match rather than leaving full-size gaps around shrunken text. Indentation is cumulative: level 1 always stays flush left, and the shared indent step is how much further right each deeper level sits than the one above it. Body prose indents with its entry unless you turn **Indent body under its outline level** off (in Settings, or via the **Indent body with outline** command).
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

- **Open outline sidebar**
- **Show outline only** / **Show body only** / **Show outline and body**
- **Indent body with outline** — toggles the same setting as **Indent body under its outline level** in Settings
- **Generate filtered copy** — writes a new `.md` file with the current view honored and labels materialized
- **Prune orphaned outline metadata** — removes metadata records whose node no longer exists, after reporting what it's about to remove

## Development

```
npm install
npm run dev     # esbuild watch mode
npm run build   # typecheck + production bundle
npm test        # vitest, headless — everything under src/core/
npm run lint    # eslint
```

`src/core/` is a pure TypeScript engine (no `obsidian`, no CodeMirror, no DOM) covering parsing, structural operations, label computation, metadata serialization, and render planning — fully covered by headless tests. `src/editor/` and `src/ui/` are the CodeMirror 6 / Obsidian shell around it.

## License

[MIT](LICENSE)
