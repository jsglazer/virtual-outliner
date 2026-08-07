"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VirtualOutlinerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/core/label.ts
var ROMAN_TABLE = [
  [1e3, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"]
];
function toRoman(n) {
  if (n <= 0) return String(n);
  let value = n;
  let out = "";
  for (const [amount, numeral] of ROMAN_TABLE) {
    while (value >= amount) {
      out += numeral;
      value -= amount;
    }
  }
  return out;
}
function toAlpha(n) {
  if (n <= 0) return String(n);
  let value = n;
  let out = "";
  while (value > 0) {
    const rem = (value - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}
function dottedPath(indices) {
  return indices.join(".");
}
function segmentFor(style, ownIndex, pathIndices, hasDeeperSegment) {
  switch (style) {
    case "1":
      return String(ownIndex);
    case "1.0":
      return hasDeeperSegment ? String(ownIndex) : `${ownIndex}.0`;
    case "1.1":
      return dottedPath(pathIndices);
    case "I":
      return toRoman(ownIndex);
    case "i":
      return toRoman(ownIndex).toLowerCase();
    case "A":
      return toAlpha(ownIndex);
    case "a":
      return toAlpha(ownIndex).toLowerCase();
    case "bullet":
      return "\u2022";
    case "none":
      return "";
  }
}
function ancestorChain(node) {
  const chain = [];
  let cur = node;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent;
  }
  return chain;
}
function computeLabel(levelFormats, node) {
  const chain = ancestorChain(node);
  const pathIndices = chain.map((n) => n.siblingIndex);
  const formats = chain.map((n) => {
    var _a, _b;
    return (_b = (_a = levelFormats[n.level - 1]) != null ? _a : levelFormats[levelFormats.length - 1]) != null ? _b : null;
  });
  const segments = [];
  for (let i = 0; i < chain.length; i++) {
    const ancestor = chain[i];
    const format = formats[i];
    if (!ancestor || !format) continue;
    let hasDeeperSegment = false;
    for (let j = i + 1; j < chain.length; j++) {
      const deeper = formats[j];
      if (deeper && deeper.style !== "none") {
        hasDeeperSegment = true;
        break;
      }
    }
    const segment = segmentFor(format.style, ancestor.siblingIndex, pathIndices.slice(0, i + 1), hasDeeperSegment);
    if (segment === "") continue;
    const prefix = segments.length === 0 ? "" : format.separator;
    segments.push(prefix + segment);
  }
  return segments.join("");
}

// src/core/metadata.ts
var BLOCK_OPEN = "%%md-outline";
var BLOCK_CLOSE = "%%";
function isMarkerLine(line, marker) {
  return line.trimEnd() === marker;
}
function isRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function parseRecordValue(v) {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string" || v.id === "") return null;
  const fields = {};
  for (const [key, value] of Object.entries(v)) {
    if (key === "id") continue;
    if (typeof value !== "string") return null;
    fields[key] = value;
  }
  return { id: v.id, fields };
}
function parseMetaDocument(doc) {
  const lines = doc.split("\n");
  let openIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line !== void 0 && isMarkerLine(line, BLOCK_OPEN)) {
      openIdx = i;
      break;
    }
  }
  if (openIdx === -1) return { body: doc, records: [], unparseable: [] };
  let closeIdx = -1;
  for (let i = openIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line !== void 0 && isMarkerLine(line, BLOCK_CLOSE)) {
      closeIdx = i;
      break;
    }
  }
  const contentEnd = closeIdx === -1 ? lines.length : closeIdx;
  const contentLines = lines.slice(openIdx + 1, contentEnd);
  const tailLines = closeIdx === -1 ? [] : lines.slice(closeIdx + 1);
  const tail = tailLines.join("\n");
  const bodyLines = lines.slice(0, openIdx);
  const body = tail.trim() === "" ? bodyLines.join("\n") : bodyLines.join("\n") + "\n" + tail;
  const records = [];
  const unparseable = [];
  for (const raw of contentLines) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      unparseable.push(raw);
      continue;
    }
    const record = parseRecordValue(parsed);
    if (record) records.push(record);
    else unparseable.push(raw);
  }
  return { body, records, unparseable };
}
function serializeRecordLine(r) {
  return JSON.stringify({ id: r.id, ...r.fields });
}
function composeMetaDocument(body, records, unparseable) {
  if (records.length === 0 && unparseable.length === 0) return body;
  const bodyLines = body === "" ? [] : body.split("\n");
  const last = bodyLines[bodyLines.length - 1];
  if (bodyLines.length > 0 && last !== void 0 && last.trimEnd() !== "") bodyLines.push("");
  const blockLines = [
    BLOCK_OPEN,
    ...records.map(serializeRecordLine),
    ...unparseable,
    BLOCK_CLOSE,
    ""
  ];
  return [...bodyLines, ...blockLines].join("\n");
}
function pruneOrphaned(doc, liveIds) {
  const { body, records, unparseable } = parseMetaDocument(doc);
  const kept = [];
  const removedIds = [];
  for (const record of records) {
    if (liveIds.has(record.id)) kept.push(record);
    else removedIds.push(record.id);
  }
  if (removedIds.length === 0) return { doc, removedIds: [] };
  return { doc: composeMetaDocument(body, kept, unparseable), removedIds };
}

// src/core/id.ts
var ID_PREFIX = "^o-";
var ID_LENGTH = 8;
var BASE36 = 36;
var ID_SUFFIX_RE = / \^o-([0-9a-z]{8})$/;
function mintId(seed1, seed2) {
  const mixed = Math.abs(Math.floor(seed1)) * 2654435761 + Math.floor(seed2 * 2 ** 32) >>> 0;
  return ID_PREFIX + mixed.toString(BASE36).padStart(ID_LENGTH, "0");
}
function splitEntryId(text) {
  var _a;
  const match = ID_SUFFIX_RE.exec(text);
  if (!match) return { text, id: null };
  const digits = (_a = match[1]) != null ? _a : "";
  return { text: text.slice(0, match.index), id: ID_PREFIX + digits };
}
function appendId(text, id) {
  return `${text} ${id}`;
}

// src/core/sigil.ts
var DEFAULT_SIGIL_CHAR = "@";
var MAX_LEVEL = 6;
function escapeForRegex(char) {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function entryLineRegex(sigilChar) {
  const escaped = escapeForRegex(sigilChar);
  return new RegExp(`^(${escaped}{1,${MAX_LEVEL}})[ \\t]+(\\S.*)$`);
}
function entryLevel(line, sigilChar) {
  var _a;
  const match = entryLineRegex(sigilChar).exec(line);
  if (!match) return null;
  const sigils = (_a = match[1]) != null ? _a : "";
  return sigils.length;
}
function isEntryLine(line, sigilChar) {
  return entryLineRegex(sigilChar).test(line);
}
function outlineLineRegex(sigilChar) {
  const escaped = escapeForRegex(sigilChar);
  return new RegExp(`^(${escaped}{1,${MAX_LEVEL}})[ \\t]+(.*)$`);
}
function isOutlineLine(line, sigilChar) {
  return outlineLineRegex(sigilChar).test(line);
}
function entrySegments(line, sigilChar) {
  var _a, _b;
  const match = entryLineRegex(sigilChar).exec(line);
  if (!match) return null;
  const sigils = (_a = match[1]) != null ? _a : "";
  const rest = (_b = match[2]) != null ? _b : "";
  const prefixEnd = line.length - rest.length;
  const idSuffixMatch = ID_SUFFIX_RE.exec(rest);
  const textEnd = idSuffixMatch ? prefixEnd + idSuffixMatch.index : line.length;
  return { level: sigils.length, prefixEnd, textEnd };
}
var RISKY_SIGILS = /* @__PURE__ */ new Set(["#", "-", "*", "+", ">", "`", "=", "|", "_"]);
function isRiskySigil(char) {
  return RISKY_SIGILS.has(char) || /[0-9]/.test(char) || /\s/.test(char);
}

// src/core/parser.ts
function parseOutline(body, sigilChar = DEFAULT_SIGIL_CHAR) {
  var _a, _b, _c, _d, _e, _f;
  const lines = body.split("\n");
  const flat = [];
  const roots = [];
  const stack = new Array(7).fill(null);
  const siblingCounts = new Array(7).fill(0);
  const seenIds = /* @__PURE__ */ new Set();
  const entryRe = entryLineRegex(sigilChar);
  for (let i = 0; i < lines.length; i++) {
    const line = (_a = lines[i]) != null ? _a : "";
    const match = entryRe.exec(line);
    if (!match) continue;
    const level = ((_b = match[1]) != null ? _b : "").length;
    const rest = (_c = match[2]) != null ? _c : "";
    const { text, id } = splitEntryId(rest);
    let claimedId = null;
    if (id !== null) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        claimedId = id;
      }
    }
    const parent = (_d = stack[level - 1]) != null ? _d : null;
    siblingCounts[level] = ((_e = siblingCounts[level]) != null ? _e : 0) + 1;
    for (let l = level + 1; l <= 6; l++) siblingCounts[l] = 0;
    const node = {
      entryLine: i,
      level,
      text: text.trimEnd(),
      id: claimedId,
      siblingIndex: (_f = siblingCounts[level]) != null ? _f : 1,
      parent,
      children: [],
      ownBodyStart: i + 1,
      ownBodyEnd: lines.length,
      // patched below once the next entry is known
      subtreeStart: i,
      subtreeEnd: lines.length
      // patched below
    };
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack[level] = node;
    for (let l = level + 1; l <= 6; l++) stack[l] = null;
    flat.push(node);
  }
  for (let idx = 0; idx < flat.length; idx++) {
    const node = flat[idx];
    if (!node) continue;
    const next = flat[idx + 1];
    node.ownBodyEnd = next ? next.entryLine : lines.length;
    let subtreeEndIdx = idx + 1;
    while (subtreeEndIdx < flat.length) {
      const candidate = flat[subtreeEndIdx];
      if (candidate && candidate.level <= node.level) break;
      subtreeEndIdx++;
    }
    const subtreeNext = flat[subtreeEndIdx];
    node.subtreeEnd = subtreeNext ? subtreeNext.entryLine : lines.length;
  }
  return { roots, flat, lineCount: lines.length };
}
function nodeAtLine(parsed, line) {
  for (const node of parsed.flat) {
    if (node.entryLine === line) return node;
  }
  return null;
}
function previousSibling(parsed, node) {
  const idx = parsed.flat.indexOf(node);
  for (let i = idx - 1; i >= 0; i--) {
    const candidate = parsed.flat[i];
    if (!candidate || candidate.level < node.level) return null;
    if (candidate.level === node.level) return candidate;
  }
  return null;
}
function nextSibling(parsed, node) {
  const idx = parsed.flat.indexOf(node);
  for (let i = idx + 1; i < parsed.flat.length; i++) {
    const candidate = parsed.flat[i];
    if (!candidate || candidate.level < node.level) return null;
    if (candidate.level === node.level) return candidate;
  }
  return null;
}

// src/api.ts
function clone(v) {
  return structuredClone(v);
}
function summarize(doc, sigilChar, levels) {
  const { body, records } = parseMetaDocument(doc);
  const parsed = parseOutline(body, sigilChar);
  const metaById = new Map(records.map((r) => [r.id, r.fields]));
  return parsed.flat.map((node) => {
    var _a;
    return {
      id: node.id,
      level: node.level,
      text: node.text,
      label: computeLabel(levels, node),
      siblingIndex: node.siblingIndex,
      meta: node.id !== null ? clone((_a = metaById.get(node.id)) != null ? _a : null) : null
    };
  });
}
function createApi(vault, sigilChar, levels) {
  return {
    async getOutline(path) {
      const file = vault.getFileByPath(path);
      if (!file || file.extension !== "md") return [];
      const doc = await vault.cachedRead(file);
      return summarize(doc, sigilChar(), levels());
    },
    async getAllOutlines() {
      const out = [];
      const sigil = sigilChar();
      const lvls = levels();
      for (const file of vault.getMarkdownFiles()) {
        const doc = await vault.cachedRead(file);
        if (!doc.includes(sigil) && !doc.includes(BLOCK_OPEN)) continue;
        const nodes = summarize(doc, sigil, lvls);
        if (nodes.length > 0) out.push({ path: file.path, nodes });
      }
      return out;
    }
  };
}

// src/core/lines.ts
function lineStartOffsets(lines) {
  var _a;
  const offsets = [0];
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    pos += ((_a = lines[i]) != null ? _a : "").length;
    if (i < lines.length - 1) pos += 1;
    offsets.push(pos);
  }
  return offsets;
}
function lineRangeToOffsets(offsets, startLine, endLine) {
  var _a, _b, _c;
  const from = (_a = offsets[startLine]) != null ? _a : 0;
  const to = (_c = (_b = offsets[endLine]) != null ? _b : offsets[offsets.length - 1]) != null ? _c : 0;
  return { from, to };
}

// src/core/render.ts
function mergeRanges(ranges) {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
function isLineHidden(hidden, line) {
  for (const range of hidden) {
    if (line >= range.from && line < range.to) return true;
  }
  return false;
}
function computeRenderPlan(body, sigilChar, levels, viewState, collapsedIds, indentBody = true) {
  const parsed = parseOutline(body, sigilChar);
  const collapseRanges = [];
  for (const node of parsed.flat) {
    if (node.id !== null && collapsedIds.has(node.id) && node.subtreeEnd > node.entryLine + 1) {
      collapseRanges.push({ from: node.entryLine + 1, to: node.subtreeEnd });
    }
  }
  const viewStateRanges = [];
  if (viewState === "outline") {
    let runStart = null;
    const entryLines = new Set(parsed.flat.map((n) => n.entryLine));
    for (let i = 0; i < parsed.lineCount; i++) {
      if (entryLines.has(i)) {
        if (runStart !== null) viewStateRanges.push({ from: runStart, to: i });
        runStart = null;
      } else if (runStart === null) {
        runStart = i;
      }
    }
    if (runStart !== null) viewStateRanges.push({ from: runStart, to: parsed.lineCount });
  } else if (viewState === "body") {
    for (const node of parsed.flat) {
      viewStateRanges.push({ from: node.entryLine, to: node.entryLine + 1 });
    }
  }
  const hiddenLineRanges = mergeRanges([...collapseRanges, ...viewStateRanges]);
  const labels = /* @__PURE__ */ new Map();
  const entryLevel2 = /* @__PURE__ */ new Map();
  const indentLevel = /* @__PURE__ */ new Map();
  const showLabels = viewState === "outline" || viewState === "both";
  for (const node of parsed.flat) {
    if (isLineHidden(hiddenLineRanges, node.entryLine)) continue;
    entryLevel2.set(node.entryLine, node.level);
    if (showLabels) labels.set(node.entryLine, computeLabel(levels, node));
    indentLevel.set(node.entryLine, node.level);
  }
  if (indentBody) {
    for (const node of parsed.flat) {
      for (let line = node.ownBodyStart; line < node.ownBodyEnd; line++) {
        if (isLineHidden(hiddenLineRanges, line)) continue;
        indentLevel.set(line, node.level);
      }
    }
  }
  return { parsed, labels, indentLevel, entryLevel: entryLevel2, hiddenLineRanges };
}

// src/core/exportFilter.ts
function generateFilteredCopy(doc, sigilChar, levels, viewState, collapsedIds) {
  var _a;
  const { body } = parseMetaDocument(doc);
  const plan = computeRenderPlan(body, sigilChar, levels, viewState, collapsedIds);
  const lines = body.split("\n");
  const entryOutput = /* @__PURE__ */ new Map();
  for (const node of plan.parsed.flat) {
    if (isLineHidden(plan.hiddenLineRanges, node.entryLine)) continue;
    const label = plan.labels.get(node.entryLine);
    entryOutput.set(node.entryLine, label && label !== "" ? `${label} ${node.text}` : node.text);
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (isLineHidden(plan.hiddenLineRanges, i)) continue;
    const entryText = entryOutput.get(i);
    out.push(entryText !== void 0 ? entryText : (_a = lines[i]) != null ? _a : "");
  }
  return out.join("\n");
}

// src/core/settings.ts
var DEFAULT_LABEL_STYLES = ["1.0", "1", "1", "1", "1", "1"];
function defaultLevelFormat(level) {
  var _a;
  return {
    style: (_a = DEFAULT_LABEL_STYLES[level - 1]) != null ? _a : "1",
    separator: level === 1 ? "" : ".",
    fontSize: "",
    fontWeight: level === 1 ? "600" : "",
    fontFamily: "",
    color: "",
    italic: false,
    // Cumulative: a level's own step is added to every step above it, so
    // level 1's step is the whole outline's base offset (0 = flush left)
    // and each deeper level's step is how much further right it sits than
    // its parent.
    indentStep: level === 1 ? "0px" : "1.5em",
    spacing: level === 1 ? "0.75em" : "0.25em",
    labelGap: "0.3em"
  };
}
function defaultMetaFields() {
  return [
    { name: "Status", type: "select", options: ["", "Open", "In progress", "Done"] },
    { name: "Note", type: "text", options: [] }
  ];
}
function defaultSettings() {
  const levels = [];
  for (let l = 1; l <= MAX_LEVEL; l++) levels.push(defaultLevelFormat(l));
  return {
    sigil: DEFAULT_SIGIL_CHAR,
    defaultViewState: "both",
    indentBody: true,
    levels,
    metaFields: defaultMetaFields()
  };
}
function isRecord2(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function readString(v, fallback) {
  return typeof v === "string" ? v : fallback;
}
function readBool(v, fallback) {
  return typeof v === "boolean" ? v : fallback;
}
var LABEL_STYLES = /* @__PURE__ */ new Set(["1", "1.0", "1.1", "I", "A", "a", "i", "bullet", "none"]);
function readLabelStyle(v, fallback) {
  return typeof v === "string" && LABEL_STYLES.has(v) ? v : fallback;
}
function normalizeLevelFormat(v, level) {
  const fallback = defaultLevelFormat(level);
  if (!isRecord2(v)) return fallback;
  return {
    style: readLabelStyle(v.style, fallback.style),
    separator: readString(v.separator, fallback.separator),
    fontSize: readString(v.fontSize, fallback.fontSize),
    fontWeight: readString(v.fontWeight, fallback.fontWeight),
    fontFamily: readString(v.fontFamily, fallback.fontFamily),
    color: readString(v.color, fallback.color),
    italic: readBool(v.italic, fallback.italic),
    indentStep: readString(v.indentStep, fallback.indentStep),
    spacing: readString(v.spacing, fallback.spacing),
    labelGap: readString(v.labelGap, fallback.labelGap)
  };
}
function normalizeMetaField(v) {
  if (!isRecord2(v)) return null;
  if (typeof v.name !== "string" || v.name.trim() === "") return null;
  const type = v.type === "select" ? "select" : "text";
  const options = Array.isArray(v.options) ? v.options.filter((o) => typeof o === "string") : [];
  return { name: v.name, type, options };
}
var VIEW_STATES = /* @__PURE__ */ new Set(["outline", "body", "both"]);
function normalizeSettings(raw) {
  const fallback = defaultSettings();
  if (!isRecord2(raw)) return fallback;
  const sigilRaw = readString(raw.sigil, fallback.sigil);
  const sigil = sigilRaw.length === 1 && !/\s/.test(sigilRaw) ? sigilRaw : fallback.sigil;
  const defaultViewState = typeof raw.defaultViewState === "string" && VIEW_STATES.has(raw.defaultViewState) ? raw.defaultViewState : fallback.defaultViewState;
  const levels = [];
  const rawLevels = Array.isArray(raw.levels) ? raw.levels : [];
  for (let i = 0; i < MAX_LEVEL; i++) levels.push(normalizeLevelFormat(rawLevels[i], i + 1));
  const metaFields = Array.isArray(raw.metaFields) ? raw.metaFields.map(normalizeMetaField).filter((f) => f !== null) : fallback.metaFields;
  return {
    sigil,
    defaultViewState,
    indentBody: readBool(raw.indentBody, fallback.indentBody),
    levels,
    metaFields: metaFields.length > 0 ? metaFields : fallback.metaFields
  };
}
function levelCssVars(levels) {
  const vars = {};
  let cumulativeIndent = "";
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    if (!level) continue;
    const n = i + 1;
    vars[`--vo-l${n}-size`] = level.fontSize !== "" ? cssValue(level.fontSize) : "inherit";
    vars[`--vo-l${n}-weight`] = level.fontWeight !== "" ? cssValue(level.fontWeight) : "inherit";
    vars[`--vo-l${n}-family`] = level.fontFamily !== "" ? cssValue(level.fontFamily) : "inherit";
    vars[`--vo-l${n}-color`] = level.color !== "" ? cssValue(level.color) : "inherit";
    vars[`--vo-l${n}-style`] = level.italic ? "italic" : "normal";
    vars[`--vo-l${n}-spacing`] = level.spacing !== "" ? cssValue(level.spacing) : "0px";
    vars[`--vo-l${n}-gap`] = level.labelGap !== "" ? cssValue(level.labelGap) : "0px";
    const step = cssLength(level.indentStep);
    cumulativeIndent = cumulativeIndent === "" ? step : `calc(${cumulativeIndent} + ${step})`;
    vars[`--vo-l${n}-indent`] = cumulativeIndent;
  }
  return vars;
}
function cssValue(v) {
  return v.replace(/[;{}<>]/g, "").trim();
}
function cssLength(v) {
  const value = cssValue(v);
  if (value === "" || /^[+-]?0*(\.0*)?$/.test(value)) return "0px";
  return value;
}

// src/editor/livePreview.ts
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var import_obsidian = require("obsidian");
var setOutlineDecorations = import_state.StateEffect.define({
  map: (value, mapping) => value.map(mapping)
});
var outlineDecoField = import_state.StateField.define({
  create: () => import_view.Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setOutlineDecorations)) next = effect.value;
    }
    return next;
  },
  provide: (field) => [
    import_view.EditorView.decorations.from(field),
    // A block-replace range must also be atomic so the cursor can never
    // land inside it (Decision #16) — the same DecorationSet doubles as
    // the atomic-ranges source.
    import_view.EditorView.atomicRanges.of((view) => view.state.field(field))
  ]
});
var EDITOR_RESOLVE_DEBOUNCE_MS = 200;
function buildEditorExtension(host) {
  const watcher = import_view.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        host.attachEditor(view);
        host.scheduleEditorResolve(view, 0);
      }
      update(update) {
        if (update.docChanged) host.scheduleEditorResolve(update.view, EDITOR_RESOLVE_DEBOUNCE_MS);
      }
      destroy() {
        host.detachEditor(this.view);
      }
    }
  );
  return [outlineDecoField, watcher];
}
function editorViewPath(view) {
  var _a, _b, _c;
  return (_c = (_b = (_a = view.state.field(import_obsidian.editorInfoField, false)) == null ? void 0 : _a.file) == null ? void 0 : _b.path) != null ? _c : null;
}
var LabelWidget = class extends import_view.WidgetType {
  constructor(label, levelClass) {
    super();
    this.label = label;
    this.levelClass = levelClass;
  }
  eq(other) {
    return other.label === this.label && other.levelClass === this.levelClass;
  }
  toDOM(view) {
    const span = view.dom.ownerDocument.createElement("span");
    span.className = `vo-label ${this.levelClass}`;
    span.textContent = this.label;
    return span;
  }
  ignoreEvent() {
    return true;
  }
};
function buildOutlineDecorations(view, plan, sigilChar) {
  var _a;
  const doc = view.state.doc;
  const lineCount = doc.lines;
  const builder = new import_state.RangeSetBuilder();
  const items = [];
  for (const range of plan.hiddenLineRanges) {
    if (range.from >= lineCount || range.to > lineCount) continue;
    const lastLineNo = Math.min(range.to, lineCount);
    const lastLine = doc.line(lastLineNo);
    const atDocStart = range.from === 0;
    const from = atDocStart ? doc.line(1).from : doc.line(range.from).to;
    const to = atDocStart && lastLineNo < lineCount ? doc.line(lastLineNo + 1).from : lastLine.to;
    if (from >= to) continue;
    items.push({ from, to, deco: import_view.Decoration.replace({ block: true }) });
  }
  for (const [lineIndex, label] of plan.labels) {
    if (lineIndex >= lineCount) continue;
    const line = doc.line(lineIndex + 1);
    const segs = entrySegments(line.text, sigilChar);
    if (!segs) continue;
    const level = (_a = plan.entryLevel.get(lineIndex)) != null ? _a : segs.level;
    if (segs.prefixEnd > 0) {
      items.push({
        from: line.from,
        to: line.from + segs.prefixEnd,
        deco: import_view.Decoration.replace({ widget: new LabelWidget(label, `vo-l${level}`) })
      });
    }
    if (segs.textEnd > segs.prefixEnd) {
      items.push({
        from: line.from + segs.prefixEnd,
        to: line.from + segs.textEnd,
        deco: import_view.Decoration.mark({ class: `vo-text vo-l${level}` })
      });
    }
    if (segs.textEnd < line.text.length) {
      items.push({ from: line.from + segs.textEnd, to: line.to, deco: import_view.Decoration.replace({}) });
    }
  }
  for (const [lineIndex, level] of plan.indentLevel) {
    if (lineIndex >= lineCount) continue;
    const line = doc.line(lineIndex + 1);
    items.push({ from: line.from, to: line.from, deco: import_view.Decoration.line({ class: `vo-indent-l${level}` }) });
  }
  for (const [lineIndex, level] of plan.entryLevel) {
    if (lineIndex >= lineCount) continue;
    const line = doc.line(lineIndex + 1);
    items.push({
      from: line.from,
      to: line.from,
      deco: import_view.Decoration.line({ class: `vo-entry-l${level}` })
    });
  }
  items.sort((a, b) => {
    var _a2, _b;
    return a.from - b.from || ((_a2 = a.deco.startSide) != null ? _a2 : 0) - ((_b = b.deco.startSide) != null ? _b : 0);
  });
  for (const item of items) builder.add(item.from, item.to, item.deco);
  return builder.finish();
}

// src/editor/keymap.ts
var import_state2 = require("@codemirror/state");
var import_view2 = require("@codemirror/view");

// src/core/ops.ts
function sliceRange(lines, start, end) {
  return lineRangeToOffsets(lineStartOffsets(lines), start, end);
}
function subtreeText(body, lines, node) {
  const { from, to } = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
  return body.slice(from, to);
}
function deepestLevelInSubtree(lines, node, sigilChar) {
  var _a;
  let max = node.level;
  for (let i = node.subtreeStart; i < node.subtreeEnd; i++) {
    const level = entryLevel((_a = lines[i]) != null ? _a : "", sigilChar);
    if (level !== null && level > max) max = level;
  }
  return max;
}
function shiftSubtreeLevels(text, delta, sigilChar) {
  const lines = text.split("\n");
  const shifted = lines.map((line) => {
    if (!isEntryLine(line, sigilChar)) return line;
    return delta === 1 ? sigilChar + line : line.slice(sigilChar.length);
  });
  return shifted.join("\n");
}
function demote(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node = nodeAtLine(parsed, entryLine);
  if (!node) return null;
  if (node.level >= MAX_LEVEL) return null;
  if (deepestLevelInSubtree(lines, node, sigilChar) >= MAX_LEVEL) return null;
  const idx = parsed.flat.indexOf(node);
  const prev = idx > 0 ? parsed.flat[idx - 1] : null;
  if (!prev || prev.level < node.level) return null;
  const { from, to } = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
  const insert = shiftSubtreeLevels(subtreeText(body, lines, node), 1, sigilChar);
  return { from, to, insert };
}
function promote(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node = nodeAtLine(parsed, entryLine);
  if (!node) return null;
  if (node.level <= 1) return null;
  const { from, to } = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
  const insert = shiftSubtreeLevels(subtreeText(body, lines, node), -1, sigilChar);
  return { from, to, insert };
}
function moveUp(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node = nodeAtLine(parsed, entryLine);
  if (!node) return null;
  const prev = previousSibling(parsed, node);
  if (!prev) return null;
  const prevRange = sliceRange(lines, prev.subtreeStart, prev.subtreeEnd);
  const nodeRange = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
  const prevText = body.slice(prevRange.from, prevRange.to);
  const nodeText = body.slice(nodeRange.from, nodeRange.to);
  return { from: prevRange.from, to: nodeRange.to, insert: nodeText + prevText };
}
function moveDown(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node = nodeAtLine(parsed, entryLine);
  if (!node) return null;
  const next = nextSibling(parsed, node);
  if (!next) return null;
  const nodeRange = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
  const nextRange = sliceRange(lines, next.subtreeStart, next.subtreeEnd);
  const nodeText = body.slice(nodeRange.from, nodeRange.to);
  const nextText = body.slice(nextRange.from, nextRange.to);
  return { from: nodeRange.from, to: nextRange.to, insert: nextText + nodeText };
}
function addSibling(body, entryLine, cursorCol, sigilChar = DEFAULT_SIGIL_CHAR) {
  var _a, _b, _c, _d, _e;
  const lines = body.split("\n");
  const line = (_a = lines[entryLine]) != null ? _a : "";
  if (cursorCol !== line.length) return null;
  const match = outlineLineRegex(sigilChar).exec(line);
  if (!match) return null;
  const level = ((_b = match[1]) != null ? _b : "").length;
  const rest = (_c = match[2]) != null ? _c : "";
  const { text } = splitEntryId(rest);
  const offsets = lineStartOffsets(lines);
  if (text.trim() === "") {
    const from = (_d = offsets[entryLine]) != null ? _d : 0;
    const to = from + line.length;
    return { from, to, insert: "" };
  }
  const parsed = parseOutline(body, sigilChar);
  const node = nodeAtLine(parsed, entryLine);
  if (!node) return null;
  const insertAt = (_e = offsets[node.subtreeEnd]) != null ? _e : body.length;
  const atEof = node.subtreeEnd >= parsed.lineCount;
  const newEntry = sigilChar.repeat(level) + " ";
  const insert = atEof ? "\n" + newEntry : newEntry + "\n";
  return { from: insertAt, to: insertAt, insert };
}
function addBodyLine(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  var _a;
  const lines = body.split("\n");
  const line = lines[entryLine];
  if (line === void 0) return null;
  if (!isOutlineLine(line, sigilChar)) return null;
  const offsets = lineStartOffsets(lines);
  const insertAt = ((_a = offsets[entryLine]) != null ? _a : 0) + line.length;
  return { from: insertAt, to: insertAt, insert: "\n" };
}

// src/editor/keymap.ts
function bodyOf(view) {
  return parseMetaDocument(view.state.doc.toString()).body;
}
function activeLine(view) {
  const sel = view.state.selection.main;
  if (!sel.empty) return null;
  const line = view.state.doc.lineAt(sel.head);
  return { lineIndex: line.number - 1, lineText: line.text, col: sel.head - line.from };
}
function dispatchSplice(view, splice, selection) {
  view.dispatch({
    changes: { from: splice.from, to: splice.to, insert: splice.insert },
    selection: selection !== void 0 ? { anchor: selection } : void 0,
    scrollIntoView: true
  });
  return true;
}
function structuralBinding(host, op) {
  return (view) => {
    const line = activeLine(view);
    if (!line) return false;
    const sigil = host.sigilChar(view);
    if (!isOutlineLine(line.lineText, sigil)) return false;
    const splice = op(bodyOf(view), line.lineIndex, sigil);
    if (!splice) return true;
    return dispatchSplice(view, splice);
  };
}
function enterBinding(host) {
  return (view) => {
    const line = activeLine(view);
    if (!line) return false;
    const sigil = host.sigilChar(view);
    if (!isOutlineLine(line.lineText, sigil)) return false;
    const splice = addSibling(bodyOf(view), line.lineIndex, line.col, sigil);
    if (!splice) return false;
    const trailingNewline = splice.insert.endsWith("\n") ? 1 : 0;
    const cursor = splice.from + splice.insert.length - trailingNewline;
    return dispatchSplice(view, splice, cursor);
  };
}
function bodyLineBinding(host) {
  return (view) => {
    const line = activeLine(view);
    if (!line) return false;
    const sigil = host.sigilChar(view);
    if (!isOutlineLine(line.lineText, sigil)) return false;
    const splice = addBodyLine(bodyOf(view), line.lineIndex, sigil);
    if (!splice) return true;
    return dispatchSplice(view, splice, splice.from + splice.insert.length);
  };
}
function buildOutlineKeymap(host) {
  const bindings = [
    { key: "Enter", run: enterBinding(host) },
    { key: "Mod-Enter", run: bodyLineBinding(host) },
    { key: "Tab", run: structuralBinding(host, demote) },
    { key: "Shift-Tab", run: structuralBinding(host, promote) },
    { key: "Alt-ArrowUp", run: structuralBinding(host, moveUp) },
    { key: "Alt-ArrowDown", run: structuralBinding(host, moveDown) }
  ];
  return import_state2.Prec.highest(import_view2.keymap.of(bindings));
}

// src/editor/readingView.ts
function collectFirstAndLastTextNode(nodes) {
  let first = null;
  let last = null;
  for (const root of nodes) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (!first) first = root;
      last = root;
      continue;
    }
    if (!root.instanceOf(HTMLElement)) continue;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (!first) first = node;
      last = node;
      node = walker.nextNode();
    }
  }
  return { first, last };
}
function wrapEntryText(first, last, level, doc) {
  var _a;
  const wrapper = doc.createElement("span");
  wrapper.className = `vo-text vo-l${level}`;
  (_a = first.parentNode) == null ? void 0 : _a.insertBefore(wrapper, first);
  let node = first;
  while (node) {
    const next = node.nextSibling;
    wrapper.appendChild(node);
    if (node === last) break;
    node = next;
  }
}
function stripLinePrefix(node, prefix) {
  var _a;
  const raw = (_a = node.nodeValue) != null ? _a : "";
  const index = raw.indexOf(prefix);
  if (index < 0 || raw.slice(0, index).trim() !== "") return false;
  node.nodeValue = raw.slice(index + prefix.length);
  return true;
}
function stripIdSuffix(node, suffix) {
  var _a;
  const raw = (_a = node.nodeValue) != null ? _a : "";
  const trimmed = raw.trimEnd();
  if (!trimmed.endsWith(suffix)) return false;
  node.nodeValue = trimmed.slice(0, -suffix.length);
  return true;
}
function materializeLabelIn(nodes, line, sigilChar, label, level, doc) {
  var _a;
  const segs = entrySegments(line, sigilChar);
  if (!segs) return;
  const prefixStr = line.slice(0, segs.prefixEnd);
  const idSuffixStr = segs.textEnd < line.length ? line.slice(segs.textEnd) : "";
  const { first, last } = collectFirstAndLastTextNode(nodes);
  if (!first) return;
  if (idSuffixStr !== "" && last) stripIdSuffix(last, idSuffixStr);
  if (!stripLinePrefix(first, prefixStr)) return;
  const labelSpan = doc.createElement("span");
  labelSpan.className = `vo-label vo-l${level}`;
  labelSpan.textContent = label;
  (_a = first.parentNode) == null ? void 0 : _a.insertBefore(labelSpan, first);
  wrapEntryText(first, last, level, doc);
}
function materializeLabel(el, line, sigilChar, label, level) {
  materializeLabelIn(el.childNodes, line, sigilChar, label, level, el.ownerDocument);
}
function inlineHost(el) {
  let host = el;
  for (; ; ) {
    const children = Array.from(host.childNodes);
    const only = children.length === 1 ? children[0] : null;
    if (!only || !only.instanceOf(HTMLElement)) return host;
    host = only;
  }
}
function splitByLineBreak(el) {
  const segments = [{ nodes: [], br: null }];
  for (const child of Array.from(el.childNodes)) {
    const current = segments[segments.length - 1];
    if (!current) continue;
    if (child.nodeName === "BR") {
      current.br = child;
      segments.push({ nodes: [], br: null });
    } else {
      current.nodes.push(child);
    }
  }
  return segments;
}
function blockWrapSegment(segment, classes, doc) {
  var _a, _b;
  const first = segment.nodes[0];
  if (!first) return null;
  const wrapper = doc.createElement("span");
  wrapper.className = classes.join(" ");
  (_a = first.parentNode) == null ? void 0 : _a.insertBefore(wrapper, first);
  for (const node of segment.nodes) wrapper.appendChild(node);
  (_b = segment.br) == null ? void 0 : _b.remove();
  return wrapper;
}
function levelClasses(indentLevel, entryLevel2) {
  const classes = [];
  if (indentLevel !== void 0) classes.push(`vo-indent-l${indentLevel}`);
  if (entryLevel2 !== void 0) classes.push(`vo-entry-l${entryLevel2}`);
  return classes;
}
function createReadingPostProcessor(host) {
  return (el, ctx) => {
    var _a, _b, _c;
    const section = ctx.getSectionInfo(el);
    if (!section) return;
    const { body } = parseMetaDocument(section.text);
    const sigilChar = host.sigilChar(ctx.sourcePath);
    const levels = host.levels(ctx.sourcePath);
    const viewState = host.viewState(ctx.sourcePath);
    const collapsedIds = host.collapsedIds(ctx.sourcePath);
    const plan = computeRenderPlan(
      body,
      sigilChar,
      levels,
      viewState,
      collapsedIds,
      host.indentBody(ctx.sourcePath)
    );
    const { lineStart, lineEnd } = section;
    if (lineStart === lineEnd) {
      if (isLineHidden(plan.hiddenLineRanges, lineStart)) {
        el.addClass("vo-hidden");
        return;
      }
      for (const cls of levelClasses(plan.indentLevel.get(lineStart), plan.entryLevel.get(lineStart))) {
        el.addClass(cls);
      }
      const label = plan.labels.get(lineStart);
      if (label === void 0) return;
      const level = (_a = plan.entryLevel.get(lineStart)) != null ? _a : 1;
      const lines2 = body.split("\n");
      const lineText = lines2[lineStart];
      if (lineText === void 0) return;
      materializeLabel(el, lineText, sigilChar, label, level);
      return;
    }
    let allHidden = true;
    for (let line = lineStart; line <= lineEnd; line++) {
      if (!isLineHidden(plan.hiddenLineRanges, line)) {
        allHidden = false;
        break;
      }
    }
    if (allHidden) {
      el.addClass("vo-hidden");
      return;
    }
    const doc = el.ownerDocument;
    const segments = splitByLineBreak(inlineHost(el));
    if (segments.length !== lineEnd - lineStart + 1) {
      for (let line = lineStart; line <= lineEnd; line++) {
        if (isLineHidden(plan.hiddenLineRanges, line)) continue;
        const indent = plan.indentLevel.get(line);
        const entryLvl = plan.entryLevel.get(line);
        if (indent === void 0 && entryLvl === void 0) continue;
        for (const cls of levelClasses(indent, entryLvl)) el.addClass(cls);
        break;
      }
      return;
    }
    const lines = body.split("\n");
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;
      const line = lineStart + i;
      const hidden = isLineHidden(plan.hiddenLineRanges, line);
      if (segment.nodes.length === 0) {
        if (hidden) (_b = segment.br) == null ? void 0 : _b.remove();
        continue;
      }
      const classes = hidden ? ["vo-hidden"] : ["vo-line", ...levelClasses(plan.indentLevel.get(line), plan.entryLevel.get(line))];
      const wrapper = blockWrapSegment(segment, classes, doc);
      if (!wrapper || hidden) continue;
      const label = plan.labels.get(line);
      if (label === void 0) continue;
      const lineText = lines[line];
      if (lineText === void 0) continue;
      const level = (_c = plan.entryLevel.get(line)) != null ? _c : 1;
      materializeLabelIn(Array.from(wrapper.childNodes), lineText, sigilChar, label, level, doc);
    }
  };
}

// src/settingsTab.ts
var import_obsidian2 = require("obsidian");
var LABEL_STYLE_OPTIONS = {
  "1": "1, 2, 3",
  "1.0": "N.0 (1.0, 2.0, 3.0)",
  "1.1": "Dotted path (1.2.1)",
  I: "I, II, III",
  i: "i, ii, iii",
  A: "A, B, C",
  a: "a, b, c",
  bullet: "Bullet (\u2022)",
  none: "None"
};
var VIEW_STATE_OPTIONS = {
  outline: "Outline only",
  body: "Body only",
  both: "Both"
};
var VirtualOutlinerSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("Depth sigil").setDesc(
      'The character repeated at line start to mark an outline entry (e.g. "@@ text" is a level-2 entry). Exactly one character.'
    ).addText((text) => {
      text.setValue(this.plugin.settings.sigil).onChange(async (value) => {
        const char = value.trim();
        if (char.length !== 1 || /\s/.test(char)) return;
        this.plugin.settings.sigil = char;
        await this.plugin.saveSettings();
        this.display();
      });
      text.inputEl.maxLength = 1;
    });
    if (isRiskySigil(this.plugin.settings.sigil)) {
      containerEl.createEl("p", {
        cls: "vo-fixture-note",
        text: `"${this.plugin.settings.sigil}" already opens a markdown block construct (heading, list, quote, \u2026) at line start and may collide with it.`
      });
    }
    new import_obsidian2.Setting(containerEl).setName("Default view state").setDesc("The view a note opens in when it has no view state recorded yet.").addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(VIEW_STATE_OPTIONS)) dropdown.addOption(value, label);
      dropdown.setValue(this.plugin.settings.defaultViewState).onChange(async (value) => {
        this.plugin.settings.defaultViewState = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Indent body under its outline level").setDesc("Visual only \u2014 the file itself is never re-indented.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.indentBody).onChange(async (value) => {
        this.plugin.settings.indentBody = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Level format").setHeading();
    containerEl.createEl("p", {
      cls: "vo-fixture-note",
      text: `Composite labels join one segment per level (e.g. "I.B.3") \u2014 each level below controls its own segment's style, separator, and typography. Click a level to open it.`
    });
    for (let level = 1; level <= MAX_LEVEL; level++) {
      this.renderLevelSetting(containerEl, level);
    }
    new import_obsidian2.Setting(containerEl).setName("Metadata fields").setHeading();
    containerEl.createEl("p", {
      cls: "vo-fixture-note",
      text: "Per-node fields (status, note, \u2026) exposed to Dataview/Datacore and stored in the end-of-file %%md-outline block."
    });
    this.renderMetaFields(containerEl);
  }
  // One collapsible block per level, one NAMED row per property. The
  // previous layout packed all nine controls into a single unlabelled row,
  // where an unlabelled toggle sat between a colour swatch and a text box
  // with nothing to say it meant "italic" — easy to flip by accident and
  // impossible to identify afterwards.
  renderLevelSetting(containerEl, level) {
    const format = this.plugin.settings.levels[level - 1];
    if (!format) return;
    const details = containerEl.createEl("details", { cls: "vo-level-details" });
    details.createEl("summary", { cls: "vo-level-summary", text: `Level ${level}` });
    new import_obsidian2.Setting(details).setName("Number style").setDesc("How this level's own segment of the composite label is numbered.").addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(LABEL_STYLE_OPTIONS)) dropdown.addOption(value, label);
      dropdown.setValue(format.style).onChange(async (value) => {
        format.style = value;
        await this.plugin.saveSettings();
      });
    });
    this.addTextRow(
      details,
      "Separator",
      `Placed before this level's segment when a level above it already contributed one (e.g. "." gives 2.1).`,
      format.separator,
      async (value) => {
        format.separator = value;
      }
    );
    new import_obsidian2.Setting(details).setName("Italic").setDesc("Renders this level's number and entry text in italics.").addToggle((toggle) => {
      toggle.setValue(format.italic);
      toggle.onChange(async (value) => {
        format.italic = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(details).setName("Colour").setDesc("Colour of this level's number and entry text.").addColorPicker((picker) => {
      if (format.color !== "") picker.setValue(format.color);
      picker.onChange(async (value) => {
        format.color = value;
        await this.plugin.saveSettings();
      });
    }).addExtraButton((button) => {
      button.setIcon("rotate-ccw").setTooltip("Use the theme colour").onClick(async () => {
        format.color = "";
        await this.plugin.saveSettings();
        this.display();
      });
    });
    this.addTextRow(
      details,
      "Font size",
      "Any CSS length (e.g. 1.2em). Blank inherits the note's font size.",
      format.fontSize,
      async (value) => {
        format.fontSize = value;
      }
    );
    this.addTextRow(
      details,
      "Font weight",
      "A CSS weight (e.g. 600, bold). Blank inherits.",
      format.fontWeight,
      async (value) => {
        format.fontWeight = value;
      }
    );
    this.addTextRow(details, "Font family", "A CSS font family. Blank inherits.", format.fontFamily, async (value) => {
      format.fontFamily = value;
    });
    this.addTextRow(
      details,
      "Indent step",
      level === 1 ? "A CSS length. Level 1 sets the whole outline's base offset from the left margin \u2014 0 keeps it flush." : "A CSS length: how much further right this level sits than the level above it.",
      format.indentStep,
      async (value) => {
        format.indentStep = value;
      }
    );
    this.addTextRow(
      details,
      "Space above",
      "A CSS length added above each entry at this level.",
      format.spacing,
      async (value) => {
        format.spacing = value;
      }
    );
    this.addTextRow(
      details,
      "Label gap",
      "A CSS length between the number and the entry text.",
      format.labelGap,
      async (value) => {
        format.labelGap = value;
      }
    );
  }
  addTextRow(containerEl, name, desc, value, apply) {
    new import_obsidian2.Setting(containerEl).setName(name).setDesc(desc).addText((text) => {
      text.setValue(value);
      text.onChange(async (next) => {
        await apply(next);
        await this.plugin.saveSettings();
      });
    });
  }
  renderMetaFields(containerEl) {
    const fields = this.plugin.settings.metaFields;
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field) continue;
      const setting = new import_obsidian2.Setting(containerEl).setName(`Field ${i + 1}`);
      setting.addText((text) => {
        text.setPlaceholder("Name").setValue(field.name);
        text.onChange(async (value) => {
          field.name = value;
          await this.plugin.saveSettings();
        });
      });
      setting.addDropdown((dropdown) => {
        dropdown.addOption("text", "Text");
        dropdown.addOption("select", "Select");
        dropdown.setValue(field.type).onChange(async (value) => {
          field.type = value === "select" ? "select" : "text";
          await this.plugin.saveSettings();
          this.display();
        });
      });
      if (field.type === "select") {
        setting.addText((text) => {
          text.setPlaceholder("Options, comma-separated").setValue(field.options.join(", "));
          text.onChange(async (value) => {
            field.options = value.split(",").map((o) => o.trim()).filter((o) => o !== "");
            await this.plugin.saveSettings();
          });
        });
      }
      setting.addExtraButton((button) => {
        button.setIcon("trash").setTooltip("Remove field").onClick(async () => {
          fields.splice(i, 1);
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }
    new import_obsidian2.Setting(containerEl).addButton((button) => {
      button.setButtonText("Add field").onClick(async () => {
        fields.push({ name: `Field ${fields.length + 1}`, type: "text", options: [] });
        await this.plugin.saveSettings();
        this.display();
      });
    });
  }
};

// src/ui/sidebar.ts
var import_obsidian3 = require("obsidian");
var SIDEBAR_VIEW_TYPE = "virtual-outliner-sidebar";
var OutlineSidebarView = class extends import_obsidian3.ItemView {
  constructor(leaf, host) {
    super(leaf);
    this.host = host;
    this.unsubscribe = null;
    this.searchQuery = "";
  }
  getViewType() {
    return SIDEBAR_VIEW_TYPE;
  }
  getDisplayText() {
    return "Outline (virtual)";
  }
  getIcon() {
    return "list-tree";
  }
  onOpen() {
    this.unsubscribe = this.host.onStateChange(() => this.render());
    this.render();
    return Promise.resolve();
  }
  onClose() {
    var _a;
    (_a = this.unsubscribe) == null ? void 0 : _a.call(this);
    this.unsubscribe = null;
    return Promise.resolve();
  }
  matchingAncestry(parsed, query) {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return null;
    const keep = /* @__PURE__ */ new Set();
    for (const node of parsed.flat) {
      if (!node.text.toLowerCase().includes(trimmed)) continue;
      let cur = node;
      while (cur) {
        keep.add(cur);
        cur = cur.parent;
      }
    }
    return keep;
  }
  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass("vo-sidebar");
    const searchWrap = root.createDiv({ cls: "vo-sidebar-search" });
    const input = searchWrap.createEl("input", { type: "search", placeholder: "Search outline\u2026" });
    input.value = this.searchQuery;
    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      this.render();
    });
    const toolbar = root.createDiv({ cls: "vo-sidebar-toolbar" });
    const foldAllBtn = toolbar.createEl("button", { text: "Fold all" });
    foldAllBtn.addEventListener("click", () => {
      const path2 = this.host.activeOutlinePath();
      if (path2) this.host.collapseAll(path2);
    });
    const expandAllBtn = toolbar.createEl("button", { text: "Expand all" });
    expandAllBtn.addEventListener("click", () => {
      const path2 = this.host.activeOutlinePath();
      if (path2) this.host.expandAll(path2);
    });
    const treeEl = root.createDiv({ cls: "vo-sidebar-tree" });
    const path = this.host.activeOutlinePath();
    const parsed = path ? this.host.getParsed(path) : null;
    if (!path || !parsed || parsed.roots.length === 0) {
      treeEl.createDiv({
        cls: "vo-sidebar-empty",
        text: path ? "No outline entries in this note." : "Open a note to see its outline."
      });
      return;
    }
    const levels = this.host.levels(path);
    const matches = this.matchingAncestry(parsed, this.searchQuery);
    const trimmedQuery = this.searchQuery.trim().toLowerCase();
    for (const node of parsed.roots) {
      this.renderNode(treeEl, path, node, levels, matches, trimmedQuery);
    }
  }
  renderNode(container, path, node, levels, matches, trimmedQuery) {
    if (matches && !matches.has(node)) return;
    const row = container.createDiv({ cls: "vo-node" });
    if (trimmedQuery !== "" && node.text.toLowerCase().includes(trimmedQuery)) {
      row.addClass("vo-node-match");
    }
    const hasChildren = node.children.length > 0;
    const hasOwnBody = node.ownBodyStart < node.ownBodyEnd;
    const canToggle = hasChildren || hasOwnBody;
    const collapsed = node.id !== null && this.host.isCollapsed(path, node.id);
    const toggle = row.createDiv({ cls: `vo-node-toggle${canToggle ? "" : " vo-node-toggle-empty"}` });
    if (canToggle) {
      (0, import_obsidian3.setIcon)(toggle, collapsed ? "chevron-right" : "chevron-down");
      toggle.addEventListener("click", (evt) => {
        evt.stopPropagation();
        this.host.toggleCollapsed(path, node);
      });
    }
    row.createSpan({ cls: "vo-node-label", text: computeLabel(levels, node) });
    row.createSpan({ cls: "vo-node-text", text: node.text === "" ? "(empty)" : node.text });
    row.addEventListener("click", () => this.host.jumpToNode(path, node));
    if (hasChildren) {
      const expanded = matches !== null || !collapsed;
      const childrenEl = container.createDiv({
        cls: `vo-node-children${expanded ? "" : " vo-collapsed"}`
      });
      for (const child of node.children) {
        this.renderNode(childrenEl, path, child, levels, matches, trimmedQuery);
      }
    }
  }
};

// src/main.ts
function normalizeFileStateEntry(v, fallback) {
  if (v === null || typeof v !== "object") return { viewState: fallback, collapsedIds: [] };
  const rec = v;
  const viewState = rec.viewState === "outline" || rec.viewState === "body" || rec.viewState === "both" ? rec.viewState : fallback;
  const collapsedIds = Array.isArray(rec.collapsedIds) ? rec.collapsedIds.filter((id) => typeof id === "string") : [];
  return { viewState, collapsedIds };
}
var RESOLVE_DEBOUNCE_MS = 200;
var VirtualOutlinerPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = normalizeSettings(null);
    this.states = /* @__PURE__ */ new Map();
    this.fileState = /* @__PURE__ */ new Map();
    this.editors = /* @__PURE__ */ new Set();
    this.editorTimers = /* @__PURE__ */ new Map();
    this.diskTimers = /* @__PURE__ */ new Map();
    this.changeListeners = /* @__PURE__ */ new Set();
    this.cssVarStyleEl = null;
  }
  async onload() {
    const raw = await this.loadData();
    this.settings = normalizeSettings(raw);
    this.loadFileState(raw);
    this.api = createApi(
      this.app.vault,
      () => this.settings.sigil,
      () => this.settings.levels
    );
    this.applyLevelCssVars();
    this.registerEditorExtension([
      buildOutlineKeymap({ sigilChar: () => this.settings.sigil }),
      buildEditorExtension({
        attachEditor: (view) => this.editors.add(view),
        detachEditor: (view) => {
          this.editors.delete(view);
          const timer = this.editorTimers.get(view);
          if (timer !== void 0) {
            window.clearTimeout(timer);
            this.editorTimers.delete(view);
          }
        },
        scheduleEditorResolve: (view, delayMs) => this.scheduleEditorResolve(view, delayMs)
      })
    ]);
    this.registerMarkdownPostProcessor(
      createReadingPostProcessor({
        sigilChar: () => this.settings.sigil,
        levels: () => this.settings.levels,
        viewState: (path) => this.viewStateFor(path),
        collapsedIds: (path) => this.collapsedIdsFor(path),
        indentBody: () => this.settings.indentBody
      })
    );
    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new OutlineSidebarView(leaf, this.sidebarHost()));
    this.addSettingTab(new VirtualOutlinerSettingTab(this.app, this));
    this.addRibbonIcon("list-tree", "Open outline sidebar", () => void this.activateSidebar());
    this.addCommand({
      id: "open-sidebar",
      name: "Open outline sidebar",
      callback: () => void this.activateSidebar()
    });
    const viewStateCommand = (id, name, viewState) => {
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          const file = this.activeMarkdownFile();
          if (!file) return false;
          if (checking) return true;
          this.setViewState(file.path, viewState);
          return true;
        }
      });
    };
    viewStateCommand("view-outline-only", "Show outline only", "outline");
    viewStateCommand("view-body-only", "Show body only", "body");
    viewStateCommand("view-both", "Show outline and body", "both");
    this.addCommand({
      id: "generate-filtered-copy",
      name: "Generate filtered copy",
      checkCallback: (checking) => {
        const file = this.activeMarkdownFile();
        if (!file) return false;
        if (checking) return true;
        void this.generateFilteredCopyFor(file);
        return true;
      }
    });
    this.addCommand({
      id: "prune-orphaned-metadata",
      name: "Prune orphaned outline metadata",
      editorCallback: (_editor, ctx) => {
        var _a;
        const path = (_a = ctx.file) == null ? void 0 : _a.path;
        const view = path !== void 0 ? this.editorFor(path) : null;
        if (!view || path === void 0) return;
        this.pruneOrphanedIn(view, path);
      }
    });
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!this.states.has(file.path)) return;
        this.scheduleDiskRefresh(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const state = this.states.get(oldPath);
        this.states.delete(oldPath);
        if (state) this.states.set(file.path, state);
        const fs = this.fileState.get(oldPath);
        this.fileState.delete(oldPath);
        if (fs) this.fileState.set(file.path, fs);
        this.notifyChange();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.states.delete(file.path);
        this.fileState.delete(file.path);
        this.notifyChange();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file && file.extension === "md") void this.ensureFileState(file.path);
        this.notifyChange();
      })
    );
    this.app.workspace.onLayoutReady(() => {
      const file = this.app.workspace.getActiveFile();
      if (file && file.extension === "md") void this.ensureFileState(file.path);
    });
  }
  onunload() {
    var _a;
    for (const timer of this.editorTimers.values()) window.clearTimeout(timer);
    this.editorTimers.clear();
    for (const timer of this.diskTimers.values()) window.clearTimeout(timer);
    this.diskTimers.clear();
    (_a = this.cssVarStyleEl) == null ? void 0 : _a.remove();
    this.cssVarStyleEl = null;
  }
  async saveSettings() {
    await this.persist();
    this.applyLevelCssVars();
    for (const view of this.editors) this.decorate(view);
    this.rerenderPreviews(null);
    this.notifyChange();
  }
  // Reading view is a one-shot post-processor render, so anything that
  // changes what it should draw (settings, view state, a collapse) has to
  // ask Obsidian to run it again — the editor's decoration path has no
  // equivalent effect on it. `path === null` means every open preview.
  rerenderPreviews(path) {
    var _a;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian4.MarkdownView)) continue;
      if (view.getMode() !== "preview") continue;
      if (path !== null && ((_a = view.file) == null ? void 0 : _a.path) !== path) continue;
      view.previewMode.rerender(true);
    }
  }
  async persist() {
    const fileState = {};
    for (const [path, fs] of this.fileState) {
      fileState[path] = { viewState: fs.viewState, collapsedIds: [...fs.collapsedIds] };
    }
    await this.saveData({ ...this.settings, fileState });
  }
  loadFileState(raw) {
    if (raw === null || typeof raw !== "object") return;
    const rec = raw;
    if (rec.fileState === null || typeof rec.fileState !== "object") return;
    for (const [path, value] of Object.entries(rec.fileState)) {
      const entry = normalizeFileStateEntry(value, this.settings.defaultViewState);
      this.fileState.set(path, { viewState: entry.viewState, collapsedIds: new Set(entry.collapsedIds) });
    }
  }
  // A <style> element rather than `body.setCssProps` (Decision superseded —
  // see core/settings.ts levelCssVars doc comment): Obsidian periodically
  // rewrites `document.body.style.cssText` wholesale from its own
  // appearance settings (zoom, font overrides, indent-size), which silently
  // drops any custom property a plugin added via setCssProps on body. A
  // dedicated stylesheet is never touched by that rewrite.
  applyLevelCssVars() {
    const vars = levelCssVars(this.settings.levels);
    const body = Object.entries(vars).map(([key, value]) => `	${key}: ${value};`).join("\n");
    if (!this.cssVarStyleEl) {
      this.cssVarStyleEl = activeDocument.createElement("style");
      this.cssVarStyleEl.id = "virtual-outliner-level-vars";
      activeDocument.head.appendChild(this.cssVarStyleEl);
    }
    this.cssVarStyleEl.textContent = `:root {
${body}
}`;
  }
  // ── Per-file view/collapse state ─────────────────────────────────────────
  viewStateFor(path) {
    var _a, _b;
    return (_b = (_a = this.fileState.get(path)) == null ? void 0 : _a.viewState) != null ? _b : this.settings.defaultViewState;
  }
  collapsedIdsFor(path) {
    var _a, _b;
    return (_b = (_a = this.fileState.get(path)) == null ? void 0 : _a.collapsedIds) != null ? _b : /* @__PURE__ */ new Set();
  }
  fileStateEntry(path) {
    let entry = this.fileState.get(path);
    if (!entry) {
      entry = { viewState: this.settings.defaultViewState, collapsedIds: /* @__PURE__ */ new Set() };
      this.fileState.set(path, entry);
    }
    return entry;
  }
  setViewState(path, viewState) {
    this.fileStateEntry(path).viewState = viewState;
    void this.persist();
    this.decorateAllFor(path);
    this.notifyChange();
  }
  flipCollapse(path, id) {
    const entry = this.fileStateEntry(path);
    if (entry.collapsedIds.has(id)) entry.collapsedIds.delete(id);
    else entry.collapsedIds.add(id);
    void this.persist();
    this.decorateAllFor(path);
    this.notifyChange();
  }
  toggleCollapsed(path, node) {
    var _a, _b;
    if (node.id !== null) {
      this.flipCollapse(path, node.id);
      return;
    }
    const view = this.editorFor(path);
    if (!view) {
      new import_obsidian4.Notice("Open this note to collapse an entry that doesn't have a stable ID yet.");
      return;
    }
    const doc = view.state.doc.toString();
    const { body } = parseMetaDocument(doc);
    const lines = body.split("\n");
    const lineText = (_a = lines[node.entryLine]) != null ? _a : "";
    const offsets = lineStartOffsets(lines);
    const lineStart = (_b = offsets[node.entryLine]) != null ? _b : 0;
    const lineEnd = lineStart + lineText.length;
    const id = mintId(Date.now(), Math.random());
    const withId = appendId("", id);
    view.dispatch({ changes: { from: lineEnd, to: lineEnd, insert: withId } });
    this.flipCollapse(path, id);
  }
  collapseAll(path) {
    var _a, _b;
    const state = this.states.get(path);
    if (!state) return;
    const entry = this.fileStateEntry(path);
    const eligible = state.parsed.flat.filter((n) => n.children.length > 0 || n.ownBodyStart < n.ownBodyEnd);
    const view = this.editorFor(path);
    let missingIdSkipped = false;
    if (view) {
      const doc = view.state.doc.toString();
      const { body } = parseMetaDocument(doc);
      const lines = body.split("\n");
      const offsets = lineStartOffsets(lines);
      const changes = [];
      const mintedIds = [];
      for (const node of eligible) {
        if (node.id !== null) {
          entry.collapsedIds.add(node.id);
          continue;
        }
        const lineText = (_a = lines[node.entryLine]) != null ? _a : "";
        const lineStart = (_b = offsets[node.entryLine]) != null ? _b : 0;
        const lineEnd = lineStart + lineText.length;
        const id = mintId(Date.now(), Math.random());
        changes.push({ from: lineEnd, to: lineEnd, insert: appendId("", id) });
        mintedIds.push(id);
      }
      if (changes.length > 0) view.dispatch({ changes });
      for (const id of mintedIds) entry.collapsedIds.add(id);
    } else {
      for (const node of eligible) {
        if (node.id !== null) entry.collapsedIds.add(node.id);
        else missingIdSkipped = true;
      }
    }
    void this.persist();
    this.decorateAllFor(path);
    this.notifyChange();
    if (missingIdSkipped) new import_obsidian4.Notice("Open this note to fold every entry \u2014 some don't have a stable ID yet.");
  }
  expandAll(path) {
    this.fileStateEntry(path).collapsedIds.clear();
    void this.persist();
    this.decorateAllFor(path);
    this.notifyChange();
  }
  // ── Per-file parse/decoration state ──────────────────────────────────────
  async ensureFileState(path) {
    const cached = this.states.get(path);
    if (cached) return cached;
    const file = this.app.vault.getFileByPath(path);
    if (!file || file.extension !== "md") return null;
    const doc = await this.app.vault.cachedRead(file);
    return this.setStateFromDoc(path, doc);
  }
  setStateFromDoc(path, doc) {
    const { body } = parseMetaDocument(doc);
    const parsed = parseOutline(body, this.settings.sigil);
    const entry = this.fileStateEntry(path);
    const state = {
      body,
      parsed,
      viewState: entry.viewState,
      collapsedIds: entry.collapsedIds
    };
    this.states.set(path, state);
    this.notifyChange();
    return state;
  }
  scheduleDiskRefresh(path) {
    const existing = this.diskTimers.get(path);
    if (existing !== void 0) window.clearTimeout(existing);
    this.diskTimers.set(
      path,
      window.setTimeout(() => {
        this.diskTimers.delete(path);
        if (this.editorFor(path)) return;
        void (async () => {
          const file = this.app.vault.getFileByPath(path);
          if (!file) return;
          const doc = await this.app.vault.cachedRead(file);
          this.setStateFromDoc(path, doc);
        })();
      }, 400)
    );
  }
  // ── Editor attachment / decoration ───────────────────────────────────────
  scheduleEditorResolve(view, delayMs) {
    const existing = this.editorTimers.get(view);
    if (existing !== void 0) window.clearTimeout(existing);
    this.editorTimers.set(
      view,
      window.setTimeout(() => {
        this.editorTimers.delete(view);
        this.resolveEditor(view);
      }, delayMs || RESOLVE_DEBOUNCE_MS)
    );
  }
  resolveEditor(view) {
    const path = editorViewPath(view);
    if (path === null) return;
    this.setStateFromDoc(path, view.state.doc.toString());
    this.decorate(view);
  }
  editorFor(path) {
    for (const view of this.editors) {
      if (editorViewPath(view) === path) return view;
    }
    return null;
  }
  decorate(view) {
    const path = editorViewPath(view);
    if (path === null) return;
    const state = this.states.get(path);
    if (!state) return;
    const plan = computeRenderPlan(
      state.body,
      this.settings.sigil,
      this.settings.levels,
      state.viewState,
      state.collapsedIds,
      this.settings.indentBody
    );
    const decorations = buildOutlineDecorations(view, plan, this.settings.sigil);
    view.dispatch({ effects: setOutlineDecorations.of(decorations) });
  }
  decorateAllFor(path) {
    const state = this.states.get(path);
    if (state) {
      const entry = this.fileStateEntry(path);
      state.viewState = entry.viewState;
      state.collapsedIds = entry.collapsedIds;
    }
    for (const view of this.editors) {
      if (editorViewPath(view) === path) this.decorate(view);
    }
    this.rerenderPreviews(path);
  }
  // ── Commands ──────────────────────────────────────────────────────────────
  async generateFilteredCopyFor(file) {
    const doc = await this.app.vault.cachedRead(file);
    const path = file.path;
    const viewState = this.viewStateFor(path);
    const collapsedIds = this.collapsedIdsFor(path);
    const filtered = generateFilteredCopy(doc, this.settings.sigil, this.settings.levels, viewState, collapsedIds);
    const base = file.basename;
    const dir = file.parent ? file.parent.path : "";
    let target = `${dir ? dir + "/" : ""}${base} (filtered).md`;
    let n = 2;
    while (this.app.vault.getAbstractFileByPath(target)) {
      target = `${dir ? dir + "/" : ""}${base} (filtered ${n}).md`;
      n++;
    }
    const created = await this.app.vault.create(target, filtered);
    await this.app.workspace.getLeaf(true).openFile(created);
    new import_obsidian4.Notice(`Generated ${target}`);
  }
  pruneOrphanedIn(view, path) {
    const doc = view.state.doc.toString();
    const { body } = parseMetaDocument(doc);
    const parsed = parseOutline(body, this.settings.sigil);
    const liveIds = /* @__PURE__ */ new Set();
    for (const node of parsed.flat) if (node.id !== null) liveIds.add(node.id);
    const result = pruneOrphaned(doc, liveIds);
    if (result.removedIds.length === 0) {
      new import_obsidian4.Notice("Virtual Outliner: nothing to prune.");
      return;
    }
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result.doc } });
    new import_obsidian4.Notice(`Virtual Outliner: pruned ${result.removedIds.length} orphaned record(s).`);
  }
  // ── Sidebar ───────────────────────────────────────────────────────────────
  sidebarHost() {
    return {
      activeOutlinePath: () => {
        const file = this.app.workspace.getActiveFile();
        return file && file.extension === "md" ? file.path : null;
      },
      getParsed: (path) => {
        var _a, _b;
        return (_b = (_a = this.states.get(path)) == null ? void 0 : _a.parsed) != null ? _b : null;
      },
      levels: () => this.settings.levels,
      isCollapsed: (path, id) => this.collapsedIdsFor(path).has(id),
      toggleCollapsed: (path, node) => this.toggleCollapsed(path, node),
      collapseAll: (path) => this.collapseAll(path),
      expandAll: (path) => this.expandAll(path),
      jumpToNode: (path, node) => void this.jumpToNode(path, node),
      onStateChange: (listener) => this.onStateChange(listener)
    };
  }
  async jumpToNode(path, node) {
    var _a, _b;
    let view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    if (!view || ((_a = view.file) == null ? void 0 : _a.path) !== path) {
      await this.app.workspace.openLinkText(path, "", false);
      view = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    }
    if (!view || ((_b = view.file) == null ? void 0 : _b.path) !== path) return;
    const targetLine = node.ownBodyStart < node.ownBodyEnd ? node.ownBodyStart : node.entryLine;
    const pos = { line: targetLine, ch: 0 };
    view.editor.setCursor(pos);
    view.editor.scrollIntoView({ from: pos, to: pos }, true);
  }
  async activateSidebar() {
    const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  activeMarkdownFile() {
    const file = this.app.workspace.getActiveFile();
    return file && file.extension === "md" ? file : null;
  }
  // ── Change notification (sidebar refresh) ────────────────────────────────
  onStateChange(listener) {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }
  notifyChange() {
    for (const listener of this.changeListeners) listener();
  }
};
