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
var import_obsidian5 = require("obsidian");

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
function rejoinChunks(body, from, to, chunks) {
  var _a;
  const withBreaks = chunks.filter((c) => c !== "").map((c) => c.endsWith("\n") ? c : c + "\n");
  const last = withBreaks.length - 1;
  const originalHadBreak = body.slice(from, to).endsWith("\n");
  if (last >= 0 && !originalHadBreak) withBreaks[last] = ((_a = withBreaks[last]) != null ? _a : "").slice(0, -1);
  return withBreaks;
}
function ownerNodeAtLine(body, line, sigilChar = DEFAULT_SIGIL_CHAR) {
  const parsed = parseOutline(body, sigilChar);
  let owner = null;
  for (const node of parsed.flat) {
    if (node.entryLine > line) break;
    owner = node;
  }
  return owner;
}
function moveUp(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node = nodeAtLine(parsed, entryLine);
  if (!node) return null;
  const nodeRange = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
  const nodeText = body.slice(nodeRange.from, nodeRange.to);
  const prev = previousSibling(parsed, node);
  if (prev) {
    const prevRange = sliceRange(lines, prev.subtreeStart, prev.subtreeEnd);
    const prevText = body.slice(prevRange.from, prevRange.to);
    const chunks2 = rejoinChunks(body, prevRange.from, nodeRange.to, [nodeText, prevText]);
    return { from: prevRange.from, to: nodeRange.to, insert: chunks2.join(""), movedTo: prevRange.from };
  }
  const parent = node.parent;
  if (!parent || !previousSibling(parsed, parent)) return null;
  const headRange = sliceRange(lines, parent.entryLine, node.subtreeStart);
  const headText = body.slice(headRange.from, headRange.to);
  const chunks = rejoinChunks(body, headRange.from, nodeRange.to, [nodeText, headText]);
  return { from: headRange.from, to: nodeRange.to, insert: chunks.join(""), movedTo: headRange.from };
}
function moveDown(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  var _a, _b;
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node = nodeAtLine(parsed, entryLine);
  if (!node) return null;
  const nodeRange = sliceRange(lines, node.subtreeStart, node.subtreeEnd);
  const nodeText = body.slice(nodeRange.from, nodeRange.to);
  const next = nextSibling(parsed, node);
  if (next) {
    const nextRange = sliceRange(lines, next.subtreeStart, next.subtreeEnd);
    const nextText = body.slice(nextRange.from, nextRange.to);
    const chunks2 = rejoinChunks(body, nodeRange.from, nextRange.to, [nextText, nodeText]);
    return {
      from: nodeRange.from,
      to: nextRange.to,
      insert: chunks2.join(""),
      movedTo: nodeRange.from + ((_a = chunks2[0]) != null ? _a : "").length
    };
  }
  const parent = node.parent;
  const parentNext = parent ? nextSibling(parsed, parent) : null;
  if (!parentNext) return null;
  const headRange = sliceRange(lines, node.subtreeEnd, parentNext.ownBodyEnd);
  const headText = body.slice(headRange.from, headRange.to);
  const chunks = rejoinChunks(body, nodeRange.from, headRange.to, [headText, nodeText]);
  return {
    from: nodeRange.from,
    to: headRange.to,
    insert: chunks.join(""),
    movedTo: nodeRange.from + ((_b = chunks[0]) != null ? _b : "").length
  };
}
function addSibling(body, entryLine, cursorCol, sigilChar = DEFAULT_SIGIL_CHAR, behavior = "section") {
  var _a, _b, _c, _d, _e;
  const lines = body.split("\n");
  const line = lines[entryLine];
  if (line === void 0) return null;
  const match = outlineLineRegex(sigilChar).exec(line);
  if (!match) return null;
  const sigils = (_a = match[1]) != null ? _a : "";
  const rest = (_b = match[2]) != null ? _b : "";
  const { text } = splitEntryId(rest);
  const prefixEnd = line.length - rest.length;
  const idMatch = ID_SUFFIX_RE.exec(line);
  const visibleEnd = idMatch ? idMatch.index : line.length;
  const newEntry = sigils + " ";
  const offsets = lineStartOffsets(lines);
  const lineStart = (_c = offsets[entryLine]) != null ? _c : 0;
  const lineEnd = lineStart + line.length;
  if (text.trim() === "") {
    return { from: lineStart, to: lineEnd, insert: "", cursor: lineStart };
  }
  const col = Math.max(cursorCol, prefixEnd);
  const atVisibleEnd = col >= visibleEnd || line.slice(col, visibleEnd).trim() === "";
  if (!atVisibleEnd) {
    if (line.slice(prefixEnd, col).trim() === "") {
      const insert3 = newEntry + "\n";
      return { from: lineStart, to: lineStart, insert: insert3, cursor: lineStart + insert3.length + prefixEnd };
    }
    const head = line.slice(0, col).trimEnd() + line.slice(visibleEnd);
    const insert2 = head + "\n" + newEntry + line.slice(col, visibleEnd).trimStart();
    return { from: lineStart, to: lineEnd, insert: insert2, cursor: lineStart + head.length + 1 + newEntry.length };
  }
  if (behavior === "line") {
    const insert2 = "\n" + newEntry;
    return { from: lineEnd, to: lineEnd, insert: insert2, cursor: lineEnd + insert2.length };
  }
  const parsed = parseOutline(body, sigilChar);
  const node = nodeAtLine(parsed, entryLine);
  if (!node) return null;
  let lastLine = node.subtreeEnd - 1;
  while (lastLine > entryLine && ((_d = lines[lastLine]) != null ? _d : "").trim() === "") lastLine--;
  if (lastLine + 1 < lines.length) {
    const insertAt = (_e = offsets[lastLine + 1]) != null ? _e : body.length;
    return { from: insertAt, to: insertAt, insert: newEntry + "\n", cursor: insertAt + newEntry.length };
  }
  const insert = "\n" + newEntry;
  return { from: body.length, to: body.length, insert, cursor: body.length + insert.length };
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
  var _a;
  const parsed = parseOutline(body, sigilChar);
  const lines = body.split("\n");
  const collapseRanges = [];
  for (const node of parsed.flat) {
    if (node.id !== null && collapsedIds.has(node.id) && node.subtreeEnd > node.entryLine + 1) {
      collapseRanges.push({ from: node.entryLine + 1, to: node.subtreeEnd });
    }
  }
  const viewStateRanges = [];
  if (viewState === "outline") {
    let runStart = null;
    for (let i = 0; i < parsed.lineCount; i++) {
      if (isOutlineLine((_a = lines[i]) != null ? _a : "", sigilChar)) {
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
  const bodyIndentLevel = /* @__PURE__ */ new Map();
  const bodyOwnerLine = /* @__PURE__ */ new Map();
  const foldable = /* @__PURE__ */ new Map();
  const showLabels = viewState === "outline" || viewState === "both";
  for (const node of parsed.flat) {
    if (isLineHidden(hiddenLineRanges, node.entryLine)) continue;
    entryLevel2.set(node.entryLine, node.level);
    if (showLabels) labels.set(node.entryLine, computeLabel(levels, node));
    indentLevel.set(node.entryLine, node.level);
    if (hasFoldableContent(lines, node)) {
      foldable.set(node.entryLine, node.id !== null && collapsedIds.has(node.id));
    }
  }
  if (indentBody) {
    for (const node of parsed.flat) {
      for (let line = node.ownBodyStart; line < node.ownBodyEnd; line++) {
        if (isLineHidden(hiddenLineRanges, line)) continue;
        bodyIndentLevel.set(line, node.level);
        bodyOwnerLine.set(line, node.entryLine);
      }
    }
  }
  return { parsed, labels, indentLevel, bodyIndentLevel, bodyOwnerLine, entryLevel: entryLevel2, foldable, hiddenLineRanges };
}
function hasFoldableContent(lines, node) {
  var _a;
  for (let i = node.entryLine + 1; i < node.subtreeEnd; i++) {
    if (((_a = lines[i]) != null ? _a : "").trim() !== "") return true;
  }
  return false;
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
function colorOption(color = "") {
  return { enabled: color !== "", color };
}
function makeToolbarHighlight(onLight = "#fff3a3", onDark = "#7a6f1f") {
  return {
    toolbarUuid: "",
    itemUuid: "",
    on: { light: colorOption(onLight), dark: colorOption(onDark) },
    off: { light: colorOption(), dark: colorOption() }
  };
}
function defaultToolbarHighlights() {
  return {
    sidebar: makeToolbarHighlight(),
    indentBody: makeToolbarHighlight(),
    enterBehavior: makeToolbarHighlight()
  };
}
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
    enterBehavior: "section",
    levels,
    metaFields: defaultMetaFields(),
    toolbarHighlights: defaultToolbarHighlights()
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
    // Level 1's indent step is never exposed in the settings UI (it's the
    // outline's flush-left base offset, not a per-level user control), so
    // unlike every other field it is NOT read from persisted data — this
    // also self-heals data.json files saved before flush-left became the
    // fixed behavior.
    indentStep: level === 1 ? fallback.indentStep : readString(v.indentStep, fallback.indentStep),
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
function readColorOption(v) {
  if (!isRecord2(v)) return colorOption();
  return { enabled: v.enabled === true, color: readString(v.color, "") };
}
function readThemedColorOption(v, fallback) {
  if (!isRecord2(v)) return fallback;
  return { light: readColorOption(v.light), dark: readColorOption(v.dark) };
}
function readToolbarHighlight(v, fallback) {
  if (!isRecord2(v)) return fallback;
  return {
    toolbarUuid: readString(v.toolbarUuid, ""),
    itemUuid: readString(v.itemUuid, ""),
    on: readThemedColorOption(v.on, fallback.on),
    off: readThemedColorOption(v.off, fallback.off)
  };
}
function readToolbarHighlights(v) {
  const fallback = defaultToolbarHighlights();
  if (!isRecord2(v)) return fallback;
  return {
    sidebar: readToolbarHighlight(v.sidebar, fallback.sidebar),
    indentBody: readToolbarHighlight(v.indentBody, fallback.indentBody),
    enterBehavior: readToolbarHighlight(v.enterBehavior, fallback.enterBehavior)
  };
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
    enterBehavior: raw.enterBehavior === "line" ? "line" : "section",
    levels,
    metaFields: metaFields.length > 0 ? metaFields : fallback.metaFields,
    toolbarHighlights: readToolbarHighlights(raw.toolbarHighlights)
  };
}
function toolbarHighlightColor(highlight, active, dark) {
  const themed = active ? highlight.on : highlight.off;
  const opt = dark ? themed.dark : themed.light;
  return opt.enabled && /^#[0-9a-fA-F]{6}$/.test(opt.color) ? opt.color : "";
}
function levelCssVars(levels) {
  var _a, _b;
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
  for (let n = 1; n <= levels.length; n++) {
    const next = (_a = levels[n]) != null ? _a : levels[n - 1];
    const step = next ? cssLength(next.indentStep) : "0px";
    vars[`--vo-l${n}-body-indent`] = `calc(${(_b = vars[`--vo-l${n}-indent`]) != null ? _b : "0px"} + ${step})`;
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
    // the atomic-ranges source, filtered to POINT ranges only (replace/
    // widget decorations: hidden body blocks, the sigil-prefix label, the
    // hidden id suffix). `RangeValue.point` is what CM6's own atomicRanges
    // contract keys on — a `Decoration.mark` (e.g. the visible `vo-text`
    // entry-text span) has `point: false` and must NOT be atomic, or the
    // whole marked span becomes one unnavigable unit: clicks and arrow
    // keys can no longer land inside the visible entry text at all, and
    // deleting at its edge deletes the entire span in one bite instead of
    // one character.
    import_view.EditorView.atomicRanges.of(
      (view) => view.state.field(field).update({ filter: (_from, _to, value) => value.point })
    )
  ]
});
function hiddenBlockRanges(state) {
  const deco = state.field(outlineDecoField, false);
  if (!deco) return [];
  const out = [];
  for (const iter = deco.iter(); iter.value !== null; iter.next()) {
    const spec = iter.value.spec;
    const isBlock = typeof spec === "object" && spec !== null && spec.block === true;
    if (isBlock) out.push({ from: iter.from, to: iter.to });
  }
  return out;
}
function buildHiddenContentGuard(onBlocked) {
  return import_state.EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !tr.isUserEvent("delete")) return tr;
    const blocks = hiddenBlockRanges(tr.startState).filter(
      (b) => tr.startState.doc.sliceString(b.from, b.to).trim() !== ""
    );
    if (blocks.length === 0) return tr;
    let destroys = false;
    tr.changes.iterChanges((fromA, toA) => {
      if (destroys || toA <= fromA) return;
      if (blocks.some((b) => fromA < b.to && toA > b.from)) destroys = true;
    });
    if (!destroys) return tr;
    onBlocked();
    return [];
  });
}
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
        if (update.viewportChanged || update.geometryChanged) host.layoutChanged(update.view);
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
var HiddenBlockWidget = class extends import_view.WidgetType {
  // Every instance is interchangeable, so CM6 reuses the DOM instead of
  // tearing down and rebuilding a hidden block on each recompute.
  eq() {
    return true;
  }
  toDOM(view) {
    const div = view.dom.ownerDocument.createElement("div");
    div.className = "vo-hidden-block";
    div.setAttribute("aria-hidden", "true");
    return div;
  }
  ignoreEvent() {
    return true;
  }
};
var hiddenBlockWidget = new HiddenBlockWidget();
function lineIndexAt(view, el) {
  if (!view.contentDOM.contains(el)) return null;
  try {
    return view.state.doc.lineAt(view.posAtDOM(el)).number - 1;
  } catch (e) {
    return null;
  }
}
function bindFoldClick(el, view, onToggle) {
  el.addEventListener("mousedown", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  });
  el.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const line = lineIndexAt(view, el);
    if (line !== null) onToggle(view, line);
  });
}
var LabelWidget = class extends import_view.WidgetType {
  constructor(label, levelClass, fold, onToggle) {
    super();
    this.label = label;
    this.levelClass = levelClass;
    this.fold = fold;
    this.onToggle = onToggle;
  }
  eq(other) {
    return other.label === this.label && other.levelClass === this.levelClass && other.fold === this.fold;
  }
  toDOM(view) {
    const doc = view.dom.ownerDocument;
    const span = doc.createElement("span");
    span.className = `vo-label ${this.levelClass}`;
    if (this.fold !== null && this.onToggle) {
      const toggle = doc.createElement("span");
      toggle.className = `vo-fold collapse-icon${this.fold ? " is-collapsed" : ""}`;
      toggle.setAttribute("aria-label", this.fold ? "Expand" : "Collapse");
      (0, import_obsidian.setIcon)(toggle, "right-triangle");
      bindFoldClick(toggle, view, this.onToggle);
      span.appendChild(toggle);
    }
    span.appendChild(doc.createTextNode(this.label));
    return span;
  }
  ignoreEvent() {
    return true;
  }
};
var FoldPlaceholderWidget = class extends import_view.WidgetType {
  constructor(onToggle) {
    super();
    this.onToggle = onToggle;
  }
  eq() {
    return true;
  }
  toDOM(view) {
    const span = view.dom.ownerDocument.createElement("span");
    span.className = "vo-fold-placeholder cm-foldPlaceholder";
    span.setAttribute("aria-label", "Expand");
    span.textContent = "\u2026";
    bindFoldClick(span, view, this.onToggle);
    return span;
  }
  ignoreEvent() {
    return true;
  }
};
function buildOutlineDecorations(view, plan, sigilChar, onToggleFold = null, textOffsets = /* @__PURE__ */ new Map()) {
  var _a, _b, _c;
  const doc = view.state.doc;
  const lineCount = doc.lines;
  const builder = new import_state.RangeSetBuilder();
  const items = [];
  for (const range of plan.hiddenLineRanges) {
    if (range.from >= lineCount || range.to > lineCount) continue;
    const lastLineNo = Math.min(range.to, lineCount);
    const from = doc.line(range.from + 1).from;
    const to = lastLineNo < lineCount ? doc.line(lastLineNo + 1).from : doc.length;
    if (from >= to) continue;
    items.push({
      from,
      to,
      deco: import_view.Decoration.replace({
        block: true,
        inclusiveEnd: false,
        widget: hiddenBlockWidget
      })
    });
  }
  for (const [lineIndex, label] of plan.labels) {
    if (lineIndex >= lineCount) continue;
    const line = doc.line(lineIndex + 1);
    const segs = entrySegments(line.text, sigilChar);
    if (!segs) continue;
    const level = (_a = plan.entryLevel.get(lineIndex)) != null ? _a : segs.level;
    const fold = onToggleFold ? (_b = plan.foldable.get(lineIndex)) != null ? _b : null : null;
    if (segs.prefixEnd > 0) {
      items.push({
        from: line.from,
        to: line.from + segs.prefixEnd,
        deco: import_view.Decoration.replace({ widget: new LabelWidget(label, `vo-l${level}`, fold, onToggleFold) })
      });
    }
    if (segs.textEnd > segs.prefixEnd) {
      items.push({
        from: line.from + segs.prefixEnd,
        to: line.from + segs.textEnd,
        deco: import_view.Decoration.mark({ class: `vo-text vo-l${level}` })
      });
    }
    if (fold === true && onToggleFold) {
      items.push({
        from: line.from + segs.textEnd,
        to: line.from + segs.textEnd,
        deco: import_view.Decoration.widget({ widget: new FoldPlaceholderWidget(onToggleFold), side: 1 })
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
  const offsetByLevel = levelTextOffsets(plan, textOffsets);
  for (const [lineIndex, level] of plan.bodyIndentLevel) {
    if (lineIndex >= lineCount) continue;
    const line = doc.line(lineIndex + 1);
    const owner = plan.bodyOwnerLine.get(lineIndex);
    const offset = (_c = owner !== void 0 ? textOffsets.get(owner) : void 0) != null ? _c : offsetByLevel.get(level);
    items.push({
      from: line.from,
      to: line.from,
      deco: import_view.Decoration.line({
        class: `vo-body-indent-l${level}`,
        attributes: offset !== void 0 ? { style: `--vo-body-text-offset: ${offset}px` } : void 0
      })
    });
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
    var _a2, _b2;
    return a.from - b.from || ((_a2 = a.deco.startSide) != null ? _a2 : 0) - ((_b2 = b.deco.startSide) != null ? _b2 : 0);
  });
  for (const item of items) builder.add(item.from, item.to, item.deco);
  return builder.finish();
}
function measureEntryTextOffsets(view) {
  const out = /* @__PURE__ */ new Map();
  const scale = view.scaleX || 1;
  for (const text of Array.from(view.contentDOM.querySelectorAll(".cm-line .vo-text"))) {
    const line = text.closest(".cm-line");
    if (!line) continue;
    let lineIndex;
    try {
      lineIndex = view.state.doc.lineAt(view.posAtDOM(line)).number - 1;
    } catch (e) {
      continue;
    }
    if (out.has(lineIndex)) continue;
    const rect = text.getClientRects()[0];
    if (!rect) continue;
    const offset = (rect.left - line.getBoundingClientRect().left) / scale;
    out.set(lineIndex, Math.round(offset * 10) / 10);
  }
  return out;
}
function sameTextOffsets(a, b) {
  if (a.size !== b.size) return false;
  for (const [line, offset] of a) {
    const other = b.get(line);
    if (other === void 0 || Math.abs(other - offset) > 0.5) return false;
  }
  return true;
}
function levelTextOffsets(plan, textOffsets) {
  const byLevel = /* @__PURE__ */ new Map();
  for (const [line, offset] of textOffsets) {
    const level = plan.entryLevel.get(line);
    if (level !== void 0 && !byLevel.has(level)) byLevel.set(level, offset);
  }
  return byLevel;
}

// src/editor/keymap.ts
var import_state2 = require("@codemirror/state");
var import_view2 = require("@codemirror/view");
function bodyOf(view) {
  return parseMetaDocument(view.state.doc.toString()).body;
}
function activeLine(view) {
  const sel = view.state.selection.main;
  if (!sel.empty) return null;
  const line = view.state.doc.lineAt(sel.head);
  return { lineIndex: line.number - 1, lineText: line.text, col: sel.head - line.from };
}
function isAtVisibleEnd(line) {
  const idMatch = ID_SUFFIX_RE.exec(line.lineText);
  const visibleEnd = idMatch ? idMatch.index : line.lineText.length;
  return line.col === line.lineText.length || line.col === visibleEnd;
}
function dispatchSplice(view, host, splice, selection) {
  view.dispatch({
    changes: { from: splice.from, to: splice.to, insert: splice.insert },
    selection: selection !== void 0 ? { anchor: selection } : void 0,
    scrollIntoView: true
  });
  host.resolveNow(view);
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
    return dispatchSplice(view, host, splice);
  };
}
function enterBinding(host) {
  return (view) => {
    const line = activeLine(view);
    if (!line) return false;
    const sigil = host.sigilChar(view);
    if (!isOutlineLine(line.lineText, sigil)) return false;
    const splice = addSibling(bodyOf(view), line.lineIndex, line.col, sigil, host.enterBehavior());
    if (!splice) return false;
    return dispatchSplice(view, host, splice, splice.cursor);
  };
}
function moveBlock(view, host, direction) {
  const line = activeLine(view);
  if (!line) return false;
  const sigil = host.sigilChar(view);
  const body = bodyOf(view);
  const node = ownerNodeAtLine(body, line.lineIndex, sigil);
  if (!node) return false;
  const splice = (direction === "up" ? moveUp : moveDown)(body, node.entryLine, sigil);
  if (!splice) return true;
  const blockStart = view.state.doc.line(node.subtreeStart + 1).from;
  const offsetInBlock = view.state.selection.main.head - blockStart;
  const cursor = splice.movedTo !== void 0 ? splice.movedTo + offsetInBlock : void 0;
  return dispatchSplice(view, host, splice, cursor);
}
function moveBinding(host, direction) {
  return (view) => {
    const line = activeLine(view);
    if (!line) return false;
    const sigil = host.sigilChar(view);
    if (!isOutlineLine(line.lineText, sigil)) return false;
    if (isEntryLine(line.lineText, sigil)) moveBlock(view, host, direction);
    return true;
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
    return dispatchSplice(view, host, splice, splice.from + splice.insert.length);
  };
}
function shiftEnterBinding(host) {
  return (view) => {
    const line = activeLine(view);
    if (!line) return false;
    const sigil = host.sigilChar(view);
    if (!isOutlineLine(line.lineText, sigil)) return false;
    if (!isAtVisibleEnd(line)) return false;
    const splice = addBodyLine(bodyOf(view), line.lineIndex, sigil);
    if (!splice) return true;
    return dispatchSplice(view, host, splice, splice.from + splice.insert.length);
  };
}
function buildOutlineKeymap(host) {
  const bindings = [
    { key: "Enter", run: enterBinding(host) },
    { key: "Shift-Enter", run: shiftEnterBinding(host) },
    { key: "Mod-Enter", run: bodyLineBinding(host) },
    { key: "Tab", run: structuralBinding(host, demote) },
    { key: "Shift-Tab", run: structuralBinding(host, promote) },
    { key: "Alt-ArrowUp", run: moveBinding(host, "up") },
    { key: "Alt-ArrowDown", run: moveBinding(host, "down") }
  ];
  return import_state2.Prec.highest(import_view2.keymap.of(bindings));
}

// src/editor/readingView.ts
var import_obsidian2 = require("obsidian");
function foldClickTarget(el, fold) {
  el.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    fold.toggle();
  });
}
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
  return wrapper;
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
function materializeLabelIn(nodes, line, sigilChar, label, level, doc, fold) {
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
  if (fold) {
    const toggle = doc.createElement("span");
    toggle.className = `vo-fold collapse-icon${fold.collapsed ? " is-collapsed" : ""}`;
    toggle.setAttribute("aria-label", fold.collapsed ? "Expand" : "Collapse");
    (0, import_obsidian2.setIcon)(toggle, "right-triangle");
    foldClickTarget(toggle, fold);
    labelSpan.appendChild(toggle);
  }
  labelSpan.appendChild(doc.createTextNode(label));
  (_a = first.parentNode) == null ? void 0 : _a.insertBefore(labelSpan, first);
  const wrapper = wrapEntryText(first, last, level, doc);
  if (fold == null ? void 0 : fold.collapsed) {
    const placeholder = doc.createElement("span");
    placeholder.className = "vo-fold-placeholder";
    placeholder.setAttribute("aria-label", "Expand");
    placeholder.textContent = "\u2026";
    foldClickTarget(placeholder, fold);
    wrapper.after(placeholder);
  }
}
function materializeLabel(el, line, sigilChar, label, level, fold) {
  materializeLabelIn(el.childNodes, line, sigilChar, label, level, el.ownerDocument, fold);
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
var ENTRY_ATTR = "data-vo-entry-line";
var OWNER_ATTR = "data-vo-owner-line";
var OWNER_LEVEL_ATTR = "data-vo-owner-level";
var levelOffsetCache = /* @__PURE__ */ new WeakMap();
function tagForAlignment(el, plan, line) {
  const entryLevel2 = plan.entryLevel.get(line);
  if (entryLevel2 !== void 0) {
    el.setAttribute(ENTRY_ATTR, String(line));
    el.setAttribute(OWNER_LEVEL_ATTR, String(entryLevel2));
  }
  const owner = plan.bodyOwnerLine.get(line);
  const level = plan.bodyIndentLevel.get(line);
  if (owner !== void 0 && level !== void 0) {
    el.setAttribute(OWNER_ATTR, String(owner));
    el.setAttribute(OWNER_LEVEL_ATTR, String(level));
  }
}
function entryTextOffset(entry) {
  const text = entry.querySelector(".vo-text");
  const rect = text == null ? void 0 : text.getClientRects()[0];
  if (!rect) return null;
  return Math.round((rect.left - entry.getBoundingClientRect().left) * 10) / 10;
}
function blocksIn(root, selector) {
  const found = Array.from(root.querySelectorAll(selector));
  return root.matches(selector) ? [root, ...found] : found;
}
function alignBodyIn(root) {
  var _a;
  const preview = root.closest(".markdown-rendered");
  if (!preview) return;
  let cache = levelOffsetCache.get(preview);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    levelOffsetCache.set(preview, cache);
  }
  const bodies = new Set(blocksIn(root, `[${OWNER_ATTR}]`));
  for (const entry of blocksIn(root, `[${ENTRY_ATTR}]`)) {
    const offset = entryTextOffset(entry);
    const line = entry.getAttribute(ENTRY_ATTR);
    if (offset === null || line === null) continue;
    cache.set(Number(entry.getAttribute(OWNER_LEVEL_ATTR)), offset);
    for (const body of blocksIn(preview, `[${OWNER_ATTR}="${line}"]`)) bodies.add(body);
  }
  for (const body of bodies) {
    const owner = body.getAttribute(OWNER_ATTR);
    const entry = owner !== null ? preview.querySelector(`[${ENTRY_ATTR}="${owner}"]`) : null;
    const offset = (_a = entry ? entryTextOffset(entry) : null) != null ? _a : cache.get(Number(body.getAttribute(OWNER_LEVEL_ATTR)));
    if (offset !== null && offset !== void 0) body.setCssProps({ "--vo-body-text-offset": `${offset}px` });
  }
}
function scheduleAlignment(el) {
  var _a;
  const win = (_a = el.win) != null ? _a : window;
  win.requestAnimationFrame(() => {
    if (el.isConnected) alignBodyIn(el);
    else win.setTimeout(() => el.isConnected && alignBodyIn(el), 100);
  });
}
function levelClasses(plan, line) {
  const indentLevel = plan.indentLevel.get(line);
  const entryLevel2 = plan.entryLevel.get(line);
  const bodyIndentLevel = plan.bodyIndentLevel.get(line);
  const classes = [];
  if (indentLevel !== void 0) classes.push(`vo-indent-l${indentLevel}`);
  if (bodyIndentLevel !== void 0) classes.push(`vo-body-indent-l${bodyIndentLevel}`);
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
    const foldFor = (line) => {
      const collapsed = plan.foldable.get(line);
      if (collapsed === void 0) return null;
      return { collapsed, toggle: () => host.toggleFold(ctx.sourcePath, line) };
    };
    if (lineStart === lineEnd) {
      if (isLineHidden(plan.hiddenLineRanges, lineStart)) {
        el.addClass("vo-hidden");
        return;
      }
      for (const cls of levelClasses(plan, lineStart)) {
        el.addClass(cls);
      }
      tagForAlignment(el, plan, lineStart);
      scheduleAlignment(el);
      const label = plan.labels.get(lineStart);
      if (label === void 0) return;
      const level = (_a = plan.entryLevel.get(lineStart)) != null ? _a : 1;
      const lines2 = body.split("\n");
      const lineText = lines2[lineStart];
      if (lineText === void 0) return;
      materializeLabel(el, lineText, sigilChar, label, level, foldFor(lineStart));
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
        const classes = levelClasses(plan, line);
        if (classes.length === 0) continue;
        for (const cls of classes) el.addClass(cls);
        tagForAlignment(el, plan, line);
        scheduleAlignment(el);
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
      const classes = hidden ? ["vo-hidden"] : ["vo-line", ...levelClasses(plan, line)];
      const wrapper = blockWrapSegment(segment, classes, doc);
      if (!wrapper || hidden) continue;
      tagForAlignment(wrapper, plan, line);
      const label = plan.labels.get(line);
      if (label === void 0) continue;
      const lineText = lines[line];
      if (lineText === void 0) continue;
      const level = (_c = plan.entryLevel.get(line)) != null ? _c : 1;
      materializeLabelIn(Array.from(wrapper.childNodes), lineText, sigilChar, label, level, doc, foldFor(line));
    }
    scheduleAlignment(el);
  };
}

// src/settingsTab.ts
var import_obsidian3 = require("obsidian");

// src/ui/toolbarHighlight.ts
var SKIP_ITEM_TYPES = /* @__PURE__ */ new Set(["separator", "break", "spreader", "group"]);
var HIGHLIGHT_CLASS = "vo-toolbar-highlight";
function getNoteToolbarPlugin(app) {
  var _a, _b;
  const registry = app.plugins;
  if (!((_a = registry == null ? void 0 : registry.enabledPlugins) == null ? void 0 : _a.has("note-toolbar"))) return null;
  const plugin = (_b = registry.plugins) == null ? void 0 : _b["note-toolbar"];
  return plugin !== null && typeof plugin === "object" ? plugin : null;
}
function rawToolbars(app) {
  var _a, _b;
  const toolbars = (_b = (_a = getNoteToolbarPlugin(app)) == null ? void 0 : _a.settings) == null ? void 0 : _b.toolbars;
  return Array.isArray(toolbars) ? toolbars : [];
}
function rawItems(toolbar) {
  return Array.isArray(toolbar.items) ? toolbar.items : [];
}
function isNoteToolbarAvailable(app) {
  return getNoteToolbarPlugin(app) !== null;
}
function listToolbars(app) {
  return rawToolbars(app).filter((t) => typeof t.uuid === "string").map((t) => ({
    uuid: t.uuid,
    name: typeof t.name === "string" && t.name !== "" ? t.name : "(untitled toolbar)"
  }));
}
function listHighlightableItems(app, toolbarUuid) {
  const toolbar = rawToolbars(app).find((t) => t.uuid === toolbarUuid);
  if (!toolbar) return [];
  return rawItems(toolbar).filter((i) => typeof i.uuid === "string").filter((i) => {
    var _a;
    const type = (_a = i.linkAttr) == null ? void 0 : _a.type;
    return typeof type === "string" && !SKIP_ITEM_TYPES.has(type);
  }).filter(
    (i) => typeof i.label === "string" && i.label !== "" || typeof i.icon === "string" && i.icon !== ""
  ).map((i) => ({
    uuid: i.uuid,
    label: typeof i.label === "string" ? i.label : "",
    tooltip: typeof i.tooltip === "string" ? i.tooltip : "",
    icon: typeof i.icon === "string" ? i.icon : ""
  }));
}
function itemDisplayName(item) {
  return item.label || item.tooltip || item.icon || "(untitled item)";
}
var ToolbarHighlighter = class {
  constructor(app, getTargets) {
    this.app = app;
    this.getTargets = getTargets;
  }
  // Re-applies every target for the current toggle states. Cheap and
  // idempotent, so it is safe to call on any workspace event.
  refresh() {
    var _a;
    this.clear();
    const targets = this.getTargets().filter(
      (t) => t.highlight.toolbarUuid !== "" && t.highlight.itemUuid !== ""
    );
    if (targets.length === 0) return;
    const containers = this.toolbarContainers();
    if (containers.length === 0) return;
    for (const { highlight, active } of targets) {
      const toolbar = rawToolbars(this.app).find((t) => t.uuid === highlight.toolbarUuid);
      if (!toolbar) continue;
      const index = rawItems(toolbar).findIndex((i) => i.uuid === highlight.itemUuid);
      if (index === -1) continue;
      for (const container of containers) {
        if (container.id !== highlight.toolbarUuid) continue;
        const target = (_a = container.querySelector(`li[data-index="${index}"]`)) == null ? void 0 : _a.firstElementChild;
        if (!(target instanceof HTMLElement)) continue;
        const dark = target.ownerDocument.body.classList.contains("theme-dark");
        const bg = toolbarHighlightColor(highlight, active, dark);
        if (bg === "") continue;
        target.addClass(HIGHLIGHT_CLASS);
        target.style.setProperty("background-color", bg);
      }
    }
  }
  // Removes every colour this plugin applied, wherever it currently lives.
  clear() {
    for (const container of this.toolbarContainers()) {
      for (const el of Array.from(
        container.querySelectorAll(`.${HIGHLIGHT_CLASS}`)
      )) {
        el.removeClass(HIGHLIGHT_CLASS);
        el.style.removeProperty("background-color");
        el.style.removeProperty("color");
      }
    }
  }
  // Every rendered Note Toolbar container across the workspace. Walking the
  // leaves rather than one document means popout windows are covered too.
  toolbarContainers() {
    const containers = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      containers.push(
        ...Array.from(
          leaf.view.containerEl.querySelectorAll(".cg-note-toolbar-container")
        )
      );
    });
    return containers;
  }
};

// src/settingsTab.ts
function isValidHex(v) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}
var ENTER_BEHAVIOR_OPTIONS = {
  section: "After the whole section",
  line: "On the next line"
};
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
var VirtualOutlinerSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian3.Setting(containerEl).setName("Depth sigil").setDesc(
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
    new import_obsidian3.Setting(containerEl).setName("Default view state").setDesc("The view a note opens in when it has no view state recorded yet.").addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(VIEW_STATE_OPTIONS)) dropdown.addOption(value, label);
      dropdown.setValue(this.plugin.settings.defaultViewState).onChange(async (value) => {
        this.plugin.settings.defaultViewState = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Indent body under its outline level").setDesc("Visual only \u2014 the file itself is never re-indented.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.indentBody).onChange(async (value) => {
        this.plugin.settings.indentBody = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Enter at the end of an entry").setDesc(
      "Where the new same-level entry goes. After the whole section keeps the current entry's body and sub-entries with it; on the next line puts the new entry directly below, so that body and those sub-entries move under the new entry. Pressing return in the middle of an entry always splits it in place."
    ).addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(ENTER_BEHAVIOR_OPTIONS)) dropdown.addOption(value, label);
      dropdown.setValue(this.plugin.settings.enterBehavior).onChange(async (value) => {
        this.plugin.settings.enterBehavior = value === "line" ? "line" : "section";
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Level format").setHeading();
    containerEl.createEl("p", {
      cls: "vo-fixture-note",
      text: 'One format applied to every outline level (e.g. "1.2.1" from repeated Number style + Separator). Indent step and Space above still accumulate with depth, so deeper levels sit further right and further apart even though the format itself is shared.'
    });
    this.renderLevelSetting(containerEl);
    new import_obsidian3.Setting(containerEl).setName("Metadata fields").setHeading();
    containerEl.createEl("p", {
      cls: "vo-fixture-note",
      text: "Per-node fields (status, note, \u2026) exposed to Dataview/Datacore and stored in the end-of-file %%md-outline block."
    });
    this.renderMetaFields(containerEl);
    this.renderToolbarSection(containerEl);
  }
  // ── Note Toolbar buttons (ported from md-annotation's Note Toolbar tab) ──
  renderToolbarSection(containerEl) {
    new import_obsidian3.Setting(containerEl).setName("Note Toolbar buttons").setHeading();
    if (!isNoteToolbarAvailable(this.app)) {
      containerEl.createEl("p", {
        cls: "vo-fixture-note",
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Note Toolbar' is the plugin's own name
        text: "Install and enable the Note Toolbar plugin to have one of its buttons change colour while the toggle it runs is on."
      });
      return;
    }
    containerEl.createEl("p", {
      cls: "vo-fixture-note",
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Note Toolbar' is the plugin's own name; On/Off name the grid columns
      text: `Pick the toolbar button that runs each toggle command below and it takes the On colour while that toggle is on, so the toolbar reads as pressed, and the Off colour while it is off. A colour left unticked leaves the button to Note Toolbar for that state \u2014 Off is unticked by default, so only "on" stands out. Backgrounds only: the icon and label colour stay Note Toolbar's.`
    });
    const highlights = this.plugin.settings.toolbarHighlights;
    const rows = [
      { name: "Outline sidebar button", short: "Sidebar", highlight: highlights.sidebar },
      { name: "Indent body button", short: "Indent body", highlight: highlights.indentBody },
      { name: "Enter on next line button", short: "Enter: next line", highlight: highlights.enterBehavior }
    ];
    for (const row of rows) this.renderToolbarItemPicker(containerEl, row.name, row.highlight);
    const wrap = containerEl.createDiv("vo-grid-wrap");
    const table = wrap.createEl("table", { cls: "vo-grid-table" });
    const thead = table.createEl("thead");
    const r1 = thead.createEl("tr");
    r1.createEl("th", { text: "Button", attr: { rowspan: "2" }, cls: "vo-grid-name-h" });
    r1.createEl("th", { text: "Light", attr: { colspan: "2" }, cls: "vo-grid-sep" });
    r1.createEl("th", { text: "Dark", attr: { colspan: "2" }, cls: "vo-grid-sep" });
    r1.createEl("th", { text: "Example", attr: { rowspan: "2" }, cls: "vo-grid-sep" });
    const r2 = thead.createEl("tr");
    for (let i = 0; i < 4; i++) {
      r2.createEl("th", { text: i % 2 === 0 ? "On" : "Off", cls: i % 2 === 0 ? "vo-grid-sep" : "" });
    }
    const tbody = table.createEl("tbody");
    for (const row of rows) this.renderToolbarHighlightRow(tbody, row.short, row.highlight);
  }
  // Toolbar + item dropdowns. Changing the toolbar clears the item, since
  // item uuids belong to a single toolbar.
  renderToolbarItemPicker(containerEl, name, highlight) {
    new import_obsidian3.Setting(containerEl).setName(name).setDesc("Toolbar, then the button within it").addDropdown((dropdown) => {
      dropdown.addOption("", "None");
      for (const toolbar of listToolbars(this.app)) dropdown.addOption(toolbar.uuid, toolbar.name);
      dropdown.setValue(highlight.toolbarUuid).onChange(async (value) => {
        highlight.toolbarUuid = value;
        highlight.itemUuid = "";
        await this.plugin.saveSettings();
        this.display();
      });
    }).addDropdown((dropdown) => {
      const items = highlight.toolbarUuid ? listHighlightableItems(this.app, highlight.toolbarUuid) : [];
      dropdown.addOption("", items.length === 0 ? "No buttons" : "None");
      for (const item of items) dropdown.addOption(item.uuid, itemDisplayName(item));
      dropdown.setDisabled(items.length === 0);
      dropdown.setValue(highlight.itemUuid).onChange(async (value) => {
        highlight.itemUuid = value;
        await this.plugin.saveSettings();
      });
    });
  }
  renderToolbarHighlightRow(tbody, label, highlight) {
    const tr = tbody.createEl("tr");
    tr.createEl("td", { text: label, cls: "vo-grid-name" });
    let exampleTd = null;
    const refreshExample = () => {
      if (!exampleTd) return;
      exampleTd.empty();
      const theme = this.containerEl.ownerDocument.body.classList.contains("theme-dark") ? "dark" : "light";
      for (const [text, opt] of [
        ["On", highlight.on[theme]],
        ["Off", highlight.off[theme]]
      ]) {
        const span = exampleTd.createEl("span", { text });
        span.setCssStyles({ backgroundColor: opt.enabled && isValidHex(opt.color) ? opt.color : "" });
        exampleTd.appendText(" ");
      }
    };
    for (const theme of ["light", "dark"]) {
      for (const state of ["on", "off"]) {
        const td = tr.createEl("td", { cls: state === "on" ? "vo-grid-sep" : "" });
        this.renderColorCell(td, highlight[state][theme], refreshExample);
      }
    }
    exampleTd = tr.createEl("td", { cls: "vo-grid-example vo-grid-sep" });
    refreshExample();
  }
  // A checkbox, a swatch (native picker), and an editable hex field bound to
  // one ColorOption. Setting a colour by either control ticks the checkbox;
  // the checkbox alone decides whether the stored colour is applied.
  renderColorCell(td, opt, onChanged) {
    const wrap = td.createDiv("vo-grid-cell");
    const check = wrap.createEl("input", { attr: { type: "checkbox" }, cls: "vo-grid-check" });
    check.checked = opt.enabled;
    const picker = wrap.createEl("input", { attr: { type: "color" }, cls: "vo-grid-color" });
    picker.value = isValidHex(opt.color) ? opt.color : "#888888";
    const hex = wrap.createEl("input", {
      cls: "vo-grid-hex",
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- '#hex' is a hex-notation placeholder, not prose
      attr: { type: "text", maxlength: "7", placeholder: "#hex", spellcheck: "false" }
    });
    hex.value = isValidHex(opt.color) ? opt.color : "";
    const setColor = (value, persist) => {
      opt.color = value;
      picker.value = value;
      hex.value = value;
      if (!opt.enabled) {
        opt.enabled = true;
        check.checked = true;
      }
      if (persist) void this.plugin.saveSettings();
      onChanged();
    };
    check.addEventListener("change", () => {
      opt.enabled = check.checked;
      if (opt.enabled && !isValidHex(opt.color)) {
        opt.color = picker.value;
        hex.value = picker.value;
      }
      void this.plugin.saveSettings();
      onChanged();
    });
    picker.addEventListener("input", () => setColor(picker.value, false));
    picker.addEventListener("change", () => setColor(picker.value, true));
    hex.addEventListener("change", () => {
      const raw = hex.value.trim();
      const value = raw.startsWith("#") ? raw : `#${raw}`;
      if (isValidHex(value)) setColor(value.toLowerCase(), true);
      else hex.value = isValidHex(opt.color) ? opt.color : "";
    });
  }
  // One NAMED row per property, applied to every level at once (Update003:
  // the previous layout repeated these ten controls inside a collapsible
  // block per level, which was mostly redundant — nothing here needs to
  // differ level to level, and levelCssVars already accumulates Indent
  // step/Space above across levels regardless of whether the six stored
  // LevelFormat entries are distinct or identical).
  //
  // The array's six LevelFormat entries stay in settings as separate
  // objects (render.ts/label.ts/levelCssVars all still index into
  // `levels[n]`), so this editor writes every change to ALL SIX slots
  // rather than changing the stored shape. Displayed values are seeded from
  // level 1's entry; an old vault whose levels still differ from a
  // pre-Update003 install keeps that difference invisibly until the first
  // edit here flattens it.
  renderLevelSetting(containerEl) {
    var _a, _b;
    const format = this.plugin.settings.levels[0];
    if (!format) return;
    const applyToAllLevels = async (mutate) => {
      for (const level of this.plugin.settings.levels) mutate(level);
      await this.plugin.saveSettings();
    };
    new import_obsidian3.Setting(containerEl).setName("Number style").setDesc(`How each level's segment of the composite label is numbered (e.g. "1" + "." gives "1.2.1").`).addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(LABEL_STYLE_OPTIONS)) dropdown.addOption(value, label);
      dropdown.setValue(format.style).onChange(async (value) => {
        await applyToAllLevels((level) => {
          level.style = value;
        });
      });
    });
    this.addTextRow(
      containerEl,
      "Separator",
      `Placed before a level's segment when a shallower level already contributed one (e.g. "." gives 2.1).`,
      format.separator,
      async (value) => {
        await applyToAllLevels((level) => {
          level.separator = value;
        });
      }
    );
    new import_obsidian3.Setting(containerEl).setName("Italic").setDesc("Renders every level's number and entry text in italics.").addToggle((toggle) => {
      toggle.setValue(format.italic);
      toggle.onChange(async (value) => {
        await applyToAllLevels((level) => {
          level.italic = value;
        });
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Colour").setDesc("Colour of every level's number and entry text.").addColorPicker((picker) => {
      if (format.color !== "") picker.setValue(format.color);
      picker.onChange(async (value) => {
        await applyToAllLevels((level) => {
          level.color = value;
        });
      });
    }).addExtraButton((button) => {
      button.setIcon("rotate-ccw").setTooltip("Use the theme colour").onClick(async () => {
        await applyToAllLevels((level) => {
          level.color = "";
        });
        this.display();
      });
    });
    this.addTextRow(
      containerEl,
      "Font size",
      "Any CSS length (e.g. 1.2em). Blank inherits the note's font size.",
      format.fontSize,
      async (value) => {
        await applyToAllLevels((level) => {
          level.fontSize = value;
        });
      }
    );
    this.addTextRow(
      containerEl,
      "Font weight",
      "A CSS weight (e.g. 600, bold). Blank inherits.",
      format.fontWeight,
      async (value) => {
        await applyToAllLevels((level) => {
          level.fontWeight = value;
        });
      }
    );
    this.addTextRow(
      containerEl,
      "Font family",
      "A CSS font family. Blank inherits.",
      format.fontFamily,
      async (value) => {
        await applyToAllLevels((level) => {
          level.fontFamily = value;
        });
      }
    );
    this.addTextRow(
      containerEl,
      "Indent step",
      "A CSS length: how much further right each level sits than the level above it (level 1 stays flush left).",
      (_b = (_a = this.plugin.settings.levels[1]) == null ? void 0 : _a.indentStep) != null ? _b : format.indentStep,
      async (value) => {
        const levels = this.plugin.settings.levels;
        for (let i = 1; i < levels.length; i++) {
          const level = levels[i];
          if (level) level.indentStep = value;
        }
        await this.plugin.saveSettings();
      }
    );
    this.addTextRow(
      containerEl,
      "Space above",
      "A CSS length added above each entry, accumulating with depth.",
      format.spacing,
      async (value) => {
        await applyToAllLevels((level) => {
          level.spacing = value;
        });
      }
    );
    this.addTextRow(
      containerEl,
      "Label gap",
      "A CSS length between the number and the entry text.",
      format.labelGap,
      async (value) => {
        await applyToAllLevels((level) => {
          level.labelGap = value;
        });
      }
    );
  }
  addTextRow(containerEl, name, desc, value, apply) {
    new import_obsidian3.Setting(containerEl).setName(name).setDesc(desc).addText((text) => {
      text.setValue(value);
      text.onChange(async (next) => {
        await apply(next);
      });
    });
  }
  renderMetaFields(containerEl) {
    const fields = this.plugin.settings.metaFields;
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field) continue;
      const setting = new import_obsidian3.Setting(containerEl).setName(`Field ${i + 1}`);
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
    new import_obsidian3.Setting(containerEl).addButton((button) => {
      button.setButtonText("Add field").onClick(async () => {
        fields.push({ name: `Field ${fields.length + 1}`, type: "text", options: [] });
        await this.plugin.saveSettings();
        this.display();
      });
    });
  }
};

// src/ui/sidebar.ts
var import_obsidian4 = require("obsidian");
var SIDEBAR_VIEW_TYPE = "virtual-outliner-sidebar";
var OutlineSidebarView = class extends import_obsidian4.ItemView {
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
      (0, import_obsidian4.setIcon)(toggle, collapsed ? "chevron-right" : "chevron-down");
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
var CSS_VAR_STYLE_ID = "virtual-outliner-level-vars";
var TOOLBAR_HIGHLIGHT_DELAY_MS = 50;
var VirtualOutlinerPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = normalizeSettings(null);
    this.states = /* @__PURE__ */ new Map();
    this.fileState = /* @__PURE__ */ new Map();
    this.editors = /* @__PURE__ */ new Set();
    this.editorTimers = /* @__PURE__ */ new Map();
    // Per editor: entry line -> measured text start, for aligning body under it.
    this.textOffsets = /* @__PURE__ */ new Map();
    this.diskTimers = /* @__PURE__ */ new Map();
    this.changeListeners = /* @__PURE__ */ new Set();
    this.toolbarHighlighter = null;
    this.toolbarTimer = null;
    // One stable handler for every editor's fold chevrons (a fresh closure per
    // decorate would be harmless but pointless).
    this.onFoldClick = (view, lineIndex) => {
      const path = editorViewPath(view);
      if (path !== null) this.toggleFoldAtLine(path, lineIndex, view);
    };
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
    this.keymapHost = {
      sigilChar: () => this.settings.sigil,
      enterBehavior: () => this.settings.enterBehavior,
      resolveNow: (view) => this.resolveEditor(view)
    };
    this.registerEditorExtension([
      buildHiddenContentGuard(() => {
        new import_obsidian5.Notice("Hidden text is not deleted from this view \u2014 switch to outline and body to edit it.");
      }),
      buildOutlineKeymap(this.keymapHost),
      buildEditorExtension({
        attachEditor: (view) => this.editors.add(view),
        detachEditor: (view) => {
          this.editors.delete(view);
          this.textOffsets.delete(view);
          const timer = this.editorTimers.get(view);
          if (timer !== void 0) {
            window.clearTimeout(timer);
            this.editorTimers.delete(view);
          }
        },
        scheduleEditorResolve: (view, delayMs) => this.scheduleEditorResolve(view, delayMs),
        layoutChanged: (view) => this.scheduleTextMeasure(view)
      })
    ]);
    this.registerMarkdownPostProcessor(
      createReadingPostProcessor({
        sigilChar: () => this.settings.sigil,
        levels: () => this.settings.levels,
        viewState: (path) => this.viewStateFor(path),
        collapsedIds: (path) => this.collapsedIdsFor(path),
        indentBody: () => this.settings.indentBody,
        toggleFold: (path, lineIndex) => this.toggleFoldAtLine(path, lineIndex, null)
      })
    );
    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new OutlineSidebarView(leaf, this.sidebarHost()));
    this.addSettingTab(new VirtualOutlinerSettingTab(this.app, this));
    this.addRibbonIcon("list-tree", "Toggle outline sidebar", () => void this.toggleSidebar());
    this.addCommand({
      id: "open-sidebar",
      name: "Toggle outline sidebar",
      callback: () => void this.toggleSidebar()
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
      id: "toggle-indent-body",
      name: "Indent body with outline",
      callback: () => {
        this.settings.indentBody = !this.settings.indentBody;
        void this.saveSettings();
        new import_obsidian5.Notice(this.settings.indentBody ? "Indent body with outline: on" : "Indent body with outline: off");
      }
    });
    this.addCommand({
      id: "toggle-fold-entry",
      name: "Toggle collapse of current outline entry",
      checkCallback: (checking) => {
        const view = this.activeEditorView();
        const path = view ? editorViewPath(view) : null;
        if (!view || path === null) return false;
        if (checking) return true;
        const line = view.state.doc.lineAt(view.state.selection.main.head).number - 1;
        this.toggleFoldAtLine(path, line, view);
        return true;
      }
    });
    const foldAllCommand = (id, name, run) => {
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          const file = this.activeMarkdownFile();
          if (!file) return false;
          if (checking) return true;
          run(file.path);
          return true;
        }
      });
    };
    foldAllCommand("collapse-all-entries", "Collapse all outline entries", (path) => this.collapseAll(path));
    foldAllCommand("expand-all-entries", "Expand all outline entries", (path) => this.expandAll(path));
    this.addCommand({
      id: "toggle-enter-behavior",
      name: "Toggle new entry on next line vs after section",
      callback: () => {
        this.settings.enterBehavior = this.settings.enterBehavior === "line" ? "section" : "line";
        void this.saveSettings();
        new import_obsidian5.Notice(
          this.settings.enterBehavior === "line" ? "Enter adds the new entry on the next line" : "Enter adds the new entry after the whole section"
        );
      }
    });
    const moveCommand = (id, name, direction) => {
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          const view = this.activeEditorView();
          if (!view) return false;
          if (checking) return true;
          moveBlock(view, this.keymapHost, direction);
          return true;
        }
      });
    };
    moveCommand("move-block-up", "Move outline block up", "up");
    moveCommand("move-block-down", "Move outline block down", "down");
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
    this.toolbarHighlighter = new ToolbarHighlighter(this.app, () => [
      { highlight: this.settings.toolbarHighlights.sidebar, active: this.isSidebarShown() },
      { highlight: this.settings.toolbarHighlights.indentBody, active: this.settings.indentBody },
      {
        highlight: this.settings.toolbarHighlights.enterBehavior,
        active: this.settings.enterBehavior === "line"
      }
    ]);
    const onWorkspaceChange = () => this.scheduleToolbarRefresh();
    this.registerEvent(this.app.workspace.on("layout-change", onWorkspaceChange));
    this.registerEvent(this.app.workspace.on("active-leaf-change", onWorkspaceChange));
    this.registerEvent(this.app.workspace.on("css-change", onWorkspaceChange));
    this.app.workspace.onLayoutReady(onWorkspaceChange);
    this.app.workspace.onLayoutReady(() => {
      const file = this.app.workspace.getActiveFile();
      if (file && file.extension === "md") void this.ensureFileState(file.path);
      this.applyLevelCssVars();
      for (const view of this.editors) this.decorate(view);
      this.rerenderPreviews(null);
    });
  }
  onunload() {
    var _a, _b;
    for (const timer of this.editorTimers.values()) window.clearTimeout(timer);
    this.editorTimers.clear();
    for (const timer of this.diskTimers.values()) window.clearTimeout(timer);
    this.diskTimers.clear();
    for (const doc of this.cssVarTargetDocuments()) (_a = doc.getElementById(CSS_VAR_STYLE_ID)) == null ? void 0 : _a.remove();
    if (this.toolbarTimer !== null) window.clearTimeout(this.toolbarTimer);
    this.toolbarTimer = null;
    (_b = this.toolbarHighlighter) == null ? void 0 : _b.clear();
  }
  scheduleToolbarRefresh() {
    if (this.toolbarTimer !== null) window.clearTimeout(this.toolbarTimer);
    this.toolbarTimer = window.setTimeout(() => {
      var _a;
      this.toolbarTimer = null;
      (_a = this.toolbarHighlighter) == null ? void 0 : _a.refresh();
    }, TOOLBAR_HIGHLIGHT_DELAY_MS);
  }
  async saveSettings() {
    await this.persist();
    this.applyLevelCssVars();
    for (const view of this.editors) this.decorate(view);
    this.rerenderPreviews(null);
    this.notifyChange();
    this.scheduleToolbarRefresh();
  }
  // Reading view is a one-shot post-processor render, so anything that
  // changes what it should draw (settings, view state, a collapse) has to
  // ask Obsidian to run it again — the editor's decoration path has no
  // equivalent effect on it. `path === null` means every open preview.
  rerenderPreviews(path) {
    var _a;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian5.MarkdownView)) continue;
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
  //
  // Every open markdown leaf's own document, rather than a single "the
  // current" document — `activeDocument` (Obsidian's "whichever window last
  // had focus" global) was the actual Update003 bug, caught by temporary
  // diagnostic logging: right after a plugin off/on toggle it can resolve to
  // an unrelated `about:blank` document instead of any real app window, so
  // the element was created and connected successfully every time — just in
  // a document nobody renders. Targeting every leaf's own document sidesteps
  // that "which window is active right now" question entirely, and as a
  // side effect correctly supports a note popped out into its own window
  // too (each Electron window has its own separate DOM).
  cssVarTargetDocuments() {
    const docs = /* @__PURE__ */ new Set();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) docs.add(leaf.view.containerEl.ownerDocument);
    docs.add(activeDocument);
    return docs;
  }
  applyLevelCssVars() {
    const vars = levelCssVars(this.settings.levels);
    const body = Object.entries(vars).map(([key, value]) => `	${key}: ${value};`).join("\n");
    const css = `:root {
${body}
}`;
    for (const doc of this.cssVarTargetDocuments()) {
      let el = doc.getElementById(CSS_VAR_STYLE_ID);
      if (!(el instanceof HTMLStyleElement)) {
        el = doc.createElement("style");
        el.id = CSS_VAR_STYLE_ID;
        doc.head.appendChild(el);
      }
      el.textContent = css;
    }
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
  // Folds or unfolds one entry from a click on its chevron (either view) or
  // the toggle command. `lineIndex` may be the entry line or any body line
  // under it; `caretView` is the editor the command ran in, if any. Collapsing
  // the section the caret is sitting in would leave the caret inside a hidden
  // atomic block with no rendered position, so it is first moved to the end
  // of the entry's visible text.
  toggleFoldAtLine(path, lineIndex, caretView) {
    var _a;
    const view = caretView != null ? caretView : this.editorFor(path);
    const body = view ? parseMetaDocument(view.state.doc.toString()).body : (_a = this.states.get(path)) == null ? void 0 : _a.body;
    if (body === void 0) return;
    const node = ownerNodeAtLine(body, lineIndex, this.settings.sigil);
    if (!node) {
      new import_obsidian5.Notice("Put the cursor on an outline entry or its body to collapse it.");
      return;
    }
    if (!hasFoldableContent(body.split("\n"), node)) {
      new import_obsidian5.Notice("Nothing to collapse under this entry.");
      return;
    }
    const collapsing = node.id === null || !this.collapsedIdsFor(path).has(node.id);
    let moveCaret = false;
    if (collapsing && caretView) {
      const caretLine = caretView.state.doc.lineAt(caretView.state.selection.main.head).number - 1;
      moveCaret = caretLine > node.entryLine && caretLine < node.subtreeEnd;
    }
    this.toggleCollapsed(path, node, moveCaret ? caretView : null);
  }
  toggleCollapsed(path, node, caretView = null) {
    var _a, _b;
    if (node.id !== null) {
      if (caretView) {
        const line = caretView.state.doc.line(node.entryLine + 1);
        const idMatch = ID_SUFFIX_RE.exec(line.text);
        const visibleEnd = line.from + (idMatch ? idMatch.index : line.text.length);
        caretView.dispatch({ selection: { anchor: visibleEnd } });
      }
      this.flipCollapse(path, node.id);
      return;
    }
    const view = this.editorFor(path);
    if (!view) {
      new import_obsidian5.Notice("Open this note to collapse an entry that doesn't have a stable ID yet.");
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
    view.dispatch({
      changes: { from: lineEnd, to: lineEnd, insert: withId },
      selection: caretView === view ? { anchor: lineEnd } : void 0
    });
    this.setStateFromDoc(path, view.state.doc.toString());
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
      if (changes.length > 0) {
        view.dispatch({ changes });
        this.setStateFromDoc(path, view.state.doc.toString());
      }
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
    if (missingIdSkipped) new import_obsidian5.Notice("Open this note to fold every entry \u2014 some don't have a stable ID yet.");
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
      }, delayMs === 0 ? 0 : delayMs || RESOLVE_DEBOUNCE_MS)
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
    const decorations = buildOutlineDecorations(
      view,
      plan,
      this.settings.sigil,
      this.onFoldClick,
      this.textOffsets.get(view)
    );
    view.dispatch({
      effects: setOutlineDecorations.of(decorations),
      selection: view.composing ? void 0 : view.state.selection
    });
    if (this.settings.indentBody) this.scheduleTextMeasure(view);
  }
  // Measures where each rendered entry's text starts and, only when that moved,
  // redraws so body lines pick up the new offsets. The redraw schedules one
  // more measure, which finds nothing changed and stops — so this settles in
  // at most two passes instead of looping. Runs in CM6's measure phase, which
  // batches the DOM reads away from its own writes.
  scheduleTextMeasure(view) {
    if (!this.settings.indentBody || !this.editors.has(view)) return;
    view.requestMeasure({
      key: "vo-entry-text-offsets",
      read: () => measureEntryTextOffsets(view),
      write: (measured) => {
        var _a;
        const previous = (_a = this.textOffsets.get(view)) != null ? _a : /* @__PURE__ */ new Map();
        if (sameTextOffsets(previous, measured)) return;
        this.textOffsets.set(view, measured);
        window.setTimeout(() => {
          if (this.editors.has(view)) this.decorate(view);
        }, 0);
      }
    });
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
    new import_obsidian5.Notice(`Generated ${target}`);
  }
  pruneOrphanedIn(view, path) {
    const doc = view.state.doc.toString();
    const { body } = parseMetaDocument(doc);
    const parsed = parseOutline(body, this.settings.sigil);
    const liveIds = /* @__PURE__ */ new Set();
    for (const node of parsed.flat) if (node.id !== null) liveIds.add(node.id);
    const result = pruneOrphaned(doc, liveIds);
    if (result.removedIds.length === 0) {
      new import_obsidian5.Notice("Virtual Outliner: nothing to prune.");
      return;
    }
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result.doc } });
    new import_obsidian5.Notice(`Virtual Outliner: pruned ${result.removedIds.length} orphaned record(s).`);
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
    let view = this.app.workspace.getActiveViewOfType(import_obsidian5.MarkdownView);
    if (!view || ((_a = view.file) == null ? void 0 : _a.path) !== path) {
      await this.app.workspace.openLinkText(path, "", false);
      view = this.app.workspace.getActiveViewOfType(import_obsidian5.MarkdownView);
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
  // Close when the outline is on screen; otherwise open it, or bring an
  // existing one forward (a tab behind another in its group, or a collapsed
  // sidebar). "On screen" rather than "exists" so a press never closes an
  // outline the user could not see — that would read as the button doing
  // nothing.
  async toggleSidebar() {
    const shown = this.shownSidebarLeaves();
    if (shown.length > 0) {
      for (const leaf of shown) leaf.detach();
    } else {
      await this.activateSidebar();
    }
    this.scheduleToolbarRefresh();
  }
  shownSidebarLeaves() {
    return this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE).filter((leaf) => {
      const root = leaf.getRoot();
      const { leftSplit, rightSplit } = this.app.workspace;
      if (root === rightSplit && rightSplit.collapsed || root === leftSplit && leftSplit.collapsed) {
        return false;
      }
      return leaf.view.containerEl.isShown();
    });
  }
  isSidebarShown() {
    return this.shownSidebarLeaves().length > 0;
  }
  // The CM6 EditorView inside the active Markdown pane (not merely one open
  // on the same file — the same note can be open in two panes). Obsidian's
  // Editor wrapper exposes no public handle to it, so it is matched from the
  // views the editor extension has already registered.
  activeEditorView() {
    const markdownView = this.app.workspace.getActiveViewOfType(import_obsidian5.MarkdownView);
    if (!markdownView || markdownView.getMode() !== "source") return null;
    for (const view of this.editors) {
      if (markdownView.containerEl.contains(view.dom)) return view;
    }
    return null;
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
