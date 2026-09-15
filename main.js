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
var import_obsidian7 = require("obsidian");

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
function ancestorChain(node2) {
  const chain = [];
  let cur = node2;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent;
  }
  return chain;
}
function computeLabel(levelFormats, node2) {
  const chain = ancestorChain(node2);
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
function splitEntryId(text2) {
  var _a;
  const match = ID_SUFFIX_RE.exec(text2);
  if (!match) return { text: text2, id: null };
  const digits = (_a = match[1]) != null ? _a : "";
  return { text: text2.slice(0, match.index), id: ID_PREFIX + digits };
}
function appendId(text2, id) {
  return `${text2} ${id}`;
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
    const { text: text2, id } = splitEntryId(rest);
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
    const node2 = {
      entryLine: i,
      level,
      text: text2.trimEnd(),
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
    if (parent) parent.children.push(node2);
    else roots.push(node2);
    stack[level] = node2;
    for (let l = level + 1; l <= 6; l++) stack[l] = null;
    flat.push(node2);
  }
  for (let idx = 0; idx < flat.length; idx++) {
    const node2 = flat[idx];
    if (!node2) continue;
    const next = flat[idx + 1];
    node2.ownBodyEnd = next ? next.entryLine : lines.length;
    let subtreeEndIdx = idx + 1;
    while (subtreeEndIdx < flat.length) {
      const candidate = flat[subtreeEndIdx];
      if (candidate && candidate.level <= node2.level) break;
      subtreeEndIdx++;
    }
    const subtreeNext = flat[subtreeEndIdx];
    node2.subtreeEnd = subtreeNext ? subtreeNext.entryLine : lines.length;
  }
  return { roots, flat, lineCount: lines.length };
}
function nodeAtLine(parsed, line) {
  for (const node2 of parsed.flat) {
    if (node2.entryLine === line) return node2;
  }
  return null;
}
function previousSibling(parsed, node2) {
  const idx = parsed.flat.indexOf(node2);
  for (let i = idx - 1; i >= 0; i--) {
    const candidate = parsed.flat[i];
    if (!candidate || candidate.level < node2.level) return null;
    if (candidate.level === node2.level) return candidate;
  }
  return null;
}
function nextSibling(parsed, node2) {
  const idx = parsed.flat.indexOf(node2);
  for (let i = idx + 1; i < parsed.flat.length; i++) {
    const candidate = parsed.flat[i];
    if (!candidate || candidate.level < node2.level) return null;
    if (candidate.level === node2.level) return candidate;
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
  return parsed.flat.map((node2) => {
    var _a;
    return {
      id: node2.id,
      level: node2.level,
      text: node2.text,
      label: computeLabel(levels, node2),
      siblingIndex: node2.siblingIndex,
      meta: node2.id !== null ? clone((_a = metaById.get(node2.id)) != null ? _a : null) : null
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
function subtreeText(body, lines, node2) {
  const { from, to } = sliceRange(lines, node2.subtreeStart, node2.subtreeEnd);
  return body.slice(from, to);
}
function deepestLevelInSubtree(lines, node2, sigilChar) {
  var _a;
  let max = node2.level;
  for (let i = node2.subtreeStart; i < node2.subtreeEnd; i++) {
    const level = entryLevel((_a = lines[i]) != null ? _a : "", sigilChar);
    if (level !== null && level > max) max = level;
  }
  return max;
}
function shiftSubtreeLevels(text2, delta, sigilChar) {
  const lines = text2.split("\n");
  const shifted = lines.map((line) => {
    if (!isEntryLine(line, sigilChar)) return line;
    return delta === 1 ? sigilChar + line : line.slice(sigilChar.length);
  });
  return shifted.join("\n");
}
function demote(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node2 = nodeAtLine(parsed, entryLine);
  if (!node2) return null;
  if (node2.level >= MAX_LEVEL) return null;
  if (deepestLevelInSubtree(lines, node2, sigilChar) >= MAX_LEVEL) return null;
  const idx = parsed.flat.indexOf(node2);
  const prev = idx > 0 ? parsed.flat[idx - 1] : null;
  if (!prev || prev.level < node2.level) return null;
  const { from, to } = sliceRange(lines, node2.subtreeStart, node2.subtreeEnd);
  const insert = shiftSubtreeLevels(subtreeText(body, lines, node2), 1, sigilChar);
  return { from, to, insert };
}
function promote(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node2 = nodeAtLine(parsed, entryLine);
  if (!node2) return null;
  if (node2.level <= 1) return null;
  const { from, to } = sliceRange(lines, node2.subtreeStart, node2.subtreeEnd);
  const insert = shiftSubtreeLevels(subtreeText(body, lines, node2), -1, sigilChar);
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
  for (const node2 of parsed.flat) {
    if (node2.entryLine > line) break;
    owner = node2;
  }
  return owner;
}
function moveUp(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node2 = nodeAtLine(parsed, entryLine);
  if (!node2) return null;
  const nodeRange = sliceRange(lines, node2.subtreeStart, node2.subtreeEnd);
  const nodeText = body.slice(nodeRange.from, nodeRange.to);
  const prev = previousSibling(parsed, node2);
  if (prev) {
    const prevRange = sliceRange(lines, prev.subtreeStart, prev.subtreeEnd);
    const prevText = body.slice(prevRange.from, prevRange.to);
    const chunks2 = rejoinChunks(body, prevRange.from, nodeRange.to, [nodeText, prevText]);
    return { from: prevRange.from, to: nodeRange.to, insert: chunks2.join(""), movedTo: prevRange.from };
  }
  const parent = node2.parent;
  if (!parent || !previousSibling(parsed, parent)) return null;
  const headRange = sliceRange(lines, parent.entryLine, node2.subtreeStart);
  const headText = body.slice(headRange.from, headRange.to);
  const chunks = rejoinChunks(body, headRange.from, nodeRange.to, [nodeText, headText]);
  return { from: headRange.from, to: nodeRange.to, insert: chunks.join(""), movedTo: headRange.from };
}
function moveDown(body, entryLine, sigilChar = DEFAULT_SIGIL_CHAR) {
  var _a, _b;
  const lines = body.split("\n");
  const parsed = parseOutline(body, sigilChar);
  const node2 = nodeAtLine(parsed, entryLine);
  if (!node2) return null;
  const nodeRange = sliceRange(lines, node2.subtreeStart, node2.subtreeEnd);
  const nodeText = body.slice(nodeRange.from, nodeRange.to);
  const next = nextSibling(parsed, node2);
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
  const parent = node2.parent;
  const parentNext = parent ? nextSibling(parsed, parent) : null;
  if (!parentNext) return null;
  const headRange = sliceRange(lines, node2.subtreeEnd, parentNext.ownBodyEnd);
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
  const { text: text2 } = splitEntryId(rest);
  const prefixEnd = line.length - rest.length;
  const idMatch = ID_SUFFIX_RE.exec(line);
  const visibleEnd = idMatch ? idMatch.index : line.length;
  const newEntry = sigils + " ";
  const offsets = lineStartOffsets(lines);
  const lineStart = (_c = offsets[entryLine]) != null ? _c : 0;
  const lineEnd = lineStart + line.length;
  if (text2.trim() === "") {
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
  const node2 = nodeAtLine(parsed, entryLine);
  if (!node2) return null;
  let lastLine = node2.subtreeEnd - 1;
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
  for (const node2 of parsed.flat) {
    if (node2.id !== null && collapsedIds.has(node2.id) && node2.subtreeEnd > node2.entryLine + 1) {
      collapseRanges.push({ from: node2.entryLine + 1, to: node2.subtreeEnd });
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
    for (const node2 of parsed.flat) {
      viewStateRanges.push({ from: node2.entryLine, to: node2.entryLine + 1 });
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
  for (const node2 of parsed.flat) {
    if (isLineHidden(hiddenLineRanges, node2.entryLine)) continue;
    entryLevel2.set(node2.entryLine, node2.level);
    if (showLabels) labels.set(node2.entryLine, computeLabel(levels, node2));
    indentLevel.set(node2.entryLine, node2.level);
    if (hasFoldableContent(lines, node2)) {
      foldable.set(node2.entryLine, node2.id !== null && collapsedIds.has(node2.id));
    }
  }
  if (indentBody) {
    for (const node2 of parsed.flat) {
      for (let line = node2.ownBodyStart; line < node2.ownBodyEnd; line++) {
        if (isLineHidden(hiddenLineRanges, line)) continue;
        bodyIndentLevel.set(line, node2.level);
        bodyOwnerLine.set(line, node2.entryLine);
      }
    }
  }
  return { parsed, labels, indentLevel, bodyIndentLevel, bodyOwnerLine, entryLevel: entryLevel2, foldable, hiddenLineRanges };
}
function hasFoldableContent(lines, node2) {
  var _a;
  for (let i = node2.entryLine + 1; i < node2.subtreeEnd; i++) {
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
  for (const node2 of plan.parsed.flat) {
    if (isLineHidden(plan.hiddenLineRanges, node2.entryLine)) continue;
    const label = plan.labels.get(node2.entryLine);
    entryOutput.set(node2.entryLine, label && label !== "" ? `${label} ${node2.text}` : node2.text);
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (isLineHidden(plan.hiddenLineRanges, i)) continue;
    const entryText = entryOutput.get(i);
    out.push(entryText !== void 0 ? entryText : (_a = lines[i]) != null ? _a : "");
  }
  return out.join("\n");
}

// src/core/exportOptions.ts
var FONT_SIZES = ["8", "9", "10", "11", "12", "14", "17", "20"];
var CITE_STYLES = ["MLA", "APA", "Chicago", "Chicago-notes"];
function frontmatterValue(fm, key) {
  if (!fm) return void 0;
  const wanted = key.toLowerCase();
  for (const [k, v] of Object.entries(fm)) {
    if (k.toLowerCase() === wanted) return v;
  }
  return void 0;
}
function text(v) {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}
function parseYesNo(v, fallback) {
  if (typeof v === "boolean") return v;
  const s = text(v).toLowerCase();
  if (["y", "yes", "true", "1", "on"].includes(s)) return true;
  if (["n", "no", "false", "0", "off"].includes(s)) return false;
  return fallback;
}
function parseNotes(v, fallback) {
  const s = text(v).toLowerCase();
  if (s.startsWith("e")) return "e";
  if (s.startsWith("f")) return "f";
  return fallback;
}
function normalizeFontSize(v) {
  let s = text(v).toLowerCase();
  if (s.endsWith("pt")) s = s.slice(0, -2).trim();
  return FONT_SIZES.includes(s) ? s : null;
}
function resolveExportOptions(fm, defaults, noteBasename) {
  const title = text(frontmatterValue(fm, "title"));
  const author = text(frontmatterValue(fm, "author"));
  const cite = text(frontmatterValue(fm, "cite"));
  return {
    headnum: parseYesNo(frontmatterValue(fm, "headnum"), defaults.headnum),
    toc: parseYesNo(frontmatterValue(fm, "toc"), defaults.toc),
    notes: parseNotes(frontmatterValue(fm, "notes"), defaults.notes),
    cite: cite !== "" ? cite : defaults.cite,
    pdfOutput: text(frontmatterValue(fm, "pdf-output")),
    fontsize: normalizeFontSize(frontmatterValue(fm, "fontsize")),
    title: title !== "" ? title : noteBasename,
    author: author !== "" ? author : null,
    bibliography: text(frontmatterValue(fm, "bibliography")),
    latexPreamble: text(frontmatterValue(fm, "latex-preamble"))
  };
}
function normalizePosixPath(p) {
  const absolute = p.startsWith("/");
  const out = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(part);
  }
  return (absolute ? "/" : "") + out.join("/");
}
function resolvePdfOutput(pdfOutput, noteDirAbs, noteStem, homeDir) {
  let value = pdfOutput.trim();
  if (value === "") return normalizePosixPath(`${noteDirAbs}/${noteStem}.pdf`);
  if (value === "~") value = homeDir;
  else if (value.startsWith("~/")) value = `${homeDir}/${value.slice(2)}`;
  if (!value.startsWith("/")) value = `${noteDirAbs}/${value}`;
  if (value.toLowerCase().endsWith(".pdf")) return normalizePosixPath(value);
  return normalizePosixPath(`${value}/${noteStem}.pdf`);
}
function checkPreamble(preamble) {
  const warnings = [];
  let depth = 0;
  let unbalanced = false;
  for (const rawLine of preamble.split("\n")) {
    let line = "";
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i];
      if (ch === "\\") {
        line += rawLine.slice(i, i + 2);
        i++;
        continue;
      }
      if (ch === "%") break;
      line += ch;
    }
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth < 0) unbalanced = true;
      }
    }
    if (/\\documentclass\b/.test(line)) warnings.push("Remove \\documentclass \u2014 this is a preamble include, not a full document.");
    if (/\\begin\{document\}/.test(line)) warnings.push("Remove \\begin{document} \u2014 the export adds it.");
  }
  if (unbalanced || depth !== 0) warnings.unshift("Braces { } are unbalanced.");
  return warnings;
}

// src/core/settings.ts
function defaultPdfExportSettings() {
  return {
    preamble: "",
    author: "Joshua S. Glazer",
    headnum: false,
    toc: false,
    notes: "f",
    cite: "MLA",
    lastFontSize: "12",
    keepBuildFiles: false,
    openAfterExport: false
  };
}
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
    toolbarHighlights: defaultToolbarHighlights(),
    pdfExport: defaultPdfExportSettings()
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
function readPdfExport(v) {
  var _a;
  const fallback = defaultPdfExportSettings();
  if (!isRecord2(v)) return fallback;
  const cite = readString(v.cite, fallback.cite).trim();
  const size = readString(v.lastFontSize, fallback.lastFontSize);
  return {
    preamble: readString(v.preamble, fallback.preamble),
    author: readString(v.author, fallback.author),
    headnum: readBool(v.headnum, fallback.headnum),
    toc: readBool(v.toc, fallback.toc),
    notes: v.notes === "e" ? "e" : "f",
    cite: cite !== "" ? cite : (_a = CITE_STYLES[0]) != null ? _a : "MLA",
    lastFontSize: FONT_SIZES.includes(size) ? size : fallback.lastFontSize,
    keepBuildFiles: readBool(v.keepBuildFiles, fallback.keepBuildFiles),
    openAfterExport: readBool(v.openAfterExport, fallback.openAfterExport)
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
    toolbarHighlights: readToolbarHighlights(raw.toolbarHighlights),
    pdfExport: readPdfExport(raw.pdfExport)
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
  for (const text2 of Array.from(view.contentDOM.querySelectorAll(".cm-line .vo-text"))) {
    const line = text2.closest(".cm-line");
    if (!line) continue;
    let lineIndex;
    try {
      lineIndex = view.state.doc.lineAt(view.posAtDOM(line)).number - 1;
    } catch (e) {
      continue;
    }
    if (out.has(lineIndex)) continue;
    const rect = text2.getClientRects()[0];
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
  const node2 = ownerNodeAtLine(body, line.lineIndex, sigil);
  if (!node2) return false;
  const splice = (direction === "up" ? moveUp : moveDown)(body, node2.entryLine, sigil);
  if (!splice) return true;
  const blockStart = view.state.doc.line(node2.subtreeStart + 1).from;
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
    let node2 = walker.nextNode();
    while (node2) {
      if (!first) first = node2;
      last = node2;
      node2 = walker.nextNode();
    }
  }
  return { first, last };
}
function wrapEntryText(first, last, level, doc) {
  var _a;
  const wrapper = doc.createElement("span");
  wrapper.className = `vo-text vo-l${level}`;
  (_a = first.parentNode) == null ? void 0 : _a.insertBefore(wrapper, first);
  let node2 = first;
  while (node2) {
    const next = node2.nextSibling;
    wrapper.appendChild(node2);
    if (node2 === last) break;
    node2 = next;
  }
  return wrapper;
}
function stripLinePrefix(node2, prefix) {
  var _a;
  const raw = (_a = node2.nodeValue) != null ? _a : "";
  const index = raw.indexOf(prefix);
  if (index < 0 || raw.slice(0, index).trim() !== "") return false;
  node2.nodeValue = raw.slice(index + prefix.length);
  return true;
}
function stripIdSuffix(node2, suffix) {
  var _a;
  const raw = (_a = node2.nodeValue) != null ? _a : "";
  const trimmed = raw.trimEnd();
  if (!trimmed.endsWith(suffix)) return false;
  node2.nodeValue = trimmed.slice(0, -suffix.length);
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
  for (const node2 of segment.nodes) wrapper.appendChild(node2);
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
  const text2 = entry.querySelector(".vo-text");
  const rect = text2 == null ? void 0 : text2.getClientRects()[0];
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

// src/export/exporter.ts
var import_obsidian3 = require("obsidian");

// src/core/exportBody.ts
var FENCE_RE = /^\s*(`{3,}|~{3,})/;
function nextFenceState(line, open) {
  var _a;
  const m = FENCE_RE.exec(line);
  if (!m) return open;
  const marker = (_a = m[1]) != null ? _a : "";
  if (open === null) return marker;
  return marker[0] === open[0] && marker.length >= open.length ? null : open;
}
function stripFrontmatter(doc) {
  var _a, _b;
  const lines = doc.split("\n");
  if (((_a = lines[0]) != null ? _a : "").trimEnd() !== "---") return doc;
  for (let i = 1; i < lines.length; i++) {
    const t = ((_b = lines[i]) != null ? _b : "").trimEnd();
    if (t === "---" || t === "...") return lines.slice(i + 1).join("\n");
  }
  return doc;
}
var FOOTNOTE_RE = /\[\^[^\]\s]+\]|\^\[/;
var EMBED_RE = /!\[\[/;
var WIKILINK_RE = /(^|[^!])\[\[/;
var MD_LINK_RE = /(^|[^!])\[[^\]]*\]\([^)]+\)/;
function lostKinds(entryText) {
  const kinds = [];
  if (FOOTNOTE_RE.test(entryText)) kinds.push("footnote");
  if (collectCiteKeys(entryText).length > 0) kinds.push("citation");
  if (WIKILINK_RE.test(entryText) || MD_LINK_RE.test(entryText)) kinds.push("link");
  if (EMBED_RE.test(entryText)) kinds.push("embed");
  return kinds;
}
function extractBody(doc, sigilChar) {
  var _a, _b, _c, _d;
  const lines = stripFrontmatter(parseMetaDocument(doc).body).split("\n");
  const entryRe = outlineLineRegex(sigilChar);
  const out = [];
  const lost = [];
  let fence = null;
  let lastBlank = true;
  for (let i = 0; i < lines.length; i++) {
    const line = (_a = lines[i]) != null ? _a : "";
    if (fence !== null || FENCE_RE.test(line)) {
      fence = nextFenceState(line, fence);
      out.push(line);
      lastBlank = false;
      continue;
    }
    let emitted = line;
    if (isOutlineLine(line, sigilChar)) {
      const entryText = ((_c = (_b = entryRe.exec(line)) == null ? void 0 : _b[2]) != null ? _c : "").trim();
      const kinds = lostKinds(entryText);
      if (kinds.length > 0) lost.push({ line: i, text: entryText, kinds });
      emitted = "";
    }
    const blank = emitted.trim() === "";
    if (blank && lastBlank) continue;
    out.push(blank ? "" : emitted);
    lastBlank = blank;
  }
  while (out.length > 0 && ((_d = out[out.length - 1]) != null ? _d : "").trim() === "") out.pop();
  const body = out.join("\n");
  return { body, lost, isEmpty: body.trim() === "" };
}
var CITE_RE = /(^|[^A-Za-z0-9_@.\\])-?@(\{[^}]+\}|[A-Za-z0-9_À-ɏ][A-Za-z0-9_À-ɏ:.#$%&+?<>~/-]*)/g;
function trimKey(raw) {
  if (raw.startsWith("{")) return raw.slice(1, -1).trim();
  return raw.replace(/[^A-Za-z0-9_À-ɏ]+$/, "");
}
function stripInlineCode(line) {
  return line.replace(/(`+)[\s\S]*?\1/g, " ");
}
function collectCiteKeys(markdown) {
  var _a;
  const keys = [];
  const seen = /* @__PURE__ */ new Set();
  let fence = null;
  for (const line of markdown.split("\n")) {
    if (fence !== null || FENCE_RE.test(line)) {
      fence = nextFenceState(line, fence);
      continue;
    }
    const scan = stripInlineCode(line);
    CITE_RE.lastIndex = 0;
    let m;
    while ((m = CITE_RE.exec(scan)) !== null) {
      const key = trimKey((_a = m[2]) != null ? _a : "");
      if (key !== "" && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}
function groupKeysByLibrary(keys, known) {
  var _a;
  const libraryOf = /* @__PURE__ */ new Map();
  for (const k of known) if (!libraryOf.has(k.citekey)) libraryOf.set(k.citekey, k.libraryID);
  const byLibrary = /* @__PURE__ */ new Map();
  const unknown = [];
  for (const key of keys) {
    const lib = libraryOf.get(key);
    if (lib === void 0) {
      unknown.push(key);
      continue;
    }
    const list = (_a = byLibrary.get(lib)) != null ? _a : [];
    list.push(key);
    byLibrary.set(lib, list);
  }
  return { byLibrary, unknown };
}

// src/core/obsidianMarkdown.ts
var MAX_EMBED_DEPTH = 5;
var FENCE_START_RE = /^\s*(`{3,}|~{3,})/;
var EMBED_RE2 = /!\[\[([^\]]+)\]\]/g;
var WIKILINK_RE2 = /\[\[([^\]]+)\]\]/g;
var MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
var MD_LINK_RE2 = /\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
var CALLOUT_RE = /^(\s*(?:>\s*)+)\[!([^\]]+)\][+-]?\s*(.*)$/;
var BLOCK_ID_RE = /\s\^[A-Za-z0-9-]+\s*$/;
var REMOTE_RE = /^[a-z][a-z0-9+.-]*:/i;
function stripComments(markdown) {
  const out = [];
  let fence = null;
  let inComment = false;
  for (const line of markdown.split("\n")) {
    if (!inComment && (fence !== null || FENCE_START_RE.test(line))) {
      fence = nextFenceState(line, fence);
      out.push(line);
      continue;
    }
    if (!inComment && !line.includes("%%")) {
      out.push(line);
      continue;
    }
    let kept = "";
    let rest = line;
    while (rest.length > 0) {
      const idx = rest.indexOf("%%");
      if (idx === -1) {
        if (!inComment) kept += rest;
        break;
      }
      if (!inComment) kept += rest.slice(0, idx);
      inComment = !inComment;
      rest = rest.slice(idx + 2);
    }
    if (kept.trim() !== "" || line.trim() === "") out.push(kept.trimEnd());
  }
  return out.join("\n");
}
function splitCode(line) {
  const parts = [];
  const re = /(`+)[\s\S]*?\1/g;
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    parts.push(line.slice(last, m.index), m[0]);
    last = m.index + m[0].length;
  }
  parts.push(line.slice(last));
  return parts;
}
function splitTarget(inner) {
  const bar = inner.indexOf("|");
  const target = (bar === -1 ? inner : inner.slice(0, bar)).trim();
  const alias = bar === -1 ? "" : inner.slice(bar + 1).trim();
  const hash = target.indexOf("#");
  return {
    linkpath: hash === -1 ? target : target.slice(0, hash),
    subpath: hash === -1 ? "" : target.slice(hash + 1),
    alias
  };
}
function wikilinkText(inner) {
  const { linkpath, subpath, alias } = splitTarget(inner);
  if (alias !== "") return alias;
  const name = linkpath.replace(/\.md$/i, "");
  const sub = subpath.startsWith("^") ? "" : subpath.replace(/#/g, " > ");
  if (name === "") return sub;
  return sub === "" ? name : `${name} > ${sub}`;
}
function extractSubpath(markdown, subpath) {
  var _a, _b, _c, _d, _e, _f;
  const lines = markdown.split("\n");
  if (subpath.startsWith("^")) {
    const id = subpath.slice(1);
    const idx = lines.findIndex((l) => new RegExp(`\\s\\^${id.replace(/[-]/g, "\\-")}\\s*$`).test(l));
    if (idx === -1) return null;
    let start2 = idx;
    while (start2 > 0 && ((_a = lines[start2 - 1]) != null ? _a : "").trim() !== "") start2--;
    return lines.slice(start2, idx + 1).join("\n");
  }
  const wanted = (_c = (_b = subpath.split("#").pop()) == null ? void 0 : _b.trim().toLowerCase()) != null ? _c : "";
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec((_d = lines[i]) != null ? _d : "");
    if (!m) continue;
    const lvl = ((_e = m[1]) != null ? _e : "").length;
    if (start === -1) {
      if (((_f = m[2]) != null ? _f : "").trim().toLowerCase() === wanted) {
        start = i;
        level = lvl;
      }
    } else if (lvl <= level) {
      return lines.slice(start, i).join("\n");
    }
  }
  return start === -1 ? null : lines.slice(start).join("\n");
}
function decodeTarget(raw) {
  const t = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
  try {
    return decodeURIComponent(t);
  } catch (e) {
    return t;
  }
}
function imageRef(rel) {
  return /[\s()<>]/.test(rel) ? `<${rel}>` : rel;
}
function sizeAttr(alias) {
  const m = /^(\d+)(?:x\d+)?$/.exec(alias.trim());
  return m ? `{width=${m[1]}px}` : "";
}
async function convertEmbed(inner, fromPath, ctx, standalone) {
  const { linkpath, subpath, alias } = splitTarget(inner);
  const decoded = decodeTarget(linkpath);
  if (REMOTE_RE.test(decoded)) return `![](${imageRef(decoded)})${sizeAttr(alias)}`;
  const resolved = linkpath === "" ? { path: fromPath, kind: "markdown" } : ctx.resolver.resolveLink(decoded, fromPath);
  if (!resolved) {
    ctx.issues.push({ kind: "unresolved", target: inner });
    return "";
  }
  if (resolved.kind === "image") {
    const alt = sizeAttr(alias) === "" ? alias : "";
    return `![${alt}](${imageRef(ctx.resolver.stageImage(resolved.path))})${sizeAttr(alias)}`;
  }
  if (resolved.kind !== "markdown") {
    ctx.issues.push({ kind: "unsupported", target: inner });
    return "";
  }
  if (ctx.stack.includes(resolved.path) || ctx.stack.length >= MAX_EMBED_DEPTH) {
    ctx.issues.push({ kind: "cycle", target: inner });
    return "";
  }
  let content = extractBody(await ctx.resolver.readNote(resolved.path), ctx.sigilChar).body;
  if (subpath !== "") {
    const section = extractSubpath(content, subpath);
    if (section === null) {
      ctx.issues.push({ kind: "unresolved", target: inner });
      return "";
    }
    content = section;
  }
  ctx.stack.push(resolved.path);
  const converted = await convertText(content, resolved.path, ctx);
  ctx.stack.pop();
  return standalone ? `
${converted.trim()}
` : converted.trim().replace(/\n+/g, " ");
}
async function convertSegment(segment, fromPath, ctx, standalone) {
  var _a;
  let out = "";
  let last = 0;
  EMBED_RE2.lastIndex = 0;
  const embeds = [];
  let m;
  while ((m = EMBED_RE2.exec(segment)) !== null) embeds.push({ index: m.index, length: m[0].length, inner: (_a = m[1]) != null ? _a : "" });
  for (const e of embeds) {
    out += segment.slice(last, e.index);
    out += await convertEmbed(e.inner, fromPath, ctx, standalone);
    last = e.index + e.length;
  }
  out += segment.slice(last);
  out = out.replace(MD_IMAGE_RE, (whole, alt, target, title) => {
    const decoded = decodeTarget(target);
    if (REMOTE_RE.test(decoded) || decoded.startsWith("/") || decoded.startsWith("assets/")) return whole;
    const resolved = ctx.resolver.resolveLink(decoded, fromPath);
    if (!resolved || resolved.kind !== "image") {
      ctx.issues.push({ kind: "unresolved", target: decoded });
      return "";
    }
    return `![${alt}](${imageRef(ctx.resolver.stageImage(resolved.path))}${title})`;
  });
  out = out.replace(WIKILINK_RE2, (_whole, inner) => wikilinkText(inner));
  out = out.replace(MD_LINK_RE2, (whole, label, target, offset, full) => {
    if (offset > 0 && full[offset - 1] === "!") return whole;
    const decoded = decodeTarget(target);
    if (REMOTE_RE.test(decoded) || decoded.startsWith("#")) return whole;
    return label;
  });
  return out;
}
async function convertText(markdown, fromPath, ctx) {
  var _a, _b, _c, _d;
  const out = [];
  let fence = null;
  for (const rawLine of stripComments(markdown).split("\n")) {
    if (fence !== null || FENCE_START_RE.test(rawLine)) {
      fence = nextFenceState(rawLine, fence);
      out.push(rawLine);
      continue;
    }
    let line = rawLine;
    const callout = CALLOUT_RE.exec(line);
    if (callout) {
      const type = ((_a = callout[2]) != null ? _a : "").trim();
      const title = ((_b = callout[3]) != null ? _b : "").trim() || type.charAt(0).toUpperCase() + type.slice(1);
      line = `${(_c = callout[1]) != null ? _c : "> "}**${title}**`;
    }
    line = line.replace(BLOCK_ID_RE, "");
    const standalone = /^\s*!\[\[[^\]]+\]\]\s*$/.test(line);
    const parts = splitCode(line);
    let rebuilt = "";
    for (let i = 0; i < parts.length; i++) {
      const part = (_d = parts[i]) != null ? _d : "";
      rebuilt += i % 2 === 1 ? part : await convertSegment(part, fromPath, ctx, standalone);
    }
    out.push(rebuilt);
  }
  return out.join("\n");
}
async function toPandocMarkdown(body, fromPath, sigilChar, resolver) {
  const ctx = { sigilChar, resolver, issues: [], stack: [fromPath] };
  const markdown = await convertText(body, fromPath, ctx);
  return { markdown: collapseBlankRuns(markdown), issues: ctx.issues };
}
function collapseBlankRuns(markdown) {
  var _a, _b;
  const out = [];
  let fence = null;
  for (const line of markdown.split("\n")) {
    if (fence !== null || FENCE_START_RE.test(line)) {
      fence = nextFenceState(line, fence);
      out.push(line);
      continue;
    }
    if (line.trim() === "" && (out.length === 0 || ((_a = out[out.length - 1]) != null ? _a : "").trim() === "")) continue;
    out.push(line.trim() === "" ? "" : line);
  }
  while (out.length > 0 && ((_b = out[out.length - 1]) != null ? _b : "").trim() === "") out.pop();
  return out.join("\n");
}

// src/export/node.ts
var cached = null;
function node() {
  if (cached === null) {
    cached = {
      fs: require("fs"),
      path: require("path"),
      os: require("os"),
      crypto: require("crypto"),
      childProcess: require("child_process"),
      process: require("process")
    };
  }
  return cached;
}
function electronShell() {
  try {
    return require("electron").shell;
  } catch (e) {
    return null;
  }
}

// renderer/job.py
var job_default = '#!/usr/bin/env python3\n"""Job helper for render-pdf.sh and quick-action.sh (Python 3.9+, stdlib only).\n\nA job is a build folder holding job.json plus the files it names:\n\n    {\n      "version": 1,\n      "source": "source.md",        # prepared Markdown, relative to the build folder\n      "output": "/abs/path/Note.pdf",\n      "fontsize": "12pt",           # 8 9 10 11 12 14 17 20 (extarticle sizes)\n      "headnum": false,             # number body headings (pandoc -N)\n      "toc": false,                 # table of contents from body headings\n      "notes": "f",                 # "f" footnotes at page bottom, "e" endnotes at document end\n      "preamble": "preamble.tex",   # relative to the build folder, or absolute\n      "bibliography": "",           # CSL-JSON / .bib path; "" = no citation processing\n      "cite": "MLA",                # MLA | APA | Chicago | Chicago-notes | path to a .csl\n      "title": "Note",              # running header title\n      "author": "\u2026",                # running header author (\\\\DocAuthor)\n      "resourcePath": "/abs/note/folder"\n    }\n\nSubcommands:\n    env <job.json>                     shell assignments (JOB_*) for render-pdf.sh\n    prepare <job.json> <work.md> <meta.tex>\n    deliver <job.json> <pdf>           collision check + atomic move; prints status JSON\n    latex-errors <doc.log>             the useful lines of a failed LaTeX log\n    status-fail <stage> <message>      prints a failure status JSON line\n    qa <note.md> <config.json|""> <fontsize> <build dir>\n                                       Quick Action: refuse outline notes (exit 3),\n                                       otherwise write source.md, preamble.tex, job.json\n"""\n\nimport json\nimport os\nimport re\nimport shlex\nimport shutil\nimport sys\n\nHERE = os.path.dirname(os.path.abspath(__file__))\nFONT_SIZES = {"8", "9", "10", "11", "12", "14", "17", "20"}\n# The PDF Creator stamp written by meta.tex. deliver() only overwrites an\n# existing PDF that carries it, so an unrelated "Note.pdf" beside "Note.md"\n# (a source document, a Zotero attachment) is never clobbered.\nCREATOR = "Virtual Outliner"\nSTYLES = {\n    "mla": ("mla.csl", "Works Cited"),\n    "apa": ("apa.csl", "References"),\n    "chicago": ("chicago.csl", "Bibliography"),\n    "chicago-notes": ("chicago-notes.csl", "Bibliography"),\n}\nFENCE = re.compile(r"^\\s*(```|~~~)")\nFOOTNOTE = re.compile(r"\\[\\^[^\\]\\s]+\\]|\\^\\[")\n\n\ndef status(obj):\n    print(json.dumps(obj))\n\n\ndef fail(stage, message, code=1):\n    status({"ok": False, "stage": stage, "message": message})\n    sys.exit(code)\n\n\ndef load_job(path):\n    with open(path, encoding="utf-8") as fh:\n        job = json.load(fh)\n    build = os.path.dirname(os.path.abspath(path))\n    return job, build\n\n\ndef in_build(build, value):\n    if not value:\n        return ""\n    value = os.path.expanduser(value)\n    return value if os.path.isabs(value) else os.path.join(build, value)\n\n\ndef normalize_fontsize(value):\n    size = str(value or "12").strip().lower()\n    if size.endswith("pt"):\n        size = size[:-2].strip()\n    if size not in FONT_SIZES:\n        raise ValueError("Font size %s is not available; choose one of %s pt."\n                         % (value, ", ".join(sorted(FONT_SIZES, key=int))))\n    return size + "pt"\n\n\ndef resolve_style(cite):\n    """(csl path, reference-section title) for a style name or .csl path."""\n    cite = (cite or "").strip()\n    if not cite:\n        cite = "mla"\n    known = STYLES.get(cite.lower())\n    if known:\n        return os.path.join(HERE, "styles", known[0]), known[1]\n    return os.path.expanduser(cite), "References"\n\n\ndef latex_escape(text):\n    out = []\n    for ch in text:\n        if ch == "\\\\":\n            out.append(r"\\textbackslash{}")\n        elif ch in "&%$#_{}":\n            out.append("\\\\" + ch)\n        elif ch == "~":\n            out.append(r"\\textasciitilde{}")\n        elif ch == "^":\n            out.append(r"\\textasciicircum{}")\n        else:\n            out.append(ch)\n    return "".join(out)\n\n\ndef outside_fences(text):\n    """Yield (line, in_fence) pairs."""\n    in_fence = False\n    for line in text.split("\\n"):\n        if FENCE.match(line):\n            in_fence = not in_fence\n            yield line, True\n            continue\n        yield line, in_fence\n\n\nATX_HEADING = re.compile(r"^(#{1,6})[ \\t]+\\S")\n\n\ndef heading_shift(text):\n    """How far to shift headings so the shallowest one used becomes a LaTeX\n    \\\\section: a note whose headings start at ## would otherwise number its\n    sections 0.1, 0.2, \u2026 and start its TOC one level in."""\n    levels = [len(m.group(1)) for line, fenced in outside_fences(text)\n              if not fenced for m in [ATX_HEADING.match(line)] if m]\n    return 1 - min(levels) if levels else 0\n\n\ndef has_footnotes(text):\n    return any(not fenced and FOOTNOTE.search(line) for line, fenced in outside_fences(text))\n\n\n# --- subcommands -------------------------------------------------------------\n\ndef cmd_env(job_path):\n    job, build = load_job(job_path)\n    try:\n        fontsize = normalize_fontsize(job.get("fontsize"))\n    except ValueError as e:\n        fail("job", str(e))\n    preamble = in_build(build, job.get("preamble") or "preamble.tex")\n    if not os.path.isfile(preamble):\n        fail("job", "Preamble not found: %s" % preamble)\n    bibliography = in_build(build, job.get("bibliography", ""))\n    csl = ""\n    if bibliography:\n        if not os.path.isfile(bibliography):\n            fail("job", "Bibliography not found: %s" % bibliography)\n        csl, _ = resolve_style(job.get("cite"))\n        if not os.path.isfile(csl):\n            fail("job", "Citation style not found: %s" % csl)\n    with open(in_build(build, job.get("source") or "source.md"), encoding="utf-8") as fh:\n        shift = heading_shift(fh.read())\n    values = {\n        "JOB_FONTSIZE": fontsize,\n        "JOB_HEADING_SHIFT": str(shift),\n        "JOB_HEADNUM": "1" if job.get("headnum") else "0",\n        "JOB_TOC": "1" if job.get("toc") else "0",\n        "JOB_PREAMBLE": preamble,\n        "JOB_BIBLIOGRAPHY": bibliography,\n        "JOB_CSL": csl,\n        "JOB_RESOURCE_PATH": job.get("resourcePath") or build,\n    }\n    for key, value in values.items():\n        print("%s=%s" % (key, shlex.quote(value)))\n\n\ndef cmd_prepare(job_path, work_md, meta_tex):\n    job, build = load_job(job_path)\n    with open(in_build(build, job.get("source") or "source.md"), encoding="utf-8") as fh:\n        text = fh.read().rstrip("\\n")\n\n    endnotes = job.get("notes") == "e"\n    tail = []\n    cite_makes_notes = bool(job.get("bibliography")) and "notes" in str(job.get("cite", "")).lower()\n    if endnotes and (has_footnotes(text) or cite_makes_notes):\n        tail.append("\\\\printendnotes")\n    if job.get("bibliography"):\n        _, heading = resolve_style(job.get("cite"))\n        tail.append("# %s {.unnumbered}\\n\\n::: {#refs}\\n:::" % heading)\n    if tail:\n        text += "\\n\\n" + "\\n\\n".join(tail)\n    with open(work_md, "w", encoding="utf-8") as fh:\n        fh.write(text + "\\n")\n\n    title = latex_escape(job.get("title") or "")\n    author = latex_escape(job.get("author") or "")\n    meta = [\n        "% Written by job.py \u2014 per-export values, included BEFORE the preamble so the",\n        "% preamble\'s \\\\providecommand defaults leave them alone.",\n        # Object-stream level 1 keeps the /Info dictionary (and with it the\n        # Creator stamp deliver() looks for) uncompressed and readable.\n        "\\\\pdfvariable objcompresslevel=1",\n        "\\\\def\\\\DocTitle{%s}" % title,\n        "\\\\def\\\\DocAuthor{%s}" % author,\n        "\\\\AtBeginDocument{\\\\hypersetup{pdfcreator={%s},pdftitle={%s},pdfauthor={%s}}}" % (CREATOR, title, author),\n    ]\n    if endnotes:\n        meta += [\n            "\\\\usepackage{enotez}",\n            "\\\\setenotez{list-name=Notes,backref=true}",\n            "\\\\let\\\\footnote\\\\endnote",\n        ]\n    with open(meta_tex, "w", encoding="utf-8") as fh:\n        fh.write("\\n".join(meta) + "\\n")\n\n\nPDF_STRING = re.compile(rb"/Creator\\s*(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]*>)", re.S)\nPDF_ESCAPES = {b"n": b"\\n", b"r": b"\\r", b"t": b"\\t", b"b": b"\\b", b"f": b"\\f"}\n\n\ndef decode_pdf_string(token):\n    """Bytes of a PDF literal "(\u2026)" or hex "<\u2026>" string, decoded to text."""\n    if token.startswith(b"<"):\n        raw = bytes.fromhex(re.sub(rb"\\s", b"", token[1:-1]).decode("ascii"))\n    else:\n        body, raw, i = token[1:-1], bytearray(), 0\n        while i < len(body):\n            c = body[i:i + 1]\n            if c != b"\\\\":\n                raw += c\n                i += 1\n                continue\n            m = re.match(rb"[0-7]{1,3}", body[i + 1:i + 4])\n            if m:\n                raw.append(int(m.group(0), 8) & 0xFF)\n                i += 1 + len(m.group(0))\n            else:\n                nxt = body[i + 1:i + 2]\n                raw += PDF_ESCAPES.get(nxt, nxt)\n                i += 2\n        raw = bytes(raw)\n    if raw.startswith(b"\\xfe\\xff"):\n        return raw[2:].decode("utf-16-be", errors="replace")\n    return raw.decode("latin-1")\n\n\ndef is_ours(pdf_path):\n    """True when the PDF\'s /Info Creator is the Virtual Outliner stamp. meta.tex\n    sets objcompresslevel=1 so the /Info dictionary is never compressed."""\n    try:\n        with open(pdf_path, "rb") as fh:\n            data = fh.read()\n    except OSError:\n        return False\n    return any(CREATOR in decode_pdf_string(m.group(1)) for m in PDF_STRING.finditer(data))\n\n\ndef cmd_deliver(job_path, pdf):\n    job, build = load_job(job_path)\n    src = in_build(build, pdf)\n    out = os.path.expanduser(job.get("output") or "")\n    if not out:\n        fail("deliver", "The job has no output path.")\n    if not os.path.isfile(src):\n        fail("deliver", "LaTeX finished without producing a PDF.")\n    if os.path.exists(out) and not is_ours(out):\n        fail("collision", "%s already exists and was not made by Virtual Outliner, so it was left untouched. "\n                          "Set pdf-output: in the note\'s frontmatter to write somewhere else." % out)\n    try:\n        os.makedirs(os.path.dirname(out), exist_ok=True)\n        tmp = out + ".vo-partial"\n        shutil.copyfile(src, tmp)\n        os.replace(tmp, out)\n    except OSError as e:\n        fail("deliver", "Could not write %s: %s" % (out, e))\n    status({"ok": True, "output": out})\n\n\ndef cmd_latex_errors(log_path):\n    try:\n        with open(log_path, encoding="utf-8", errors="replace") as fh:\n            lines = fh.read().split("\\n")\n    except OSError:\n        print("LaTeX failed and left no log.")\n        return\n    picked = []\n    for i, line in enumerate(lines):\n        if line.startswith("!") or re.match(r"^\\S+\\.tex:\\d+: ", line):\n            picked.extend(lines[i:i + 4])\n            picked.append("")\n        if len(picked) > 30:\n            break\n    print("\\n".join(picked).strip() or "\\n".join(lines[-20:]).strip())\n\n\n# --- Quick Action --------------------------------------------------------------\n\ndef parse_frontmatter(text):\n    """({lowercased key: str}, body) \u2014 flat `key: value` lines only."""\n    lines = text.split("\\n")\n    if not lines or lines[0].strip() != "---":\n        return {}, text\n    for end in range(1, len(lines)):\n        if lines[end].strip() in ("---", "..."):\n            fields = {}\n            for line in lines[1:end]:\n                m = re.match(r"^([A-Za-z0-9_-]+)\\s*:\\s*(.*)$", line)\n                if m:\n                    value = m.group(2).strip()\n                    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\\"\'":\n                        value = value[1:-1]\n                    fields[m.group(1).lower()] = value\n            return fields, "\\n".join(lines[end + 1:])\n    return {}, text\n\n\ndef parse_bool(value, default):\n    v = str(value).strip().lower()\n    if v in ("y", "yes", "true", "1", "on"):\n        return True\n    if v in ("n", "no", "false", "0", "off"):\n        return False\n    return default\n\n\ndef parse_notes(value, default):\n    v = str(value).strip().lower()\n    if v.startswith("e"):\n        return "e"\n    if v.startswith("f"):\n        return "f"\n    return default\n\n\ndef resolve_output(pdf_output, note_path):\n    note_dir = os.path.dirname(os.path.abspath(note_path))\n    stem = os.path.splitext(os.path.basename(note_path))[0]\n    value = (pdf_output or "").strip()\n    if not value:\n        return os.path.join(note_dir, stem + ".pdf")\n    value = os.path.expanduser(value)\n    if not os.path.isabs(value):\n        value = os.path.join(note_dir, value)\n    if value.lower().endswith(".pdf"):\n        return os.path.normpath(value)\n    return os.path.normpath(os.path.join(value, stem + ".pdf"))\n\n\ndef outline_reason(text, sigil):\n    if re.search(r"^%%md-outline\\s*$", text, re.M):\n        return "it has a Virtual Outliner metadata block"\n    entry = re.compile(r"^%s{1,6}[ \\t]+\\S" % re.escape(sigil))\n    for line, fenced in outside_fences(text):\n        if not fenced and entry.match(line):\n            return "it has outline entries (lines starting with %s)" % sigil\n    return None\n\n\ndef cmd_qa(note, config_path, fontsize, build):\n    config = {}\n    if config_path and os.path.isfile(config_path):\n        with open(config_path, encoding="utf-8") as fh:\n            config = json.load(fh)\n    defaults = config.get("defaults", {})\n    sigil = config.get("sigil") or "@"\n\n    with open(note, encoding="utf-8") as fh:\n        text = fh.read()\n    front, body = parse_frontmatter(text)\n    reason = outline_reason(body, sigil)\n    if reason:\n        print("%s can\'t be converted here because %s. Use Export to PDF in Obsidian instead."\n              % (os.path.basename(note), reason))\n        sys.exit(3)\n\n    sys.path.insert(0, HERE)\n    import wikilinks  # noqa: E402\n    body, unresolved = wikilinks.rewrite(body, note)\n    for u in unresolved:\n        print("unresolved embed: %s" % u, file=sys.stderr)\n\n    os.makedirs(build, exist_ok=True)\n    with open(os.path.join(build, "source.md"), "w", encoding="utf-8") as fh:\n        fh.write(body)\n\n    preamble_src = config.get("preamblePath") or ""\n    if not (preamble_src and os.path.isfile(preamble_src)):\n        preamble_src = os.path.join(HERE, "default-preamble.tex")\n    shutil.copyfile(preamble_src, os.path.join(build, "preamble.tex"))\n\n    note_dir = os.path.dirname(os.path.abspath(note))\n    bibliography = front.get("bibliography", "")\n    if bibliography:\n        bibliography = os.path.expanduser(bibliography)\n        if not os.path.isabs(bibliography):\n            bibliography = os.path.join(note_dir, bibliography)\n\n    job = {\n        "version": 1,\n        "source": "source.md",\n        "output": resolve_output(front.get("pdf-output"), note),\n        "fontsize": fontsize or front.get("fontsize") or "12",\n        "headnum": parse_bool(front.get("headnum", ""), bool(defaults.get("headnum", False))),\n        "toc": parse_bool(front.get("toc", ""), bool(defaults.get("toc", False))),\n        "notes": parse_notes(front.get("notes", ""), defaults.get("notes", "f")),\n        "preamble": "preamble.tex",\n        "bibliography": bibliography,\n        "cite": front.get("cite") or defaults.get("cite") or "MLA",\n        "title": front.get("title") or os.path.splitext(os.path.basename(note))[0],\n        "author": front.get("author") or config.get("author", ""),\n        "resourcePath": note_dir,\n    }\n    with open(os.path.join(build, "job.json"), "w", encoding="utf-8") as fh:\n        json.dump(job, fh, indent=2)\n\n\ndef main(argv):\n    if len(argv) < 2:\n        print(__doc__)\n        return 2\n    cmd, args = argv[1], argv[2:]\n    if cmd == "env" and len(args) == 1:\n        cmd_env(*args)\n    elif cmd == "prepare" and len(args) == 3:\n        cmd_prepare(*args)\n    elif cmd == "deliver" and len(args) == 2:\n        cmd_deliver(*args)\n    elif cmd == "latex-errors" and len(args) == 1:\n        cmd_latex_errors(*args)\n    elif cmd == "status-fail" and len(args) == 2:\n        status({"ok": False, "stage": args[0], "message": args[1]})\n    elif cmd == "qa" and len(args) == 4:\n        cmd_qa(*args)\n    else:\n        print(__doc__)\n        return 2\n    return 0\n\n\nif __name__ == "__main__":\n    sys.exit(main(sys.argv))\n';

// renderer/lib.sh
var lib_default = '# lib.sh \u2014 media helpers for render-pdf.sh. Sourced, not run directly.\n#\n# Forked from ~/.claude/scripts/lib/md-convert-lib.sh (sanitize/optimize). This\n# copy ships inside the Virtual Outliner plugin bundle and is written to\n# ~/Library/Application Support/virtual-outliner/renderer/<version>/ on load,\n# so every path here is relative to the renderer folder, never ~/.claude.\n\n: ${IMG_MAX_WIDTH:=1600}\n# `=` not `:=`: an explicitly empty PNGQUANT_QUALITY="" must disable pngquant.\n: ${PNGQUANT_QUALITY=65-90}\n\nlog() { print -r -- "$(date \'+%Y-%m-%d %H:%M:%S\') $*" >>"${LOG:-/dev/null}" }\n\nhuman_size() {\n  local bytes=$1\n  if (( bytes >= 1048576 )); then\n    printf "%.1f MB" $(( bytes / 1048576.0 ))\n  else\n    printf "%d KB" $(( bytes / 1024 ))\n  fi\n}\n\n# Real format of a file, as a bare extension ("png", "jpg", "webp", ...).\nreal_format() {\n  local mime\n  mime=$(file -b --mime-type -- "$1" 2>/dev/null)\n  case $mime in\n    image/png)             print png  ;;\n    image/jpeg)            print jpg  ;;\n    image/webp)            print webp ;;\n    image/gif)             print gif  ;;\n    image/tiff)            print tiff ;;\n    image/svg+xml|text/*)  print svg  ;;\n    application/pdf)       print pdf  ;;\n    *)                     print ""   ;;\n  esac\n}\n\n# Convert $1 to PNG at $2. Returns non-zero if no converter could handle it.\nto_png() {\n  local src=$1 dst=$2\n  if [[ $(real_format "$src") == webp ]] && (( $+commands[dwebp] )); then\n    dwebp -quiet "$src" -o "$dst" && return 0\n  fi\n  if (( $+commands[magick] )); then\n    magick "$src" "$dst" && return 0\n  fi\n  sips -s format png "$src" --out "$dst" >/dev/null 2>&1\n}\n\n# Make every file under $1 actually be what its extension claims (CDNs lie).\n# Files with an extension lualatex can use (png/jpg/pdf) are converted in place;\n# files it cannot use at all (.webp, .gif, ...) get a new .png beside them and\n# the rename is echoed as "old<TAB>new" for the caller to patch into doc.tex.\nsanitize_media() {\n  local dir=$1\n  local f ext real png\n  [[ -d $dir ]] || return 0\n\n  for f in $dir/**/*(.N); do\n    ext=${${f:e}:l}\n    real=$(real_format "$f")\n\n    [[ -z $real || $real == svg ]] && continue\n    [[ $real == $ext ]] && continue\n    [[ $real == jpg && $ext == jpeg ]] && continue\n\n    case $ext in\n      png|jpg|jpeg)\n        if to_png "$f" "$f.tmp.png"; then\n          mv -f "$f.tmp.png" "$f"\n          log "  transcoded $real -> $ext: ${f:t}"\n        else\n          rm -f "$f.tmp.png"\n          log "  WARNING: could not transcode ${f:t} ($real)"\n        fi\n        ;;\n      *)\n        png="${f:r}.png"\n        if to_png "$f" "$png"; then\n          rm -f "$f"\n          print -r -- "${f:t}	${png:t}"\n          log "  converted $real -> png (renamed): ${f:t} -> ${png:t}"\n        else\n          log "  WARNING: could not convert ${f:t} ($real)"\n        fi\n        ;;\n    esac\n  done\n}\n\n# Shrink every PNG under $1: cap width at IMG_MAX_WIDTH, then lossy-recompress\n# with pngquant when it is installed. Never fatal, never makes a file bigger.\noptimize_media() {\n  local dir=$1\n  local f width before after\n  [[ -d $dir ]] || return 0\n\n  for f in $dir/**/*.png(.N); do\n    before=$(stat -f%z "$f")\n\n    if (( IMG_MAX_WIDTH > 0 )); then\n      width=$(sips -g pixelWidth "$f" 2>/dev/null | awk \'/pixelWidth/{print $2}\')\n      if [[ -n $width ]] && (( width > IMG_MAX_WIDTH )); then\n        sips --resampleWidth "$IMG_MAX_WIDTH" "$f" >/dev/null 2>&1\n      fi\n    fi\n\n    if [[ -n $PNGQUANT_QUALITY ]] && (( $+commands[pngquant] )); then\n      pngquant --quality="$PNGQUANT_QUALITY" --speed 1 --strip \\\n        --skip-if-larger --force --output "$f" -- "$f" 2>/dev/null\n    fi\n\n    after=$(stat -f%z "$f")\n    (( after < before )) && log "  optimized ${f:t}: $(human_size $before) -> $(human_size $after)"\n  done\n}\n';

// renderer/lists.py
var lists_default = `#!/usr/bin/env python3
"""Insert a blank line before a top-level list that starts immediately
after a paragraph line, with no blank line between them.

Pandoc's markdown reader (unlike CommonMark) never lets a list interrupt
a paragraph -- a list item with no blank line before it is read as a lazy
continuation of the preceding paragraph's text, numbers and all. Verified
experimentally: round-tripping a file through \`pandoc -t markdown\` turns

    **Assumptions**
    1. All five questions are relevant...
    2. Necessary data is available.

into a single run-on paragraph ("**Assumptions** 1. All five questions
are relevant... 2. Necessary data is available."), silently destroying
the list. This is the exact "number conversion failed" failure mode seen
in the Md-PDF/Md-Tex output. Obsidian (and CommonMark generally) renders
the same source as a proper list, so the source files are never wrong --
only pandoc's stricter blank-line requirement needs satisfying, and a
blank line before the list is invisible to every other renderer.

This only touches column-0 (top-level) list markers preceded by a
non-blank, non-list line, and leaves fenced code blocks alone. Indented
sub-list items are never touched -- they nest under an already-recognized
list item, so the interruption ambiguity doesn't apply to them.

Usage: lists.py <input.md> <output.md>
"""
import re
import sys

FENCE = re.compile(r'^\\s*(\`\`\`|~~~)')
TOP_LIST_ITEM = re.compile(r'^(\\d+[.)]|[-*+])\\s')
ANY_LIST_ITEM = re.compile(r'^\\s*(\\d+[.)]|[-*+])\\s')


def process(text):
    lines = text.split('\\n')
    out = []
    in_fence = False
    prev = None

    for line in lines:
        if FENCE.match(line):
            in_fence = not in_fence
            out.append(line)
            prev = line
            continue

        if (not in_fence and TOP_LIST_ITEM.match(line)
                and prev is not None and prev.strip() != ''
                and not ANY_LIST_ITEM.match(prev)):
            out.append('')

        out.append(line)
        prev = line

    return '\\n'.join(out)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding='utf-8') as fh:
        text = fh.read()
    with open(dst, 'w', encoding='utf-8') as fh:
        fh.write(process(text))


if __name__ == '__main__':
    main()
`;

// renderer/default-preamble.tex
var default_preamble_default = "\\usepackage[top=.75in, bottom=.75in, left=.75in, right=.75in, includehead, includefoot, marginparwidth=.75in, marginparsep=.125in]{geometry}\n\\setlength{\\parskip}{.15in}\n\\usepackage{hyperref}\n\n\\RequirePackage{datetime}\n\\settimeformat{ampmtime}\n\\newdateformat{dashdate}{\\THEYEAR-\\twodigit{\\THEMONTH}-\\twodigit{\\THEDAY}}\n\\newtimeformat{dottime}{\\twodigit{\\THEHOUR}:\\twodigit{\\THEMINUTE}:\\twodigit{\\THESECOND}}\n\n\\RequirePackage{lastpage}    %% Required for pages of page number\n\\RequirePackage{fancyhdr}   %must come after geometry\n\\RequirePackage{etoolbox}\n\\pagestyle{fancy}\n\\renewcommand{\\sectionmark}[1]{\\markright{Sec.\\thesection:\\ #1}{}}\n% \\DocTitle and \\DocAuthor are set per export (the note's title: frontmatter or\n% its file name, and the Author setting) in a small include that Virtual\n% Outliner loads BEFORE this preamble, so these \\providecommand lines only\n% apply when this preamble is used on its own. An empty \\DocTitle falls back\n% to \\jobname.\n\\providecommand{\\DocTitle}{}\n\\providecommand{\\DocAuthor}{}\n\\newcommand{\\HeaderTitle}{\\ifdefempty{\\DocTitle}{\\jobname}{\\DocTitle}}\n\\fancyhead{} % clear all header fields\n\\fancyhead[L]{\\small{\\textbf{\\HeaderTitle}}}\n\\fancyhead[R]{\\small{\\DocAuthor}}\n\\fancyfoot{}\n\\fancyfoot[L]{\\scriptsize{\\thepage\\ of \\pageref{LastPage}}}\n\\fancyfoot[R]{\\scriptsize{\\dashdate{\\today} at \\dottime}}\n\\renewcommand{\\headrulewidth}{0.4pt}\n\\renewcommand{\\footrulewidth}{0.4pt}\n\n% Light grey rule between table rows. Just the colour lives here \u2014 the actual\n% \\hline after each row is inserted into the generated .tex by rowlines.py,\n% since longtable's row-end machinery resists doing it from a preamble hook.\n\\usepackage{colortbl}\n\\definecolor{rowline}{gray}{0.75}\n";

// renderer/quick-action.sh
var quick_action_default = '#!/bin/zsh\n# quick-action.sh \u2014 Finder Quick Action entry point ("Convert Md to PDF").\n#\n# The installed .workflow is a two-line stub that execs this file from\n# ~/Library/Application Support/virtual-outliner/renderer/current/, so the\n# Quick Action\'s behaviour updates whenever the plugin does.\n#\n# For each selected .md file: find its vault (the folder holding .obsidian),\n# load that vault\'s config written by the plugin (sigil, author, preamble,\n# export defaults), refuse notes that carry a Virtual Outliner outline \u2014 only\n# the plugin can strip one \u2014 and otherwise render next to the note (or to its\n# pdf-output: frontmatter) with the same renderer the plugin uses.\n\nemulate -L zsh\nsetopt no_nomatch\nset -u\n\nHERE=${0:A:h}\nSUPPORT="$HOME/Library/Application Support/virtual-outliner"\nexport PATH=/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}\nPY=python3\n(( $+commands[python3] )) || PY=/usr/bin/python3\n\nquoted() { print -r -- "\\"${${1//\\\\/\\\\\\\\}//\\"/\\\\\\"}\\"" }\nnotify() { osascript -e "display notification $(quoted "$2") with title $(quoted "$1")" >/dev/null 2>&1 }\nalert() { osascript -e "display dialog $(quoted "$1") buttons {\\"OK\\"} default button \\"OK\\" with icon caution with title \\"Convert Md to PDF\\"" >/dev/null 2>&1 }\n\n(( $# )) || exit 0\n\nFONT_SIZE=$(osascript -e \'text returned of (display dialog "Font size (pt): 8, 9, 10, 11, 12, 14, 17 or 20" default answer "12" buttons {"Cancel","OK"} default button "OK" with title "Convert Md to PDF")\' 2>/dev/null) || exit 0\nFONT_SIZE=${FONT_SIZE%pt}\n[[ -n $FONT_SIZE ]] || exit 0\n\nvault_root() {\n  local dir=${1:A:h}\n  while [[ $dir != / ]]; do\n    [[ -d "$dir/.obsidian" ]] && { print -r -- "$dir"; return 0 }\n    dir=${dir:h}\n  done\n  return 1\n}\n\nWROTE=0\nFAILS=0\nfor f in "$@"; do\n  [[ -f $f && ${f:e:l} == md ]] || continue\n  CONFIG=""\n  if ROOT=$(vault_root "$f"); then\n    CONFIG="$SUPPORT/vaults/${ROOT:t}/config.json"\n    [[ -f $CONFIG ]] || CONFIG=""\n  fi\n\n  BUILD=$(mktemp -d "${TMPDIR:-/tmp}/vo-quick-action.XXXXXX") || { (( FAILS++ )); continue }\n  OUT=$("$PY" "$HERE/job.py" qa "$f" "$CONFIG" "$FONT_SIZE" "$BUILD" 2>>"$BUILD/render.log")\n  RC=$?\n  if (( RC == 3 )); then\n    alert "$OUT"\n    rm -rf "$BUILD"\n    continue\n  elif (( RC != 0 )); then\n    alert "Could not prepare ${f:t}: $(tail -3 "$BUILD/render.log")"\n    (( FAILS++ ))\n    continue\n  fi\n\n  STATUS=$(/bin/zsh "$HERE/render-pdf.sh" --job "$BUILD/job.json" | tail -1)\n  if [[ $STATUS == \'{"ok": true\'* ]]; then\n    (( WROTE++ ))\n    rm -rf "$BUILD"\n  else\n    MESSAGE=$(print -r -- "$STATUS" | "$PY" -c \'import json,sys; print(json.load(sys.stdin).get("message",""))\' 2>/dev/null)\n    alert "${f:t} failed: ${MESSAGE:-$STATUS}\n\nBuild files kept in $BUILD"\n    (( FAILS++ ))\n  fi\ndone\n\nif (( WROTE )); then\n  notify "Convert Md to PDF" "Wrote $WROTE PDF$([[ $WROTE == 1 ]] || print s)"\nfi\n(( FAILS == 0 ))\n';

// renderer/render-pdf.sh
var render_pdf_default = '#!/bin/zsh\n# render-pdf.sh \u2014 typeset one prepared Markdown source into a PDF.\n#\n#   zsh render-pdf.sh --job /path/to/build/job.json\n#\n# The build folder is the folder holding job.json. Whoever calls this (the\n# Obsidian plugin, or quick-action.sh) has already written the source Markdown\n# and the preamble there; job.py documents every job.json field.\n#\n# Pipeline: job.py prepare (endnote/reference tail + meta.tex) -> table widths\n# -> list breaks -> pandoc to .tex (extracting media) -> sanitize/optimize media\n# -> table row lines -> latexmk -> job.py deliver (collision check, atomic move).\n#\n# The LAST line on stdout is always one JSON status object, which is what the\n# plugin parses: {"ok":true,"output":\u2026} or {"ok":false,"stage":\u2026,"message":\u2026}.\n# Everything else goes to render.log in the build folder.\n#\n# Run with /bin/zsh explicitly: sync services drop the executable bit, so\n# nothing here relies on it.\n\nemulate -L zsh\nsetopt no_nomatch pipe_fail\nset -u\n\nHERE=${0:A:h}\nexport PATH=/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}\n\nJOB=""\nwhile (( $# )); do\n  case $1 in\n    --job) JOB=${2:-}; shift 2 ;;\n    *) shift ;;\n  esac\ndone\n\nPY=python3\n(( $+commands[python3] )) || PY=/usr/bin/python3\n\nfail_json() {\n  # stage, message\n  "$PY" "$HERE/job.py" status-fail "$1" "$2" 2>/dev/null \\\n    || print -r -- \'{"ok":false,"stage":"\'"$1"\'","message":"renderer failure"}\'\n  exit 1\n}\n\n[[ -n $JOB && -f $JOB ]] || fail_json args "No job file given (expected --job <job.json>)."\nJOB=${JOB:A}\nBUILD=${JOB:h}\ncd "$BUILD" || fail_json args "Cannot enter build folder $BUILD"\n\nLOG="$BUILD/render.log"\nsource "$HERE/lib.sh"\n# Leftovers from an earlier run in the same folder (e.g. an .aux written with\n# enotez loaded) break the next compile when the options change.\nrm -rf media doc.aux doc.toc doc.out doc.log doc.pdf doc.fls doc.fdb_latexmk doc.tex work*.md meta.tex pandoc.out latexmk.out\nlog "=== render $JOB"\n\nfor tool in pandoc latexmk lualatex; do\n  (( $+commands[$tool] )) || fail_json tools "$tool was not found. Install pandoc and MacTeX (pandoc, latexmk, lualatex)."\ndone\n\n# Shell assignments for the job\'s fields (values shell-quoted by job.py).\nENV_OUT=$("$PY" "$HERE/job.py" env "$JOB" 2>>"$LOG") || fail_json job "$(tail -3 "$LOG")"\neval "$ENV_OUT"\n\n"$PY" "$HERE/job.py" prepare "$JOB" work.md meta.tex 2>>"$LOG" || fail_json job "$(tail -3 "$LOG")"\n"$PY" "$HERE/tables.py" work.md work-tables.md 2>>"$LOG" || cp work.md work-tables.md\n"$PY" "$HERE/lists.py" work-tables.md work-final.md 2>>"$LOG" || cp work-tables.md work-final.md\n\n# Plain pandoc paragraphs: consecutive lines join into one paragraph, and a\n# blank line (which is what each removed outline entry becomes) starts a new\n# one. End a line with two spaces or a backslash to force a line break.\nargs=(\n  -f markdown+mark\n  -t latex -s -o doc.tex\n  --extract-media=media\n  --resource-path="$BUILD:$JOB_RESOURCE_PATH"\n  -H meta.tex -H "$JOB_PREAMBLE"\n  -V documentclass=extarticle -V fontsize="$JOB_FONTSIZE" -V papersize=letter\n)\n(( JOB_HEADING_SHIFT )) && args+=(--shift-heading-level-by="$JOB_HEADING_SHIFT")\n(( JOB_HEADNUM )) && args+=(-N)\n(( JOB_TOC )) && args+=(--toc)\nif [[ -n $JOB_BIBLIOGRAPHY ]]; then\n  args+=(--citeproc --bibliography="$JOB_BIBLIOGRAPHY")\n  [[ -n $JOB_CSL ]] && args+=(--csl="$JOB_CSL")\nfi\n\nlog "  pandoc ${args[*]}"\nif ! pandoc work-final.md "${args[@]}" >pandoc.out 2>&1; then\n  cat pandoc.out >>"$LOG"\n  fail_json pandoc "$(tail -15 pandoc.out)"\nfi\n[[ -s pandoc.out ]] && cat pandoc.out >>"$LOG"\n\nrenames=$(sanitize_media media)\nif [[ -n $renames ]]; then\n  while IFS=$\'\\t\' read -r old new; do\n    [[ -n $old ]] || continue\n    LC_ALL=C sed -i \'\' "s|media/${old}|media/${new}|g" doc.tex\n  done <<< "$renames"\nfi\noptimize_media media\n"$PY" "$HERE/rowlines.py" doc.tex >>"$LOG" 2>&1\n\nlog "  latexmk"\nif ! latexmk -lualatex -interaction=nonstopmode -halt-on-error -file-line-error doc.tex >latexmk.out 2>&1; then\n  fail_json latex "$("$PY" "$HERE/job.py" latex-errors doc.log 2>/dev/null)"\nfi\n\n"$PY" "$HERE/job.py" deliver "$JOB" doc.pdf 2>>"$LOG"\n';

// renderer/rowlines.py
var rowlines_default = `#!/usr/bin/env python3
"""Insert a light grey \\\\hline after every body row of every pandoc-generated
longtable, so tables get a rule between rows instead of just top/mid/bottom.

Pandoc's longtable output always has the shape:
    \\\\begin{longtable}[]{...}
    \\\\toprule\\\\noalign{}
    <header row> \\\\\\\\
    \\\\midrule\\\\noalign{}
    \\\\endhead
    \\\\bottomrule\\\\noalign{}
    \\\\endlastfoot
    <body row> \\\\\\\\
    <body row> \\\\\\\\
    ...
    \\\\end{longtable}
\\\\bottomrule is a "last page footer" (\\\\endlastfoot) \u2014 longtable defers it and
actually renders it right after the final body row, so the last row is left
alone here to avoid a double line right on top of that rule.

A row may wrap across several physical lines (pandoc wraps at ~80 cols); only
the line ending the row actually ends in "\\\\\\\\", so matching on that is safe.

Requires \\\\usepackage{colortbl} and \\\\definecolor{rowline}{...} in the preamble
(see default-preamble.tex) \u2014 this script only touches the table body.

Usage: rowlines.py FILE [FILE ...]
Edits in place; prints a count of insertions per file.
"""
import re
import sys

ROW_END = re.compile(r'\\\\\\\\\\s*$')
RULE_LINE = '\\\\arrayrulecolor{rowline}\\\\hline'


def fix(path):
    with open(path, encoding='utf-8') as fh:
        lines = fh.read().split('\\n')

    # Pass 1: find every body-row-ending line index, per longtable block.
    row_end_indices = []
    in_body = False
    rows_this_table = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('\\\\begin{longtable}'):
            in_body = False
        elif stripped == '\\\\endlastfoot':
            in_body = True
            rows_this_table = 0
        elif stripped.startswith('\\\\end{longtable}'):
            if rows_this_table and row_end_indices[-1][1] == 'pending':
                # last row of this table: don't mark it, drop the pending tag
                row_end_indices[-1][1] = 'skip'
            in_body = False
        elif in_body and ROW_END.search(line):
            row_end_indices.append([i, 'pending'])
            rows_this_table += 1

    # Anything still 'pending' after the scan is a genuine row to rule under;
    # only the row immediately preceding \\end{longtable} was downgraded above.
    insert_after = {idx for idx, tag in row_end_indices if tag == 'pending'}

    out = []
    inserted = 0
    for i, line in enumerate(lines):
        out.append(line)
        if i in insert_after:
            out.append(RULE_LINE)
            inserted += 1

    if inserted:
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write('\\n'.join(out))
    print(f"{inserted} row line(s) inserted: {path}")


if __name__ == '__main__':
    for p in sys.argv[1:]:
        fix(p)
`;

// renderer/styles/apa.csl
var apa_default = '<?xml version="1.0" encoding="utf-8"?>\n<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" demote-non-dropping-particle="never" initialize-with=". " names-delimiter=", " page-range-format="expanded" version="1.0">\n  <!-- This file was generated by the Style Variant Builder <https://github.com/citation-style-language/style-variant-builder>. To contribute changes, modify the template and regenerate variants. -->\n  <info>\n    <title>APA Style 7th edition</title>\n    <title-short>Publication Manual of the American Psychological Association, with Bluebook</title-short>\n    <id>http://www.zotero.org/styles/apa</id>\n    <link href="http://www.zotero.org/styles/apa" rel="self"/>\n    <link href="http://www.zotero.org/styles/apa-6th-edition" rel="template"/>\n    <link href="https://apastyle.apa.org/style-grammar-guidelines/references" rel="documentation"/>\n    <link href="https://zotero.org/groups/2205533/collections/MR2N872S" rel="documentation"/>\n    <author>\n      <name>Brenton M. Wiernik</name>\n      <email>zotero@wiernik.org</email>\n      <uri>https://orcid.org/0000-0001-9560-6336</uri>\n    </author>\n    <author>\n      <name>Andrew Dunning</name>\n      <uri>https://orcid.org/0000-0003-0464-5036</uri>\n    </author>\n    <category citation-format="author-date"/>\n    <category field="anthropology"/>\n    <category field="communications"/>\n    <category field="generic-base"/>\n    <category field="law"/>\n    <category field="medicine"/>\n    <category field="psychology"/>\n    <category field="social_science"/>\n    <category field="sociology"/>\n    <summary>Author-date system of the Publication Manual of the American Psychological Association (2020)</summary>\n    <updated>2026-02-07T00:00:00+00:00</updated>\n    <rights license="http://creativecommons.org/licenses/by-sa/3.0/">This work is licensed under a Creative Commons Attribution-ShareAlike 3.0 License</rights>\n  </info>\n  <locale xml:lang="en">\n    <terms>\n      <term name="ad"> C.E.</term>\n      <term name="bc"> B.C.E.</term>\n      <term form="short" name="circa">ca.</term>\n      <term name="guest">\n        <single>guest expert</single>\n        <multiple>guest experts</multiple>\n      </term>\n      <term form="short" name="illustrator">illus.</term>\n      <term form="short" name="interviewer">\n        <single>interviewer</single>\n        <multiple>interviewers</multiple>\n      </term>\n      <term form="short" name="legislation">Pub. L.</term>\n      <term name="manuscript">unpublished manuscript</term>\n      <term form="verb" name="performer">recorded by</term>\n      <term name="post">online post</term>\n      <term name="review-of">review of the</term>\n      <term form="short" name="review-of">review of</term>\n      <term name="software">computer software</term>\n      <term form="short" name="supplement">\n        <single>suppl.</single>\n        <multiple>suppls.</multiple>\n      </term>\n    </terms>\n  </locale>\n  <locale xml:lang="da">\n    <terms>\n      <term name="et-al">et al.</term>\n    </terms>\n  </locale>\n  <locale xml:lang="de">\n    <terms>\n      <term name="et-al">et al.</term>\n    </terms>\n  </locale>\n  <locale xml:lang="es">\n    <terms>\n      <term name="from">de</term>\n    </terms>\n  </locale>\n  <locale xml:lang="fr">\n    <terms>\n      <term form="short" name="editor">\n        <single>\xE9d.</single>\n        <multiple>\xE9ds.</multiple>\n      </term>\n    </terms>\n  </locale>\n  <locale xml:lang="nb">\n    <terms>\n      <term name="et-al">et al.</term>\n    </terms>\n  </locale>\n  <locale xml:lang="nl">\n    <terms>\n      <term name="et-al">et al.</term>\n    </terms>\n  </locale>\n  <locale xml:lang="nn">\n    <terms>\n      <term name="et-al">et al.</term>\n    </terms>\n  </locale>\n  <locale xml:lang="pl">\n    <terms>\n      <term name="et-al">i in.</term>\n    </terms>\n  </locale>\n  <locale xml:lang="ro">\n    <terms>\n      <term name="et-al">et al.</term>\n    </terms>\n  </locale>\n  <!-- Contents:\n\n       APA uses four main reference elements:\n\n        1. Author (APA 9.7-12)\n        2. Date (APA 9.13-17)\n        3. Title and descriptions (APA 9.18-22)\n            3.1. Title (APA 9.18)\n            3.2. Identifier (in parentheses) (APA 9.19)\n            3.3. Description [in square brackets] (APA 9.21-22)\n        4. Source (APA 9.23-37)\n            4.1. Serial sources (APA 9.25-27)\n            4.2. Monographic sources (APA 9.28)\n            4.3. Publisher sources (APA 9.29)\n            4.4. Database and archive sources (APA 9.30)\n            4.5. Works with specific locations (APA 9.31)\n            4.6. Social media and website sources (APA 9.32-33)\n            4.7. DOI or URL (APA 9.34-36)\n\n       A note on the source may follow the main reference elements:\n\n        5. Publication history (APA 9.39-41)\n\n       APA also provides parallel rules for legal references following The Bluebook: A Uniform System of Citation (chap. 11):\n\n        6. Legal references\n  -->\n  <!-- APA categorizes all sources as serial (APA 9.25-27) or monographic (APA 9.28).\n\n       Serial\n       : article-journal article-magazine article-newspaper periodical post-weblog review review-book\n\n       Serial or Monographic\n       : interview paper-conference\n\n         Monographic with any of `collection-editor compiler editor editorial-director`.\n         A serial `paper-conference` is unpublished if it lacks any of `issue page supplement-number volume`.\n\n       Monographic\n       : article book broadcast chapter classic collection dataset document entry entry-dictionary entry-encyclopedia event figure graphic manuscript map motion_picture musical_score pamphlet patent performance personal_communication post report software song speech standard thesis webpage\n\n       Legal\n       : bill hearing legal_case legislation regulation treaty\n  -->\n  <!-- Equivalencies:\n\n       `classic` == `book`\n       `document` == `report` (but give full date)\n       `standard` == `report`\n       `performance` == `speech`\n       `event` == `speech`\n  -->\n  <!-- Role equivalencies:\n\n       `compiler` == `editor`\n       `organizer`, `curator` == `chair`\n       `script-writer` == `director`\n       `producer` == `director` (but don\'t print both)\n       `guest`, `host` == `director`\n       `series-creator`, `executive-producer` == `editor`\n  -->\n  <!-- Reviews are detected if an item has type `review` or `review-book` or if it has any of the variables `reviewed-title`, `reviewed-author`, or `reviewed-genre`. For the latter case, reviews are commonly stored as types `article-journal`, `article-magazine`, `article-newspaper`, `post-weblog`, or `webpage`. -->\n  <!-- Indigeneous knowledge: Assume the item is stored as `document` or `speech` and that Nation/Community, treaty territory, where the Elder lives, and topic are all stored in `title`. Cf. <https://libguides.norquest.ca/c.php?g=314831&p=5188823>. If the item is stored as `interview`, assume that Nation/Community, treaty territory, and topic are stored in `title`. \'Oral teaching\' or similar is stored in `archive`, and where the Elder lives is stored in `archive-place`. -->\n  <!-- Variable labels -->\n  <macro name="label-chapter-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="chapter-number" type="song">\n          <text text-case="capitalize-first" value="track"/>\n        </if>\n        <else-if is-numeric="chapter-number">\n          <label text-case="capitalize-first" variable="chapter-number"/>\n        </else-if>\n      </choose>\n      <text variable="chapter-number"/>\n    </group>\n  </macro>\n  <macro name="label-edition">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="edition">\n          <number form="ordinal" variable="edition"/>\n          <label form="short" variable="edition"/>\n        </if>\n        <else>\n          <text variable="edition"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-issue">\n    <group delimiter=" ">\n      <label text-case="capitalize-first" variable="issue"/>\n      <text variable="issue"/>\n    </group>\n  </macro>\n  <macro name="label-locator">\n    <!-- Abbreviate page and paragraph; leave other locator labels in long form (APA 8.13) -->\n    <group delimiter=" ">\n      <choose>\n        <if locator="page">\n          <label form="short" variable="locator"/>\n        </if>\n        <else-if match="any" type="bill hearing legal_case legislation regulation treaty">\n          <!-- Bluebook-style labels for legal types -->\n          <choose>\n            <if locator="chapter paragraph section" match="any">\n              <label form="symbol" variable="locator"/>\n            </if>\n            <else>\n              <label text-case="capitalize-first" variable="locator"/>\n            </else>\n          </choose>\n        </else-if>\n        <else-if locator="paragraph">\n          <label form="short" variable="locator"/>\n        </else-if>\n        <else-if is-numeric="locator">\n          <label text-case="capitalize-first" variable="locator"/>\n        </else-if>\n        <!-- a non-numeric canonical reference is identified by its formatting and does not need a label, similar to a timestamp -->\n        <else-if locator="chapter line verse" match="any"/>\n        <else>\n          <label text-case="capitalize-first" variable="locator"/>\n        </else>\n      </choose>\n      <text variable="locator"/>\n    </group>\n  </macro>\n  <macro name="label-number">\n    <group delimiter=" ">\n      <choose>\n        <if type="standard"/>\n        <else-if is-numeric="number" match="any" type="legislation patent regulation">\n          <label form="short" text-case="capitalize-first" variable="number"/>\n        </else-if>\n      </choose>\n      <text text-case="capitalize-first" variable="number"/>\n    </group>\n  </macro>\n  <macro name="label-number-capitalized">\n    <!-- alias for cross-compatibility of Bluebook macros -->\n    <text macro="label-number"/>\n  </macro>\n  <macro name="label-number-article">\n    <!-- APA example 6: Journal article with article number or eLocator -->\n    <group delimiter=" ">\n      <text term="article-locator" text-case="capitalize-first"/>\n      <text variable="number"/>\n    </group>\n  </macro>\n  <macro name="label-number-of-volumes">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="number-of-volumes">\n          <label form="short" text-case="capitalize-first" variable="number-of-volumes"/>\n          <group>\n            <text prefix="1" term="page-range-delimiter"/>\n            <number variable="number-of-volumes"/>\n          </group>\n        </if>\n        <else>\n          <text variable="number-of-volumes"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-page">\n    <group delimiter=" ">\n      <label form="short" variable="page"/>\n      <text variable="page"/>\n    </group>\n  </macro>\n  <macro name="label-part-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="part-number">\n          <!-- TODO: Replace with `part-number` label when CSL provides one -->\n          <text form="short" term="part" text-case="capitalize-first"/>\n        </if>\n      </choose>\n      <text text-case="capitalize-first" variable="part-number"/>\n    </group>\n  </macro>\n  <macro name="label-section-symbol">\n    <group delimiter=" ">\n      <label form="symbol" variable="section"/>\n      <text variable="section"/>\n    </group>\n  </macro>\n  <macro name="label-supplement-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="supplement-number">\n          <!-- TODO: Replace with `supplement-number` label when CSL provides one -->\n          <text form="short" term="supplement" text-case="capitalize-first"/>\n        </if>\n      </choose>\n      <text text-case="capitalize-first" variable="supplement-number"/>\n    </group>\n  </macro>\n  <macro name="label-version">\n    <group delimiter=" ">\n      <label text-case="capitalize-first" variable="version"/>\n      <text variable="version"/>\n    </group>\n  </macro>\n  <macro name="label-volume">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="volume">\n          <label form="short" text-case="capitalize-first" variable="volume"/>\n        </if>\n      </choose>\n      <text text-case="capitalize-first" variable="volume"/>\n    </group>\n  </macro>\n  <!-- 1. Author (APA 9.7-12) -->\n  <macro name="author">\n    <!-- Substitutes for missing authors: order prioritizes primary creators (e.g., composer, author) over secondary roles (e.g., editor, curator), with title as the final fallback. -->\n    <names variable="composer">\n      <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n      <label form="short" prefix=" (" suffix=")" text-case="title"/>\n      <substitute>\n        <names variable="author"/>\n        <!-- `narrator` only cited in `identifier-contributors` -->\n        <names variable="illustrator"/>\n        <choose>\n          <if type="broadcast">\n            <names variable="script-writer director">\n              <!-- Actors/performers and producers [not executive] not cited in APA style. -->\n              <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n              <label prefix=" (" suffix=")" text-case="title"/>\n            </names>\n          </if>\n        </choose>\n        <names variable="director">\n          <!-- For non-broadcast items, APA only cites directors and not writers. -->\n          <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n          <label prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <names variable="guest host">\n          <!-- TODO: Collapse variables when that becomes available. -->\n          <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n          <label prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <names variable="producer">\n          <!-- Producers not cited if there is a writer/director, but use if they are the principal creator. -->\n          <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n          <label prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <choose>\n          <if match="any" type="entry-dictionary entry-encyclopedia">\n            <text variable="publisher"/>\n          </if>\n        </choose>\n        <choose>\n          <if match="none" variable="container-title"/>\n          <else-if match="any" type="book classic entry entry-dictionary entry-encyclopedia">\n            <!-- Items with a monographic `container-title` substitute their title and identifier, but leave description after `container-title`. This mimics the `source-monographic` macro. -->\n            <text macro="author-title-substitute"/>\n          </else-if>\n        </choose>\n        <names variable="executive-producer">\n          <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n          <label prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <names variable="series-creator">\n          <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n          <label prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <names variable="editor-translator"/>\n        <!-- `translator` is not cited as a primary creator (only as Ed. & Trans.). -->\n        <names variable="editor"/>\n        <names variable="editorial-director"/>\n        <names variable="compiler">\n          <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n          <label prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <choose>\n          <if match="any" type="event performance speech">\n            <names variable="chair">\n              <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n              <label prefix=" (" suffix=")" text-case="title"/>\n            </names>\n            <names variable="organizer">\n              <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n              <label prefix=" (" suffix=")" text-case="title"/>\n            </names>\n          </if>\n        </choose>\n        <names variable="curator">\n          <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n          <label prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <names variable="collection-editor"/>\n        <choose>\n          <if match="any" type="software webpage">\n            <!-- `software` (APA 10.10) and `webpage` (APA 10.16) can be cited under "name of group": likely in `publisher` if no `author` -->\n            <text variable="publisher"/>\n          </if>\n          <else-if type="standard">\n            <text variable="authority"/>\n          </else-if>\n        </choose>\n        <text macro="author-title-substitute"/>\n      </substitute>\n    </names>\n  </macro>\n  <macro name="author-and-contributors">\n    <group delimiter=" ">\n      <text macro="author"/>\n      <choose>\n        <!-- add nonprimary authors equivalent to those appearing "on a book cover"; do not modify the in-text citation (APA 9.8) -->\n        <if match="none" variable="author compiler composer editor editor-translator illustrator"/>\n        <else-if match="any" type="book musical_score pamphlet report standard">\n          <names prefix="(" suffix=")" variable="contributor">\n            <label form="verb" suffix=" "/>\n            <name and="symbol" delimiter-precedes-last="always" name-as-sort-order="all"/>\n          </names>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="author-short">\n    <choose>\n      <if match="any" type="bill hearing legal_case legislation regulation treaty">\n        <text macro="title-and-descriptions-short"/>\n      </if>\n      <else-if match="any" type="interview personal_communication">\n        <choose>\n          <!-- These variables indicate that the letter is retrievable by the reader. If not, use the APA in-text-only personal communication format. -->\n          <if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n            <names variable="author">\n              <name and="symbol" form="short"/>\n              <substitute>\n                <text macro="title-and-descriptions-short"/>\n              </substitute>\n            </names>\n          </if>\n          <else>\n            <group delimiter=", ">\n              <names variable="author">\n                <name and="symbol"/>\n                <substitute>\n                  <text macro="title-and-descriptions-short"/>\n                </substitute>\n              </names>\n              <text term="personal-communication"/>\n            </group>\n          </else>\n        </choose>\n      </else-if>\n      <else>\n        <names variable="composer">\n          <name and="symbol" form="short"/>\n          <substitute>\n            <names variable="author"/>\n            <names variable="illustrator"/>\n            <choose>\n              <if type="broadcast">\n                <!-- TODO: Collapse variables when that becomes available. -->\n                <!-- Ideally combine as `script-writer director` -->\n                <names variable="script-writer"/>\n              </if>\n            </choose>\n            <names variable="director"/>\n            <!-- TODO: Collapse variables when that becomes available. -->\n            <names variable="guest host"/>\n            <names variable="producer"/>\n            <choose>\n              <if match="any" type="entry-dictionary entry-encyclopedia">\n                <text variable="publisher"/>\n              </if>\n            </choose>\n            <choose>\n              <if match="none" variable="container-title"/>\n              <else-if match="any" type="book classic entry entry-dictionary entry-encyclopedia">\n                <text macro="title-and-descriptions-short"/>\n              </else-if>\n            </choose>\n            <names variable="executive-producer"/>\n            <names variable="series-creator"/>\n            <names variable="editor"/>\n            <names variable="editorial-director"/>\n            <names variable="compiler"/>\n            <choose>\n              <if match="any" type="event performance speech">\n                <names variable="chair"/>\n                <names variable="organizer"/>\n              </if>\n            </choose>\n            <names variable="curator"/>\n            <names variable="collection-editor"/>\n            <choose>\n              <if match="any" type="software webpage">\n                <!-- `software` (APA 10.10) and `webpage` (APA 10.16) can be cited under "name of group": likely in `publisher` if no `author` -->\n                <text form="short" variable="publisher"/>\n              </if>\n              <else-if type="standard">\n                <text form="short" variable="authority"/>\n              </else-if>\n            </choose>\n            <text macro="title-and-descriptions-short"/>\n          </substitute>\n        </names>\n      </else>\n    </choose>\n  </macro>\n  <macro name="author-sort">\n    <choose>\n      <if match="any" type="bill hearing legal_case legislation regulation treaty">\n        <text macro="legal-title"/>\n      </if>\n      <else>\n        <text macro="author"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Author elements -->\n  <macro name="author-title-substitute">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- `title` is only the review title if there is a separate `reviewed-genre` or `reviewed-title`; otherwise, it is the title of the reviewed work, printed in the description -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <text macro="title"/>\n          </if>\n          <else-if variable="reviewed-title title">\n            <text macro="title"/>\n          </else-if>\n          <else>\n            <text macro="title-and-descriptions"/>\n          </else>\n        </choose>\n      </if>\n      <else-if variable="title">\n        <!-- If an item has a `title`, substitute missing author with title and identifier, but leave description after the date (in the title position). -->\n        <group delimiter=" ">\n          <text macro="title"/>\n          <text macro="identifier"/>\n        </group>\n      </else-if>\n      <else>\n        <!-- If an item has no `title`, substitute with descriptions. -->\n        <text macro="title-and-descriptions"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 2. Date (APA 9.13-17) -->\n  <macro name="date">\n    <!-- Full dates included for ephemeral sources (e.g. broadcasts, interviews) to provide maximum specificity, while books use year only. -->\n    <group delimiter="-" prefix="(" suffix=")">\n      <choose>\n        <if variable="issued">\n          <group delimiter=", ">\n            <group>\n              <text macro="date-issued-year"/>\n              <text variable="year-suffix"/>\n            </group>\n            <choose>\n              <if match="any" type="article-magazine article-newspaper broadcast collection document event motion_picture pamphlet performance personal_communication post post-weblog song speech webpage">\n                <!-- Many video and audio examples in manual give full dates. Err on the side of too much information. -->\n                <text macro="date-issued-month-day"/>\n              </if>\n              <!-- Only show the month and day for an unpublished `interview` or `paper-conference` -->\n              <else-if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume"/>\n              <else-if match="any" type="interview paper-conference">\n                <text macro="date-issued-month-day"/>\n              </else-if>\n              <!-- Only year: article article-journal book chapter classic entry entry-dictionary entry-encyclopedia dataset figure graphic manuscript map musical_score paper-conference[published] patent periodical report review review-book software standard thesis -->\n            </choose>\n          </group>\n        </if>\n        <else-if variable="status">\n          <!-- Print the status variable rather than use generic CSL terms (`in press`, etc.) -->\n          <text text-case="lowercase" variable="status"/>\n          <text variable="year-suffix"/>\n        </else-if>\n        <else>\n          <text form="short" term="no date"/>\n          <text variable="year-suffix"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="date-short">\n    <group delimiter="-">\n      <choose>\n        <if variable="issued">\n          <group delimiter="/">\n            <text macro="date-original-year"/>\n            <group>\n              <choose>\n                <if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n                  <text macro="date-issued-year"/>\n                </if>\n                <else-if match="any" type="interview personal_communication">\n                  <!-- use the in-text-only format for inaccessible personal communications -->\n                  <text macro="date-issued-full"/>\n                </else-if>\n                <else>\n                  <text macro="date-issued-year"/>\n                </else>\n              </choose>\n              <text variable="year-suffix"/>\n            </group>\n          </group>\n        </if>\n        <else-if variable="status">\n          <!-- Print the status variable rather than use generic CSL terms (`in press`, etc.) -->\n          <text text-case="lowercase" variable="status"/>\n          <text variable="year-suffix"/>\n        </else-if>\n        <else>\n          <text form="short" term="no date"/>\n          <text variable="year-suffix"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="date-sort">\n    <!-- Sort items by issue date as printed -->\n    <choose>\n      <if match="any" type="article article-journal book chapter entry entry-dictionary entry-encyclopedia dataset figure graphic manuscript map musical_score patent report review review-book thesis">\n        <date date-parts="year" form="numeric" variable="issued"/>\n      </if>\n      <else-if type="paper-conference">\n        <!-- Determine whether published and serial or monographic -->\n        <choose>\n          <if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n            <date date-parts="year" form="numeric" variable="issued"/>\n          </if>\n          <else>\n            <text macro="date-issued-leading-zeros"/>\n          </else>\n        </choose>\n      </else-if>\n      <else>\n        <text macro="date-issued-leading-zeros"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-sort-group">\n    <!-- Sorts items with and without dates:\n\n          1. `no date` items (= 0)\n          2. items with dates (= 1)\n          3. items with `status` (forthcoming, in press, etc.) (= 2) -->\n    <choose>\n      <if variable="issued">\n        <text value="1"/>\n      </if>\n      <else-if variable="status">\n        <text value="2"/>\n      </else-if>\n      <else>\n        <text value="0"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Date elements -->\n  <macro name="date-event-full">\n    <group delimiter=" ">\n      <choose>\n        <if is-uncertain-date="event-date">\n          <text form="short" term="circa"/>\n        </if>\n      </choose>\n      <date form="text" variable="event-date"/>\n    </group>\n  </macro>\n  <macro name="date-issued-full">\n    <group delimiter=" ">\n      <choose>\n        <if is-uncertain-date="issued">\n          <text form="short" term="circa"/>\n        </if>\n      </choose>\n      <date form="text" variable="issued"/>\n    </group>\n  </macro>\n  <macro name="date-issued-leading-zeros">\n    <date delimiter="-" variable="issued">\n      <date-part name="year"/>\n      <date-part form="numeric-leading-zeros" name="month"/>\n      <date-part form="numeric-leading-zeros" name="day"/>\n    </date>\n  </macro>\n  <macro name="date-issued-month-day">\n    <date variable="issued">\n      <date-part name="month"/>\n      <date-part name="day" prefix=" "/>\n    </date>\n  </macro>\n  <macro name="date-issued-year">\n    <group delimiter=" ">\n      <choose>\n        <if is-uncertain-date="issued">\n          <text form="short" term="circa"/>\n        </if>\n      </choose>\n      <date date-parts="year" form="numeric" variable="issued"/>\n    </group>\n  </macro>\n  <macro name="date-original-year">\n    <group delimiter=" ">\n      <choose>\n        <if is-uncertain-date="original-date">\n          <text form="short" term="circa"/>\n        </if>\n      </choose>\n      <date date-parts="year" form="numeric" variable="original-date"/>\n    </group>\n  </macro>\n  <!-- 3. Title and descriptions (APA 9.18-22) -->\n  <macro name="title-and-descriptions">\n    <group delimiter=" ">\n      <choose>\n        <if variable="title">\n          <text macro="title"/>\n          <text macro="identifier"/>\n          <text macro="description"/>\n        </if>\n        <else-if match="any" type="bill report">\n          <!-- Bills, resolutions, and congressional reports substitute bill number if no title. -->\n          <!-- Congressional reports are indistinguishable from other reports -->\n          <text macro="identifier-number"/>\n          <text macro="description"/>\n          <text macro="identifier"/>\n        </else-if>\n        <else>\n          <text macro="description"/>\n          <text macro="identifier"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="title-and-descriptions-short">\n    <choose>\n      <if variable="title">\n        <text macro="title-short"/>\n      </if>\n      <else-if match="any" type="bill report">\n        <!-- Bills, resolutions, and congressional reports substitute bill number if no title. -->\n        <text macro="legal-identifier-bill-report"/>\n      </else-if>\n      <else>\n        <text macro="description-short"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 3.1. Title (APA 9.18) -->\n  <macro name="title">\n    <choose>\n      <if match="any" type="post webpage">\n        <!-- part number/title always at the analytic level -->\n        <text font-style="italic" macro="title-and-part-filter-review"/>\n      </if>\n      <!-- Other types are italicized based on presence of `container-title`. Assume that `review` and `review-book` are published either in a serial or on a webpage (APA example 69) -->\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="title-serial"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <text macro="title-monographic"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <text macro="title-serial"/>\n      </else-if>\n      <else>\n        <text macro="title-monographic"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-short">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- `title` is only the review title if there is a separate `reviewed-genre` or `reviewed-title`; otherwise, it is the title of the reviewed work, printed in the description -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <!-- Quotes, title case -->\n            <text form="short" quotes="true" text-case="title" variable="title"/>\n          </if>\n          <else-if variable="reviewed-title title">\n            <!-- Quotes, title case -->\n            <text form="short" quotes="true" text-case="title" variable="title"/>\n          </else-if>\n          <else>\n            <text macro="description-short"/>\n          </else>\n        </choose>\n      </if>\n      <else-if match="any" type="bill legislation regulation report treaty">\n        <!-- No italics or quotes, title case -->\n        <text form="short" text-case="title" variable="title"/>\n      </else-if>\n      <else-if match="any" type="legal_case post">\n        <!-- Italicized, sentence case -->\n        <text font-style="italic" form="short" variable="title"/>\n      </else-if>\n      <else-if match="any" type="hearing webpage">\n        <!-- Italicized, title case (regardless of `container-title`) -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else-if>\n      <!-- Other types are formatted based on presence of `container-title`, as in title macro -->\n      <else-if variable="container-title">\n        <!-- Quotes, title case -->\n        <text form="short" quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else>\n        <!-- Italicized, title case (default) -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Title elements -->\n  <macro name="title-and-part-filter-review">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- If a review has no `reviewed-genre` or `reviewed-title`, assume that `title` contains the title of the reviewed work; the description provides it. -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <text macro="title-and-part-title"/>\n          </if>\n          <else-if variable="reviewed-title title">\n            <text macro="title-and-part-title"/>\n          </else-if>\n        </choose>\n      </if>\n      <else>\n        <text macro="title-and-part-title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-and-part-title">\n    <group delimiter=": ">\n      <text variable="title"/>\n      <text macro="title-part"/>\n    </group>\n  </macro>\n  <macro name="title-and-volume-title">\n    <group delimiter=": ">\n      <text variable="title"/>\n      <text macro="title-volume"/>\n    </group>\n  </macro>\n  <macro name="title-monographic">\n    <!-- For monographic items, assume `part-number` and `part-title` refer to the book/volume. -->\n    <choose>\n      <if variable="container-title">\n        <text variable="title"/>\n      </if>\n      <else>\n        <!-- For monographic items without `container-title` and with `volume-title`, append `volume-title` to `title` (APA example 30) -->\n        <text font-style="italic" macro="title-and-volume-title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-part">\n    <choose>\n      <if variable="part-title">\n        <group delimiter=". ">\n          <text macro="label-part-number"/>\n          <text text-case="capitalize-first" variable="part-title"/>\n        </group>\n      </if>\n      <else-if is-numeric="part-number"/>\n      <else>\n        <text macro="label-part-number"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-serial">\n    <!-- For serials, assume that `part-number` and `part-title` refer to the article and append to `title` -->\n    <choose>\n      <if variable="container-title">\n        <text macro="title-and-part-filter-review"/>\n      </if>\n      <else>\n        <!-- for serial items without `container-title`, don\'t append `volume-title` to `title` -->\n        <text font-style="italic" macro="title-and-part-filter-review"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-volume">\n    <group delimiter=", ">\n      <choose>\n        <!-- Assume that `part-number` and `part-title` of monographic items refer to the source book/volume -->\n        <if variable="volume-title">\n          <group delimiter=": ">\n            <group delimiter=". ">\n              <text macro="label-volume"/>\n              <text variable="volume-title"/>\n            </group>\n            <text macro="title-part"/>\n          </group>\n        </if>\n        <else-if variable="part-title">\n          <text macro="label-volume"/>\n          <text macro="title-part"/>\n        </else-if>\n        <!-- if there is no `part-title` or `volume title`, `part-number` and `volume` appear in `identifier` if numeric -->\n        <else-if is-numeric="part-number volume"/>\n        <else-if is-numeric="part-number" variable="volume">\n          <text macro="label-volume"/>\n        </else-if>\n        <else-if is-numeric="volume" variable="part-number">\n          <text macro="label-part-number"/>\n        </else-if>\n        <else-if is-numeric="part-number"/>\n        <else-if is-numeric="volume"/>\n        <else>\n          <text macro="label-volume"/>\n          <text macro="label-part-number"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 3.2. Identifier (in parentheses) (APA 9.19) -->\n  <macro name="identifier">\n    <!-- (Secondary contributors; Database location; Genre no. 123; Report Series 123, Version, Edition, Volume, Page) -->\n    <group delimiter="; " prefix="(" suffix=")">\n      <choose>\n        <if type="patent">\n          <text macro="identifier-patent"/>\n        </if>\n        <else-if match="any" type="post webpage">\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` -->\n          <text macro="identifier-contributors"/>\n          <text macro="identifier-number"/>\n          <text macro="identifier-monographic"/>\n        </else-if>\n        <else-if type="report" variable="container-title">\n          <!-- If the report is a chapter in a larger report, then most identifying information is printed in the source. -->\n          <text macro="identifier-contributors"/>\n        </else-if>\n        <else-if type="report" variable="title">\n          <text macro="identifier-contributors"/>\n          <text macro="identifier-number"/>\n          <text macro="identifier-monographic"/>\n        </else-if>\n        <else-if type="report">\n          <!-- If there is no `title`, then `genre` and `number` are already printed as the title. -->\n          <text macro="identifier-contributors"/>\n          <text macro="identifier-monographic"/>\n        </else-if>\n        <else-if variable="container-title">\n          <choose>\n            <if match="none" variable="genre title">\n              <text macro="label-chapter-number"/>\n            </if>\n          </choose>\n          <text macro="identifier-contributors"/>\n          <choose>\n            <if match="any" type="broadcast graphic map motion_picture">\n              <!-- For some audiovisual media, `number` information comes after title, not `container-title` (APA example 94); but an album track number is `chapter-number` -->\n              <text macro="identifier-number"/>\n            </if>\n          </choose>\n          <text macro="identifier-serial"/>\n        </else-if>\n        <else>\n          <text macro="identifier-contributors"/>\n          <text macro="identifier-number"/>\n          <text macro="identifier-monographic"/>\n          <text macro="identifier-serial"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Identifier elements -->\n  <macro name="identifier-contributors">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="identifier-contributors-serial"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <text macro="identifier-contributors-monographic"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <text macro="identifier-contributors-serial"/>\n      </else-if>\n      <else>\n        <text macro="identifier-contributors-monographic"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-contributors-monographic">\n    <group delimiter="; ">\n      <choose>\n        <if variable="title">\n          <names variable="interviewer">\n            <name and="symbol"/>\n            <label form="short" prefix=", " text-case="title"/>\n          </names>\n        </if>\n      </choose>\n      <choose>\n        <if match="any" type="post webpage">\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` -->\n          <names variable="container-author">\n            <label form="verb-short" suffix=" " text-case="title"/>\n            <name and="symbol"/>\n          </names>\n          <names delimiter="; " variable="editor translator">\n            <name and="symbol"/>\n            <label form="short" prefix=", " text-case="title"/>\n          </names>\n          <names delimiter="; " variable="illustrator narrator">\n            <name and="symbol"/>\n            <label form="short" prefix=", " text-case="title"/>\n          </names>\n          <names delimiter="; " variable="compiler chair organizer curator series-creator executive-producer">\n            <name and="symbol"/>\n            <label prefix=", " text-case="title"/>\n          </names>\n        </if>\n        <else>\n          <names delimiter="; " variable="illustrator narrator">\n            <name and="symbol"/>\n            <label form="short" prefix=", " text-case="title"/>\n          </names>\n          <choose>\n            <if variable="container-title editor-translator"/>\n            <else-if variable="container-title">\n              <!-- TODO: Check logic once processors start to automatically populate `editor-translator` -->\n              <names delimiter="; " variable="translator">\n                <name and="symbol"/>\n                <label form="short" prefix=", " text-case="title"/>\n              </names>\n            </else-if>\n            <else>\n              <names variable="container-author">\n                <label form="verb-short" suffix=" " text-case="title"/>\n                <name and="symbol"/>\n              </names>\n              <names delimiter="; " variable="editor translator">\n                <name and="symbol"/>\n                <label form="short" prefix=", " text-case="title"/>\n              </names>\n              <names delimiter="; " variable="compiler chair organizer curator series-creator executive-producer">\n                <name and="symbol"/>\n                <label prefix=", " text-case="title"/>\n              </names>\n            </else>\n          </choose>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-contributors-serial">\n    <group delimiter="; ">\n      <choose>\n        <if variable="title">\n          <names delimiter="; " variable="interviewer">\n            <name and="symbol"/>\n            <label form="short" prefix=", " text-case="title"/>\n          </names>\n        </if>\n      </choose>\n      <names delimiter="; " variable="translator narrator">\n        <name and="symbol"/>\n        <label form="short" prefix=", " text-case="title"/>\n      </names>\n    </group>\n  </macro>\n  <macro name="identifier-locators">\n    <choose>\n      <if variable="page">\n        <text macro="label-page"/>\n      </if>\n      <else-if variable="chapter-number genre">\n        <text macro="label-chapter-number"/>\n      </else-if>\n      <else-if variable="chapter-number title">\n        <text macro="label-chapter-number"/>\n      </else-if>\n      <!-- `chapter-number` appears earlier in `identifier` if there is no `title` or `genre` -->\n    </choose>\n  </macro>\n  <macro name="identifier-monographic">\n    <choose>\n      <!-- omit serial types -->\n      <if match="any" type="article-journal article-magazine article-newspaper broadcast event patent performance periodical post post-weblog review review-book speech webpage"/>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="identifier-monographic-item"/>\n      </else-if>\n      <!-- omit serial types -->\n      <else-if match="any" type="interview paper-conference"/>\n      <else>\n        <!-- monographic types -->\n        <text macro="identifier-monographic-item"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-monographic-item">\n    <group delimiter=", ">\n      <text macro="label-version"/>\n      <text macro="label-edition"/>\n      <text macro="identifier-series"/>\n      <text macro="label-supplement-number"/>\n      <text macro="identifier-number-volume"/>\n      <text macro="identifier-number-part"/>\n      <text macro="label-issue"/>\n      <text macro="identifier-locators"/>\n    </group>\n  </macro>\n  <macro name="identifier-number">\n    <group delimiter=" ">\n      <choose>\n        <if type="thesis" variable="genre">\n          <!-- `genre` provided with thesis description (APA example 65) -->\n          <text text-case="capitalize-first" value="publication"/>\n        </if>\n        <else-if variable="number">\n          <text text-case="title" variable="genre"/>\n        </else-if>\n      </choose>\n      <text macro="label-number"/>\n    </group>\n  </macro>\n  <macro name="identifier-number-part">\n    <choose>\n      <!-- Part number printed with part title -->\n      <if variable="part-title"/>\n      <!-- Non-numeric part numbers printed as part of the title -->\n      <else-if is-numeric="part-number">\n        <text macro="label-part-number"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="identifier-number-volume">\n    <choose>\n      <!-- Volume number printed with volume/part title -->\n      <if variable="volume volume-title"/>\n      <else-if variable="part-title volume"/>\n      <!-- Non-numeric volumes printed as part of the book title -->\n      <else-if is-numeric="volume">\n        <text macro="label-volume"/>\n      </else-if>\n      <else>\n        <text macro="label-number-of-volumes"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-patent">\n    <!-- `authority`: U.S. ; `genre`: patent ; `number`: 123,445 -->\n    <group delimiter=" ">\n      <text form="short" variable="authority"/>\n      <choose>\n        <if variable="genre">\n          <text text-case="capitalize-first" variable="genre"/>\n        </if>\n        <else>\n          <text term="patent" text-case="capitalize-first"/>\n        </else>\n      </choose>\n      <text macro="label-number"/>\n    </group>\n  </macro>\n  <macro name="identifier-serial">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="identifier-number-part"/>\n      </if>\n      <!-- omit monographic types -->\n      <else-if match="any" variable="collection-editor compiler editor editorial-director"/>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="identifier-number-part"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="identifier-series">\n    <!-- Series given only for report-like types (APA example 52) -->\n    <choose>\n      <if match="any" type="document report standard">\n        <group delimiter=" ">\n          <text text-case="title" variable="collection-title"/>\n          <text variable="collection-number"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <!-- 3.3. Description [in square brackets] (APA 9.21) -->\n  <macro name="description">\n    <group prefix="[" suffix="]">\n      <choose>\n        <if match="any" type="interview" variable="interviewer">\n          <text macro="description-interview"/>\n        </if>\n        <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n          <text macro="description-review"/>\n        </else-if>\n        <else-if type="personal_communication">\n          <text macro="description-letter"/>\n        </else-if>\n        <else-if type="song" variable="composer">\n          <text macro="description-song"/>\n        </else-if>\n        <else-if type="thesis">\n          <text macro="description-thesis"/>\n        </else-if>\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n          <text macro="description-serial"/>\n        </else-if>\n        <else-if match="none" variable="container-title">\n          <!-- Other description -->\n          <text macro="description-format"/>\n        </else-if>\n        <!-- For unpublished conference presentations/performances/events, chapters in reports/standards/generic documents, software, place description within the source element -->\n        <else-if match="any" type="document report software standard"/>\n        <else-if match="any" type="event paper-conference performance speech">\n          <choose>\n            <if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n              <text macro="description-format"/>\n            </if>\n          </choose>\n        </else-if>\n        <else>\n          <text macro="description-format"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="description-short">\n    <group prefix="[" suffix="]">\n      <choose>\n        <if match="any" type="interview" variable="interviewer">\n          <text macro="description-interview-short"/>\n        </if>\n        <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n          <text macro="description-review-short"/>\n        </else-if>\n        <else-if type="personal_communication">\n          <text macro="description-letter-short"/>\n        </else-if>\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n          <!-- serial types -->\n          <text macro="description-serial-short"/>\n        </else-if>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text macro="description-format-short"/>\n        </else-if>\n        <else-if match="any" type="interview paper-conference">\n          <!-- serial types -->\n          <text macro="description-serial-short"/>\n        </else-if>\n        <else>\n          <!-- monographic types -->\n          <text macro="description-format-short"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Description elements -->\n  <macro name="description-format">\n    <choose>\n      <if match="any" variable="genre medium">\n        <group delimiter="; ">\n          <choose>\n            <if match="none" variable="number">\n              <text text-case="capitalize-first" variable="genre"/>\n            </if>\n          </choose>\n          <text text-case="capitalize-first" variable="medium"/>\n        </group>\n      </if>\n      <else>\n        <text macro="description-format-term-generic"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-format-short">\n    <choose>\n      <if variable="genre">\n        <text form="short" text-case="capitalize-first" variable="genre"/>\n      </if>\n      <else-if variable="medium">\n        <text form="short" text-case="capitalize-first" variable="medium"/>\n      </else-if>\n      <else>\n        <text macro="description-format-term-generic"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-format-term-generic">\n    <!-- Generic labels for specific types -->\n    <choose>\n      <if type="broadcast">\n        <text term="broadcast" text-case="capitalize-first"/>\n      </if>\n      <else-if type="collection">\n        <text term="collection" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="dataset">\n        <text term="dataset" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="figure">\n        <text term="figure" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="graphic">\n        <text term="graphic" text-case="capitalize-first"/>\n      </else-if>\n      <else-if match="any" type="interview personal_communication">\n        <choose>\n          <if match="none" variable="archive archive-place container-title DOI number publisher references URL">\n            <text term="personal-communication" text-case="capitalize-first"/>\n          </if>\n          <else-if type="interview">\n            <text term="interview" text-case="capitalize-first"/>\n          </else-if>\n          <else-if type="personal_communication">\n            <text term="letter" text-case="capitalize-first"/>\n          </else-if>\n        </choose>\n      </else-if>\n      <else-if type="manuscript">\n        <choose>\n          <if match="none" variable="archive archive-place container-title DOI number publisher references URL">\n            <text term="manuscript" text-case="capitalize-first"/>\n          </if>\n        </choose>\n      </else-if>\n      <else-if type="map">\n        <text term="map" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="motion_picture">\n        <text term="motion_picture" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="periodical" variable="container-title supplement-number">\n        <text term="supplement" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="periodical" variable="container-title title">\n        <text term="special-issue" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="song">\n        <text term="song" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="software">\n        <text term="software" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="post">\n        <text term="post" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="review">\n        <text term="review" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="review-book">\n        <text term="review-book" text-case="capitalize-first"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="description-interview">\n    <group delimiter="; ">\n      <choose>\n        <if variable="interviewer title">\n          <!-- Avoid repeating \'interview\' -->\n          <choose>\n            <if match="none" variable="number">\n              <text text-case="capitalize-first" variable="genre"/>\n            </if>\n          </choose>\n          <text text-case="capitalize-first" variable="medium"/>\n        </if>\n        <else-if variable="title">\n          <text macro="description-format"/>\n        </else-if>\n        <else-if variable="genre">\n          <group delimiter=" ">\n            <text text-case="capitalize-first" variable="genre"/>\n            <choose>\n              <if variable="interviewer">\n                <text form="verb" term="container-author"/>\n                <names variable="interviewer">\n                  <name and="symbol"/>\n                </names>\n              </if>\n            </choose>\n          </group>\n        </else-if>\n        <else-if variable="interviewer">\n          <names variable="interviewer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="symbol"/>\n          </names>\n          <text text-case="capitalize-first" variable="medium"/>\n        </else-if>\n        <else>\n          <text macro="description-format"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="description-interview-short">\n    <names variable="interviewer">\n      <label form="verb" suffix=" " text-case="capitalize-first"/>\n      <name and="symbol" form="short"/>\n      <substitute>\n        <text macro="description-format-short"/>\n      </substitute>\n    </names>\n  </macro>\n  <macro name="description-letter">\n    <choose>\n      <if variable="recipient">\n        <group delimiter="; ">\n          <group delimiter=" ">\n            <text macro="description-format"/>\n            <names variable="recipient">\n              <label form="verb" suffix=" "/>\n              <name and="symbol" initialize="false"/>\n            </names>\n          </group>\n          <text macro="description-medium"/>\n        </group>\n      </if>\n      <else>\n        <text macro="description-format"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-letter-short">\n    <choose>\n      <if variable="recipient">\n        <group delimiter=" ">\n          <text macro="description-format-short"/>\n          <names variable="recipient">\n            <label form="verb" suffix=" "/>\n            <name and="symbol" form="short"/>\n          </names>\n        </group>\n      </if>\n      <else>\n        <text macro="description-format-short"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-medium">\n    <choose>\n      <if variable="number"/>\n      <else-if variable="genre">\n        <text text-case="capitalize-first" variable="medium"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="description-review">\n    <group delimiter="; ">\n      <group delimiter=", ">\n        <group delimiter=" ">\n          <choose>\n            <if variable="reviewed-genre">\n              <text term="review-of" text-case="capitalize-first"/>\n              <text variable="reviewed-genre"/>\n            </if>\n            <else-if variable="number">\n              <!-- Genre printed with `number` -->\n              <text form="short" term="review-of" text-case="capitalize-first"/>\n            </else-if>\n            <!-- If no `reviewed-genre`, assume that `genre` or `medium` is entered as \'Review of the book\' or similar -->\n            <else-if variable="genre">\n              <text text-case="capitalize-first" variable="genre"/>\n            </else-if>\n            <else-if variable="medium">\n              <text text-case="capitalize-first" variable="medium"/>\n            </else-if>\n            <else-if type="review-book">\n              <text term="review-of" text-case="capitalize-first"/>\n              <text term="book" text-case="lowercase"/>\n            </else-if>\n            <else>\n              <text form="short" term="review-of" text-case="capitalize-first"/>\n            </else>\n          </choose>\n          <text macro="description-review-title"/>\n        </group>\n        <names variable="reviewed-author">\n          <label form="verb-short" suffix=" "/>\n          <name and="symbol"/>\n        </names>\n      </group>\n      <text macro="description-medium"/>\n    </group>\n  </macro>\n  <macro name="description-review-short">\n    <group delimiter=" ">\n      <text form="short" term="review-of" text-case="capitalize-first"/>\n      <text macro="description-review-title-short"/>\n    </group>\n  </macro>\n  <macro name="description-review-title">\n    <choose>\n      <if match="any" variable="reviewed-genre reviewed-title">\n        <!-- Not possible to distinguish TV series episode from other reviewed works without a reviewed source title (APA example 69) -->\n        <!-- TODO: Adapt for `reviewed-container-title` or similar if it becomes available -->\n        <text font-style="italic" variable="reviewed-title"/>\n      </if>\n      <else>\n        <!-- Assume `title` is the title of the reviewed work -->\n        <text font-style="italic" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-title-short">\n    <choose>\n      <if match="any" variable="reviewed-genre reviewed-title">\n        <!-- Not possible to distinguish TV series episode from other reviewed works without a reviewed source title (APA example 69) -->\n        <!-- TODO: Adapt for `reviewed-container-title` or similar if it becomes available -->\n        <text font-style="italic" form="short" text-case="title" variable="reviewed-title"/>\n      </if>\n      <else>\n        <!-- Assume `title` is the title of the reviewed work -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-serial">\n    <group delimiter="; ">\n      <text macro="description-format"/>\n      <choose>\n        <if match="none" variable="title">\n          <text variable="section"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="description-serial-short">\n    <choose>\n      <if variable="title"/>\n      <else-if variable="section">\n        <text form="short" text-case="capitalize-first" variable="section"/>\n      </else-if>\n      <else>\n        <text macro="description-format-short"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-song">\n    <!-- Performer of classical music works -->\n    <group delimiter="; ">\n      <group delimiter=" ">\n        <!-- Based on `description-format` macro -->\n        <choose>\n          <if match="any" variable="genre medium">\n            <choose>\n              <if match="none" variable="number">\n                <text text-case="capitalize-first" variable="genre"/>\n              </if>\n            </choose>\n            <text text-case="capitalize-first" variable="medium"/>\n            <text form="verb" term="performer"/>\n          </if>\n          <else>\n            <text form="verb" term="performer" text-case="capitalize-first"/>\n          </else>\n        </choose>\n        <names variable="author">\n          <name and="symbol"/>\n          <substitute>\n            <names variable="performer"/>\n          </substitute>\n        </names>\n      </group>\n      <text macro="description-medium"/>\n    </group>\n  </macro>\n  <macro name="description-thesis">\n    <group delimiter="; ">\n      <group delimiter=", ">\n        <text text-case="capitalize-first" variable="genre"/>\n        <choose>\n          <if match="any" variable="archive DOI URL">\n            <!-- Include the university in description if thesis is published -->\n            <text variable="publisher"/>\n          </if>\n        </choose>\n      </group>\n      <text text-case="capitalize-first" variable="medium"/>\n    </group>\n  </macro>\n  <!-- 4. Source (APA 9.23-37) -->\n  <macro name="source">\n    <group delimiter=". ">\n      <choose>\n        <if match="any" type="post webpage"/>\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n          <text macro="source-serial"/>\n        </else-if>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <text macro="source-monographic"/>\n        </else-if>\n        <else-if match="any" type="interview paper-conference">\n          <text macro="source-serial"/>\n        </else-if>\n        <else>\n          <text macro="source-monographic"/>\n        </else>\n      </choose>\n      <text macro="source-publisher"/>\n      <text macro="source-archive"/>\n      <text macro="source-location"/>\n      <text macro="source-website"/>\n    </group>\n  </macro>\n  <!-- 4.1. Serial sources (APA 9.25-27) -->\n  <macro name="source-serial">\n    <group delimiter=". ">\n      <group delimiter=", ">\n        <group delimiter=", " font-style="italic">\n          <text text-case="title" variable="container-title"/>\n          <!-- `collection-title` is for any serial with multiple series (e.g. \'second series\') -->\n          <text text-case="title" variable="collection-title"/>\n        </group>\n        <group>\n          <text font-style="italic" variable="volume"/>\n          <group delimiter=", " prefix="(" suffix=")">\n            <text variable="issue"/>\n            <text macro="label-supplement-number"/>\n          </group>\n        </group>\n        <choose>\n          <if variable="number">\n            <text macro="label-number-article"/>\n          </if>\n          <else>\n            <text variable="page"/>\n          </else>\n        </choose>\n      </group>\n      <choose>\n        <if match="any" variable="collection-title issue number page supplement-number volume"/>\n        <else-if variable="issued status">\n          <!-- Print the status variable rather than use generic CSL terms (`in press`, etc.) -->\n          <text text-case="capitalize-first" variable="status"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4.2. Monographic sources (APA 9.28) -->\n  <macro name="source-monographic">\n    <!-- Monographic sources repeat main reference elements -->\n    <choose>\n      <if variable="container-title">\n        <group delimiter=" ">\n          <choose>\n            <if type="song">\n              <text term="on" text-case="capitalize-first"/>\n            </if>\n            <else>\n              <text term="in" text-case="capitalize-first"/>\n            </else>\n          </choose>\n          <group delimiter=", ">\n            <text macro="source-monographic-author"/>\n            <text macro="source-monographic-title"/>\n          </group>\n          <text macro="source-monographic-identifier"/>\n          <text macro="source-monographic-description"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <!-- Monographic source author -->\n  <macro name="source-monographic-author">\n    <names variable="container-author">\n      <name and="symbol"/>\n      <label prefix=" (" suffix=")" text-case="title"/>\n      <substitute>\n        <names variable="executive-producer"/>\n        <names variable="series-creator"/>\n        <names variable="editor-translator">\n          <name and="symbol"/>\n          <label form="short" prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <!-- TODO: Translator omitted on the assumption that editor-translators are uncommon for chapter citations. If needed, direct entry or automatic population of `editor-translator` can produce combined labels. -->\n        <names delimiter="; " variable="editor">\n          <name and="symbol"/>\n          <label form="short" prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <names variable="editorial-director">\n          <name and="symbol"/>\n          <label form="short" prefix=" (" suffix=")" text-case="title"/>\n        </names>\n        <names variable="compiler"/>\n        <choose>\n          <if match="any" type="event performance speech">\n            <names variable="chair"/>\n            <names variable="organizer"/>\n          </if>\n        </choose>\n        <names variable="curator"/>\n        <names variable="collection-editor">\n          <name and="symbol"/>\n          <label form="short" prefix=" (" suffix=")" text-case="title"/>\n        </names>\n      </substitute>\n    </names>\n  </macro>\n  <!-- Monographic source title -->\n  <macro name="source-monographic-title">\n    <group delimiter=": " font-style="italic">\n      <text variable="container-title"/>\n      <text macro="title-volume"/>\n    </group>\n  </macro>\n  <!-- Monographic source identifier -->\n  <macro name="source-monographic-identifier">\n    <choose>\n      <if variable="container-title">\n        <group delimiter="; " prefix="(" suffix=")">\n          <choose>\n            <if match="none" type="broadcast graphic map motion_picture">\n              <!-- For some audiovisual media, number information comes after `title`, not `container-title` (APA example 94); but an album track number is `chapter-number` -->\n              <text macro="identifier-number"/>\n            </if>\n          </choose>\n          <text macro="identifier-monographic"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <!-- Monographic source description -->\n  <macro name="source-monographic-description">\n    <group prefix="[" suffix="]">\n      <choose>\n        <if match="any" type="document report software standard">\n          <!-- place description after `container-title` -->\n          <text macro="description-format"/>\n        </if>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume"/>\n        <else-if match="any" type="event paper-conference performance speech">\n          <!-- unpublished conference presentations should describe the session -->\n          <text macro="description-format"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4.3. Publisher sources (APA 9.29) -->\n  <macro name="source-publisher">\n    <choose>\n      <if type="thesis">\n        <choose>\n          <if match="none" variable="archive DOI URL">\n            <!-- Provide university in `publisher` if unpublished -->\n            <text variable="publisher"/>\n          </if>\n        </choose>\n      </if>\n      <!-- omit serial types -->\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book"/>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text variable="publisher"/>\n      </else-if>\n      <else-if type="interview">\n        <!-- give publisher for a broadcast `interview` handled as a serial type -->\n        <text variable="publisher"/>\n      </else-if>\n      <!-- omit serial `paper-conference` -->\n      <else-if type="paper-conference"/>\n      <else>\n        <text variable="publisher"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.4. Database and archive sources (APA 9.30) -->\n  <macro name="source-archive">\n    <group delimiter=", ">\n      <choose>\n        <if variable="archive_collection">\n          <!-- With collection: `archive_collection` (`archive_location`), `archive`, `archive-place` -->\n          <group delimiter=" ">\n            <text variable="archive_collection"/>\n            <text prefix="(" suffix=")" variable="archive_location"/>\n          </group>\n          <text variable="archive"/>\n          <text variable="archive-place"/>\n        </if>\n        <else>\n          <!-- No collection: `archive` (`archive_location`), `archive-place` -->\n          <group delimiter=" ">\n            <text variable="archive"/>\n            <text prefix="(" suffix=")" variable="archive_location"/>\n          </group>\n          <text variable="archive-place"/>\n        </else>\n      </choose>\n      <!-- a database identifier/number is stored in `number` and appears in `identifier-number` -->\n    </group>\n  </macro>\n  <!-- 4.5. Works with specific locations (APA 9.31) -->\n  <macro name="source-location">\n    <choose>\n      <if match="any" variable="event event-title">\n        <!-- TODO: To prevent Zotero from printing `event-place`, due to its double-mapping of `publisher-place` and `event-place`. Remove this when that is changed. -->\n        <choose>\n          <if type="paper-conference">\n            <choose>\n              <if match="none" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n                <!-- Don\'t print event info for conference papers published in a proceedings -->\n                <text macro="source-location-title-place-date"/>\n              </if>\n            </choose>\n          </if>\n          <else>\n            <!-- For other item types, print event info even if published (e.g. collection catalogs, performance programs). These items aren\'t given explicit examples in the APA manual, so err on the side of providing too much information. -->\n            <text macro="source-location-title-place-date"/>\n          </else>\n        </choose>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-location-title-place-date">\n    <group delimiter=", ">\n      <choose>\n        <!-- TODO: We expect `event-title` to be used, but processors and applications may not be updated yet. This macro ensures that either `event` or `event-title` can be accepted. Remove if processor logic and application adoption can handle this. -->\n        <if variable="event-title">\n          <text text-case="capitalize-first" variable="event-title"/>\n        </if>\n        <else>\n          <text text-case="capitalize-first" variable="event"/>\n        </else>\n      </choose>\n      <text variable="event-place"/>\n      <text macro="date-event-full"/>\n    </group>\n  </macro>\n  <!-- 4.6. Social media and website sources (APA 9.32-33) -->\n  <macro name="source-website">\n    <choose>\n      <if match="any" type="post webpage">\n        <text text-case="title" variable="container-title"/>\n      </if>\n    </choose>\n  </macro>\n  <!-- 4.7. DOI or URL (APA 9.34-36) -->\n  <macro name="source-DOI-URL">\n    <choose>\n      <if variable="DOI">\n        <text prefix="https://doi.org/" variable="DOI"/>\n      </if>\n      <else-if variable="URL">\n        <group delimiter=" ">\n          <choose>\n            <if match="none" variable="issued status">\n              <text term="retrieved" text-case="capitalize-first"/>\n              <group delimiter=", ">\n                <date form="text" variable="accessed"/>\n                <text term="from"/>\n              </group>\n            </if>\n          </choose>\n          <text variable="URL"/>\n        </group>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- 5. Publication history (APA 9.39-41) -->\n  <macro name="publication-history">\n    <!-- Notes on source element: original publication, reprint info, retraction info -->\n    <group delimiter="; " prefix="(" suffix=")">\n      <choose>\n        <if type="patent">\n          <text variable="references"/>\n        </if>\n        <else>\n          <!-- Print `status` here for "retracted" etc. if it\'s not printed elsewhere. -->\n          <choose>\n            <if match="none" variable="issued"/>\n            <else-if match="any" variable="collection-title issue number page supplement-number volume">\n              <text text-case="capitalize-first" variable="status"/>\n            </else-if>\n          </choose>\n          <choose>\n            <if variable="references">\n              <!-- Provide the option for more elaborate description of publication history, such as full "reprinted" references (APA examples 11, 43, 44) -->\n              <text variable="references"/>\n            </if>\n            <else>\n              <!-- Format publication history using CSL variables -->\n              <group delimiter=" ">\n                <text term="original-work-published" text-case="capitalize-first"/>\n                <group delimiter=", ">\n                  <group delimiter=" ">\n                    <text value="as"/>\n                    <text font-style="italic" variable="original-title"/>\n                  </group>\n                  <text macro="date-original-year"/>\n                  <text variable="original-publisher"/>\n                </group>\n              </group>\n            </else>\n          </choose>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 6. Legal references: Bluebook style (shared with Chicago) -->\n  <!-- Where APA or Chicago diverge from Bluebook, the official manual is followed -->\n  <macro name="legal-reference">\n    <!-- Type usage:\n\n         `bill`\n         : bills, resolutions, federal reports\n\n         `legal_case`\n         : all legal and court cases\n\n         `hearing`\n         : hearings and testimony\n\n         `legislation`\n         : statutes, constitutional items, and charters\n\n         `regulation`\n         : codified regulations, uncodified regulations, executive orders\n\n         `treaty`\n         : treaties\n    -->\n    <group delimiter=", ">\n      <choose>\n        <if type="treaty">\n          <text macro="legal-title"/>\n          <names variable="author">\n            <!-- Treaty parties should be included at least for bilateral treaties (Bluebook 21.4.2) -->\n            <name delimiter="-" et-al-min="100" et-al-use-first="99" form="short" initialize="false"/>\n          </names>\n          <text macro="legal-date"/>\n          <!-- treaty source/report in addition to URL (Bluebook 21.4.5) -->\n          <text macro="legal-source"/>\n        </if>\n        <else>\n          <group delimiter=" ">\n            <group delimiter=", ">\n              <text macro="legal-title"/>\n              <text macro="legal-source"/>\n            </group>\n            <text macro="legal-date"/>\n            <text macro="legal-identifier"/>\n          </group>\n        </else>\n      </choose>\n      <group delimiter=" ">\n        <!-- locator for use in notes -->\n        <choose>\n          <if locator="page" variable="page">\n            <text term="at"/>\n          </if>\n        </choose>\n        <text macro="label-locator"/>\n      </group>\n    </group>\n  </macro>\n  <!-- 6.1. Legal date -->\n  <macro name="legal-date">\n    <choose>\n      <if type="treaty">\n        <text macro="date-issued-full"/>\n      </if>\n      <else-if type="legal_case">\n        <text macro="legal-date-case"/>\n      </else-if>\n      <else-if match="any" type="bill hearing legislation regulation">\n        <group delimiter=" " prefix="(" suffix=")">\n          <group delimiter=" ">\n            <text macro="date-original-year"/>\n            <text form="symbol" term="and"/>\n          </group>\n          <choose>\n            <if variable="issued">\n              <text macro="date-issued-year"/>\n            </if>\n            <else>\n              <!-- Show proposal date for uncodified regulations. Assume date is entered literally ala "proposed May 23, 2016". -->\n              <!-- TODO: Add `proposed` date here if that becomes available -->\n              <date form="text" variable="submitted"/>\n            </else>\n          </choose>\n        </group>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="legal-date-case">\n    <group delimiter=" " prefix="(" suffix=")">\n      <text variable="authority"/>\n      <choose>\n        <if variable="container-title">\n          <!-- Print only year for cases published in reporters-->\n          <text macro="date-issued-year"/>\n        </if>\n        <else>\n          <text macro="date-issued-full"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 6.2.1. Legal title -->\n  <macro name="legal-title">\n    <choose>\n      <if match="any" type="bill legal_case legislation regulation treaty">\n        <text text-case="title" variable="title"/>\n      </if>\n      <else-if type="hearing">\n        <!-- use standard format (Bluebook 13.3) -->\n        <group delimiter=": " font-style="italic">\n          <text text-case="capitalize-first" variable="title"/>\n          <group delimiter=" ">\n            <text term="hearing" text-case="capitalize-first"/>\n            <group delimiter=" ">\n              <text term="on"/>\n              <text variable="number"/>\n            </group>\n            <group delimiter=" ">\n              <text value="before the"/>\n              <text variable="section"/>\n            </group>\n          </group>\n        </group>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- 6.2.2. Legal identifier -->\n  <macro name="legal-identifier">\n    <group delimiter=" " prefix="(" suffix=")">\n      <choose>\n        <if type="hearing">\n          <!-- Use the \'verb\' form of the hearing term to hold \'testimony of\' -->\n          <text form="verb" term="hearing"/>\n          <names variable="author">\n            <name and="symbol" initialize="false"/>\n          </names>\n        </if>\n        <else-if match="any" type="bill legislation regulation">\n          <!-- For uncodified regulations, assume future code section is in `status`. -->\n          <text variable="status"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="legal-identifier-bill-report">\n    <group delimiter=" ">\n      <text variable="genre"/>\n      <choose>\n        <if match="any" variable="authority chapter-number container-title">\n          <text variable="number"/>\n        </if>\n        <else>\n          <!-- If there is no legislative body, session number, or code/record title, assume the item is a congressional report and include \'No.\' label. -->\n          <text macro="label-number-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 6.3. Legal source -->\n  <macro name="legal-source">\n    <!-- Expect legal item `container-title` to be stored in short form -->\n    <choose>\n      <if type="bill">\n        <text macro="legal-source-bill"/>\n      </if>\n      <else-if type="hearing">\n        <text macro="legal-source-hearing"/>\n      </else-if>\n      <else-if type="legal_case">\n        <text macro="legal-source-case"/>\n      </else-if>\n      <else-if type="legislation">\n        <text macro="legal-source-legislation"/>\n      </else-if>\n      <else-if type="regulation">\n        <text macro="legal-source-regulation"/>\n      </else-if>\n      <else-if type="treaty">\n        <text macro="legal-source-treaty"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- Legal source types -->\n  <macro name="legal-source-bill">\n    <group delimiter=", ">\n      <text macro="legal-identifier-bill-report"/>\n      <group delimiter=" ">\n        <text variable="authority"/>\n        <!-- `chapter-number` is a session number -->\n        <text variable="chapter-number"/>\n      </group>\n      <group delimiter=" ">\n        <text variable="volume"/>\n        <text variable="container-title"/>\n        <text variable="page-first"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="legal-source-case">\n    <group delimiter=" ">\n      <choose>\n        <if variable="container-title">\n          <text variable="volume"/>\n          <text variable="container-title"/>\n          <text macro="label-section-symbol"/>\n          <choose>\n            <if match="any" variable="page page-first">\n              <text variable="page-first"/>\n            </if>\n            <else>\n              <text value="___"/>\n            </else>\n          </choose>\n        </if>\n        <else>\n          <text macro="label-number-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="legal-source-hearing">\n    <group delimiter=" ">\n      <text variable="authority"/>\n      <!-- `chapter-number` is a session number -->\n      <text variable="chapter-number"/>\n    </group>\n  </macro>\n  <macro name="legal-source-legislation">\n    <choose>\n      <if variable="number">\n        <!-- `number` is a public law number -->\n        <group delimiter=", ">\n          <group delimiter=" ">\n            <choose>\n              <if variable="genre">\n                <text text-case="capitalize-first" variable="genre"/>\n              </if>\n              <else>\n                <text form="short" term="legislation" text-case="capitalize-first"/>\n              </else>\n            </choose>\n            <text macro="label-number-capitalized"/>\n          </group>\n          <group delimiter=" ">\n            <text variable="volume"/>\n            <text variable="container-title"/>\n            <text variable="page-first"/>\n          </group>\n        </group>\n      </if>\n      <else>\n        <group delimiter=" ">\n          <text variable="volume"/>\n          <text variable="container-title"/>\n          <choose>\n            <if variable="section">\n              <text macro="label-section-symbol"/>\n            </if>\n            <else>\n              <text variable="page-first"/>\n            </else>\n          </choose>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="legal-source-regulation">\n    <group delimiter=", ">\n      <group delimiter=" ">\n        <text variable="genre"/>\n        <text macro="label-number-capitalized"/>\n      </group>\n      <group delimiter=" ">\n        <text variable="volume"/>\n        <text variable="container-title"/>\n        <choose>\n          <if variable="section">\n            <text macro="label-section-symbol"/>\n          </if>\n          <else>\n            <text variable="page-first"/>\n          </else>\n        </choose>\n      </group>\n    </group>\n  </macro>\n  <macro name="legal-source-treaty">\n    <group delimiter=" ">\n      <number variable="volume"/>\n      <text variable="container-title"/>\n      <choose>\n        <if match="any" variable="page page-first">\n          <text variable="page-first"/>\n        </if>\n        <else>\n          <text macro="label-number-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Citation -->\n  <citation collapse="year" disambiguate-add-givenname="true" disambiguate-add-names="true" disambiguate-add-year-suffix="true" et-al-min="3" et-al-use-first="1" givenname-disambiguation-rule="primary-name-with-initials">\n    <sort>\n      <key macro="author-sort" names-min="3" names-use-first="1"/>\n      <key macro="date-sort-group"/>\n      <key macro="date-sort"/>\n      <key variable="status"/>\n    </sort>\n    <layout delimiter="; " prefix="(" suffix=")">\n      <group delimiter=", ">\n        <text macro="author-short"/>\n        <text macro="date-short"/>\n        <text macro="label-locator"/>\n      </group>\n    </layout>\n  </citation>\n  <!-- Bibliography -->\n  <macro name="bibliography">\n    <group delimiter=" ">\n      <choose>\n        <if match="any" type="bill hearing legal_case legislation regulation treaty">\n          <!-- Legal items have different orders and delimiters -->\n          <text macro="legal-reference" suffix="."/>\n          <text macro="source-DOI-URL"/>\n          <text variable="references"/>\n        </if>\n        <else>\n          <group delimiter=". " suffix=".">\n            <text macro="author-and-contributors"/>\n            <text macro="date"/>\n            <text macro="title-and-descriptions"/>\n            <text macro="source"/>\n          </group>\n          <text macro="source-DOI-URL"/>\n          <text macro="publication-history"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <bibliography entry-spacing="0" et-al-min="21" et-al-use-first="19" et-al-use-last="true" hanging-indent="true" line-spacing="2">\n    <sort>\n      <key macro="author-sort"/>\n      <key macro="date-sort-group"/>\n      <key macro="date-sort"/>\n      <key variable="status"/>\n      <key macro="title"/>\n      <key variable="volume"/>\n      <key variable="part-number"/>\n      <key variable="event-date"/>\n      <key variable="original-date"/>\n      <key macro="source-archive"/>\n    </sort>\n    <layout>\n      <choose>\n        <if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n          <text macro="bibliography"/>\n        </if>\n        <!-- an inaccessible `interview` or `personal_communication` is cited in-text only (APA 8.9) -->\n        <else-if match="any" type="interview personal_communication"/>\n        <else>\n          <text macro="bibliography"/>\n        </else>\n      </choose>\n    </layout>\n  </bibliography>\n</style>\n';

// renderer/styles/chicago.csl
var chicago_default = '<?xml version="1.0" encoding="utf-8"?>\n<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" initialize-with=". " page-range-format="chicago-16" version="1.0">\n  <!-- This file was generated by the Style Variant Builder <https://github.com/citation-style-language/style-variant-builder>. To contribute changes, modify the template and regenerate variants. -->\n  <info>\n    <title>Chicago Manual of Style 18th edition (author-date)</title>\n    <title-short>CMOS/CMS with Bluebook (author-date/AD [13.102])</title-short>\n    <id>http://www.zotero.org/styles/chicago-author-date</id>\n    <link href="http://www.zotero.org/styles/chicago-author-date" rel="self"/>\n    <link href="http://www.zotero.org/styles/chicago-notes-bibliography" rel="template"/>\n    <link href="https://www.chicagomanualofstyle.org/" rel="documentation"/>\n    <link href="https://zotero.org/groups/2205533/collections/5V67EPX3" rel="documentation"/>\n    <author>\n      <name>Andrew Dunning</name>\n      <uri>https://orcid.org/0000-0003-0464-5036</uri>\n    </author>\n    <category citation-format="author-date"/>\n    <category field="anthropology"/>\n    <category field="communications"/>\n    <category field="generic-base"/>\n    <category field="geography"/>\n    <category field="history"/>\n    <category field="humanities"/>\n    <category field="law"/>\n    <category field="linguistics"/>\n    <category field="literature"/>\n    <category field="philosophy"/>\n    <category field="political_science"/>\n    <category field="science"/>\n    <category field="social_science"/>\n    <category field="sociology"/>\n    <category field="theology"/>\n    <summary>Chicago-style source citations (with Bluebook for legal citations), author-date system</summary>\n    <updated>2025-02-09T00:00:00+00:00</updated>\n    <rights license="http://creativecommons.org/licenses/by-sa/3.0/">This work is licensed under a Creative Commons Attribution-ShareAlike 3.0 License</rights>\n  </info>\n  <locale xml:lang="en">\n    <terms>\n      <!-- Chicago omits \'by\' from `verb-short` forms; it abbreviates only the most common roles -->\n      <term name="advance-online-publication">ahead of print</term>\n      <term name="anonymous">unsigned</term>\n      <term form="verb-short" name="collection-editor">ed.</term>\n      <term form="short" name="collection-number">\n        <single>vol.</single>\n        <multiple>vols.</multiple>\n      </term>\n      <term form="verb-short" name="compiler">comp.</term>\n      <term form="verb-short" name="editor">ed.</term>\n      <term form="short" name="editor-translator">\n        <single>ed. and trans.</single>\n        <multiple>eds. and trans.</multiple>\n      </term>\n      <term form="short" name="editortranslator">\n        <single>ed. and trans.</single>\n        <multiple>eds. and trans.</multiple>\n      </term>\n      <term form="verb" name="editor-translator">edited and translated by</term>\n      <term form="verb" name="editortranslator">edited and translated by</term>\n      <term form="verb-short" name="editor-translator">ed. and trans.</term>\n      <term form="verb-short" name="editortranslator">ed. and trans.</term>\n      <term form="verb-short" name="illustrator">ill.</term>\n      <term form="short" name="legislation">Pub. L.</term>\n      <term name="manuscript">unpublished manuscript</term>\n      <term name="original-work-published">originally published as</term>\n      <term form="short" name="paper-conference">paper</term>\n      <!-- \'under\' replaces \'s.v.\' from CMOS17 and earlier (CMOS18 14.130) -->\n      <term name="sub-verbo">under</term>\n      <term form="short" name="sub-verbo">under</term>\n      <term name="timestamp">at</term>\n      <term form="verb-short" name="translator">trans.</term>\n    </terms>\n  </locale>\n  <locale xml:lang="en-GB">\n    <terms>\n      <!-- the Bibliography of Additional Resources recommends the New Oxford Style Manual as a British English guide, which the `en-GB` locale follows -->\n      <term form="short" name="collection-number">\n        <single>vol.</single>\n        <multiple>vols</multiple>\n      </term>\n      <term form="short" name="editor-translator">\n        <single>ed. and trans.</single>\n        <multiple>eds and trans.</multiple>\n      </term>\n      <term form="short" name="editortranslator">\n        <single>ed. and trans.</single>\n        <multiple>eds and trans.</multiple>\n      </term>\n      <term form="verb-short" name="illustrator">illus.</term>\n    </terms>\n  </locale>\n  <!-- Contents:\n\n       This file interprets Chicago using APA\'s four basic reference elements\n       (cf. CMOS18 14.2, 14.64, 14.161):\n\n        1. Author (CMOS18 13.74-86)\n        2. Date (author-date system only, CMOS18 13.102)\n        3. Title and descriptions (CMOS18 13.87-101)\n            3.1. Title\n            3.2. Description\n            3.3. Identifiers (edition, contributors, volume)\n        4. Source\n            4.1. Serial sources\n            4.2. Monographic sources\n            4.3. Series\n            4.4. Event\n            4.5. Publisher\n            4.6. Date\n            4.7. Locator (including page references)\n            4.8. Medium\n            4.9. Archival location\n            4.10. URL or persistent identifier\n\n       Freeform annotations to bibliography entries:\n\n        5. Notes\n\n       Chicago also provides parallel rules for legal references following\n       The Bluebook: A Uniform System of Citation (code shared with APA):\n\n        6. Legal references\n  -->\n  <!-- In this file, macros suffixed `-bib` and `-note` are parallel versions\n       of the same features for the bibliography and notes, and all changes\n       must be applied to both. They should only contain differences of\n       punctuation (periods in bibliography, commas in notes) and capitalization,\n       except where the comments indicate structural changes. -->\n  <!-- Categories of CSL item types:\n\n       Serial\n       : article-journal article-magazine article-newspaper periodical post-weblog review review-book\n\n       Serial or Monographic\n       : interview paper-conference\n\n         Monographic with any of `collection-editor compiler editor editorial-director`.\n         A serial `paper-conference` is unpublished if it lacks any of `issue page supplement-number volume`.\n\n       Monographic\n       : article book broadcast chapter classic collection dataset document\n         entry entry-dictionary entry-encyclopedia event figure\n         graphic manuscript map motion_picture musical_score\n         pamphlet patent performance personal_communication post report\n         software song speech standard thesis webpage\n\n       Legal\n       : bill hearing legal_case legislation regulation treaty\n  -->\n  <!-- Variable labels -->\n  <macro name="label-chapter-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="chapter-number" type="song">\n          <text value="track"/>\n        </if>\n        <else-if is-numeric="chapter-number">\n          <label form="short" variable="chapter-number"/>\n        </else-if>\n      </choose>\n      <text variable="chapter-number"/>\n    </group>\n  </macro>\n  <macro name="label-chapter-number-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="chapter-number" type="song">\n          <text text-case="capitalize-first" value="track"/>\n        </if>\n        <else-if is-numeric="chapter-number">\n          <label form="short" text-case="capitalize-first" variable="chapter-number"/>\n        </else-if>\n      </choose>\n      <text text-case="capitalize-first" variable="chapter-number"/>\n    </group>\n  </macro>\n  <macro name="label-collection-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="collection-number">\n          <label form="short" variable="collection-number"/>\n        </if>\n      </choose>\n      <text variable="collection-number"/>\n    </group>\n  </macro>\n  <macro name="label-edition">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="edition">\n          <number form="ordinal" variable="edition"/>\n          <label form="short" variable="edition"/>\n        </if>\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n          <!-- serial types: full label (CMOS18 14.89) -->\n          <text variable="edition"/>\n          <label variable="edition"/>\n        </else-if>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text variable="edition"/>\n        </else-if>\n        <else-if match="any" type="interview paper-conference">\n          <!-- serial types -->\n          <text variable="edition"/>\n          <label variable="edition"/>\n        </else-if>\n        <else>\n          <!-- monographic types -->\n          <text variable="edition"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-edition-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="edition">\n          <number form="ordinal" variable="edition"/>\n          <label form="short" variable="edition"/>\n        </if>\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n          <!-- serial types: full label (CMOS18 14.89) -->\n          <text text-case="title" variable="edition"/>\n          <label text-case="capitalize-first" variable="edition"/>\n        </else-if>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text text-case="capitalize-first" variable="edition"/>\n        </else-if>\n        <else-if match="any" type="interview paper-conference">\n          <!-- serial types -->\n          <text text-case="title" variable="edition"/>\n          <label text-case="capitalize-first" variable="edition"/>\n        </else-if>\n        <else>\n          <!-- monographic types -->\n          <text text-case="capitalize-first" variable="edition"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-issue">\n    <group delimiter=" ">\n      <label form="short" variable="issue"/>\n      <text variable="issue"/>\n    </group>\n  </macro>\n  <macro name="label-locator">\n    <group delimiter=" ">\n      <choose>\n        <if locator="page"/>\n        <else-if match="any" type="bill hearing legal_case legislation regulation treaty">\n          <!-- Bluebook-style labels for legal types (CMOS18 14.174) -->\n          <choose>\n            <if locator="chapter paragraph section" match="any">\n              <label form="symbol" variable="locator"/>\n            </if>\n            <else>\n              <label form="short" variable="locator"/>\n            </else>\n          </choose>\n        </else-if>\n        <else-if is-numeric="locator" locator="line">\n          <label variable="locator"/>\n        </else-if>\n        <else-if is-numeric="locator">\n          <label form="short" variable="locator"/>\n        </else-if>\n        <else-if locator="chapter line verse" match="any"/>\n        <!-- a non-numeric canonical reference is identified by its formatting and does not need a label (CMOS18 14.143-54) -->\n        <else>\n          <label form="short" variable="locator"/>\n        </else>\n      </choose>\n      <text variable="locator"/>\n    </group>\n  </macro>\n  <macro name="label-locator-all">\n    <group delimiter=" ">\n      <label form="short" variable="locator"/>\n      <text variable="locator"/>\n    </group>\n  </macro>\n  <macro name="label-number-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if type="standard"/>\n        <else-if is-numeric="number" match="any" type="legislation regulation">\n          <label form="short" text-case="capitalize-first" variable="number"/>\n        </else-if>\n      </choose>\n      <text text-case="capitalize-first" variable="number"/>\n    </group>\n  </macro>\n  <macro name="label-number-of-volumes">\n    <group delimiter=" ">\n      <text variable="number-of-volumes"/>\n      <choose>\n        <if is-numeric="number-of-volumes">\n          <label form="short" variable="number-of-volumes"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-page">\n    <group delimiter=" ">\n      <label form="short" variable="page"/>\n      <text variable="page"/>\n    </group>\n  </macro>\n  <macro name="label-part-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="part-number">\n          <!-- TODO: Replace with `part-number` label when CSL provides one -->\n          <text form="short" term="part"/>\n        </if>\n      </choose>\n      <text variable="part-number"/>\n    </group>\n  </macro>\n  <macro name="label-part-number-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="part-number">\n          <!-- TODO: Replace with `part-number` label when CSL provides one -->\n          <text form="short" term="part" text-case="capitalize-first"/>\n        </if>\n      </choose>\n      <text text-case="capitalize-first" variable="part-number"/>\n    </group>\n  </macro>\n  <macro name="label-section-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="section">\n          <label form="short" text-case="capitalize-first" variable="section"/>\n        </if>\n      </choose>\n      <text text-case="title" variable="section"/>\n    </group>\n  </macro>\n  <macro name="label-section-symbol">\n    <group delimiter=" ">\n      <label form="symbol" variable="section"/>\n      <text variable="section"/>\n    </group>\n  </macro>\n  <macro name="label-supplement-number">\n    <group delimiter=" ">\n      <choose>\n        <!-- TODO: Replace with `supplement-number` label when CSL provides one -->\n        <if variable="issue supplement-number">\n          <!-- if there is both an issue and supplement number, do not label both as \'no.\' -->\n          <text form="short" term="supplement"/>\n        </if>\n        <else-if is-numeric="supplement-number" variable="volume-title">\n          <!-- if there is a volume title, it is already described as a supplement -->\n          <text form="short" term="issue"/>\n        </else-if>\n        <else-if is-numeric="supplement-number" type="periodical" variable="title">\n          <text form="short" term="issue"/>\n        </else-if>\n        <else-if is-numeric="supplement-number">\n          <text form="short" term="supplement"/>\n        </else-if>\n      </choose>\n      <text variable="supplement-number"/>\n    </group>\n  </macro>\n  <macro name="label-version">\n    <group delimiter=" ">\n      <choose>\n        <if type="software">\n          <!-- short version label for software (CMOS18 14.169) -->\n          <label form="short" variable="version"/>\n        </if>\n        <else>\n          <label variable="version"/>\n        </else>\n      </choose>\n      <text variable="version"/>\n    </group>\n  </macro>\n  <macro name="label-version-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if type="software">\n          <!-- short version label for software (CMOS18 14.169) -->\n          <label form="short" text-case="capitalize-first" variable="version"/>\n        </if>\n        <else>\n          <label text-case="capitalize-first" variable="version"/>\n        </else>\n      </choose>\n      <text variable="version"/>\n    </group>\n  </macro>\n  <macro name="label-volume">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="volume">\n          <label form="short" variable="volume"/>\n        </if>\n      </choose>\n      <text variable="volume"/>\n    </group>\n  </macro>\n  <macro name="label-volume-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="volume">\n          <label form="short" text-case="capitalize-first" variable="volume"/>\n        </if>\n      </choose>\n      <text text-case="capitalize-first" variable="volume"/>\n    </group>\n  </macro>\n  <!-- 1. Author (CMOS18 13.74-86) -->\n  <macro name="author-bib">\n    <names variable="composer">\n      <name and="text" delimiter-precedes-last="always" initialize="false" name-as-sort-order="first"/>\n      <label form="short" prefix=", "/>\n      <substitute>\n        <names variable="author"/>\n        <!-- cf. `interview` model (CMOS18 14.110); if it is desired to prioritize `host` over `guest`, the latter could be encoded as a `contributor` -->\n        <names variable="guest"/>\n        <names variable="host"/>\n        <choose>\n          <if type="song">\n            <names variable="performer"/>\n          </if>\n        </choose>\n        <choose>\n          <if type="classic">\n            <!-- contributors fall after the title of `classic` (CMOS18 14.147) -->\n            <text macro="author-title-substitute-bib"/>\n          </if>\n          <else-if type="entry-dictionary" variable="container-title">\n            <!-- contributors fall after the title of unsigned reference entries (CMOS18 14.130) -->\n            <text macro="author-title-substitute-container"/>\n          </else-if>\n          <else-if type="entry-encyclopedia" variable="container-title">\n            <text macro="author-title-substitute-container"/>\n          </else-if>\n        </choose>\n        <names variable="illustrator"/>\n        <choose>\n          <if match="none" type="standard">\n            <names variable="editor-translator"/>\n            <names variable="editor"/>\n            <names variable="translator"/>\n            <names variable="collection-editor"/>\n          </if>\n        </choose>\n        <names variable="director"/>\n        <choose>\n          <!-- serial `broadcast` prioritizes title (CMOS18 14.165, 14.168) -->\n          <if type="broadcast" variable="container-title number title"/>\n          <else>\n            <names variable="producer"/>\n            <names variable="executive-producer"/>\n            <names variable="series-creator"/>\n            <choose>\n              <if type="broadcast">\n                <names variable="contributor"/>\n              </if>\n            </choose>\n          </else>\n        </choose>\n        <names variable="editorial-director"/>\n        <names variable="compiler"/>\n        <choose>\n          <if match="any" type="event performance speech">\n            <names variable="chair"/>\n            <names variable="organizer"/>\n          </if>\n        </choose>\n        <names variable="curator"/>\n        <choose>\n          <if match="any" type="software webpage">\n            <!-- `software` listed under the name of the publisher or developer (CMOS18 14.169); `webpage` listed under a site owner or sponsor (CMOS18 14.104) -->\n            <text variable="publisher"/>\n          </if>\n          <else-if type="standard">\n            <!-- `standard` listed in bibliography under organization, but note omits this (CMOS18 14.159) -->\n            <text variable="authority"/>\n          </else-if>\n        </choose>\n        <text macro="author-title-substitute-container"/>\n        <text macro="author-title-substitute-bib"/>\n        <choose>\n          <if match="any" variable="container-title event-date event-place event-title genre title publisher publisher-place"/>\n          <else-if type="manuscript">\n            <text macro="source-archive-bib"/>\n          </else-if>\n        </choose>\n      </substitute>\n    </names>\n  </macro>\n  <macro name="author-inline">\n    <choose>\n      <if match="any" type="bill hearing legal_case legislation regulation treaty">\n        <text macro="title-and-descriptions-short"/>\n      </if>\n      <else-if match="any" type="interview personal_communication">\n        <text macro="author-inline-and-recipient"/>\n      </else-if>\n      <else>\n        <names variable="composer">\n          <name and="text" form="short" initialize="true"/>\n          <substitute>\n            <names variable="author"/>\n            <names variable="guest"/>\n            <names variable="host"/>\n            <choose>\n              <if type="song">\n                <names variable="performer"/>\n              </if>\n            </choose>\n            <choose>\n              <if match="any" type="classic performance">\n                <!-- contributors fall after the title of `classic` (CMOS18 14.147), `performance` (CMOS18 14.166) -->\n                <text macro="author-title-substitute-short"/>\n              </if>\n              <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n                <!-- contributors fall after the title of unsigned reference entries (CMOS18 14.130) -->\n                <text macro="author-title-substitute-container-short"/>\n              </else-if>\n            </choose>\n            <names variable="illustrator"/>\n            <choose>\n              <if match="none" type="standard">\n                <names variable="editor-translator"/>\n                <names variable="editor"/>\n                <names variable="translator"/>\n                <names variable="collection-editor"/>\n              </if>\n            </choose>\n            <choose>\n              <if type="broadcast" variable="container-title number title"/>\n              <else>\n                <names variable="director"/>\n                <names variable="producer"/>\n                <names variable="executive-producer"/>\n                <names variable="series-creator"/>\n                <choose>\n                  <if type="broadcast">\n                    <names variable="contributor"/>\n                  </if>\n                </choose>\n              </else>\n            </choose>\n            <names variable="editorial-director"/>\n            <names variable="compiler"/>\n            <choose>\n              <if match="any" type="event performance speech">\n                <names variable="chair"/>\n                <names variable="organizer"/>\n              </if>\n            </choose>\n            <names variable="curator"/>\n            <choose>\n              <if match="any" type="software webpage">\n                <!-- `software` listed under the name of the publisher or developer (CMOS18 14.169); `webpage` listed under a site owner or sponsor (CMOS18 14.104) -->\n                <text form="short" variable="publisher"/>\n              </if>\n              <else-if type="standard">\n                <!-- `standard` listed in bibliography under organization, but note omits this (CMOS18 14.159) -->\n                <text form="short" variable="authority"/>\n              </else-if>\n            </choose>\n            <text macro="author-title-substitute-container-short"/>\n            <text macro="author-title-substitute-short"/>\n            <choose>\n              <if match="any" variable="container-title event-date event-place event-title genre title publisher publisher-place"/>\n              <else-if type="manuscript">\n                <text macro="source-archive-note"/>\n              </else-if>\n            </choose>\n          </substitute>\n        </names>\n      </else>\n    </choose>\n  </macro>\n  <macro name="author-sort">\n    <choose>\n      <if match="any" type="bill hearing legal_case legislation regulation treaty">\n        <text macro="legal-title"/>\n      </if>\n      <else>\n        <text macro="author-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Author elements -->\n  <macro name="author-inline-and-recipient">\n    <!-- identical to `author-short-and-recipient` but with initialization -->\n    <group delimiter=" ">\n      <choose>\n        <!-- inaccessible `interview` or `personal_commmunication`: in-text citation (CMOS18 14.111) -->\n        <if match="none" variable="archive archive-place container-title DOI number publisher references URL">\n          <choose>\n            <if position="first">\n              <!-- do not shorten at first reference as there is no bibliography entry -->\n              <names variable="author">\n                <name and="text" initialize="false"/>\n                <!-- never initialize -->\n                <substitute>\n                  <text macro="title-and-descriptions-short"/>\n                </substitute>\n              </names>\n            </if>\n            <else>\n              <names variable="author">\n                <name and="text" form="short" initialize="true"/>\n                <substitute>\n                  <text macro="title-and-descriptions-short"/>\n                </substitute>\n              </names>\n            </else>\n          </choose>\n          <choose>\n            <if variable="genre"/>\n            <!-- recipient appears in the description if there is a `genre`; otherwise after `author` -->\n            <else-if position="first">\n              <names variable="recipient">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </else-if>\n            <else>\n              <names variable="recipient">\n                <label form="verb" suffix=" "/>\n                <name and="text" form="short" initialize="true"/>\n              </names>\n            </else>\n          </choose>\n        </if>\n        <!-- accessible `interview` or `personal_communication`: standard citation -->\n        <else-if variable="author recipient">\n          <names variable="author">\n            <name and="text" form="short" initialize="true"/>\n          </names>\n          <choose>\n            <if match="none" variable="genre">\n              <names variable="recipient">\n                <label form="verb" suffix=" "/>\n                <name and="text" form="short" initialize="true"/>\n              </names>\n            </if>\n          </choose>\n        </else-if>\n        <else>\n          <names variable="author">\n            <name and="text" form="short" initialize="true"/>\n            <substitute>\n              <text macro="title-and-descriptions-short"/>\n            </substitute>\n          </names>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="author-title-substitute-bib">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- If a review has no `reviewed-genre` or `reviewed-title`, assume that `title` contains the title of the reviewed work; the description provides it. -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <text macro="title-bib"/>\n          </if>\n          <else-if variable="reviewed-genre reviewed-title title">\n            <text macro="title-bib"/>\n          </else-if>\n          <else>\n            <text macro="title-and-descriptions-bib"/>\n          </else>\n        </choose>\n      </if>\n      <else-if variable="title">\n        <text macro="title-bib"/>\n      </else-if>\n      <else>\n        <!-- If an item has no `title`, substitute with descriptions. -->\n        <text macro="title-and-descriptions-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="author-title-substitute-short">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- If a review has no `reviewed-genre` or `reviewed-title`, assume that `title` contains the title of the reviewed work; the description provides it. -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <text macro="title-short"/>\n          </if>\n          <else-if variable="reviewed-genre reviewed-title title">\n            <text macro="title-short"/>\n          </else-if>\n          <else>\n            <text macro="title-and-descriptions-short"/>\n          </else>\n        </choose>\n      </if>\n      <else-if variable="title">\n        <text macro="title-short"/>\n      </else-if>\n      <else>\n        <!-- If an item has no `title`, substitute with descriptions and capitalize -->\n        <text macro="title-and-descriptions-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="author-title-substitute-container">\n    <choose>\n      <!-- no Chicago model for citing an anonymous article with an issue title in `volume-title` -->\n      <if variable="volume-title"/>\n      <else-if match="any" type="article-magazine article-newspaper">\n        <!-- Anonymous magazine and newspaper articles substitute name of publication (CMOS18 14.87, 14.97) -->\n        <text macro="source-serial-name"/>\n      </else-if>\n      <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- Publication name also substituted for unsigned reviews (CMOS18 14.102) -->\n        <text macro="source-serial-name"/>\n      </else-if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <!-- Anonymous entries in reference works (CMOS18 14.130) -->\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if type="broadcast">\n        <!-- TV broadcasts and podcasts (CMOS18 14.165, 14.168) -->\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if type="webpage">\n        <!-- list a webpage under the website title if there is no owner or sponsor (CMOS18 14.104) -->\n        <choose>\n          <if variable="container-title-short">\n            <text text-case="title" variable="container-title-short"/>\n          </if>\n          <else>\n            <text text-case="title" variable="container-title"/>\n          </else>\n        </choose>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="author-title-substitute-container-short">\n    <choose>\n      <if match="any" type="article-magazine article-newspaper">\n        <!-- Anonymous magazine/newspaper articles substitute name of publication (CMOS18 14.87, 14.97) -->\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </if>\n      <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- Publication name also substituted for unsigned reviews (CMOS18 14.102) -->\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <!-- Anonymous entries in reference works (CMOS18 14.130) -->\n        <text font-style="italic" form="short" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if type="broadcast">\n        <!-- TV broadcasts and podcasts (CMOS18 14.165, 14.168) -->\n        <text font-style="italic" form="short" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if type="webpage">\n        <!-- list a webpage under the website title if there is no owner or sponsor (CMOS18 14.104) -->\n        <text form="short" text-case="title" variable="container-title"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- 2. Date (CMOS18 13.102) -->\n  <macro name="date">\n    <group delimiter="-">\n      <choose>\n        <if variable="issued">\n          <group delimiter=" ">\n            <!-- reprints and earlier editions may give original year in brackets (CMOS18 14.16) -->\n            <text macro="date-original-year" prefix="(" suffix=")"/>\n            <group>\n              <text macro="date-issued-year"/>\n              <text variable="year-suffix"/>\n            </group>\n          </group>\n        </if>\n        <else-if variable="event-date">\n          <text macro="date-event-year"/>\n        </else-if>\n        <else-if variable="available-date">\n          <date date-parts="year" form="numeric" variable="available-date"/>\n        </else-if>\n        <else-if variable="status">\n          <!-- Print the status variable rather than use generic CSL terms (`in press`, etc.) -->\n          <text text-case="capitalize-first" variable="status"/>\n          <text variable="year-suffix"/>\n        </else-if>\n        <else-if type="collection">\n          <!-- do not give n.d. for archival collections (CMOS18 14.128) -->\n          <text variable="year-suffix"/>\n        </else-if>\n        <else-if type="manuscript">\n          <!-- do not give n.d. with a bare shelfmark -->\n          <choose>\n            <if match="any" variable="container-title event-date event-place event-title genre title publisher publisher-place">\n              <text form="short" term="no date"/>\n              <text variable="year-suffix"/>\n            </if>\n          </choose>\n        </else-if>\n        <else>\n          <text form="short" term="no date"/>\n          <text variable="year-suffix"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="date-short">\n    <group delimiter="-">\n      <choose>\n        <if variable="issued">\n          <group delimiter=" ">\n            <choose>\n              <if is-uncertain-date="original-date">\n                <!-- Uncertain date already has square brackets -->\n                <text macro="date-original-year"/>\n              </if>\n              <else>\n                <text macro="date-original-year" prefix="[" suffix="]"/>\n              </else>\n            </choose>\n            <group>\n              <choose>\n                <if match="none" type="interview personal_communication">\n                  <text macro="date-issued-year"/>\n                </if>\n                <!-- accessible `interview` or `personal_communication` items appear in the bibliography; inaccessible items are in-text only -->\n                <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n                  <text macro="date-issued-year"/>\n                </else-if>\n                <else>\n                  <text macro="date-issued-full"/>\n                </else>\n              </choose>\n              <text variable="year-suffix"/>\n            </group>\n          </group>\n        </if>\n        <else-if variable="event-date">\n          <text macro="date-event-year"/>\n        </else-if>\n        <else-if variable="available-date">\n          <date date-parts="year" form="numeric" variable="available-date"/>\n        </else-if>\n        <else-if variable="status">\n          <!-- Print the status variable rather than use generic CSL terms (`in press`, etc.) -->\n          <text text-case="lowercase" variable="status"/>\n          <text variable="year-suffix"/>\n        </else-if>\n        <else-if match="any" type="interview personal_communication">\n          <choose>\n            <if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n              <!-- only give n.d. for accessible personal communication (CMOS18 14.111)-->\n              <text form="short" term="no date"/>\n              <text variable="year-suffix"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if match="any" type="classic collection entry entry-dictionary entry-encyclopedia">\n          <!-- do not give n.d. for archival collections (CMOS18 14.128), `classic` (CMOS18 14.143), or reference entries (CMOS18 14.131) -->\n          <text variable="year-suffix"/>\n        </else-if>\n        <else-if type="manuscript">\n          <!-- do not give n.d. with a bare shelfmark -->\n          <choose>\n            <if match="any" variable="container-title event-date event-place event-title genre title publisher publisher-place">\n              <text form="short" term="no date"/>\n              <text variable="year-suffix"/>\n            </if>\n          </choose>\n        </else-if>\n        <else>\n          <text form="short" term="no date"/>\n          <text variable="year-suffix"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="date-sort-group">\n    <!-- Sort items with and without dates (CMOS18 14.44):\n\n          1. items with dates (= 0)\n          2. `no date` items (= 1)\n          3. items with `status` (forthcoming, in press, etc.) (= 2) -->\n    <choose>\n      <if variable="issued">\n        <text value="0"/>\n      </if>\n      <else-if variable="status">\n        <text value="2"/>\n      </else-if>\n      <else>\n        <!-- n.d. -->\n        <text value="1"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-sort-year">\n    <!-- while reference lists are to be sorted chronologically (CMOS18 13.112), it appears that only the year is to be taken into account (CMOS18 13.114) -->\n    <choose>\n      <if type="personal_communication" variable="event-date issued">\n        <date date-parts="year" form="numeric" variable="event-date"/>\n      </if>\n      <else>\n        <text macro="date-issued-year"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Date elements -->\n  <macro name="date-event-full">\n    <choose>\n      <if is-uncertain-date="issued">\n        <!-- guessed-at date (CMOS18 14.44) -->\n        <date form="text" prefix="[" suffix="?]" variable="event-date"/>\n      </if>\n      <else>\n        <date form="text" variable="event-date"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-event-year">\n    <choose>\n      <if is-uncertain-date="issued">\n        <!-- guessed-at date (CMOS18 14.44) -->\n        <date date-parts="year" form="numeric" prefix="[" suffix="?]" variable="event-date"/>\n      </if>\n      <else>\n        <date date-parts="year" form="numeric" variable="event-date"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-issued-full">\n    <choose>\n      <if is-uncertain-date="issued">\n        <!-- guessed-at date (CMOS18 14.44) -->\n        <date form="text" prefix="[" suffix="?]" variable="issued"/>\n      </if>\n      <else>\n        <date form="text" variable="issued"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-issued-month">\n    <date variable="issued">\n      <date-part name="month"/>\n    </date>\n  </macro>\n  <macro name="date-issued-month-day">\n    <date variable="issued">\n      <date-part name="month"/>\n      <date-part name="day" prefix=" "/>\n    </date>\n  </macro>\n  <macro name="date-issued-year">\n    <choose>\n      <if is-uncertain-date="issued">\n        <!-- guessed-at date (CMOS18 14.44) -->\n        <date date-parts="year" form="numeric" prefix="[" suffix="?]" variable="issued"/>\n      </if>\n      <else>\n        <date date-parts="year" form="numeric" variable="issued"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-original-month">\n    <date variable="original-date">\n      <date-part name="month"/>\n    </date>\n  </macro>\n  <macro name="date-original-month-day">\n    <date variable="original-date">\n      <date-part name="month"/>\n      <date-part name="day" prefix=" "/>\n    </date>\n  </macro>\n  <macro name="date-original-year">\n    <choose>\n      <if is-uncertain-date="original-date">\n        <date date-parts="year" form="numeric" prefix="[" suffix="?]" variable="original-date"/>\n      </if>\n      <else>\n        <date date-parts="year" form="numeric" variable="original-date"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 3. Title and descriptions (CMOS18 13.87-101) -->\n  <macro name="title-and-descriptions-bib">\n    <group delimiter=". ">\n      <choose>\n        <if variable="title">\n          <text macro="title-bib"/>\n          <text macro="description-bib"/>\n          <text macro="identifier-bib"/>\n        </if>\n        <else-if match="any" type="bill report">\n          <!-- Bills, resolutions, and congressional reports substitute bill number if no title -->\n          <!-- Congressional reports are indistinguishable from other reports -->\n          <text macro="identifier-number-bib"/>\n          <text macro="identifier-bib"/>\n          <text macro="description-bib"/>\n        </else-if>\n        <else>\n          <text macro="description-bib"/>\n          <text macro="identifier-bib"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="title-and-descriptions-short">\n    <choose>\n      <if variable="title">\n        <text macro="title-short"/>\n      </if>\n      <else-if match="any" type="bill report">\n        <!-- Bills, resolutions, and congressional reports substitute bill number if no title -->\n        <text macro="legal-identifier-bill-report"/>\n      </else-if>\n      <else>\n        <text macro="description-short"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-and-source-bib">\n    <group delimiter=". ">\n      <choose>\n        <if type="broadcast" variable="container-title number title">\n          <!-- Bespoke `broadcast` format (CMOS18 14.165, 14.168) -->\n          <text macro="source-monographic-title-specific-title-first"/>\n          <group delimiter=", ">\n            <text macro="identifier-number-bib"/>\n            <text macro="title-bib"/>\n            <text macro="description-bib"/>\n            <text macro="source-monographic-identifier-contributors-bib"/>\n          </group>\n          <text macro="source-monographic-identifier-contributors-bib-container-author"/>\n          <text macro="source-series-bib"/>\n          <choose>\n            <!-- show event information here only if not collapsed with `issued` (CMOS18 14.167) -->\n            <if match="any" variable="event-date original-date original-publisher original-publisher-place publisher status">\n              <text macro="source-event-bib"/>\n            </if>\n          </choose>\n        </if>\n        <else-if type="chapter" variable="container-title genre">\n          <!-- \'introduction to\', \'online appendix to\' (CMOS18 14.12, 14.14) -->\n          <group delimiter=" ">\n            <text macro="title-and-descriptions-bib"/>\n            <text macro="source-bib"/>\n          </group>\n        </else-if>\n        <else-if type="article-journal" variable="container-title genre volume-title">\n          <!-- introduction to a special issue or supplement -->\n          <group delimiter=" ">\n            <text macro="title-and-descriptions-bib"/>\n            <text macro="source-bib"/>\n          </group>\n        </else-if>\n        <else>\n          <text macro="title-and-descriptions-bib"/>\n          <text macro="source-bib"/>\n        </else>\n      </choose>\n      <group delimiter=", ">\n        <choose>\n          <!-- show event information here only if collapsed with `issued` (CMOS18 14.167) -->\n          <if match="any" variable="event-date original-date original-publisher original-publisher-place publisher status"/>\n          <!-- omit serial types -->\n          <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book"/>\n          <else-if match="any" variable="collection-editor compiler editor editorial-director">\n            <!-- monographic types -->\n            <text macro="source-event-bib"/>\n          </else-if>\n          <!-- omit serial types -->\n          <else-if match="any" type="interview paper-conference"/>\n          <else>\n            <!-- monographic types -->\n            <text macro="source-event-bib"/>\n          </else>\n        </choose>\n        <text macro="source-monographic-publication-bib"/>\n      </group>\n      <text macro="source-medium-bib"/>\n      <text macro="source-archive-bib"/>\n      <text macro="source-date-accessed-DOI-URL-bib"/>\n    </group>\n  </macro>\n  <!-- 3.1. Title -->\n  <macro name="title-bib">\n    <choose>\n      <if match="any" type="post webpage">\n        <!-- part number/title always at the analytic level -->\n        <text macro="title-and-part-filter-review-bib"/>\n      </if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="title-and-part-filter-review-bib"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="title-monographic-bib-specific-title-first"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="title-and-part-filter-review-bib"/>\n      </else-if>\n      <else>\n        <text macro="title-monographic-bib-specific-title-first"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-short">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- If a review has no `reviewed-title`, assume that `title` contains the title of the reviewed work; the description provides it. -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <!-- Quotes, title case -->\n            <text form="short" quotes="true" text-case="title" variable="title"/>\n          </if>\n          <else-if variable="reviewed-genre reviewed-title title">\n            <!-- Quotes, title case -->\n            <text form="short" quotes="true" text-case="title" variable="title"/>\n          </else-if>\n          <else>\n            <text macro="description-short"/>\n          </else>\n        </choose>\n      </if>\n      <else>\n        <text macro="title-primary-short"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Title elements -->\n  <macro name="title-and-part-filter-review-bib">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- `title` is only the review title if there is a separate `reviewed-genre` or `reviewed-title`; otherwise, it is the title of the reviewed work, printed in the description -->\n        <choose>\n          <if match="any" variable="reviewed-genre reviewed-title">\n            <text macro="title-and-part-title-bib"/>\n          </if>\n        </choose>\n      </if>\n      <else>\n        <text macro="title-and-part-title-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-and-part-title-bib">\n    <group delimiter=". ">\n      <text macro="title-primary"/>\n      <group delimiter=", ">\n        <text macro="label-part-number-capitalized"/>\n        <text macro="title-part"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="title-monographic-bib-specific-title-first">\n    <!-- Use with author-date or notes and bibliography leading with volume title (CMOS18 14.21). -->\n    <!-- For monographic items, assume `part-number` and `part-title` refer to the book/volume. -->\n    <choose>\n      <if variable="container-title">\n        <text macro="title-primary"/>\n      </if>\n      <!-- For monographic items without `container-title`, bibliography entries list `part-title` or `volume-title` first if available -->\n      <else-if variable="part-title">\n        <text macro="title-part"/>\n      </else-if>\n      <else-if variable="volume-title">\n        <text macro="title-volume"/>\n      </else-if>\n      <else>\n        <text macro="title-primary"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-part">\n    <choose>\n      <if type="patent">\n        <!-- No italics or quotes, sentence case -->\n        <text form="short" text-case="capitalize-first" variable="part-title"/>\n      </if>\n      <else-if match="any" type="bill collection legislation regulation treaty">\n        <!-- No italics or quotes, title case -->\n        <text text-case="title" variable="part-title"/>\n      </else-if>\n      <else-if type="legal_case">\n        <!-- Italicized, sentence case -->\n        <text font-style="italic" variable="part-title"/>\n      </else-if>\n      <else-if match="any" type="book classic graphic hearing map">\n        <!-- Italicized, title case (regardless of `container-title`) -->\n        <text font-style="italic" text-case="title" variable="part-title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="author container-title">\n        <!-- Signed encyclopedia entry in quotes, title case (CMOS18 14.132) -->\n        <text quotes="true" text-case="title" variable="part-title"/>\n      </else-if>\n      <else-if type="entry-dictionary" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="part-title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="part-title"/>\n      </else-if>\n      <else-if type="post">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="part-title"/>\n      </else-if>\n      <else-if type="webpage">\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="part-title"/>\n      </else-if>\n      <!-- Other types are formatted based on presence of `container-title` -->\n      <else-if variable="container-title">\n        <choose>\n          <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n            <!-- serial types -->\n            <!-- Quotes, title case -->\n            <text quotes="true" text-case="title" variable="part-title"/>\n          </if>\n          <else-if match="any" variable="collection-editor compiler editor editorial-director">\n            <!-- monographic types -->\n            <!-- Italics, title case -->\n            <text font-style="italic" text-case="title" variable="part-title"/>\n          </else-if>\n          <else-if match="any" type="interview paper-conference">\n            <!-- serial types -->\n            <!-- Quotes, title case -->\n            <text quotes="true" text-case="title" variable="part-title"/>\n          </else-if>\n          <else>\n            <!-- monographic types -->\n            <!-- Italics, title case -->\n            <text font-style="italic" text-case="title" variable="part-title"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if match="any" type="article dataset document interview manuscript paper-conference personal_communication speech thesis webpage">\n        <!-- Container-like but not necessarily with `container-title` -->\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="part-title"/>\n      </else-if>\n      <else>\n        <!-- Italicized, title case (default) -->\n        <text font-style="italic" text-case="title" variable="part-title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-primary">\n    <choose>\n      <if type="patent">\n        <!-- No italics or quotes, sentence case -->\n        <text form="short" text-case="capitalize-first" variable="title"/>\n      </if>\n      <else-if match="any" type="bill collection legislation regulation treaty">\n        <!-- No italics or quotes, title case -->\n        <text text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="legal_case">\n        <!-- Italicized, sentence case -->\n        <text font-style="italic" variable="title"/>\n      </else-if>\n      <else-if match="any" type="book classic graphic hearing map">\n        <!-- Italicized, title case (regardless of `container-title`) -->\n        <text font-style="italic" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="author container-title">\n        <!-- Signed encyclopedia entry in quotes, title case (CMOS18 14.132) -->\n        <text quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="entry-dictionary" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="title"/>\n      </else-if>\n      <else-if type="post">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="title"/>\n      </else-if>\n      <!-- Other types are formatted based on presence of `container-title` -->\n      <else-if variable="container-title">\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if match="any" type="article dataset document interview manuscript paper-conference personal_communication speech thesis webpage">\n        <!-- Container-like but not necessarily with `container-title` -->\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else>\n        <!-- Italicized, title case (default) -->\n        <text font-style="italic" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-primary-short">\n    <choose>\n      <if type="patent">\n        <!-- No italics or quotes, sentence case -->\n        <text form="short" text-case="capitalize-first" variable="title"/>\n      </if>\n      <else-if match="any" type="bill collection legislation regulation treaty">\n        <!-- No italics or quotes, title case -->\n        <text form="short" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="legal_case">\n        <!-- Italicized, sentence case -->\n        <text font-style="italic" form="short" variable="title"/>\n      </else-if>\n      <else-if match="any" type="book classic graphic hearing map">\n        <!-- Italicized, title case (regardless of `container-title`) -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="author container-title">\n        <!-- Signed encyclopedia entry in quotes, title case (CMOS18 14.132) -->\n        <text form="short" quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="entry-dictionary" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text form="short" quotes="true" variable="title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text form="short" quotes="true" variable="title"/>\n      </else-if>\n      <else-if type="post">\n        <!-- Quotes, sentence case -->\n        <text form="short" quotes="true" variable="title"/>\n      </else-if>\n      <!-- Other types are formatted based on presence of `container-title` -->\n      <else-if variable="container-title">\n        <!-- Quotes, title case -->\n        <text form="short" quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if match="any" type="article dataset document interview manuscript paper-conference personal_communication speech thesis webpage">\n        <!-- Container-like but not necessarily with `container-title` -->\n        <!-- Quotes, title case -->\n        <text form="short" quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else>\n        <!-- Italicized, title case (default) -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-volume">\n    <choose>\n      <if type="manuscript">\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="volume-title"/>\n      </if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="volume-title"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <!-- Italics, title case -->\n        <text font-style="italic" text-case="title" variable="volume-title"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="volume-title"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <!-- Italics, title case -->\n        <text font-style="italic" text-case="title" variable="volume-title"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 3.2. Description -->\n  <macro name="description-bib">\n    <choose>\n      <if match="any" type="interview" variable="interviewer">\n        <text macro="description-interview-bib"/>\n      </if>\n      <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <text macro="description-review-bib"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <text macro="description-letter-bib"/>\n      </else-if>\n      <else-if type="song" variable="composer">\n        <text macro="description-song-bib"/>\n      </else-if>\n      <!-- thesis type appears with university name (CMOS18 14.113) -->\n      <else-if type="thesis"/>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="description-serial-bib"/>\n      </else-if>\n      <else-if type="paper-conference">\n        <text macro="description-paper-conference-bib"/>\n      </else-if>\n      <else-if match="none" variable="container-title">\n        <text macro="description-format-bib"/>\n      </else-if>\n      <!-- For conference presentations/performances/events, chapters in reports/standards/generic documents, software, place description within the source element -->\n      <else-if match="any" type="document report software standard"/>\n      <else-if match="any" type="event paper-conference performance speech">\n        <choose>\n          <if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n            <text macro="description-format-bib"/>\n          </if>\n        </choose>\n      </else-if>\n      <else>\n        <text macro="description-format-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-short">\n    <choose>\n      <if match="any" type="interview" variable="interviewer">\n        <choose>\n          <if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n            <text macro="description-interview-short"/>\n          </if>\n          <else>\n            <!-- for an inaccessible `interview`, give a full in-text description at the first citation -->\n            <choose>\n              <if position="first">\n                <text macro="description-interview-note"/>\n              </if>\n              <else>\n                <text macro="description-interview-short"/>\n              </else>\n            </choose>\n          </else>\n        </choose>\n      </if>\n      <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <text macro="description-review-short"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <text macro="description-letter-short"/>\n      </else-if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="description-serial-short"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="description-format-short"/>\n      </else-if>\n      <else-if type="paper-conference">\n        <!-- serial `paper-conference` -->\n        <text macro="description-serial-short"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <text macro="description-format-short"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Description elements -->\n  <macro name="description-format-bib">\n    <choose>\n      <if variable="genre number"/>\n      <else-if variable="genre">\n        <text text-case="capitalize-first" variable="genre"/>\n      </else-if>\n      <!-- generic labels if unpublished -->\n      <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL"/>\n      <else-if type="manuscript">\n        <!-- \'unpublished manuscript\' if no `genre` (CMOS18 14.114) -->\n        <text term="manuscript" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <!-- \'personal communication\' if no `genre` (CMOS18 14.111) -->\n        <text term="personal-communication" text-case="capitalize-first"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="description-format-note">\n    <choose>\n      <if variable="genre number"/>\n      <else-if variable="genre">\n        <text variable="genre"/>\n      </else-if>\n      <!-- generic labels if unpublished -->\n      <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL"/>\n      <else-if type="manuscript">\n        <!-- \'unpublished manuscript\' if no `genre` (CMOS18 14.114) -->\n        <text term="manuscript"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <!-- \'personal communication\' if no `genre` (CMOS18 14.111) -->\n        <text term="personal-communication"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="description-format-short">\n    <group delimiter=" ">\n      <choose>\n        <if type="chapter" variable="container-title genre">\n          <!-- untitled introductions: cf. review model, which includes a title (CMOS18 14.101) -->\n          <text form="short" variable="genre"/>\n          <choose>\n            <if match="none" position="ibid ibid-with-locator">\n              <!-- CMOS team suggests leaving out title in repeated references -->\n              <text macro="source-monographic-preposition-note"/>\n              <text font-style="italic" form="short" text-case="title" variable="container-title"/>\n            </if>\n          </choose>\n        </if>\n        <else-if type="article-journal" variable="container-title genre volume-title">\n          <!-- untitled introduction to a special issue or supplement -->\n          <text form="short" variable="genre"/>\n          <choose>\n            <if match="none" position="ibid ibid-with-locator">\n              <text macro="source-monographic-preposition-note"/>\n              <text form="short" quotes="true" text-case="title" variable="volume-title"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if variable="genre">\n          <text form="short" variable="genre"/>\n        </else-if>\n        <else-if variable="medium">\n          <text form="short" variable="medium"/>\n        </else-if>\n        <else-if variable="chapter-number container-title">\n          <text macro="source-monographic-preposition-note"/>\n          <text font-style="italic" form="short" text-case="title" variable="container-title"/>\n        </else-if>\n        <else-if variable="chapter-number">\n          <text macro="label-chapter-number"/>\n        </else-if>\n        <!-- generic labels if unpublished -->\n        <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL"/>\n        <else-if type="manuscript">\n          <!-- \'unpublished manuscript\' if no `genre` (CMOS18 14.114) -->\n          <text term="manuscript"/>\n        </else-if>\n        <else-if type="personal_communication">\n          <!-- \'pers. comm.\' if no `genre` (CMOS18 14.111) -->\n          <text form="short" term="personal-communication"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="description-interview-bib">\n    <group delimiter=", ">\n      <choose>\n        <if variable="genre number">\n          <!-- `genre` printed with `number` -->\n          <names variable="interviewer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n        <else-if variable="genre">\n          <group delimiter=" ">\n            <text text-case="capitalize-first" variable="genre"/>\n            <group delimiter=" ">\n              <text form="verb" term="container-author"/>\n              <names variable="interviewer">\n                <name and="text" initialize="false"/>\n              </names>\n            </group>\n          </group>\n        </else-if>\n        <else-if variable="interviewer">\n          <names variable="interviewer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n        </else-if>\n        <else>\n          <text macro="description-format-bib"/>\n        </else>\n      </choose>\n      <text macro="source-event-place-first"/>\n    </group>\n  </macro>\n  <macro name="description-interview-note">\n    <group delimiter=", ">\n      <choose>\n        <if variable="genre number">\n          <!-- `genre` printed with `number` -->\n          <names variable="interviewer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n        <else-if variable="genre">\n          <group delimiter=" ">\n            <text variable="genre"/>\n            <group delimiter=" ">\n              <text form="verb" term="container-author"/>\n              <names variable="interviewer">\n                <name and="text" initialize="false"/>\n              </names>\n            </group>\n          </group>\n        </else-if>\n        <else-if variable="interviewer">\n          <names variable="interviewer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </else-if>\n        <else>\n          <text macro="description-format-note"/>\n        </else>\n      </choose>\n      <text macro="source-event-place-first"/>\n    </group>\n  </macro>\n  <macro name="description-interview-short">\n    <choose>\n      <if disambiguate="true">\n        <names variable="interviewer">\n          <label form="verb" suffix=" "/>\n          <name and="text" form="short" initialize="true"/>\n          <substitute>\n            <text macro="description-format-short"/>\n          </substitute>\n        </names>\n      </if>\n      <else-if match="any" variable="genre medium">\n        <choose>\n          <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n            <text macro="description-format-short"/>\n          </if>\n          <else>\n            <!-- capitalize if no author or title -->\n            <text macro="description-format-bib"/>\n          </else>\n        </choose>\n      </else-if>\n      <else>\n        <!-- generic description for an unpublished interview (CMOS18 14.108) -->\n        <text term="interview"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-letter-bib">\n    <choose>\n      <if variable="recipient">\n        <group delimiter=", ">\n          <choose>\n            <if variable="genre number">\n              <!-- `genre` appears with `number` -->\n              <names variable="recipient">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n            <else-if variable="genre">\n              <group delimiter=" ">\n                <text macro="description-format-bib"/>\n                <names variable="recipient">\n                  <label form="verb" suffix=" "/>\n                  <name and="text" initialize="false"/>\n                </names>\n              </group>\n            </else-if>\n            <else>\n              <names variable="recipient">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </else>\n          </choose>\n          <text variable="event-place"/>\n          <text macro="date-event-full"/>\n        </group>\n      </if>\n      <else>\n        <text macro="description-format-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-letter-short">\n    <!-- shortened notes ideally give author, recipient, place, and date (CMOS18 14.13) -->\n    <group delimiter=", ">\n      <choose>\n        <if variable="genre recipient">\n          <group delimiter=" ">\n            <text macro="description-format-short"/>\n            <names variable="recipient">\n              <label form="verb" suffix=" "/>\n              <name and="text" form="short" initialize="true"/>\n            </names>\n          </group>\n        </if>\n        <else>\n          <text macro="description-format-short"/>\n        </else>\n      </choose>\n      <text variable="event-place"/>\n      <choose>\n        <if variable="event-date">\n          <text macro="date-event-full"/>\n        </if>\n        <else>\n          <text macro="date-issued-full"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="description-paper-conference-bib">\n    <choose>\n      <if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="description-format-bib"/>\n      </if>\n      <else>\n        <!-- serial types -->\n        <group delimiter=". ">\n          <text macro="description-serial-bib"/>\n          <text macro="source-event-bib"/>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-bib">\n    <!-- Reviewed item -->\n    <group delimiter=". ">\n      <group delimiter=", ">\n        <group delimiter=" ">\n          <text macro="description-review-genre-bib"/>\n          <text macro="description-review-title"/>\n        </group>\n        <choose>\n          <if variable="reviewed-genre reviewed-title title">\n            <names variable="reviewed-author">\n              <label form="verb" suffix=" "/>\n              <name and="text" initialize="false"/>\n            </names>\n          </if>\n          <else-if variable="reviewed-genre"/>\n          <else>\n            <names variable="reviewed-author">\n              <label form="verb" suffix=" "/>\n              <name and="text" initialize="false"/>\n            </names>\n          </else>\n        </choose>\n        <text macro="source-event-place-first"/>\n      </group>\n      <text macro="label-section-capitalized"/>\n    </group>\n  </macro>\n  <macro name="description-review-genre-bib">\n    <choose>\n      <if variable="reviewed-genre">\n        <group delimiter=" ">\n          <text macro="description-review-term-unsigned-bib"/>\n          <text variable="reviewed-genre"/>\n          <choose>\n            <if match="none" variable="reviewed-title">\n              <names variable="reviewed-author">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </group>\n      </if>\n      <else-if variable="number">\n        <text macro="description-review-term-unsigned-bib"/>\n      </else-if>\n      <!-- If no `reviewed-genre`, assume that `genre` is entered as \'Review of the book\' or similar -->\n      <else-if variable="genre">\n        <text text-case="capitalize-first" variable="genre"/>\n      </else-if>\n      <else>\n        <text macro="description-review-term-unsigned-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-short">\n    <choose>\n      <if match="any" position="ibid ibid-with-locator">\n        <text term="review"/>\n      </if>\n      <else>\n        <group delimiter=" ">\n          <text term="review-of"/>\n          <text macro="description-review-title-short"/>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-term-unsigned-bib">\n    <!-- Anonymous reviews appear as \'unsigned\' (CMOS18 14.102) -->\n    <choose>\n      <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n        <text term="review-of" text-case="capitalize-first"/>\n      </if>\n      <else>\n        <group delimiter=" ">\n          <text term="anonymous" text-case="capitalize-first"/>\n          <text term="review-of"/>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-title">\n    <choose>\n      <if match="any" variable="reviewed-genre reviewed-title">\n        <!-- Not possible to distinguish TV series episode from other reviewed works without a reviewed source title -->\n        <!-- Adapt for `reviewed-container-title` or similar if it becomes available -->\n        <text font-style="italic" text-case="title" variable="reviewed-title"/>\n      </if>\n      <else>\n        <!-- Assume title is title of reviewed work -->\n        <text font-style="italic" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-title-short">\n    <choose>\n      <if match="any" variable="reviewed-genre reviewed-title">\n        <!-- Not possible to distinguish TV series episode from other reviewed works without a reviewed source title -->\n        <!-- Adapt for `reviewed-container-title` or similar if it becomes available -->\n        <text font-style="italic" form="short" text-case="title" variable="reviewed-title"/>\n      </if>\n      <else>\n        <!-- Assume title is title of reviewed work -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-serial-bib">\n    <group delimiter=". ">\n      <text macro="description-format-bib"/>\n      <!-- `section` provides magazine departments (CMOS18 14.88) and newspaper column names (CMOS18 14.93) -->\n      <text macro="label-section-capitalized"/>\n    </group>\n  </macro>\n  <macro name="description-serial-short">\n    <choose>\n      <if variable="title"/>\n      <else-if variable="genre">\n        <text macro="description-format-short"/>\n      </else-if>\n      <else>\n        <text form="short" text-case="title" variable="section"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-song-bib">\n    <!-- Performer of classical music works -->\n    <!-- TODO: remove when Zotero fixes mapping of performer to `author` -->\n    <group delimiter=" ">\n      <!-- Based on `description-format` macro -->\n      <choose>\n        <if variable="genre">\n          <text text-case="capitalize-first" variable="genre"/>\n          <text form="verb" term="performer"/>\n        </if>\n        <!-- providing \'performed by\' label for recorded readings (CMOS18 14.164), but it should be omitted for classical music (CMOS18 14.163) -->\n        <else>\n          <text form="verb" term="performer" text-case="capitalize-first"/>\n        </else>\n      </choose>\n      <names variable="author">\n        <name and="text" initialize="false"/>\n        <substitute>\n          <names variable="performer"/>\n        </substitute>\n      </names>\n    </group>\n  </macro>\n  <!-- 3.3. Identifier (edition, contributors, volume) -->\n  <macro name="identifier-bib">\n    <group delimiter=". ">\n      <choose>\n        <if type="patent">\n          <text macro="identifier-patent"/>\n        </if>\n        <else-if type="report">\n          <text macro="identifier-report-bib"/>\n        </else-if>\n        <else-if match="any" type="post webpage">\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n          <text macro="identifier-number-bib"/>\n          <text macro="label-version-capitalized"/>\n          <text macro="identifier-edition-bib"/>\n          <text macro="identifier-contributors-bib"/>\n        </else-if>\n        <else-if variable="container-title">\n          <choose>\n            <if match="any" type="broadcast graphic map motion_picture">\n              <!-- For audiovisual media, number information comes after `title`, not `container-title`; `song` places album catalogue `number` with `publisher` (CMOS18 14.163-164) -->\n              <text macro="identifier-number-bib"/>\n            </if>\n          </choose>\n          <text macro="identifier-contributors-bib"/>\n        </else-if>\n        <else>\n          <choose>\n            <if match="none" type="song">\n              <text macro="identifier-number-bib"/>\n            </if>\n          </choose>\n          <text macro="label-version-capitalized"/>\n          <text macro="identifier-edition-bib"/>\n          <text macro="identifier-contributors-and-volume-bib"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Identifier elements -->\n  <macro name="identifier-contributors-bib">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="identifier-contributors-serial-bib"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <text macro="identifier-contributors-monographic-bib"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <text macro="identifier-contributors-serial-bib"/>\n      </else-if>\n      <else>\n        <text macro="identifier-contributors-monographic-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-contributors-monographic-bib">\n    <group delimiter=". ">\n      <choose>\n        <if match="any" type="post webpage">\n          <names variable="container-author">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editor-translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="editor translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editorial-director">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="guest">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="host">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="illustrator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="narrator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="compiler chair organizer curator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="series-creator executive-producer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="producer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="director">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="any" type="broadcast performance">\n              <names variable="script-writer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="performer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" type="thesis">\n              <names variable="contributor">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </if>\n        <else>\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n          <choose>\n            <if match="none" variable="container-title">\n              <names variable="container-author">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="editor-translator">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names delimiter=". " variable="editor translator">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="editorial-director">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="guest">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="host">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="illustrator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="narrator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" variable="container-title">\n              <names delimiter=". " variable="compiler chair organizer curator">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names delimiter=". " variable="series-creator executive-producer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="producer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="director">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <choose>\n                <if match="any" type="broadcast performance">\n                  <names variable="script-writer">\n                    <label form="verb" suffix=" " text-case="capitalize-first"/>\n                    <name and="text" initialize="false"/>\n                  </names>\n                </if>\n              </choose>\n              <names variable="performer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <choose>\n                <if match="none" type="song thesis">\n                  <names variable="contributor">\n                    <label form="verb" suffix=" " text-case="capitalize-first"/>\n                    <name and="text" initialize="false"/>\n                  </names>\n                </if>\n              </choose>\n            </if>\n          </choose>\n          <choose>\n            <if type="song">\n              <!-- Song contributors attached to album (CMOS18 14.163) -->\n              <names variable="contributor">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-contributors-serial-bib">\n    <group delimiter=". ">\n      <names delimiter=". " variable="translator narrator">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names delimiter=". " variable="compiler chair organizer curator">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names delimiter=". " variable="series-creator executive-producer">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="producer">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="director">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="script-writer">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="performer">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n    </group>\n  </macro>\n  <macro name="identifier-contributors-and-volume-bib">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="identifier-contributors-serial-bib"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="identifier-contributors-and-volume-monographic-bib-specific-title-first"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="identifier-contributors-serial-bib"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <text macro="identifier-contributors-and-volume-monographic-bib-specific-title-first"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-contributors-and-volume-monographic-bib-specific-title-first">\n    <group delimiter=". ">\n      <text macro="identifier-contributors-monographic-bib"/>\n      <group delimiter=", ">\n        <text macro="identifier-volume-bib-specific-title-first"/>\n        <choose>\n          <if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n            <!-- cite multivolume `collection-editor`; otherwise it belongs with `collection-title` -->\n            <names variable="collection-editor">\n              <label form="verb" suffix=" "/>\n              <name and="text" initialize="false"/>\n            </names>\n          </if>\n        </choose>\n      </group>\n      <choose>\n        <if match="none" variable="part-number part-title volume volume-title">\n          <text macro="label-number-of-volumes"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-edition-bib">\n    <choose>\n      <!-- ensure `source-publication-history-bib` does not duplicate edition -->\n      <if variable="original-title">\n        <text macro="label-edition-capitalized"/>\n      </if>\n      <else-if variable="issued original-date"/>\n      <else>\n        <text macro="label-edition-capitalized"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-edition-note">\n    <choose>\n      <!-- ensure `source-publication-history-note` does not duplicate edition -->\n      <if variable="original-title">\n        <text macro="label-edition"/>\n      </if>\n      <else-if variable="issued original-date"/>\n      <else>\n        <text macro="label-edition"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-number-bib">\n    <group delimiter=" ">\n      <choose>\n        <if type="thesis"/>\n        <else-if is-numeric="number" type="broadcast" variable="genre">\n          <text text-case="capitalize-first" variable="genre"/>\n          <text variable="number"/>\n        </else-if>\n        <else-if is-numeric="number" type="broadcast">\n          <text text-case="capitalize-first" value="episode"/>\n          <text variable="number"/>\n        </else-if>\n        <else-if variable="number">\n          <text text-case="title" variable="genre"/>\n          <text macro="label-number-capitalized"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-patent">\n    <group delimiter=", ">\n      <group delimiter=" ">\n        <!-- `authority`: US ; `genre`: patent ; `number`: 123,445 -->\n        <text form="short" variable="authority"/>\n        <!-- \'US Patent\' capitalized in both bibliography and note forms -->\n        <choose>\n          <if variable="genre">\n            <text text-case="capitalize-first" variable="genre"/>\n          </if>\n          <else>\n            <text term="patent" text-case="capitalize-first"/>\n          </else>\n        </choose>\n        <text variable="number"/>\n      </group>\n      <group delimiter=" ">\n        <text value="filed"/>\n        <date form="text" variable="submitted"/>\n      </group>\n      <group delimiter=" ">\n        <choose>\n          <if variable="issued submitted">\n            <text term="and"/>\n          </if>\n        </choose>\n        <text value="issued"/>\n        <!-- Always give full issue date, even in author-date (CMOS18 14.158) -->\n        <text macro="date-issued-full"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="identifier-report-bib">\n    <group delimiter=". ">\n      <choose>\n        <if variable="container-title">\n          <!-- If the report is a chapter in a larger report, then most identifying information is printed in the source. -->\n          <text macro="identifier-contributors-bib"/>\n        </if>\n        <else-if variable="title">\n          <text macro="identifier-number-bib"/>\n          <text macro="label-version-capitalized"/>\n          <text macro="identifier-edition-bib"/>\n          <text macro="identifier-contributors-and-volume-bib"/>\n        </else-if>\n        <else>\n          <!-- If there is no `title`, then `genre` and `number` are already printed as the title. -->\n          <text macro="label-version-capitalized"/>\n          <text macro="identifier-edition-bib"/>\n          <text macro="identifier-contributors-and-volume-bib"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-volume-bib-specific-title-first">\n    <!-- In author-date, bibliography must be listed under the individual volume title rather than the general title of the multivolume set; this is also allowable in notes styles (CMOS18 14.21) -->\n    <group delimiter=", ">\n      <choose>\n        <if variable="part-number part-title volume volume-title">\n          <!-- part and title with individual titles -->\n          <group delimiter=" ">\n            <text macro="label-part-number-capitalized"/>\n            <text value="of"/>\n            <text macro="title-volume"/>\n          </group>\n          <group delimiter=" ">\n            <text macro="label-volume"/>\n            <text value="of"/>\n            <text macro="title-primary"/>\n          </group>\n        </if>\n        <else-if match="any" variable="part-title volume-title">\n          <group delimiter=" ">\n            <choose>\n              <if variable="part-number volume">\n                <group delimiter=", ">\n                  <text macro="label-volume-capitalized"/>\n                  <text macro="label-part-number"/>\n                  <text value="of"/>\n                </group>\n              </if>\n              <else-if variable="part-number">\n                <text macro="label-part-number-capitalized"/>\n                <text value="of"/>\n              </else-if>\n              <else-if variable="volume">\n                <text macro="label-volume-capitalized"/>\n                <text value="of"/>\n              </else-if>\n            </choose>\n            <text macro="title-primary"/>\n          </group>\n        </else-if>\n        <else-if variable="part-number volume">\n          <text macro="label-volume-capitalized"/>\n          <text macro="label-part-number"/>\n        </else-if>\n        <else-if variable="part-number">\n          <text macro="label-part-number-capitalized"/>\n        </else-if>\n        <else-if variable="volume">\n          <text macro="label-volume-capitalized"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4. Source -->\n  <macro name="source-bib">\n    <choose>\n      <if match="any" type="patent post webpage"/>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="source-serial-bib"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <text macro="source-monographic-bib"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <text macro="source-serial-bib"/>\n      </else-if>\n      <else>\n        <text macro="source-monographic-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.1. Serial sources -->\n  <macro name="source-serial-bib">\n    <group delimiter=". ">\n      <text macro="source-serial-title-volume-bib"/>\n      <choose>\n        <if match="any" type="article-magazine article-newspaper">\n          <!-- magazines and newspapers provide the full date in place of volume/issue numbers (CMOS18 14.87, 14.89) -->\n          <group delimiter=", ">\n            <text macro="source-serial-title-bib"/>\n            <text macro="source-serial-identifier-bib"/>\n          </group>\n        </if>\n        <else-if variable="collection-title volume">\n          <group delimiter=", ">\n            <text macro="source-serial-title-bib"/>\n            <text macro="source-serial-identifier-bib"/>\n          </group>\n        </else-if>\n        <else-if variable="volume">\n          <group delimiter=" ">\n            <text macro="source-serial-title-bib"/>\n            <text macro="source-serial-identifier-bib"/>\n          </group>\n        </else-if>\n        <else>\n          <group delimiter=", ">\n            <text macro="source-serial-title-bib"/>\n            <text macro="source-serial-identifier-bib"/>\n          </group>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Serial source title -->\n  <macro name="source-serial-name">\n    <group delimiter=" ">\n      <text font-style="italic" text-case="title" variable="container-title"/>\n      <choose>\n        <!-- TODO: remove conditional when Zotero stops double-mapping `event-place` and `publisher-place` -->\n        <if match="none" variable="event-date event-title">\n          <text prefix="(" suffix=")" variable="publisher-place"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-title-bib">\n    <group delimiter=", ">\n      <choose>\n        <!-- Journal special issues (CMOS18 14.77) and supplements (CMOS18 14.78) -->\n        <if match="none" variable="container-title"/>\n        <else-if match="none" type="periodical" variable="supplement-number volume-title"/>\n        <!-- TODO: use `container-genre` here once available to allow a custom description of the journal volume -->\n        <else-if variable="supplement-number volume-title">\n          <text term="supplement" text-case="capitalize-first"/>\n        </else-if>\n        <else-if type="periodical" variable="supplement-number title">\n          <text term="supplement" text-case="capitalize-first"/>\n        </else-if>\n        <else-if variable="volume-title">\n          <text term="special-issue" text-case="capitalize-first"/>\n        </else-if>\n        <else-if type="periodical" variable="title">\n          <text term="special-issue" text-case="capitalize-first"/>\n        </else-if>\n      </choose>\n      <text macro="source-serial-name"/>\n      <choose>\n        <!-- \'ahead of print\' is placed akin to a series (CMOS18 14.75) -->\n        <if match="any" variable="collection-title issue number page supplement-number volume volume-title"/>\n        <else-if match="any" variable="available-date status"/>\n        <else-if type="article-journal" variable="DOI issued">\n          <text term="advance-online-publication"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-title-volume-bib">\n    <choose>\n      <if variable="volume-title">\n        <!-- Journal special issues (CMOS18 14.77) and supplements (CMOS18 14.78) -->\n        <group delimiter=", ">\n          <group delimiter=" ">\n            <text macro="source-monographic-preposition-bib"/>\n            <text macro="title-volume"/>\n          </group>\n          <text macro="source-monographic-identifier-contributors-bib"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <!-- Serial source identifier -->\n  <macro name="source-serial-identifier-bib">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="article-magazine article-newspaper">\n          <group delimiter=". ">\n            <text macro="source-serial-identifier-volume-author-date"/>\n            <!-- newspaper edition always capitalized (CMOS18 14.89) -->\n            <text macro="label-edition-capitalized"/>\n          </group>\n          <text macro="source-serial-locator"/>\n        </if>\n        <else-if match="any" variable="issue supplement-number volume">\n          <group delimiter=": ">\n            <text macro="source-serial-identifier-volume-author-date"/>\n            <text macro="source-serial-locator"/>\n          </group>\n        </else-if>\n        <else>\n          <text macro="source-serial-identifier-volume-author-date"/>\n          <text macro="source-serial-locator"/>\n        </else>\n        <!-- TODO: If CSL adds `date-part` detection, add two further conditions to address CMOS18 14.74: delimiting with ":" if there is a `volume` and no month or `issue` or `supplement number`; delimiting with ", " or there is an `issue` or `supplement number` and no month -->\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-identifier-volume-author-date">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="article-magazine article-newspaper">\n          <!-- magazines and newspapers provide the full date in place of volume/issue numbers (CMOS18 14.87, 14.89) -->\n          <text variable="collection-title"/>\n          <text macro="source-serial-volume-status-bib"/>\n        </if>\n        <else-if match="any" variable="issue supplement-number volume">\n          <choose>\n            <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator"/>\n            <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n              <!-- date appears first if the review `container-title` has been substituted for a missing author (CMOS18 14.87, 14.102) -->\n              <choose>\n                <!-- extra date details only appear with a lone volume or issue -->\n                <if variable="issue volume"/>\n                <else-if variable="supplement-number"/>\n                <else-if match="any" variable="issue volume">\n                  <text macro="source-date-specific-title-first"/>\n                </else-if>\n              </choose>\n            </else-if>\n          </choose>\n          <!-- `collection-title` is for any serial with multiple series (e.g. \'4th ser.\') -->\n          <text variable="collection-title"/>\n          <group delimiter=" ">\n            <choose>\n              <if variable="volume">\n                <choose>\n                  <if variable="collection-title">\n                    <text macro="label-volume"/>\n                  </if>\n                  <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n                    <!-- provide label if a review `container-title` has been substituted for a missing author (CMOS18 14.87, 14.102) -->\n                    <choose>\n                      <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n                        <text variable="volume"/>\n                      </if>\n                      <!-- TODO: when CSL provides date part detection, volume should be lowercase if there is a month, but otherwise capitalized -->\n                      <else>\n                        <text macro="label-volume-capitalized"/>\n                      </else>\n                    </choose>\n                  </else-if>\n                  <else>\n                    <text variable="volume"/>\n                  </else>\n                </choose>\n                <group delimiter=", " prefix="(" suffix=")">\n                  <choose>\n                    <if match="any" variable="issue supplement-number">\n                      <text variable="issue"/>\n                      <text macro="label-supplement-number"/>\n                    </if>\n                    <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n                      <!-- date for unsigned reviews only appears here if it did not earlier (CMOS18 14.102) -->\n                      <choose>\n                        <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n                          <text macro="source-date-specific-title-first"/>\n                        </if>\n                      </choose>\n                    </else-if>\n                    <else>\n                      <text macro="source-date-specific-title-first"/>\n                    </else>\n                  </choose>\n                </group>\n              </if>\n              <else-if match="any" variable="issue supplement-number">\n                <group delimiter=" ">\n                  <group delimiter=", ">\n                    <text macro="label-issue"/>\n                    <text macro="label-supplement-number"/>\n                  </group>\n                  <choose>\n                    <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n                      <text macro="source-date-specific-title-first" prefix="(" suffix=")"/>\n                    </if>\n                  </choose>\n                </group>\n              </else-if>\n            </choose>\n          </group>\n        </else-if>\n        <else>\n          <text variable="collection-title"/>\n          <choose>\n            <if match="any" type="interview post-weblog">\n              <!-- publisher possible with broadcast `interview` (CMOS18 14.110) or `post-weblog` (CMOS18 14.105) -->\n              <text variable="publisher"/>\n            </if>\n          </choose>\n          <text macro="source-serial-volume-status-bib"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-volume-status-bib">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="collection-title issue number page supplement-number volume volume-title"/>\n        <else-if variable="issued"/>\n        <else-if variable="available-date">\n          <group delimiter=" ">\n            <!-- article accepted for publication and available on publisher website (CMOS18 14.75) -->\n            <!-- TODO: use CSL term for `available-date` when available -->\n            <text value="accepted"/>\n            <date form="text" variable="available-date"/>\n          </group>\n        </else-if>\n      </choose>\n      <group delimiter=" ">\n        <text macro="source-date-status-bib"/>\n        <text macro="source-date-specific-title-first"/>\n      </group>\n    </group>\n  </macro>\n  <!-- Serial source locator -->\n  <macro name="source-serial-locator">\n    <choose>\n      <if match="any" variable="locator number">\n        <group delimiter=", ">\n          <text macro="label-locator"/>\n          <!-- an article ID appears alongside locators in notes (CMOS18 14.71) -->\n          <choose>\n            <!-- if there is an `archive` with no other reference, `number` appears in `source-archive-database-number` -->\n            <if match="any" variable="archive_collection archive_location archive-place">\n              <text variable="number"/>\n            </if>\n            <else-if variable="archive"/>\n            <else>\n              <text variable="number"/>\n            </else>\n          </choose>\n        </group>\n      </if>\n      <!-- do not give pages for magazines or newspapers (CMOS18 14.87, 14.89) -->\n      <else-if match="any" type="article-magazine article-newspaper"/>\n      <else>\n        <text variable="page"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.2. Monographic sources -->\n  <macro name="source-monographic-bib">\n    <group delimiter=". ">\n      <!-- Monographic sources repeat main reference elements -->\n      <choose>\n        <if variable="container-title">\n          <group delimiter=", ">\n            <group delimiter=" ">\n              <text macro="source-monographic-preposition-bib"/>\n              <text macro="source-monographic-title-specific-title-first"/>\n            </group>\n            <text macro="source-monographic-description"/>\n            <text macro="source-monographic-identifier-bib"/>\n            <text macro="source-monographic-locator"/>\n          </group>\n        </if>\n      </choose>\n      <text macro="source-monographic-identifier-contributors-bib-container-author"/>\n      <text macro="source-series-bib"/>\n      <choose>\n        <!-- show event information here only if not collapsed with `issued` (CMOS18 14.167) -->\n        <if match="any" variable="event-date original-date original-publisher original-publisher-place publisher status">\n          <text macro="source-event-bib"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <!-- Monographic source title -->\n  <macro name="source-monographic-preposition-bib">\n    <choose>\n      <if match="any" type="broadcast motion_picture"/>\n      <else-if type="chapter" variable="container-title genre">\n        <text value="to"/>\n      </else-if>\n      <else-if type="article-journal" variable="container-title genre volume-title">\n        <text value="to"/>\n      </else-if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="author composer">\n            <!-- Give preposition only for signed entries; otherwise, title is substituted -->\n            <text term="in" text-case="capitalize-first"/>\n          </if>\n        </choose>\n      </else-if>\n      <!-- if printing chapter page numbers (CMOS17/classic):\n      <else-if variable="chapter-number page title"><text term="in" text-case="capitalize-first"/></else-if>\n      -->\n      <else-if variable="chapter-number">\n        <group delimiter=" ">\n          <text macro="label-chapter-number-capitalized"/>\n          <choose>\n            <if type="song">\n              <text term="on"/>\n            </if>\n            <else>\n              <text term="in"/>\n            </else>\n          </choose>\n        </group>\n      </else-if>\n      <else>\n        <text term="in" text-case="capitalize-first"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-monographic-preposition-note">\n    <choose>\n      <if match="any" type="broadcast motion_picture"/>\n      <else-if type="chapter" variable="container-title genre">\n        <text value="to"/>\n      </else-if>\n      <else-if type="article-journal" variable="container-title genre volume-title">\n        <text value="to"/>\n      </else-if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="author composer">\n            <!-- Give preposition only for signed entries; otherwise, title is substituted -->\n            <text term="in"/>\n          </if>\n        </choose>\n      </else-if>\n      <!-- if printing chapter page numbers (CMOS17/classic):\n      <else-if variable="chapter-number page title"><text term="in"/></else-if>\n      -->\n      <else-if variable="chapter-number">\n        <group delimiter=" ">\n          <text macro="label-chapter-number"/>\n          <choose>\n            <if type="song">\n              <text term="on"/>\n            </if>\n            <else>\n              <text term="in"/>\n            </else>\n          </choose>\n        </group>\n      </else-if>\n      <else>\n        <text term="in"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-monographic-title-specific-title-first">\n    <choose>\n      <if variable="part-title">\n        <text macro="title-part"/>\n      </if>\n      <else-if variable="volume-title">\n        <text macro="title-volume"/>\n      </else-if>\n      <else>\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Monographic source description -->\n  <macro name="source-monographic-description">\n    <choose>\n      <if match="any" type="document report software standard">\n        <!-- place description after `container-title` -->\n        <text macro="description-format-note"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume"/>\n      <else-if match="any" type="event paper-conference performance speech">\n        <!-- unpublished conference presentations should describe the session -->\n        <text macro="description-format-note"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- Monographic source identifier -->\n  <macro name="source-monographic-identifier-bib">\n    <!-- Based on `identifier-bib` -->\n    <choose>\n      <if variable="container-title">\n        <group delimiter=", ">\n          <choose>\n            <if match="none" type="broadcast graphic map motion_picture song">\n              <!-- For audiovisual media, number information comes after `title`, not `container-title`; `song` places album catalogue `number` with `publisher` (CMOS18 14.163-164) -->\n              <text macro="identifier-number-bib"/>\n            </if>\n          </choose>\n          <text macro="label-version"/>\n          <!-- use note form as `edition` is not capitalized here -->\n          <text macro="identifier-edition-note"/>\n          <text macro="source-monographic-identifier-contributors-and-volume-bib-specific-title-first"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-monographic-identifier-contributors-bib">\n    <choose>\n      <if variable="container-author container-title">\n        <!-- set off `container-author` from other contributors in the bibliography (CMOS18 14.12; for page location, CMOS17 14.110) -->\n        <names variable="container-author">\n          <label form="verb" suffix=" "/>\n          <name and="text" initialize="false"/>\n        </names>\n        <!-- other contributors shift to `source-monographic-identifier-contributors-bib-container-author` -->\n      </if>\n      <else>\n        <group delimiter=", ">\n          <names variable="editor-translator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="editor translator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="guest">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="host">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="chair organizer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="illustrator narrator compiler curator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="series-creator executive-producer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="producer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editorial-director">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="any" type="broadcast performance">\n              <names variable="script-writer">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="director">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="performer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" type="song thesis">\n              <!-- Song contributors attached to album (CMOS18 14.163) -->\n              <names variable="contributor">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-monographic-identifier-contributors-bib-container-author">\n    <!-- set off `container-author` from other contributors in the bibliography (CMOS18 14.12; for page location, CMOS17 14.110) -->\n    <choose>\n      <if variable="container-author container-title">\n        <group delimiter=". ">\n          <names variable="editor-translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="editor translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="guest">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="host">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="chair organizer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="illustrator narrator compiler curator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="series-creator executive-producer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="producer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editorial-director">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="any" type="broadcast performance">\n              <names variable="script-writer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="director">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="performer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" type="song thesis">\n              <!-- Song contributors attached to album (CMOS18 14.163) -->\n              <names variable="contributor">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-monographic-identifier-contributors-and-volume-bib-specific-title-first">\n    <group delimiter=", ">\n      <text macro="source-monographic-identifier-contributors-bib"/>\n      <text macro="source-monographic-identifier-volume-bib-specific-title-first"/>\n      <choose>\n        <if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n          <!-- cite multivolume `collection-editor`; otherwise it belongs with `collection-title` -->\n          <names variable="collection-editor">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n      </choose>\n      <choose>\n        <if match="any" variable="part-number part-title volume volume-title"/>\n        <else-if variable="page"/>\n        <else>\n          <text macro="label-number-of-volumes"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-monographic-identifier-volume-bib-specific-title-first">\n    <!-- based on `identifier-volume-bib-specific-title-first` without capitalization; giving `container-title` rather than `title-primary`; and ensuring volume number -->\n    <group delimiter=", ">\n      <choose>\n        <if variable="part-number part-title volume volume-title">\n          <!-- part and title with individual titles -->\n          <group delimiter=" ">\n            <text macro="label-part-number"/>\n            <text value="of"/>\n            <text macro="title-volume"/>\n          </group>\n          <group delimiter=" ">\n            <text macro="label-volume"/>\n            <text value="of"/>\n            <text font-style="italic" text-case="title" variable="container-title"/>\n          </group>\n        </if>\n        <else-if match="any" variable="part-title volume-title">\n          <group delimiter=" ">\n            <choose>\n              <if variable="part-number volume">\n                <group delimiter=", ">\n                  <text macro="label-volume"/>\n                  <text macro="label-part-number"/>\n                  <text value="of"/>\n                </group>\n              </if>\n              <else-if variable="part-number">\n                <text macro="label-part-number"/>\n                <text value="of"/>\n              </else-if>\n              <else-if variable="volume">\n                <text macro="label-volume"/>\n                <text value="of"/>\n              </else-if>\n            </choose>\n            <text font-style="italic" text-case="title" variable="container-title"/>\n          </group>\n        </else-if>\n        <else-if variable="part-number">\n          <text macro="label-volume"/>\n          <text macro="label-part-number"/>\n        </else-if>\n        <else-if is-numeric="volume" match="none">\n          <text macro="label-volume"/>\n        </else-if>\n        <else-if variable="container-title">\n          <!-- remove condition in styles that print chapter page numbers (CMOS17/classic) -->\n          <text macro="label-volume"/>\n        </else-if>\n        <else-if is-numeric="volume" variable="page">\n          <choose>\n            <!-- check for variables that might come between the volume and page number -->\n            <if variable="collection-editor">\n              <text macro="label-volume"/>\n            </if>\n          </choose>\n        </else-if>\n        <else>\n          <text macro="label-volume"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Monographic source locator -->\n  <macro name="source-monographic-locator">\n    <choose>\n      <!-- archival locators appear after the shelfmark (CMOS18 14.127) -->\n      <if locator="column" variable="archive archive_location"/>\n      <else-if locator="folio" variable="archive archive_location"/>\n      <else-if locator="page" variable="archive archive_location"/>\n      <else-if is-numeric="volume" locator="page">\n        <!-- separate a volume and page number with a colon (CMOS18 14.18) -->\n        <group delimiter=":">\n          <choose>\n            <if match="any" variable="part-number part-title volume-title"/>\n            <else-if variable="collection-editor"/>\n            <else>\n              <text variable="volume"/>\n            </else>\n          </choose>\n          <text variable="locator"/>\n        </group>\n      </else-if>\n      <else-if variable="locator">\n        <text macro="label-locator"/>\n      </else-if>\n      <!-- remove `container-title` condition in styles that print chapter page numbers (CMOS17/classic) -->\n      <else-if variable="container-title"/>\n      <else-if is-numeric="volume" variable="page">\n        <!-- collapse the volume and page number if adjacent (CMOS18 14.18) -->\n        <group delimiter=":">\n          <choose>\n            <!-- check for variables that might come between the volume and page number -->\n            <if match="any" variable="part-number part-title volume-title"/>\n            <else-if variable="collection-editor"/>\n            <else>\n              <text variable="volume"/>\n            </else>\n          </choose>\n          <text variable="page"/>\n        </group>\n      </else-if>\n      <!-- archival locators appear after the shelfmark (CMOS18 14.127) -->\n      <else-if variable="archive archive_location page"/>\n      <else>\n        <text variable="page"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.3. Series -->\n  <macro name="source-series-bib">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n          <text macro="source-series-title"/>\n        </if>\n        <else-if variable="collection-editor collection-title">\n          <!-- `collection-editor` belongs with `collection-title` if the item is not multivolume -->\n          <text text-case="title" variable="collection-title"/>\n          <names variable="collection-editor">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <text macro="label-collection-number"/>\n          <text macro="label-issue"/>\n        </else-if>\n        <else>\n          <text macro="source-series-title"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-series-title">\n    <group delimiter=", ">\n      <choose>\n        <if variable="issue">\n          <text text-case="title" variable="collection-title"/>\n          <text macro="label-collection-number"/>\n          <text macro="label-issue"/>\n        </if>\n        <else-if is-numeric="collection-number" variable="collection-title">\n          <group delimiter=" ">\n            <text text-case="title" variable="collection-title"/>\n            <text variable="collection-number"/>\n          </group>\n        </else-if>\n        <else-if variable="collection-title">\n          <text text-case="title" variable="collection-title"/>\n          <text variable="collection-number"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4.4. Event -->\n  <macro name="source-event-bib">\n    <group delimiter=" ">\n      <choose>\n        <!-- omit types that provide event information in description  -->\n        <if match="any" type="interview" variable="interviewer"/>\n        <else-if type="personal_communication" variable="recipient"/>\n        <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title"/>\n        <else-if match="any" variable="event event-date event-title">\n          <!-- TODO: To prevent Zotero from printing `event-place`, due to its double-mapping of `publisher-place` and `event-place`. Remove this when that is changed. -->\n          <choose>\n            <if type="paper-conference">\n              <choose>\n                <if match="none" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n                  <!-- Don\'t print event info for conference papers published in proceedings -->\n                  <text macro="source-event-status-bib"/>\n                  <text macro="source-event-description-bib"/>\n                </if>\n              </choose>\n            </if>\n            <else>\n              <!-- For other item types, print event info even if published (e.g. collection catalogs, performance programs). -->\n              <text macro="source-event-status-bib"/>\n              <text macro="source-event-description-bib"/>\n            </else>\n          </choose>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-event-place-first">\n    <!-- for descriptive elements for interviews, reviews, letters -->\n    <choose>\n      <if match="any" variable="event event-date event-title">\n        <group delimiter=", ">\n          <text variable="event-title"/>\n          <text variable="event-place"/>\n          <text macro="date-event-full"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-event-status-bib">\n    <group delimiter=" ">\n      <choose>\n        <if type="broadcast" variable="status">\n          <!-- \'aired\', \'performed\', etc. (CMOS18 14.165) -->\n          <text text-case="capitalize-first" variable="status"/>\n        </if>\n        <else-if type="paper-conference">\n          <choose>\n            <if variable="genre">\n              <text text-case="capitalize-first" value="presented"/>\n            </if>\n            <else>\n              <text form="short" term="paper-conference" text-case="capitalize-first"/>\n              <text value="presented"/>\n            </else>\n          </choose>\n          <choose>\n            <if variable="event-title">\n              <text term="at"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if type="song">\n          <text text-case="capitalize-first" value="recorded"/>\n          <choose>\n            <if variable="event-title">\n              <text term="at"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if variable="event-date issued"/>\n        <else-if variable="issued"/>\n        <else>\n          <text text-case="capitalize-first" variable="status"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-event-title">\n    <choose>\n      <!-- TODO: We expect `event-title` to be used, but processors and applications may not be updated yet. This macro ensures that either `event` or `event-title` can be accepted. Remove if processor logic and application adoption can handle this. -->\n      <if variable="event-title">\n        <text variable="event-title"/>\n      </if>\n      <else>\n        <text variable="event"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-event-title-capitalized">\n    <choose>\n      <!-- TODO: We expect `event-title` to be used, but processors and applications may not be updated yet. This macro ensures that either `event` or `event-title` can be accepted. Remove if processor logic and application adoption can handle this. -->\n      <if variable="event-title">\n        <text text-case="capitalize-first" variable="event-title"/>\n      </if>\n      <else>\n        <text text-case="capitalize-first" variable="event"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-event-description-bib">\n    <group delimiter=", ">\n      <choose>\n        <if type="song">\n          <text macro="source-event-title"/>\n        </if>\n        <else-if type="paper-conference" variable="genre">\n          <text macro="source-event-title-capitalized"/>\n        </else-if>\n        <else-if type="paper-conference">\n          <text macro="source-event-title"/>\n        </else-if>\n        <else>\n          <text macro="source-event-title-capitalized"/>\n        </else>\n      </choose>\n      <text macro="date-event-full"/>\n      <text variable="event-place"/>\n    </group>\n  </macro>\n  <!-- 4.5. Facts of publication -->\n  <macro name="source-monographic-publication-bib">\n    <group delimiter=". ">\n      <choose>\n        <!-- `patent` date in identification (CMOS18 14.158) -->\n        <if type="patent"/>\n        <!-- omit serial types -->\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book"/>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text macro="source-publication-and-date-bib"/>\n        </else-if>\n        <!-- omit serial types -->\n        <else-if match="any" type="interview paper-conference"/>\n        <else>\n          <!-- monographic types -->\n          <text macro="source-publication-and-date-bib"/>\n        </else>\n      </choose>\n      <text macro="source-publication-original-title-bib"/>\n    </group>\n  </macro>\n  <macro name="source-publication-and-date-bib">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="post webpage">\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n          <!-- avoid possible repetition of `container-title` with author-date: -->\n          <choose>\n            <if variable="publisher">\n              <text text-case="title" variable="container-title"/>\n            </if>\n            <else-if type="webpage" variable="container-title container-title-short"/>\n            <else>\n              <text text-case="title" variable="container-title"/>\n            </else>\n          </choose>\n        </if>\n      </choose>\n      <choose>\n        <if type="broadcast" variable="DOI">\n          <!-- a podcast publisher appears before the date, whereas the network of an aired show appears after (CMOS18 14.165); unfortunately CSL stores both in `publisher` -->\n          <!-- TODO: `DOI` or `URL` detection is the only way to distinguish radio/TV from podcasts, but it is obviously imprecise; modify if CSL provides a `podcast` type -->\n          <text macro="source-publication-history-bib"/>\n        </if>\n        <else-if type="broadcast" variable="URL">\n          <text macro="source-publication-history-bib"/>\n        </else-if>\n        <else-if type="broadcast"/>\n        <else>\n          <text macro="source-publication-history-bib"/>\n        </else>\n      </choose>\n      <group delimiter=" ">\n        <text macro="source-date-status-bib"/>\n        <text macro="source-date-specific-title-first"/>\n      </group>\n      <choose>\n        <if type="broadcast" variable="URL"/>\n        <else-if type="broadcast">\n          <group delimiter=" ">\n            <text term="on"/>\n            <text macro="source-publication-history-bib"/>\n          </group>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- Facts of publication elements -->\n  <macro name="source-publication-description-bib">\n    <choose>\n      <if type="article" variable="genre"/>\n      <else-if type="article">\n        <!-- `preprint` term attached to repository name, but specific working paper descriptors appear in description (CMOS18 14.76, 14.116) -->\n        <text term="preprint" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="thesis">\n        <!-- thesis type appears with university name (CMOS18 14.113) -->\n        <text text-case="capitalize-first" variable="genre"/>\n      </else-if>\n      <else-if match="any" variable="original-publisher original-publisher-place">\n        <choose>\n          <!-- `edition` provides an alternative label to `reprint` (CMOS18 14.16) -->\n          <if match="any" variable="edition original-title"/>\n          <else-if match="none" type="book chapter classic entry entry-dictionary entry-encyclopedia interview musical_score pamphlet paper-conference report thesis"/>\n          <else-if variable="issued original-date">\n            <text text-case="capitalize-first" value="reprint"/>\n          </else-if>\n        </choose>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-publication-history-bib">\n    <choose>\n      <if variable="original-title">\n        <!-- `original-title` is covered in `source-publication-original-title-bib` -->\n        <group delimiter=", ">\n          <text macro="source-publication-description-bib"/>\n          <text macro="source-publication-publisher-bib"/>\n        </group>\n      </if>\n      <else-if match="any" variable="edition original-publisher original-publisher-place">\n        <group delimiter=". ">\n          <!-- full stop to separate original date if `original-publisher` (CMOS18 14.16) -->\n          <group delimiter=", ">\n            <text macro="source-publication-publisher-original-bib"/>\n            <text macro="source-date-original"/>\n          </group>\n          <group delimiter=". ">\n            <choose>\n              <if variable="issued original-date">\n                <text macro="label-edition-capitalized"/>\n              </if>\n            </choose>\n            <group delimiter=", ">\n              <text macro="source-publication-description-bib"/>\n              <text macro="source-publication-publisher-bib"/>\n            </group>\n          </group>\n        </group>\n      </else-if>\n      <else>\n        <group delimiter="; ">\n          <!-- semicolon to separate original date if no publisher (CMOS18 14.165) -->\n          <text macro="source-date-original"/>\n          <group delimiter=", ">\n            <text macro="source-publication-description-bib"/>\n            <text macro="source-publication-publisher-bib"/>\n          </group>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-publication-original-title-bib">\n    <!-- Work originally published under a different title (CMOS18 13.101) -->\n    <choose>\n      <if variable="original-title">\n        <group delimiter=" ">\n          <text term="original-work-published" text-case="capitalize-first"/>\n          <group delimiter=", ">\n            <names variable="original-author">\n              <name and="text" initialize="false"/>\n            </names>\n            <text font-style="italic" text-case="title" variable="original-title"/>\n          </group>\n          <group delimiter=", " prefix="(" suffix=")">\n            <text macro="source-publication-publisher-original-bib"/>\n            <text macro="source-date-original"/>\n          </group>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-publication-publisher-bib">\n    <group delimiter=" ">\n      <choose>\n        <if type="thesis" variable="publisher">\n          <text text-case="capitalize-first" variable="publisher"/>\n        </if>\n        <else-if variable="publisher">\n          <group delimiter=": ">\n            <!-- <text text-case="capitalize-first" variable="publisher-place"/> -->\n            <text text-case="capitalize-first" variable="publisher"/>\n          </group>\n        </else-if>\n        <!-- TODO: remove conditional when Zotero fixes double-mapping of `event-place` -->\n        <else-if match="any" variable="event-date event-title"/>\n        <else>\n          <text text-case="capitalize-first" variable="publisher-place"/>\n        </else>\n      </choose>\n      <choose>\n        <if type="song">\n          <!-- Album catalogue number follows label name (CMOS18 14.163-164) -->\n          <text variable="number"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-publication-publisher-original-bib">\n    <choose>\n      <if variable="original-publisher">\n        <group delimiter=": ">\n          <!-- <text text-case="capitalize-first" variable="original-publisher-place"/> -->\n          <text text-case="capitalize-first" variable="original-publisher"/>\n        </group>\n      </if>\n      <else>\n        <text text-case="capitalize-first" variable="original-publisher-place"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.6. Date -->\n  <macro name="source-date-specific-title-first">\n    <!-- date for the last-mentioned title, for author-date or notes and bibliography leading with volume title (CMOS18 14.21) -->\n    <choose>\n      <if variable="available-date volume-title">\n        <!-- TODO: Is there a better CSL variable for a date of a multivolume work (CMOS18 14.21)? -->\n        <date date-parts="year" form="numeric" variable="available-date"/>\n      </if>\n      <else-if variable="available-date part-title">\n        <date date-parts="year" form="numeric" variable="available-date"/>\n      </else-if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="source-date-issued-month-day"/>\n        <!-- for CMOS17 author-date: -->\n        <!-- <text macro="source-date-issued-full-serial"/> -->\n        <!-- for notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="source-date-issued-or-status"/> -->\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="source-date-issued-month-day"/>\n        <!-- for notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="source-date-issued-or-status"/> -->\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="source-date-issued-month-day"/>\n        <!-- for CMOS17 author-date: -->\n        <!-- <text macro="source-date-issued-full-serial"/> -->\n        <!-- for notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="source-date-issued-or-status"/> -->\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <text macro="source-date-issued-month-day"/>\n        <!-- for notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="source-date-issued-or-status"/> -->\n      </else>\n    </choose>\n  </macro>\n  <!-- Date elements -->\n  <macro name="source-date-issued-month-day">\n    <!-- Use with author-date -->\n    <!-- Give full date for more ephemeral types -->\n    <!-- NB: any changes must also be applied to `source-date-original-month-day` -->\n    <choose>\n      <if type="personal_communication" variable="event-date issued">\n        <!-- Provide issue date for letters listed under event-date -->\n        <text macro="date-issued-year"/>\n      </if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="DOI URL">\n            <!-- Online reference works use full dates (CMOS18 14.131) -->\n            <text macro="date-issued-month-day"/>\n          </if>\n        </choose>\n      </else-if>\n      <else-if match="any" type="article broadcast collection dataset document event graphic manuscript map patent performance personal_communication post software song speech standard webpage">\n        <text macro="date-issued-month-day"/>\n      </else-if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="source-date-issued-month-day-serial"/>\n      </else-if>\n      <!-- omit monographic types -->\n      <else-if match="any" variable="collection-editor compiler editor editorial-director"/>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="source-date-issued-month-day-serial"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-date-issued-month-day-serial">\n    <choose>\n      <if match="any" type="article-magazine article-newspaper">\n        <!-- magazines and newspapers provide the full date in place of volume/issue numbers (CMOS18 14.87, 14.89) -->\n        <text macro="date-issued-month-day"/>\n      </if>\n      <else-if match="any" variable="issue supplement-number volume">\n        <text macro="date-issued-month"/>\n      </else-if>\n      <else>\n        <text macro="date-issued-month-day"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-date-original">\n    <text macro="source-date-original-month-day"/>\n  </macro>\n  <macro name="source-date-original-month-day">\n    <!-- Give full date for more ephemeral types -->\n    <!-- Macro derived from `source-date-issued-month-day` -->\n    <choose>\n      <if type="personal_communication" variable="event-date original-date">\n        <!-- Provide original date for letters listed under event-date -->\n        <text macro="date-original-year"/>\n      </if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="DOI URL">\n            <!-- Online reference works use full dates (CMOS18 14.131) -->\n            <text macro="date-original-month-day"/>\n          </if>\n        </choose>\n      </else-if>\n      <else-if match="any" type="article broadcast collection dataset document event graphic manuscript map patent performance personal_communication post software song speech standard webpage">\n        <text macro="date-original-month-day"/>\n      </else-if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <choose>\n          <if match="any" variable="issue supplement-number volume">\n            <text macro="date-original-month"/>\n          </if>\n          <else>\n            <text macro="date-original-month-day"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <choose>\n          <if match="any" variable="collection-editor compiler editor editorial-director"/>\n          <else-if match="any" variable="issue supplement-number volume">\n            <text macro="date-original-month"/>\n          </else-if>\n          <else>\n            <text macro="date-original-month-day"/>\n          </else>\n        </choose>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-date-status-bib">\n    <choose>\n      <if type="broadcast" variable="event-title issued status"/>\n      <!-- on a `broadcast`, if there is an `event-title`, `status` appears with `event-date` as part of `source-event` (CMOS18 14.165) -->\n      <else-if variable="issued status">\n        <!-- `status` specifies date type, e.g. \'effective\', \'last modified\', \'approved\' (CMOS18 14.104 for `webpage`; CMOS18 14.159 for `standard`) -->\n        <choose>\n          <if type="webpage" variable="container-title">\n            <text variable="status"/>\n          </if>\n          <else-if type="webpage" variable="author publisher">\n            <text variable="status"/>\n          </else-if>\n          <else-if type="webpage" variable="translator publisher">\n            <text variable="status"/>\n          </else-if>\n          <else-if type="webpage">\n            <!-- capitalize `status` if there is nothing else after the `title` (either no website title or substituted publisher) -->\n            <text text-case="capitalize-first" variable="status"/>\n          </else-if>\n          <else-if match="any" variable="original-date original-publisher original-publisher-place original-title publisher">\n            <text variable="status"/>\n          </else-if>\n          <else>\n            <text text-case="capitalize-first" variable="status"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if type="broadcast" variable="issued URL"/>\n      <else-if type="broadcast" variable="issued">\n        <!-- `status` of a radio or TV broadcast is \'aired\' if unspecified (CMOS18 14.165) -->\n        <text text-case="capitalize-first" value="aired"/>\n      </else-if>\n      <else-if type="software" variable="issued publisher">\n        <!-- `status` of software is \'released\' if unspecified (CMOS18 14.169) -->\n        <choose>\n          <if match="any" variable="author chair collection-editor compiler composer contributor curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n            <!-- lowercase if `publisher` is adjacent -->\n            <text value="released"/>\n          </if>\n          <else>\n            <text text-case="capitalize-first" value="released"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if type="software" variable="original-date">\n        <!-- lowercase if `original-date` is adjacent -->\n        <text value="released"/>\n      </else-if>\n      <else-if type="software" variable="issued">\n        <!-- capitalize if `publisher` is not present -->\n        <text text-case="capitalize-first" value="released"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- 4.7. Locator (including page references) -->\n  <macro name="source-locator-author-date">\n    <choose>\n      <if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="author locator">\n            <text macro="label-locator"/>\n          </if>\n          <else-if variable="container-title title">\n            <!-- unsigned reference entry title appears in the locator (CMOS18 13.130) -->\n            <group delimiter=" ">\n              <choose>\n                <if match="none" variable="DOI URL">\n                  <!-- Only print reference entries use `sub-verbo` (CMOS18 14.131) -->\n                  <text form="short" term="sub-verbo"/>\n                </if>\n              </choose>\n              <text form="short" quotes="true" variable="title"/>\n            </group>\n          </else-if>\n        </choose>\n      </if>\n      <else>\n        <text macro="label-locator"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.8. Medium -->\n  <macro name="source-medium-bib">\n    <group delimiter=", ">\n      <text text-case="capitalize-first" variable="medium"/>\n      <text variable="scale"/>\n      <text variable="dimensions"/>\n    </group>\n  </macro>\n  <macro name="source-medium-note">\n    <group delimiter=", ">\n      <text variable="medium"/>\n      <text variable="scale"/>\n      <text variable="dimensions"/>\n    </group>\n  </macro>\n  <!-- 4.9. Archival location -->\n  <macro name="source-archive-bib">\n    <group delimiter=" ">\n      <choose>\n        <if type="graphic">\n          <text macro="source-archive-reference-institution-first"/>\n        </if>\n        <else>\n          <text macro="source-archive-reference-location-first-bib"/>\n        </else>\n      </choose>\n      <text macro="source-archive-database-number" prefix="(" suffix=")"/>\n    </group>\n  </macro>\n  <macro name="source-archive-note">\n    <group delimiter=" ">\n      <choose>\n        <if type="graphic">\n          <text macro="source-archive-reference-institution-first"/>\n        </if>\n        <else>\n          <text macro="source-archive-reference-location-first-note"/>\n        </else>\n      </choose>\n      <text macro="source-archive-database-number" prefix="(" suffix=")"/>\n    </group>\n  </macro>\n  <!-- Archival elements -->\n  <macro name="source-archive-database-number">\n    <!-- database identifier, if not included elsewhere (CMOS18 14.113) -->\n    <choose>\n      <if match="any" variable="archive_collection archive_location archive-place"/>\n      <!-- `number` never shown elsewhere with a thesis -->\n      <else-if type="thesis">\n        <text variable="number"/>\n      </else-if>\n      <!-- `number` shown with `genre` -->\n      <else-if match="any" type="dataset entry song" variable="genre"/>\n      <else-if variable="archive">\n        <text variable="number"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-archive-locator">\n    <choose>\n      <!-- physical locators with archival references appear after the shelfmark (CMOS18 14.127) -->\n      <if locator="column" variable="archive archive_location">\n        <!-- archival locators must always be labelled to avoid confusion with `archive_location` (CMOS18 14.123) -->\n        <text macro="label-locator-all"/>\n      </if>\n      <else-if locator="folio" variable="archive archive_location">\n        <text macro="label-locator-all"/>\n      </else-if>\n      <else-if locator="page" variable="archive archive_location">\n        <text macro="label-locator-all"/>\n      </else-if>\n      <else-if variable="archive archive_location page">\n        <choose>\n          <if is-numeric="page">\n            <!-- TODO: remove this conditional when `page` parsing is fixed for different locator types -->\n            <text macro="label-page"/>\n          </if>\n          <else>\n            <text variable="page"/>\n          </else>\n        </choose>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-archive-reference-institution-first">\n    <!-- Archive (gallery) name first for art (CMOS18 14.133) -->\n    <group delimiter=", ">\n      <text variable="archive"/>\n      <text variable="archive-place"/>\n      <text variable="archive_collection"/>\n      <text variable="archive_location"/>\n      <text macro="source-archive-locator"/>\n    </group>\n  </macro>\n  <macro name="source-archive-reference-location-first-bib">\n    <!-- Order of elements begins with the most specific (CMOS18 14.128) -->\n    <group delimiter=". ">\n      <group delimiter=", ">\n        <text text-case="capitalize-first" variable="archive_location"/>\n        <text macro="source-archive-locator"/>\n      </group>\n      <text variable="archive_collection"/>\n      <group delimiter=", ">\n        <text variable="archive"/>\n        <text variable="archive-place"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="source-archive-reference-location-first-note">\n    <!-- Order of elements begins with the most specific (CMOS18 14.127) -->\n    <group delimiter=", ">\n      <text variable="archive_location"/>\n      <text macro="source-archive-locator"/>\n      <text variable="archive_collection"/>\n      <text variable="archive"/>\n      <text variable="archive-place"/>\n    </group>\n  </macro>\n  <!-- 4.10. URL or persistent identifier -->\n  <macro name="source-date-accessed-DOI-URL-bib">\n    <group delimiter=". ">\n      <choose>\n        <if variable="DOI"/>\n        <else-if match="any" variable="available-date event-date issued status"/>\n        <else-if variable="accessed URL">\n          <group delimiter=" ">\n            <text term="accessed" text-case="capitalize-first"/>\n            <date form="text" variable="accessed"/>\n          </group>\n        </else-if>\n      </choose>\n      <text macro="source-DOI-URL"/>\n    </group>\n  </macro>\n  <macro name="source-DOI-URL">\n    <choose>\n      <if variable="DOI">\n        <text prefix="https://doi.org/" variable="DOI"/>\n      </if>\n      <else-if variable="URL">\n        <text variable="URL"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- 5. Notes -->\n  <!-- TODO: add variables for distributor and exhibitions if available in CSL -->\n  <!-- 6. Legal references: Bluebook style (shared with APA) -->\n  <!-- Where APA or Chicago diverge from Bluebook, the official manual is followed -->\n  <macro name="legal-reference">\n    <!-- Type usage:\n\n         `bill`\n         : bills, resolutions, federal reports\n\n         `legal_case`\n         : all legal and court cases\n\n         `hearing`\n         : hearings and testimony\n\n         `legislation`\n         : statutes, constitutional items, and charters\n\n         `regulation`\n         : codified regulations, uncodified regulations, executive orders\n\n         `treaty`\n         : treaties\n    -->\n    <group delimiter=", ">\n      <choose>\n        <if type="treaty">\n          <text macro="legal-title"/>\n          <names variable="author">\n            <!-- Treaty parties should be included at least for bilateral treaties (Bluebook 21.4.2) -->\n            <name delimiter="-" et-al-min="100" et-al-use-first="99" form="short" initialize="false"/>\n          </names>\n          <text macro="legal-date"/>\n          <!-- treaty source/report in addition to URL (Bluebook 21.4.5) -->\n          <text macro="legal-source"/>\n        </if>\n        <else>\n          <group delimiter=" ">\n            <group delimiter=", ">\n              <text macro="legal-title"/>\n              <text macro="legal-source"/>\n            </group>\n            <text macro="legal-date"/>\n            <text macro="legal-identifier"/>\n          </group>\n        </else>\n      </choose>\n      <group delimiter=" ">\n        <!-- locator for use in notes -->\n        <choose>\n          <if locator="page" variable="page">\n            <text term="at"/>\n          </if>\n        </choose>\n        <text macro="label-locator"/>\n      </group>\n    </group>\n  </macro>\n  <!-- 6.1. Legal date -->\n  <macro name="legal-date">\n    <choose>\n      <if type="treaty">\n        <text macro="date-issued-full"/>\n      </if>\n      <else-if type="legal_case">\n        <text macro="legal-date-case"/>\n      </else-if>\n      <else-if match="any" type="bill hearing legislation regulation">\n        <group delimiter=" " prefix="(" suffix=")">\n          <group delimiter=" ">\n            <text macro="date-original-year"/>\n            <text form="symbol" term="and"/>\n          </group>\n          <choose>\n            <if variable="issued">\n              <text macro="date-issued-year"/>\n            </if>\n            <else>\n              <!-- Show proposal date for uncodified regulations. Assume date is entered literally ala "proposed May 23, 2016". -->\n              <!-- TODO: Add `proposed` date here if that becomes available -->\n              <date form="text" variable="submitted"/>\n            </else>\n          </choose>\n        </group>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="legal-date-case">\n    <group delimiter=" " prefix="(" suffix=")">\n      <text variable="authority"/>\n      <choose>\n        <if variable="container-title">\n          <!-- Print only year for cases published in reporters-->\n          <text macro="date-issued-year"/>\n        </if>\n        <else>\n          <text macro="date-issued-full"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 6.2.1. Legal title -->\n  <macro name="legal-title">\n    <choose>\n      <if match="any" type="bill legal_case legislation regulation treaty">\n        <text text-case="title" variable="title"/>\n      </if>\n      <else-if type="hearing">\n        <!-- use standard format (Bluebook 13.3) -->\n        <group delimiter=": " font-style="italic">\n          <text text-case="capitalize-first" variable="title"/>\n          <group delimiter=" ">\n            <text term="hearing" text-case="capitalize-first"/>\n            <group delimiter=" ">\n              <text term="on"/>\n              <text variable="number"/>\n            </group>\n            <group delimiter=" ">\n              <text value="before the"/>\n              <text variable="section"/>\n            </group>\n          </group>\n        </group>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- 6.2.2. Legal identifier -->\n  <macro name="legal-identifier">\n    <group delimiter=" " prefix="(" suffix=")">\n      <choose>\n        <if type="hearing">\n          <!-- Use the \'verb\' form of the hearing term to hold \'testimony of\' -->\n          <text form="verb" term="hearing"/>\n          <names variable="author">\n            <name and="symbol" initialize="false"/>\n          </names>\n        </if>\n        <else-if match="any" type="bill legislation regulation">\n          <!-- For uncodified regulations, assume future code section is in `status`. -->\n          <text variable="status"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="legal-identifier-bill-report">\n    <group delimiter=" ">\n      <text variable="genre"/>\n      <choose>\n        <if match="any" variable="authority chapter-number container-title">\n          <text variable="number"/>\n        </if>\n        <else>\n          <!-- If there is no legislative body, session number, or code/record title, assume the item is a congressional report and include \'No.\' label. -->\n          <text macro="label-number-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 6.3. Legal source -->\n  <macro name="legal-source">\n    <!-- Expect legal item `container-title` to be stored in short form -->\n    <choose>\n      <if type="bill">\n        <text macro="legal-source-bill"/>\n      </if>\n      <else-if type="hearing">\n        <text macro="legal-source-hearing"/>\n      </else-if>\n      <else-if type="legal_case">\n        <text macro="legal-source-case"/>\n      </else-if>\n      <else-if type="legislation">\n        <text macro="legal-source-legislation"/>\n      </else-if>\n      <else-if type="regulation">\n        <text macro="legal-source-regulation"/>\n      </else-if>\n      <else-if type="treaty">\n        <text macro="legal-source-treaty"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- Legal source types -->\n  <macro name="legal-source-bill">\n    <group delimiter=", ">\n      <text macro="legal-identifier-bill-report"/>\n      <group delimiter=" ">\n        <text variable="authority"/>\n        <!-- `chapter-number` is a session number -->\n        <text variable="chapter-number"/>\n      </group>\n      <group delimiter=" ">\n        <text variable="volume"/>\n        <text variable="container-title"/>\n        <text variable="page-first"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="legal-source-case">\n    <group delimiter=" ">\n      <choose>\n        <if variable="container-title">\n          <text variable="volume"/>\n          <text variable="container-title"/>\n          <text macro="label-section-symbol"/>\n          <choose>\n            <if match="any" variable="page page-first">\n              <text variable="page-first"/>\n            </if>\n            <else>\n              <text value="___"/>\n            </else>\n          </choose>\n        </if>\n        <else>\n          <text macro="label-number-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="legal-source-hearing">\n    <group delimiter=" ">\n      <text variable="authority"/>\n      <!-- `chapter-number` is a session number -->\n      <text variable="chapter-number"/>\n    </group>\n  </macro>\n  <macro name="legal-source-legislation">\n    <choose>\n      <if variable="number">\n        <!-- `number` is a public law number -->\n        <group delimiter=", ">\n          <group delimiter=" ">\n            <choose>\n              <if variable="genre">\n                <text text-case="capitalize-first" variable="genre"/>\n              </if>\n              <else>\n                <text form="short" term="legislation" text-case="capitalize-first"/>\n              </else>\n            </choose>\n            <text macro="label-number-capitalized"/>\n          </group>\n          <group delimiter=" ">\n            <text variable="volume"/>\n            <text variable="container-title"/>\n            <text variable="page-first"/>\n          </group>\n        </group>\n      </if>\n      <else>\n        <group delimiter=" ">\n          <text variable="volume"/>\n          <text variable="container-title"/>\n          <choose>\n            <if variable="section">\n              <text macro="label-section-symbol"/>\n            </if>\n            <else>\n              <text variable="page-first"/>\n            </else>\n          </choose>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="legal-source-regulation">\n    <group delimiter=", ">\n      <group delimiter=" ">\n        <text variable="genre"/>\n        <text macro="label-number-capitalized"/>\n      </group>\n      <group delimiter=" ">\n        <text variable="volume"/>\n        <text variable="container-title"/>\n        <choose>\n          <if variable="section">\n            <text macro="label-section-symbol"/>\n          </if>\n          <else>\n            <text variable="page-first"/>\n          </else>\n        </choose>\n      </group>\n    </group>\n  </macro>\n  <macro name="legal-source-treaty">\n    <group delimiter=" ">\n      <number variable="volume"/>\n      <text variable="container-title"/>\n      <choose>\n        <if match="any" variable="page page-first">\n          <text variable="page-first"/>\n        </if>\n        <else>\n          <text macro="label-number-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Citation -->\n  <macro name="citation-author-date-item">\n    <group delimiter=", ">\n      <choose>\n        <if type="classic">\n          <text macro="author-inline"/>\n          <choose>\n            <if variable="author">\n              <text macro="title-and-descriptions-short"/>\n            </if>\n          </choose>\n        </if>\n        <else-if match="any" type="interview personal_communication">\n          <choose>\n            <if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n              <!-- accessible `interview` or `personal_communication` uses standard format -->\n              <choose>\n                <if match="any" variable="event-date issued">\n                  <group delimiter=" ">\n                    <text macro="author-inline"/>\n                    <text macro="date-short"/>\n                  </group>\n                </if>\n                <else>\n                  <text macro="author-inline"/>\n                  <text macro="date-short"/>\n                </else>\n              </choose>\n            </if>\n            <else>\n              <!-- inaccessible `interview` or `personal_communication` uses in-text format (CMOS18 14.111) -->\n              <text macro="author-inline"/>\n              <text macro="title-and-descriptions-short"/>\n              <choose>\n                <if position="first">\n                  <choose>\n                    <if type="interview">\n                      <text macro="date-short"/>\n                    </if>\n                  </choose>\n                  <text macro="source-medium-note"/>\n                </if>\n              </choose>\n            </else>\n          </choose>\n        </else-if>\n        <else-if match="any" variable="event-date issued">\n          <group delimiter=" ">\n            <text macro="author-inline"/>\n            <text macro="date-short"/>\n          </group>\n        </else-if>\n        <else>\n          <!--- comma with forthcoming or n.d. -->\n          <text macro="author-inline"/>\n          <text macro="date-short"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <citation collapse="year" disambiguate-add-givenname="true" disambiguate-add-names="true" disambiguate-add-year-suffix="true" et-al-min="3" et-al-use-first="1" givenname-disambiguation-rule="primary-name">\n    <layout delimiter="; " prefix="(" suffix=")">\n      <group delimiter=", ">\n        <choose>\n          <if match="none" type="classic">\n            <text macro="citation-author-date-item"/>\n            <text macro="source-locator-author-date"/>\n          </if>\n          <!-- with `classic`, a non-numeric canonical reference or identifying number is separated by a space rather than a comma (CMOS18 14.145) -->\n          <else-if is-numeric="locator">\n            <text macro="citation-author-date-item"/>\n            <text macro="source-locator-author-date"/>\n          </else-if>\n          <else-if locator="chapter line verse" match="any">\n            <group delimiter=" ">\n              <text macro="citation-author-date-item"/>\n              <text macro="source-locator-author-date"/>\n            </group>\n          </else-if>\n          <else>\n            <text macro="citation-author-date-item"/>\n            <text macro="source-locator-author-date"/>\n          </else>\n        </choose>\n      </group>\n    </layout>\n  </citation>\n  <!-- Bibliography -->\n  <macro name="bibliography-author-date">\n    <group delimiter=". ">\n      <choose>\n        <if match="any" type="bill hearing legal_case legislation regulation treaty">\n          <!-- Legal items have different orders and delimiters -->\n          <text macro="legal-reference"/>\n          <text macro="source-date-accessed-DOI-URL-bib"/>\n          <text variable="references"/>\n        </if>\n        <else>\n          <group delimiter=" ">\n            <text macro="author-bib"/>\n            <choose>\n              <!-- give key to abbreviations (CMOS18 13.127, 14.104) -->\n              <!-- TODO: add `authority` and `publisher` if it becomes possible to test for short forms -->\n              <if type="webpage" variable="publisher"/>\n              <else-if type="webpage" variable="container-title container-title-short">\n                <text prefix="(" suffix=")" text-case="title" variable="container-title"/>\n              </else-if>\n            </choose>\n          </group>\n          <text macro="date"/>\n          <text macro="title-and-source-bib"/>\n          <text variable="references"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <bibliography et-al-min="7" et-al-use-first="3" hanging-indent="true">\n    <sort>\n      <key macro="author-sort"/>\n      <key macro="date-sort-group"/>\n      <key macro="date-sort-year"/>\n      <key macro="date"/>\n      <key macro="title-and-descriptions-bib"/>\n      <key macro="source-bib"/>\n      <key variable="volume"/>\n      <key variable="part-number"/>\n      <key variable="event-date"/>\n      <key variable="issued"/>\n      <key macro="source-archive-bib"/>\n    </sort>\n    <layout suffix=".">\n      <choose>\n        <if type="classic">\n          <choose>\n            <if match="any" variable="archive editor translator publisher">\n              <text macro="bibliography-author-date"/>\n            </if>\n          </choose>\n        </if>\n        <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n          <choose>\n            <if variable="author">\n              <!-- Signed reference entries appear in the bibliography (CMOS18 14.132) -->\n              <text macro="bibliography-author-date"/>\n            </if>\n            <else-if match="any" variable="DOI URL">\n              <!-- Provide a bibliography if necessary identifying information is not in text -->\n              <text macro="bibliography-author-date"/>\n            </else-if>\n          </choose>\n        </else-if>\n        <!-- Personal communications only appear in the bibliography if the reader can retrieve them (CMOS18 14.13, 14.111) -->\n        <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n          <text macro="bibliography-author-date"/>\n        </else-if>\n        <else-if match="any" type="interview personal_communication"/>\n        <else>\n          <text macro="bibliography-author-date"/>\n        </else>\n      </choose>\n    </layout>\n  </bibliography>\n</style>\n';

// renderer/styles/chicago-notes.csl
var chicago_notes_default = '<?xml version="1.0" encoding="utf-8"?>\n<style xmlns="http://purl.org/net/xbiblio/csl" class="note" initialize-with=". " page-range-format="chicago-16" version="1.0">\n  <!-- This file was generated by the Style Variant Builder <https://github.com/citation-style-language/style-variant-builder>. To contribute changes, modify the template and regenerate variants. -->\n  <info>\n    <title>Chicago Manual of Style 18th edition (notes and bibliography)</title>\n    <title-short>CMOS/CMS with Bluebook (full notes and bibliography/NB [13.18])</title-short>\n    <id>http://www.zotero.org/styles/chicago-notes-bibliography</id>\n    <link href="http://www.zotero.org/styles/chicago-notes-bibliography" rel="self"/>\n    <link href="https://www.chicagomanualofstyle.org/" rel="documentation"/>\n    <link href="https://zotero.org/groups/2205533/collections/5V67EPX3" rel="documentation"/>\n    <author>\n      <name>Andrew Dunning</name>\n      <uri>https://orcid.org/0000-0003-0464-5036</uri>\n    </author>\n    <category citation-format="note"/>\n    <category field="anthropology"/>\n    <category field="communications"/>\n    <category field="generic-base"/>\n    <category field="geography"/>\n    <category field="history"/>\n    <category field="humanities"/>\n    <category field="law"/>\n    <category field="linguistics"/>\n    <category field="literature"/>\n    <category field="philosophy"/>\n    <category field="political_science"/>\n    <category field="science"/>\n    <category field="social_science"/>\n    <category field="sociology"/>\n    <category field="theology"/>\n    <summary>Chicago-style source citations (with Bluebook for legal citations), notes and bibliography system</summary>\n    <updated>2025-02-09T00:00:00+00:00</updated>\n    <rights license="http://creativecommons.org/licenses/by-sa/3.0/">This work is licensed under a Creative Commons Attribution-ShareAlike 3.0 License</rights>\n  </info>\n  <locale xml:lang="en">\n    <terms>\n      <!-- Chicago omits \'by\' from `verb-short` forms; it abbreviates only the most common roles -->\n      <term name="advance-online-publication">ahead of print</term>\n      <term name="anonymous">unsigned</term>\n      <term form="verb-short" name="collection-editor">ed.</term>\n      <term form="short" name="collection-number">\n        <single>vol.</single>\n        <multiple>vols.</multiple>\n      </term>\n      <term form="verb-short" name="compiler">comp.</term>\n      <term form="verb-short" name="editor">ed.</term>\n      <term form="short" name="editor-translator">\n        <single>ed. and trans.</single>\n        <multiple>eds. and trans.</multiple>\n      </term>\n      <term form="short" name="editortranslator">\n        <single>ed. and trans.</single>\n        <multiple>eds. and trans.</multiple>\n      </term>\n      <term form="verb" name="editor-translator">edited and translated by</term>\n      <term form="verb" name="editortranslator">edited and translated by</term>\n      <term form="verb-short" name="editor-translator">ed. and trans.</term>\n      <term form="verb-short" name="editortranslator">ed. and trans.</term>\n      <term form="verb-short" name="illustrator">ill.</term>\n      <term form="short" name="legislation">Pub. L.</term>\n      <term name="manuscript">unpublished manuscript</term>\n      <term name="original-work-published">originally published as</term>\n      <term form="short" name="paper-conference">paper</term>\n      <!-- \'under\' replaces \'s.v.\' from CMOS17 and earlier (CMOS18 14.130) -->\n      <term name="sub-verbo">under</term>\n      <term form="short" name="sub-verbo">under</term>\n      <term name="timestamp">at</term>\n      <term form="verb-short" name="translator">trans.</term>\n    </terms>\n  </locale>\n  <locale xml:lang="en-GB">\n    <terms>\n      <!-- the Bibliography of Additional Resources recommends the New Oxford Style Manual as a British English guide, which the `en-GB` locale follows -->\n      <term form="short" name="collection-number">\n        <single>vol.</single>\n        <multiple>vols</multiple>\n      </term>\n      <term form="short" name="editor-translator">\n        <single>ed. and trans.</single>\n        <multiple>eds and trans.</multiple>\n      </term>\n      <term form="short" name="editortranslator">\n        <single>ed. and trans.</single>\n        <multiple>eds and trans.</multiple>\n      </term>\n      <term form="verb-short" name="illustrator">illus.</term>\n    </terms>\n  </locale>\n  <!-- Contents:\n\n       This file interprets Chicago using APA\'s four basic reference elements\n       (cf. CMOS18 14.2, 14.64, 14.161):\n\n        1. Author (CMOS18 13.74-86)\n        2. Date (author-date system only, CMOS18 13.102)\n        3. Title and descriptions (CMOS18 13.87-101)\n            3.1. Title\n            3.2. Description\n            3.3. Identifiers (edition, contributors, volume)\n        4. Source\n            4.1. Serial sources\n            4.2. Monographic sources\n            4.3. Series\n            4.4. Event\n            4.5. Publisher\n            4.6. Date\n            4.7. Locator (including page references)\n            4.8. Medium\n            4.9. Archival location\n            4.10. URL or persistent identifier\n\n       Freeform annotations to bibliography entries:\n\n        5. Notes\n\n       Chicago also provides parallel rules for legal references following\n       The Bluebook: A Uniform System of Citation (code shared with APA):\n\n        6. Legal references\n  -->\n  <!-- In this file, macros suffixed `-bib` and `-note` are parallel versions\n       of the same features for the bibliography and notes, and all changes\n       must be applied to both. They should only contain differences of\n       punctuation (periods in bibliography, commas in notes) and capitalization,\n       except where the comments indicate structural changes. -->\n  <!-- Categories of CSL item types:\n\n       Serial\n       : article-journal article-magazine article-newspaper periodical post-weblog review review-book\n\n       Serial or Monographic\n       : interview paper-conference\n\n         Monographic with any of `collection-editor compiler editor editorial-director`.\n         A serial `paper-conference` is unpublished if it lacks any of `issue page supplement-number volume`.\n\n       Monographic\n       : article book broadcast chapter classic collection dataset document\n         entry entry-dictionary entry-encyclopedia event figure\n         graphic manuscript map motion_picture musical_score\n         pamphlet patent performance personal_communication post report\n         software song speech standard thesis webpage\n\n       Legal\n       : bill hearing legal_case legislation regulation treaty\n  -->\n  <!-- Variable labels -->\n  <macro name="label-chapter-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="chapter-number" type="song">\n          <text value="track"/>\n        </if>\n        <else-if is-numeric="chapter-number">\n          <label form="short" variable="chapter-number"/>\n        </else-if>\n      </choose>\n      <text variable="chapter-number"/>\n    </group>\n  </macro>\n  <macro name="label-chapter-number-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="chapter-number" type="song">\n          <text text-case="capitalize-first" value="track"/>\n        </if>\n        <else-if is-numeric="chapter-number">\n          <label form="short" text-case="capitalize-first" variable="chapter-number"/>\n        </else-if>\n      </choose>\n      <text text-case="capitalize-first" variable="chapter-number"/>\n    </group>\n  </macro>\n  <macro name="label-collection-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="collection-number">\n          <label form="short" variable="collection-number"/>\n        </if>\n      </choose>\n      <text variable="collection-number"/>\n    </group>\n  </macro>\n  <macro name="label-edition">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="edition">\n          <number form="ordinal" variable="edition"/>\n          <label form="short" variable="edition"/>\n        </if>\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n          <!-- serial types: full label (CMOS18 14.89) -->\n          <text variable="edition"/>\n          <label variable="edition"/>\n        </else-if>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text variable="edition"/>\n        </else-if>\n        <else-if match="any" type="interview paper-conference">\n          <!-- serial types -->\n          <text variable="edition"/>\n          <label variable="edition"/>\n        </else-if>\n        <else>\n          <!-- monographic types -->\n          <text variable="edition"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-edition-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="edition">\n          <number form="ordinal" variable="edition"/>\n          <label form="short" variable="edition"/>\n        </if>\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n          <!-- serial types: full label (CMOS18 14.89) -->\n          <text text-case="title" variable="edition"/>\n          <label text-case="capitalize-first" variable="edition"/>\n        </else-if>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text text-case="capitalize-first" variable="edition"/>\n        </else-if>\n        <else-if match="any" type="interview paper-conference">\n          <!-- serial types -->\n          <text text-case="title" variable="edition"/>\n          <label text-case="capitalize-first" variable="edition"/>\n        </else-if>\n        <else>\n          <!-- monographic types -->\n          <text text-case="capitalize-first" variable="edition"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-issue">\n    <group delimiter=" ">\n      <label form="short" variable="issue"/>\n      <text variable="issue"/>\n    </group>\n  </macro>\n  <macro name="label-locator">\n    <group delimiter=" ">\n      <choose>\n        <if locator="page"/>\n        <else-if match="any" type="bill hearing legal_case legislation regulation treaty">\n          <!-- Bluebook-style labels for legal types (CMOS18 14.174) -->\n          <choose>\n            <if locator="chapter paragraph section" match="any">\n              <label form="symbol" variable="locator"/>\n            </if>\n            <else>\n              <label form="short" variable="locator"/>\n            </else>\n          </choose>\n        </else-if>\n        <else-if is-numeric="locator" locator="line">\n          <label variable="locator"/>\n        </else-if>\n        <else-if is-numeric="locator">\n          <label form="short" variable="locator"/>\n        </else-if>\n        <else-if locator="chapter line verse" match="any"/>\n        <!-- a non-numeric canonical reference is identified by its formatting and does not need a label (CMOS18 14.143-54) -->\n        <else>\n          <label form="short" variable="locator"/>\n        </else>\n      </choose>\n      <text variable="locator"/>\n    </group>\n  </macro>\n  <macro name="label-locator-all">\n    <group delimiter=" ">\n      <label form="short" variable="locator"/>\n      <text variable="locator"/>\n    </group>\n  </macro>\n  <macro name="label-number">\n    <group delimiter=" ">\n      <choose>\n        <if type="standard"/>\n        <else-if is-numeric="number" match="any" type="legislation regulation">\n          <label form="short" variable="number"/>\n        </else-if>\n      </choose>\n      <text variable="number"/>\n    </group>\n  </macro>\n  <macro name="label-number-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if type="standard"/>\n        <else-if is-numeric="number" match="any" type="legislation regulation">\n          <label form="short" text-case="capitalize-first" variable="number"/>\n        </else-if>\n      </choose>\n      <text text-case="capitalize-first" variable="number"/>\n    </group>\n  </macro>\n  <macro name="label-number-of-volumes">\n    <group delimiter=" ">\n      <text variable="number-of-volumes"/>\n      <choose>\n        <if is-numeric="number-of-volumes">\n          <label form="short" variable="number-of-volumes"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-page">\n    <group delimiter=" ">\n      <label form="short" variable="page"/>\n      <text variable="page"/>\n    </group>\n  </macro>\n  <macro name="label-part-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="part-number">\n          <!-- TODO: Replace with `part-number` label when CSL provides one -->\n          <text form="short" term="part"/>\n        </if>\n      </choose>\n      <text variable="part-number"/>\n    </group>\n  </macro>\n  <macro name="label-part-number-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="part-number">\n          <!-- TODO: Replace with `part-number` label when CSL provides one -->\n          <text form="short" term="part" text-case="capitalize-first"/>\n        </if>\n      </choose>\n      <text text-case="capitalize-first" variable="part-number"/>\n    </group>\n  </macro>\n  <macro name="label-section">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="section">\n          <label form="short" variable="section"/>\n        </if>\n      </choose>\n      <text text-case="title" variable="section"/>\n    </group>\n  </macro>\n  <macro name="label-section-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="section">\n          <label form="short" text-case="capitalize-first" variable="section"/>\n        </if>\n      </choose>\n      <text text-case="title" variable="section"/>\n    </group>\n  </macro>\n  <macro name="label-section-symbol">\n    <group delimiter=" ">\n      <label form="symbol" variable="section"/>\n      <text variable="section"/>\n    </group>\n  </macro>\n  <macro name="label-supplement-number">\n    <group delimiter=" ">\n      <choose>\n        <!-- TODO: Replace with `supplement-number` label when CSL provides one -->\n        <if variable="issue supplement-number">\n          <!-- if there is both an issue and supplement number, do not label both as \'no.\' -->\n          <text form="short" term="supplement"/>\n        </if>\n        <else-if is-numeric="supplement-number" variable="volume-title">\n          <!-- if there is a volume title, it is already described as a supplement -->\n          <text form="short" term="issue"/>\n        </else-if>\n        <else-if is-numeric="supplement-number" type="periodical" variable="title">\n          <text form="short" term="issue"/>\n        </else-if>\n        <else-if is-numeric="supplement-number">\n          <text form="short" term="supplement"/>\n        </else-if>\n      </choose>\n      <text variable="supplement-number"/>\n    </group>\n  </macro>\n  <macro name="label-version">\n    <group delimiter=" ">\n      <choose>\n        <if type="software">\n          <!-- short version label for software (CMOS18 14.169) -->\n          <label form="short" variable="version"/>\n        </if>\n        <else>\n          <label variable="version"/>\n        </else>\n      </choose>\n      <text variable="version"/>\n    </group>\n  </macro>\n  <macro name="label-version-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if type="software">\n          <!-- short version label for software (CMOS18 14.169) -->\n          <label form="short" text-case="capitalize-first" variable="version"/>\n        </if>\n        <else>\n          <label text-case="capitalize-first" variable="version"/>\n        </else>\n      </choose>\n      <text variable="version"/>\n    </group>\n  </macro>\n  <macro name="label-volume">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="volume">\n          <label form="short" variable="volume"/>\n        </if>\n      </choose>\n      <text variable="volume"/>\n    </group>\n  </macro>\n  <macro name="label-volume-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="volume">\n          <label form="short" text-case="capitalize-first" variable="volume"/>\n        </if>\n      </choose>\n      <text text-case="capitalize-first" variable="volume"/>\n    </group>\n  </macro>\n  <!-- 1. Author (CMOS18 13.74-86) -->\n  <macro name="author-bib">\n    <names variable="composer">\n      <name and="text" delimiter-precedes-last="always" initialize="false" name-as-sort-order="first"/>\n      <label form="short" prefix=", "/>\n      <substitute>\n        <names variable="author"/>\n        <!-- cf. `interview` model (CMOS18 14.110); if it is desired to prioritize `host` over `guest`, the latter could be encoded as a `contributor` -->\n        <names variable="guest"/>\n        <names variable="host"/>\n        <choose>\n          <if type="song">\n            <names variable="performer"/>\n          </if>\n        </choose>\n        <choose>\n          <if type="classic">\n            <!-- contributors fall after the title of `classic` (CMOS18 14.147) -->\n            <text macro="author-title-substitute-bib"/>\n          </if>\n          <else-if type="entry-dictionary" variable="container-title">\n            <!-- contributors fall after the title of unsigned reference entries (CMOS18 14.130) -->\n            <text macro="author-title-substitute-container"/>\n          </else-if>\n          <else-if type="entry-encyclopedia" variable="container-title">\n            <text macro="author-title-substitute-container"/>\n          </else-if>\n        </choose>\n        <names variable="illustrator"/>\n        <choose>\n          <!-- list an edited multivolume work under the name of the series editor; remove this condition for author-date or notes and bibliography leading with volume title (CMOS18 14.21) -->\n          <if variable="container-title"/>\n          <else-if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n            <names variable="collection-editor"/>\n          </else-if>\n        </choose>\n        <choose>\n          <if match="none" type="standard">\n            <names variable="editor-translator"/>\n            <names variable="editor"/>\n            <names variable="translator"/>\n            <names variable="collection-editor"/>\n          </if>\n        </choose>\n        <names variable="director"/>\n        <choose>\n          <!-- serial `broadcast` prioritizes title (CMOS18 14.165, 14.168) -->\n          <if type="broadcast" variable="container-title number title"/>\n          <else>\n            <names variable="producer"/>\n            <names variable="executive-producer"/>\n            <names variable="series-creator"/>\n            <choose>\n              <if type="broadcast">\n                <names variable="contributor"/>\n              </if>\n            </choose>\n          </else>\n        </choose>\n        <names variable="editorial-director"/>\n        <names variable="compiler"/>\n        <choose>\n          <if match="any" type="event performance speech">\n            <names variable="chair"/>\n            <names variable="organizer"/>\n          </if>\n        </choose>\n        <names variable="curator"/>\n        <choose>\n          <if match="any" type="software webpage">\n            <!-- `software` listed under the name of the publisher or developer (CMOS18 14.169); `webpage` listed under a site owner or sponsor (CMOS18 14.104) -->\n            <text variable="publisher"/>\n          </if>\n          <else-if type="standard">\n            <!-- `standard` listed in bibliography under organization, but note omits this (CMOS18 14.159) -->\n            <text variable="authority"/>\n          </else-if>\n        </choose>\n        <text macro="author-title-substitute-container"/>\n        <text macro="author-title-substitute-bib"/>\n        <choose>\n          <if match="any" variable="container-title event-date event-place event-title genre title publisher publisher-place"/>\n          <else-if type="manuscript">\n            <text macro="source-archive-bib"/>\n          </else-if>\n        </choose>\n      </substitute>\n    </names>\n  </macro>\n  <macro name="author-note">\n    <names variable="composer">\n      <name and="text" initialize="false"/>\n      <label form="short" prefix=", "/>\n      <substitute>\n        <names variable="author"/>\n        <!-- cf. `interview` model (CMOS18 14.110); use `contributor` if `host` should be prioritized -->\n        <names variable="guest"/>\n        <names variable="host"/>\n        <choose>\n          <if type="song">\n            <names variable="performer"/>\n          </if>\n        </choose>\n        <choose>\n          <if match="any" type="classic performance">\n            <!-- note contributors fall after the title of `classic` (CMOS18 14.147), `performance` (CMOS18 14.166) -->\n            <text macro="author-title-substitute-note"/>\n          </if>\n          <else-if type="broadcast" variable="container-title number title">\n            <!-- note contributors fall after the title of `broadcast` (CMOS18 14.165) -->\n            <text macro="author-title-substitute-container-short"/>\n          </else-if>\n          <else-if match="any" type="broadcast motion_picture song">\n            <!-- note contributors fall after the title of `broadcast`, `motion_picture` (CMOS18 14.165), `song` (CMOS18 14.163)  -->\n            <text macro="author-title-substitute-note"/>\n          </else-if>\n          <!-- unsigned reference articles consulted in physical formats list `title` in the manner of a `sub-verbo` locator (CMOS18 14.130) -->\n          <else-if match="any" variable="DOI URL"/>\n          <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n            <text macro="author-title-substitute-reference-note"/>\n          </else-if>\n        </choose>\n        <names variable="illustrator"/>\n        <choose>\n          <!-- list an edited multivolume work under the name of the series editor; remove this condition for notes and bibliography leading with volume title (CMOS18 14.21) -->\n          <if variable="container-title"/>\n          <else-if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n            <names variable="collection-editor"/>\n          </else-if>\n        </choose>\n        <choose>\n          <if match="none" type="standard">\n            <names variable="editor-translator"/>\n            <names variable="editor"/>\n            <names variable="translator"/>\n            <names variable="collection-editor"/>\n          </if>\n        </choose>\n        <names variable="director"/>\n        <choose>\n          <!-- serial `broadcast` prioritizes title (CMOS18 14.165, 14.168) -->\n          <if type="broadcast" variable="container-title number title"/>\n          <else>\n            <names variable="producer"/>\n            <names variable="executive-producer"/>\n            <names variable="series-creator"/>\n            <choose>\n              <if type="broadcast">\n                <names variable="contributor"/>\n              </if>\n            </choose>\n          </else>\n        </choose>\n        <names variable="editorial-director"/>\n        <names variable="compiler"/>\n        <choose>\n          <if match="any" type="event performance speech">\n            <names variable="chair"/>\n            <names variable="organizer"/>\n          </if>\n        </choose>\n        <names variable="curator"/>\n        <!-- notes omit organization name for `software` (CMOS18 14.169), `standard` (CMOS18 14.159), and `webpage` (CMOS18 14.104) -->\n        <choose>\n          <!-- in notes, substitute `container-title` only if there is no article title, moving it before `genre` or `section` (CMOS18 14.89); shortened notes use this more liberally -->\n          <if match="any" variable="reviewed-genre reviewed-title title"/>\n          <else-if type="webpage"/>\n          <else>\n            <text macro="author-title-substitute-container"/>\n          </else>\n        </choose>\n        <choose>\n          <if match="none" variable="reviewed-genre reviewed-title title">\n            <!-- TODO: workaround for citeproc bug shown in substitution with an unsigned review; remove when fixed -->\n            <text macro="author-title-substitute-note"/>\n          </if>\n        </choose>\n        <choose>\n          <if match="any" variable="container-title event-date event-place event-title genre title publisher publisher-place"/>\n          <else-if type="manuscript">\n            <text macro="source-archive-note"/>\n          </else-if>\n        </choose>\n      </substitute>\n    </names>\n  </macro>\n  <macro name="author-short">\n    <choose>\n      <if match="any" type="bill hearing legal_case legislation regulation treaty">\n        <text macro="title-and-descriptions-short"/>\n      </if>\n      <else-if match="any" type="interview personal_communication">\n        <text macro="author-short-and-recipient"/>\n      </else-if>\n      <else>\n        <names variable="composer">\n          <name and="text" form="short" initialize="true"/>\n          <substitute>\n            <names variable="author"/>\n            <names variable="guest"/>\n            <names variable="host"/>\n            <choose>\n              <if type="song">\n                <names variable="performer"/>\n              </if>\n            </choose>\n            <choose>\n              <if match="any" type="classic performance">\n                <!-- note contributors fall after the title of `classic` (CMOS18 14.147), `performance` (CMOS18 14.166) -->\n                <text macro="author-title-substitute-short"/>\n              </if>\n              <else-if type="broadcast" variable="container-title number title">\n                <!-- note contributors fall after the title of `broadcast` (CMOS18 14.165) -->\n                <text macro="author-title-substitute-container-short"/>\n              </else-if>\n              <else-if match="any" type="broadcast motion_picture song">\n                <!-- note contributors fall after the title of `broadcast`, `motion_picture` (CMOS18 14.165), `song` (CMOS18 14.163)  -->\n                <text macro="author-title-substitute-short"/>\n              </else-if>\n              <!-- unsigned reference articles consulted in physical formats list `title` in the manner of a `sub-verbo` locator (CMOS18 14.130) -->\n              <else-if match="any" variable="DOI URL"/>\n              <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n                <text macro="author-title-substitute-container-short"/>\n              </else-if>\n            </choose>\n            <names variable="illustrator"/>\n            <choose>\n              <!-- list an edited multivolume work under the name of the series editor; remove this condition for notes and bibliography leading with volume title (CMOS18 14.21) -->\n              <if variable="container-title"/>\n              <else-if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n                <names variable="collection-editor"/>\n              </else-if>\n            </choose>\n            <choose>\n              <if match="none" type="standard">\n                <names variable="editor-translator"/>\n                <names variable="editor"/>\n                <names variable="translator"/>\n                <names variable="collection-editor"/>\n              </if>\n            </choose>\n            <choose>\n              <if type="broadcast" variable="container-title number title"/>\n              <else>\n                <names variable="director"/>\n                <names variable="producer"/>\n                <names variable="executive-producer"/>\n                <names variable="series-creator"/>\n                <choose>\n                  <if type="broadcast">\n                    <names variable="contributor"/>\n                  </if>\n                </choose>\n              </else>\n            </choose>\n            <names variable="editorial-director"/>\n            <names variable="compiler"/>\n            <choose>\n              <if match="any" type="event performance speech">\n                <names variable="chair"/>\n                <names variable="organizer"/>\n              </if>\n            </choose>\n            <names variable="curator"/>\n            <choose>\n              <!-- no Chicago definition for these shortened references; this follows the bibliography -->\n              <if match="any" type="software webpage">\n                <!-- `software` listed under the name of the publisher or developer (CMOS18 14.169); `webpage` listed under a site owner or sponsor (CMOS18 14.104) -->\n                <text form="short" variable="publisher"/>\n              </if>\n              <else-if type="standard">\n                <!-- `standard` listed in bibliography under organization (CMOS18 14.159) -->\n                <text form="short" variable="authority"/>\n              </else-if>\n            </choose>\n            <text macro="author-title-substitute-container-short"/>\n            <text macro="author-title-substitute-short"/>\n            <choose>\n              <if match="any" variable="container-title event-date event-place event-title genre title publisher publisher-place"/>\n              <else-if type="manuscript">\n                <text macro="source-archive-note"/>\n              </else-if>\n            </choose>\n          </substitute>\n        </names>\n      </else>\n    </choose>\n  </macro>\n  <macro name="author-sort">\n    <choose>\n      <if match="any" type="bill hearing legal_case legislation regulation treaty">\n        <text macro="legal-title"/>\n      </if>\n      <else>\n        <text macro="author-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Author elements -->\n  <macro name="author-short-and-recipient">\n    <group delimiter=" ">\n      <choose>\n        <!-- inaccessible `interview` or `personal_commmunication`: in-text citation (CMOS18 14.111) -->\n        <if match="none" variable="archive archive-place container-title DOI number publisher references URL">\n          <choose>\n            <if position="first">\n              <!-- at the first citation in shortened forms, give the full name -->\n              <names variable="author">\n                <name and="text" initialize="false"/>\n                <!-- never initialize -->\n                <substitute>\n                  <text macro="title-and-descriptions-short"/>\n                </substitute>\n              </names>\n            </if>\n            <else>\n              <names variable="author">\n                <name and="text" form="short" initialize="true"/>\n                <substitute>\n                  <text macro="title-and-descriptions-short"/>\n                </substitute>\n              </names>\n            </else>\n          </choose>\n          <choose>\n            <if variable="genre"/>\n            <!-- recipient appears in the description if there is a `genre`; otherwise after `author` -->\n            <else-if position="first">\n              <names variable="recipient">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n                <!-- never initialize -->\n              </names>\n            </else-if>\n            <else>\n              <names variable="recipient">\n                <label form="verb" suffix=" "/>\n                <name and="text" form="short" initialize="true"/>\n              </names>\n            </else>\n          </choose>\n        </if>\n        <!-- accessible `interview` or `personal_communication`: standard citation -->\n        <else-if variable="author recipient">\n          <names variable="author">\n            <name and="text" form="short" initialize="true"/>\n          </names>\n          <choose>\n            <if match="none" variable="genre">\n              <names variable="recipient">\n                <label form="verb" suffix=" "/>\n                <name and="text" form="short" initialize="true"/>\n              </names>\n            </if>\n          </choose>\n        </else-if>\n        <else>\n          <names variable="author">\n            <name and="text" form="short" initialize="true"/>\n            <substitute>\n              <text macro="title-and-descriptions-short"/>\n            </substitute>\n          </names>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="author-title-substitute-bib">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- If a review has no `reviewed-genre` or `reviewed-title`, assume that `title` contains the title of the reviewed work; the description provides it. -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <text macro="title-bib"/>\n          </if>\n          <else-if variable="reviewed-genre reviewed-title title">\n            <text macro="title-bib"/>\n          </else-if>\n          <else>\n            <text macro="title-and-descriptions-bib"/>\n          </else>\n        </choose>\n      </if>\n      <else-if variable="title">\n        <text macro="title-bib"/>\n      </else-if>\n      <else>\n        <!-- If an item has no `title`, substitute with descriptions. -->\n        <text macro="title-and-descriptions-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="author-title-substitute-note">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- If a review has no `reviewed-genre` or `reviewed-title`, assume that `title` contains the title of the reviewed work; the description provides it. -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <text macro="title-note"/>\n          </if>\n          <else-if variable="reviewed-genre reviewed-title title">\n            <text macro="title-note"/>\n          </else-if>\n          <else>\n            <text macro="title-and-descriptions-note"/>\n          </else>\n        </choose>\n      </if>\n      <else-if variable="title">\n        <text macro="title-note"/>\n      </else-if>\n      <else>\n        <!-- If an item has no `title`, substitute with descriptions and capitalize -->\n        <text macro="title-and-descriptions-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="author-title-substitute-short">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- If a review has no `reviewed-genre` or `reviewed-title`, assume that `title` contains the title of the reviewed work; the description provides it. -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <text macro="title-short"/>\n          </if>\n          <else-if variable="reviewed-genre reviewed-title title">\n            <text macro="title-short"/>\n          </else-if>\n          <else>\n            <text macro="title-and-descriptions-short"/>\n          </else>\n        </choose>\n      </if>\n      <else-if variable="title">\n        <text macro="title-short"/>\n      </else-if>\n      <else>\n        <!-- If an item has no `title`, substitute with descriptions and capitalize -->\n        <text macro="title-and-descriptions-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="author-title-substitute-container">\n    <choose>\n      <!-- no Chicago model for citing an anonymous article with an issue title in `volume-title` -->\n      <if variable="volume-title"/>\n      <else-if match="any" type="article-magazine article-newspaper">\n        <!-- Anonymous magazine and newspaper articles substitute name of publication (CMOS18 14.87, 14.97) -->\n        <text macro="source-serial-name"/>\n      </else-if>\n      <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- Publication name also substituted for unsigned reviews (CMOS18 14.102) -->\n        <text macro="source-serial-name"/>\n      </else-if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <!-- Anonymous entries in reference works (CMOS18 14.130) -->\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if type="broadcast">\n        <!-- TV broadcasts and podcasts (CMOS18 14.165, 14.168) -->\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if type="webpage">\n        <!-- list a webpage under the website title if there is no owner or sponsor (CMOS18 14.104) -->\n        <text text-case="title" variable="container-title"/>\n        <!-- for author-date:\n        <choose><if variable="container-title-short"><text text-case="title" variable="container-title-short"/></if><else><text text-case="title" variable="container-title"/></else></choose>-->\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="author-title-substitute-container-short">\n    <choose>\n      <if match="any" type="article-magazine article-newspaper">\n        <!-- Anonymous magazine/newspaper articles substitute name of publication (CMOS18 14.87, 14.97) -->\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </if>\n      <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- Publication name also substituted for unsigned reviews (CMOS18 14.102) -->\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <!-- Anonymous entries in reference works (CMOS18 14.130) -->\n        <text font-style="italic" form="short" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if type="broadcast">\n        <!-- TV broadcasts and podcasts (CMOS18 14.165, 14.168) -->\n        <text font-style="italic" form="short" text-case="title" variable="container-title"/>\n      </else-if>\n      <else-if type="webpage">\n        <!-- list a webpage under the website title if there is no owner or sponsor (CMOS18 14.104) -->\n        <text form="short" text-case="title" variable="container-title"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="author-title-substitute-reference-note">\n    <!-- unsigned reference articles consulted in physical formats list `title` in the manner of a `sub-verbo` locator (CMOS18 14.130) -->\n    <group delimiter=", ">\n      <group delimiter=" ">\n        <group delimiter=", ">\n          <text macro="author-title-substitute-container"/>\n          <text macro="source-note"/>\n        </group>\n        <text macro="source-monographic-publication-note-bracketed"/>\n      </group>\n      <group delimiter=" ">\n        <choose>\n          <if locator="sub-verbo"/>\n          <else-if variable="container-title title">\n            <choose>\n              <if match="none" variable="DOI URL">\n                <!-- Only print reference entries use `sub-verbo` (CMOS18 14.131) -->\n                <text form="short" term="sub-verbo"/>\n              </if>\n            </choose>\n            <text macro="title-primary"/>\n          </else-if>\n        </choose>\n      </group>\n    </group>\n  </macro>\n  <!-- 2. Date (CMOS18 13.102) -->\n  <macro name="date-short">\n    <group delimiter="-">\n      <choose>\n        <if variable="issued">\n          <group delimiter=" ">\n            <choose>\n              <if is-uncertain-date="original-date">\n                <!-- Uncertain date already has square brackets -->\n                <text macro="date-original-year"/>\n              </if>\n              <else>\n                <text macro="date-original-year" prefix="[" suffix="]"/>\n              </else>\n            </choose>\n            <group>\n              <choose>\n                <if match="none" type="interview personal_communication">\n                  <text macro="date-issued-year"/>\n                </if>\n                <!-- accessible `interview` or `personal_communication` items appear in the bibliography; inaccessible items are in-text only -->\n                <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n                  <text macro="date-issued-year"/>\n                </else-if>\n                <else>\n                  <text macro="date-issued-full"/>\n                </else>\n              </choose>\n              <text variable="year-suffix"/>\n            </group>\n          </group>\n        </if>\n        <else-if variable="event-date">\n          <text macro="date-event-year"/>\n        </else-if>\n        <else-if variable="available-date">\n          <date date-parts="year" form="numeric" variable="available-date"/>\n        </else-if>\n        <else-if variable="status">\n          <!-- Print the status variable rather than use generic CSL terms (`in press`, etc.) -->\n          <text text-case="lowercase" variable="status"/>\n          <text variable="year-suffix"/>\n        </else-if>\n        <else-if match="any" type="interview personal_communication">\n          <choose>\n            <if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n              <!-- only give n.d. for accessible personal communication (CMOS18 14.111)-->\n              <text form="short" term="no date"/>\n              <text variable="year-suffix"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if match="any" type="classic collection entry entry-dictionary entry-encyclopedia">\n          <!-- do not give n.d. for archival collections (CMOS18 14.128), `classic` (CMOS18 14.143), or reference entries (CMOS18 14.131) -->\n          <text variable="year-suffix"/>\n        </else-if>\n        <else-if type="manuscript">\n          <!-- do not give n.d. with a bare shelfmark -->\n          <choose>\n            <if match="any" variable="container-title event-date event-place event-title genre title publisher publisher-place">\n              <text form="short" term="no date"/>\n              <text variable="year-suffix"/>\n            </if>\n          </choose>\n        </else-if>\n        <else>\n          <text form="short" term="no date"/>\n          <text variable="year-suffix"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Date elements -->\n  <macro name="date-event-full">\n    <choose>\n      <if is-uncertain-date="issued">\n        <!-- guessed-at date (CMOS18 14.44) -->\n        <date form="text" prefix="[" suffix="?]" variable="event-date"/>\n      </if>\n      <else>\n        <date form="text" variable="event-date"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-event-year">\n    <choose>\n      <if is-uncertain-date="issued">\n        <!-- guessed-at date (CMOS18 14.44) -->\n        <date date-parts="year" form="numeric" prefix="[" suffix="?]" variable="event-date"/>\n      </if>\n      <else>\n        <date date-parts="year" form="numeric" variable="event-date"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-issued-full">\n    <choose>\n      <if is-uncertain-date="issued">\n        <!-- guessed-at date (CMOS18 14.44) -->\n        <date form="text" prefix="[" suffix="?]" variable="issued"/>\n      </if>\n      <else>\n        <date form="text" variable="issued"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-issued-year">\n    <choose>\n      <if is-uncertain-date="issued">\n        <!-- guessed-at date (CMOS18 14.44) -->\n        <date date-parts="year" form="numeric" prefix="[" suffix="?]" variable="issued"/>\n      </if>\n      <else>\n        <date date-parts="year" form="numeric" variable="issued"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-issued-year-month">\n    <choose>\n      <if is-uncertain-date="issued">\n        <!-- guessed-at date (CMOS18 14.44) -->\n        <date date-parts="year-month" form="text" prefix="[" suffix="?]" variable="issued"/>\n      </if>\n      <else>\n        <date date-parts="year-month" form="text" variable="issued"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-original-full">\n    <choose>\n      <if is-uncertain-date="original-date">\n        <date form="text" prefix="[" suffix="?]" variable="original-date"/>\n      </if>\n      <else>\n        <date form="text" variable="original-date"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-original-year">\n    <choose>\n      <if is-uncertain-date="original-date">\n        <date date-parts="year" form="numeric" prefix="[" suffix="?]" variable="original-date"/>\n      </if>\n      <else>\n        <date date-parts="year" form="numeric" variable="original-date"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="date-original-year-month">\n    <choose>\n      <if is-uncertain-date="original-date">\n        <date date-parts="year-month" form="text" prefix="[" suffix="?]" variable="original-date"/>\n      </if>\n      <else>\n        <date date-parts="year-month" form="text" variable="original-date"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 3. Title and descriptions (CMOS18 13.87-101) -->\n  <macro name="title-and-descriptions-bib">\n    <group delimiter=". ">\n      <choose>\n        <if variable="title">\n          <text macro="title-bib"/>\n          <text macro="description-bib"/>\n          <text macro="identifier-bib"/>\n        </if>\n        <else-if match="any" type="bill report">\n          <!-- Bills, resolutions, and congressional reports substitute bill number if no title -->\n          <!-- Congressional reports are indistinguishable from other reports -->\n          <text macro="identifier-number-bib"/>\n          <text macro="identifier-bib"/>\n          <text macro="description-bib"/>\n        </else-if>\n        <else>\n          <text macro="description-bib"/>\n          <text macro="identifier-bib"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="title-and-descriptions-note">\n    <group delimiter=", ">\n      <choose>\n        <if variable="title">\n          <text macro="title-note"/>\n          <text macro="description-note"/>\n          <text macro="identifier-note"/>\n        </if>\n        <else-if match="any" type="bill report">\n          <!-- Bills, resolutions, and congressional reports substitute bill number if no title -->\n          <!-- Congressional reports are indistinguishable from other reports -->\n          <text macro="identifier-number-note"/>\n          <text macro="identifier-note"/>\n          <text macro="description-note"/>\n        </else-if>\n        <else>\n          <text macro="description-note"/>\n          <text macro="identifier-note"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="title-and-descriptions-short">\n    <choose>\n      <if variable="title">\n        <text macro="title-short"/>\n      </if>\n      <else-if match="any" type="bill report">\n        <!-- Bills, resolutions, and congressional reports substitute bill number if no title -->\n        <text macro="legal-identifier-bill-report"/>\n      </else-if>\n      <else>\n        <text macro="description-short"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-and-source-bib">\n    <group delimiter=". ">\n      <choose>\n        <if type="broadcast" variable="container-title number title">\n          <!-- Bespoke `broadcast` format (CMOS18 14.165, 14.168) -->\n          <text font-style="italic" text-case="title" variable="container-title"/>\n          <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21): -->\n          <!-- <text macro="source-monographic-title-specific-title-first"/> -->\n          <group delimiter=", ">\n            <text macro="identifier-number-bib"/>\n            <text macro="title-bib"/>\n            <text macro="description-bib"/>\n            <text macro="source-monographic-identifier-contributors-bib"/>\n          </group>\n          <text macro="source-monographic-identifier-contributors-bib-container-author"/>\n          <text macro="source-series-bib"/>\n          <choose>\n            <!-- show event information here only if not collapsed with `issued` (CMOS18 14.167) -->\n            <if match="any" variable="event-date original-date original-publisher original-publisher-place publisher status">\n              <text macro="source-event-bib"/>\n            </if>\n          </choose>\n        </if>\n        <else-if type="chapter" variable="container-title genre">\n          <!-- \'introduction to\', \'online appendix to\' (CMOS18 14.12, 14.14) -->\n          <group delimiter=" ">\n            <text macro="title-and-descriptions-bib"/>\n            <text macro="source-bib"/>\n          </group>\n        </else-if>\n        <else-if type="article-journal" variable="container-title genre volume-title">\n          <!-- introduction to a special issue or supplement -->\n          <group delimiter=" ">\n            <text macro="title-and-descriptions-bib"/>\n            <text macro="source-bib"/>\n          </group>\n        </else-if>\n        <else>\n          <text macro="title-and-descriptions-bib"/>\n          <text macro="source-bib"/>\n        </else>\n      </choose>\n      <group delimiter=", ">\n        <choose>\n          <!-- show event information here only if collapsed with `issued` (CMOS18 14.167) -->\n          <if match="any" variable="event-date original-date original-publisher original-publisher-place publisher status"/>\n          <!-- omit serial types -->\n          <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book"/>\n          <else-if match="any" variable="collection-editor compiler editor editorial-director">\n            <!-- monographic types -->\n            <text macro="source-event-bib"/>\n          </else-if>\n          <!-- omit serial types -->\n          <else-if match="any" type="interview paper-conference"/>\n          <else>\n            <!-- monographic types -->\n            <text macro="source-event-bib"/>\n          </else>\n        </choose>\n        <text macro="source-monographic-publication-bib"/>\n      </group>\n      <text macro="source-medium-bib"/>\n      <text macro="source-archive-bib"/>\n      <text macro="source-date-accessed-DOI-URL-bib"/>\n    </group>\n  </macro>\n  <macro name="title-and-source-note">\n    <group delimiter=", ">\n      <group delimiter=" ">\n        <group delimiter=", ">\n          <choose>\n            <if type="broadcast" variable="container-title number title">\n              <!-- Bespoke `broadcast` format (CMOS18 14.165, 14.168) -->\n              <text font-style="italic" text-case="title" variable="container-title"/>\n              <group delimiter=", ">\n                <text macro="identifier-number-note"/>\n                <text macro="title-note"/>\n                <text macro="description-note"/>\n                <text macro="source-monographic-identifier-contributors-note"/>\n              </group>\n              <text macro="source-series-note"/>\n              <text macro="source-event-note"/>\n            </if>\n            <else-if type="chapter" variable="container-title genre">\n              <!-- \'introduction to\', \'online appendix to\' (CMOS18 14.12, 14.14) -->\n              <group delimiter=" ">\n                <text macro="title-and-descriptions-note"/>\n                <text macro="source-note"/>\n              </group>\n            </else-if>\n            <else-if type="article-journal" variable="container-title genre volume-title">\n              <!-- introduction to a special issue or supplement -->\n              <group delimiter=" ">\n                <text macro="title-and-descriptions-note"/>\n                <text macro="source-note"/>\n              </group>\n            </else-if>\n            <else>\n              <text macro="title-and-descriptions-note"/>\n              <text macro="source-note"/>\n            </else>\n          </choose>\n          <text macro="source-monographic-publication-note-unbracketed"/>\n        </group>\n        <text macro="source-monographic-publication-note-bracketed"/>\n      </group>\n      <choose>\n        <!-- Locator for monographic types only; serial locator handled in `source-serial-locator` -->\n        <!-- omit serial types -->\n        <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book"/>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text macro="source-monographic-locator"/>\n        </else-if>\n        <!-- omit serial types -->\n        <else-if match="any" type="interview paper-conference"/>\n        <else>\n          <!-- monographic types -->\n          <text macro="source-monographic-locator"/>\n        </else>\n      </choose>\n      <text macro="source-medium-note"/>\n      <text macro="source-archive-note"/>\n      <text macro="source-date-accessed-DOI-URL-note"/>\n    </group>\n  </macro>\n  <!-- 3.1. Title -->\n  <macro name="title-bib">\n    <choose>\n      <if match="any" type="post webpage">\n        <!-- part number/title always at the analytic level -->\n        <text macro="title-and-part-filter-review-bib"/>\n      </if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="title-and-part-filter-review-bib"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="title-primary"/>\n        <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="title-monographic-bib-specific-title-first"/> -->\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="title-and-part-filter-review-bib"/>\n      </else-if>\n      <else>\n        <text macro="title-primary"/>\n        <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="title-monographic-bib-specific-title-first"/> -->\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-note">\n    <choose>\n      <if match="any" type="post webpage">\n        <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n        <text macro="title-and-part-filter-review-note"/>\n      </if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="title-and-part-filter-review-note"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <!-- notes always open with the primary title -->\n        <text macro="title-primary"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="title-and-part-filter-review-note"/>\n      </else-if>\n      <else>\n        <!-- notes always open with the primary title -->\n        <text macro="title-primary"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-short">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- If a review has no `reviewed-title`, assume that `title` contains the title of the reviewed work; the description provides it. -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <!-- Quotes, title case -->\n            <text form="short" quotes="true" text-case="title" variable="title"/>\n          </if>\n          <else-if variable="reviewed-genre reviewed-title title">\n            <!-- Quotes, title case -->\n            <text form="short" quotes="true" text-case="title" variable="title"/>\n          </else-if>\n          <else>\n            <text macro="description-short"/>\n          </else>\n        </choose>\n      </if>\n      <else>\n        <text macro="title-primary-short"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Title elements -->\n  <macro name="title-and-part-filter-review-bib">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- `title` is only the review title if there is a separate `reviewed-genre` or `reviewed-title`; otherwise, it is the title of the reviewed work, printed in the description -->\n        <choose>\n          <if match="any" variable="reviewed-genre reviewed-title">\n            <text macro="title-and-part-title-bib"/>\n          </if>\n        </choose>\n      </if>\n      <else>\n        <text macro="title-and-part-title-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-and-part-filter-review-note">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- `title` is only the review title if there is a separate `reviewed-genre` or `reviewed-title`; otherwise, it is the title of the reviewed work, printed in the description -->\n        <choose>\n          <if match="any" variable="reviewed-genre reviewed-title">\n            <text macro="title-and-part-title-note"/>\n          </if>\n        </choose>\n      </if>\n      <else>\n        <text macro="title-and-part-title-note"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-and-part-title-bib">\n    <group delimiter=". ">\n      <text macro="title-primary"/>\n      <group delimiter=", ">\n        <text macro="label-part-number-capitalized"/>\n        <text macro="title-part"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="title-and-part-title-note">\n    <group delimiter=", ">\n      <text macro="title-primary"/>\n      <group delimiter=", ">\n        <text macro="label-part-number"/>\n        <text macro="title-part"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="title-part">\n    <choose>\n      <if type="patent">\n        <!-- No italics or quotes, sentence case -->\n        <text form="short" text-case="capitalize-first" variable="part-title"/>\n      </if>\n      <else-if match="any" type="bill collection legislation regulation treaty">\n        <!-- No italics or quotes, title case -->\n        <text text-case="title" variable="part-title"/>\n      </else-if>\n      <else-if type="legal_case">\n        <!-- Italicized, sentence case -->\n        <text font-style="italic" variable="part-title"/>\n      </else-if>\n      <else-if match="any" type="book classic graphic hearing map">\n        <!-- Italicized, title case (regardless of `container-title`) -->\n        <text font-style="italic" text-case="title" variable="part-title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="author container-title">\n        <!-- Signed encyclopedia entry in quotes, title case (CMOS18 14.132) -->\n        <text quotes="true" text-case="title" variable="part-title"/>\n      </else-if>\n      <else-if type="entry-dictionary" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="part-title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="part-title"/>\n      </else-if>\n      <else-if type="post">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="part-title"/>\n      </else-if>\n      <else-if type="webpage">\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="part-title"/>\n      </else-if>\n      <!-- Other types are formatted based on presence of `container-title` -->\n      <else-if variable="container-title">\n        <choose>\n          <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n            <!-- serial types -->\n            <!-- Quotes, title case -->\n            <text quotes="true" text-case="title" variable="part-title"/>\n          </if>\n          <else-if match="any" variable="collection-editor compiler editor editorial-director">\n            <!-- monographic types -->\n            <!-- Italics, title case -->\n            <text font-style="italic" text-case="title" variable="part-title"/>\n          </else-if>\n          <else-if match="any" type="interview paper-conference">\n            <!-- serial types -->\n            <!-- Quotes, title case -->\n            <text quotes="true" text-case="title" variable="part-title"/>\n          </else-if>\n          <else>\n            <!-- monographic types -->\n            <!-- Italics, title case -->\n            <text font-style="italic" text-case="title" variable="part-title"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if match="any" type="article dataset document interview manuscript paper-conference personal_communication speech thesis webpage">\n        <!-- Container-like but not necessarily with `container-title` -->\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="part-title"/>\n      </else-if>\n      <else>\n        <!-- Italicized, title case (default) -->\n        <text font-style="italic" text-case="title" variable="part-title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-primary">\n    <choose>\n      <if type="patent">\n        <!-- No italics or quotes, sentence case -->\n        <text form="short" text-case="capitalize-first" variable="title"/>\n      </if>\n      <else-if match="any" type="bill collection legislation regulation treaty">\n        <!-- No italics or quotes, title case -->\n        <text text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="legal_case">\n        <!-- Italicized, sentence case -->\n        <text font-style="italic" variable="title"/>\n      </else-if>\n      <else-if match="any" type="book classic graphic hearing map">\n        <!-- Italicized, title case (regardless of `container-title`) -->\n        <text font-style="italic" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="author container-title">\n        <!-- Signed encyclopedia entry in quotes, title case (CMOS18 14.132) -->\n        <text quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="entry-dictionary" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="title"/>\n      </else-if>\n      <else-if type="post">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="title"/>\n      </else-if>\n      <!-- Other types are formatted based on presence of `container-title` -->\n      <else-if variable="container-title">\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if match="any" type="article dataset document interview manuscript paper-conference personal_communication speech thesis webpage">\n        <!-- Container-like but not necessarily with `container-title` -->\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else>\n        <!-- Italicized, title case (default) -->\n        <text font-style="italic" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-primary-short">\n    <choose>\n      <if type="patent">\n        <!-- No italics or quotes, sentence case -->\n        <text form="short" text-case="capitalize-first" variable="title"/>\n      </if>\n      <else-if match="any" type="bill collection legislation regulation treaty">\n        <!-- No italics or quotes, title case -->\n        <text form="short" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="legal_case">\n        <!-- Italicized, sentence case -->\n        <text font-style="italic" form="short" variable="title"/>\n      </else-if>\n      <else-if match="any" type="book classic graphic hearing map">\n        <!-- Italicized, title case (regardless of `container-title`) -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="author container-title">\n        <!-- Signed encyclopedia entry in quotes, title case (CMOS18 14.132) -->\n        <text form="short" quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="entry-dictionary" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text form="short" quotes="true" variable="title"/>\n      </else-if>\n      <else-if type="entry-encyclopedia" variable="container-title">\n        <!-- Quotes, sentence case -->\n        <text form="short" quotes="true" variable="title"/>\n      </else-if>\n      <else-if type="post">\n        <!-- Quotes, sentence case -->\n        <text form="short" quotes="true" variable="title"/>\n      </else-if>\n      <!-- Other types are formatted based on presence of `container-title` -->\n      <else-if variable="container-title">\n        <!-- Quotes, title case -->\n        <text form="short" quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if match="any" type="article dataset document interview manuscript paper-conference personal_communication speech thesis webpage">\n        <!-- Container-like but not necessarily with `container-title` -->\n        <!-- Quotes, title case -->\n        <text form="short" quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else>\n        <!-- Italicized, title case (default) -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-volume">\n    <choose>\n      <if type="manuscript">\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="volume-title"/>\n      </if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="volume-title"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <!-- Italics, title case -->\n        <text font-style="italic" text-case="title" variable="volume-title"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="volume-title"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <!-- Italics, title case -->\n        <text font-style="italic" text-case="title" variable="volume-title"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 3.2. Description -->\n  <macro name="description-bib">\n    <choose>\n      <if match="any" type="interview" variable="interviewer">\n        <text macro="description-interview-bib"/>\n      </if>\n      <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <text macro="description-review-bib"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <text macro="description-letter-bib"/>\n      </else-if>\n      <else-if type="song" variable="composer">\n        <text macro="description-song-bib"/>\n      </else-if>\n      <!-- thesis type appears with university name (CMOS18 14.113) -->\n      <else-if type="thesis"/>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="description-serial-bib"/>\n      </else-if>\n      <else-if type="paper-conference">\n        <text macro="description-paper-conference-bib"/>\n      </else-if>\n      <else-if match="none" variable="container-title">\n        <text macro="description-format-bib"/>\n      </else-if>\n      <!-- For conference presentations/performances/events, chapters in reports/standards/generic documents, software, place description within the source element -->\n      <else-if match="any" type="document report software standard"/>\n      <else-if match="any" type="event paper-conference performance speech">\n        <choose>\n          <if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n            <text macro="description-format-bib"/>\n          </if>\n        </choose>\n      </else-if>\n      <else>\n        <text macro="description-format-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-note">\n    <choose>\n      <if match="any" type="interview" variable="interviewer">\n        <text macro="description-interview-note"/>\n      </if>\n      <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <text macro="description-review-note"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <text macro="description-letter-note"/>\n      </else-if>\n      <else-if type="song" variable="composer">\n        <text macro="description-song-note"/>\n      </else-if>\n      <!-- thesis type appears with university name (CMOS18 14.113) -->\n      <else-if type="thesis"/>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="description-serial-note"/>\n      </else-if>\n      <else-if type="paper-conference">\n        <text macro="description-paper-conference-note"/>\n      </else-if>\n      <else-if match="none" variable="container-title">\n        <text macro="description-format-note"/>\n      </else-if>\n      <!-- For conference presentations/performances/events, chapters in reports/standards/generic documents, software, place description within the source element -->\n      <else-if match="any" type="document report software standard"/>\n      <else-if match="any" type="event paper-conference performance speech">\n        <choose>\n          <if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n            <text macro="description-format-note"/>\n          </if>\n        </choose>\n      </else-if>\n      <else>\n        <text macro="description-format-note"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-short">\n    <choose>\n      <if match="any" type="interview" variable="interviewer">\n        <choose>\n          <if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n            <text macro="description-interview-short"/>\n          </if>\n          <else>\n            <!-- for an inaccessible `interview`, give a full in-text description at the first citation -->\n            <choose>\n              <if position="first">\n                <text macro="description-interview-note"/>\n              </if>\n              <else>\n                <text macro="description-interview-short"/>\n              </else>\n            </choose>\n          </else>\n        </choose>\n      </if>\n      <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <text macro="description-review-short"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <text macro="description-letter-short"/>\n      </else-if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="description-serial-short"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="description-format-short"/>\n      </else-if>\n      <else-if type="paper-conference">\n        <!-- serial `paper-conference` -->\n        <text macro="description-serial-short"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <text macro="description-format-short"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Description elements -->\n  <macro name="description-format-bib">\n    <choose>\n      <if variable="genre number"/>\n      <else-if variable="genre">\n        <text text-case="capitalize-first" variable="genre"/>\n      </else-if>\n      <!-- generic labels if unpublished -->\n      <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL"/>\n      <else-if type="manuscript">\n        <!-- \'unpublished manuscript\' if no `genre` (CMOS18 14.114) -->\n        <text term="manuscript" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <!-- \'personal communication\' if no `genre` (CMOS18 14.111) -->\n        <text term="personal-communication" text-case="capitalize-first"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="description-format-note">\n    <choose>\n      <if variable="genre number"/>\n      <else-if variable="genre">\n        <text variable="genre"/>\n      </else-if>\n      <!-- generic labels if unpublished -->\n      <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL"/>\n      <else-if type="manuscript">\n        <!-- \'unpublished manuscript\' if no `genre` (CMOS18 14.114) -->\n        <text term="manuscript"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <!-- \'personal communication\' if no `genre` (CMOS18 14.111) -->\n        <text term="personal-communication"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="description-format-short">\n    <group delimiter=" ">\n      <choose>\n        <if type="chapter" variable="container-title genre">\n          <!-- untitled introductions: cf. review model, which includes a title (CMOS18 14.101) -->\n          <text form="short" variable="genre"/>\n          <choose>\n            <if match="none" position="ibid ibid-with-locator">\n              <!-- CMOS team suggests leaving out title in repeated references -->\n              <text macro="source-monographic-preposition-note"/>\n              <text font-style="italic" form="short" text-case="title" variable="container-title"/>\n            </if>\n          </choose>\n        </if>\n        <else-if type="article-journal" variable="container-title genre volume-title">\n          <!-- untitled introduction to a special issue or supplement -->\n          <text form="short" variable="genre"/>\n          <choose>\n            <if match="none" position="ibid ibid-with-locator">\n              <text macro="source-monographic-preposition-note"/>\n              <text form="short" quotes="true" text-case="title" variable="volume-title"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if variable="genre">\n          <text form="short" variable="genre"/>\n        </else-if>\n        <else-if variable="medium">\n          <text form="short" variable="medium"/>\n        </else-if>\n        <else-if variable="chapter-number container-title">\n          <text macro="source-monographic-preposition-note"/>\n          <text font-style="italic" form="short" text-case="title" variable="container-title"/>\n        </else-if>\n        <else-if variable="chapter-number">\n          <text macro="label-chapter-number"/>\n        </else-if>\n        <!-- generic labels if unpublished -->\n        <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL"/>\n        <else-if type="manuscript">\n          <!-- \'unpublished manuscript\' if no `genre` (CMOS18 14.114) -->\n          <text term="manuscript"/>\n        </else-if>\n        <else-if type="personal_communication">\n          <!-- \'pers. comm.\' if no `genre` (CMOS18 14.111) -->\n          <text form="short" term="personal-communication"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="description-interview-bib">\n    <group delimiter=", ">\n      <choose>\n        <if variable="genre number">\n          <!-- `genre` printed with `number` -->\n          <names variable="interviewer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n        <else-if variable="genre">\n          <group delimiter=" ">\n            <text text-case="capitalize-first" variable="genre"/>\n            <group delimiter=" ">\n              <text form="verb" term="container-author"/>\n              <names variable="interviewer">\n                <name and="text" initialize="false"/>\n              </names>\n            </group>\n          </group>\n        </else-if>\n        <else-if variable="interviewer">\n          <names variable="interviewer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n        </else-if>\n        <else>\n          <text macro="description-format-bib"/>\n        </else>\n      </choose>\n      <text macro="source-event-place-first"/>\n    </group>\n  </macro>\n  <macro name="description-interview-note">\n    <group delimiter=", ">\n      <choose>\n        <if variable="genre number">\n          <!-- `genre` printed with `number` -->\n          <names variable="interviewer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n        <else-if variable="genre">\n          <group delimiter=" ">\n            <text variable="genre"/>\n            <group delimiter=" ">\n              <text form="verb" term="container-author"/>\n              <names variable="interviewer">\n                <name and="text" initialize="false"/>\n              </names>\n            </group>\n          </group>\n        </else-if>\n        <else-if variable="interviewer">\n          <names variable="interviewer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </else-if>\n        <else>\n          <text macro="description-format-note"/>\n        </else>\n      </choose>\n      <text macro="source-event-place-first"/>\n    </group>\n  </macro>\n  <macro name="description-interview-short">\n    <choose>\n      <if disambiguate="true">\n        <names variable="interviewer">\n          <label form="verb" suffix=" "/>\n          <name and="text" form="short" initialize="true"/>\n          <substitute>\n            <text macro="description-format-short"/>\n          </substitute>\n        </names>\n      </if>\n      <else-if match="any" variable="genre medium">\n        <choose>\n          <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n            <text macro="description-format-short"/>\n          </if>\n          <else>\n            <!-- capitalize if no author or title -->\n            <text macro="description-format-bib"/>\n          </else>\n        </choose>\n      </else-if>\n      <else>\n        <!-- generic description for an unpublished interview (CMOS18 14.108) -->\n        <text term="interview"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-letter-bib">\n    <choose>\n      <if variable="recipient">\n        <group delimiter=", ">\n          <choose>\n            <if variable="genre number">\n              <!-- `genre` appears with `number` -->\n              <names variable="recipient">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n            <else-if variable="genre">\n              <group delimiter=" ">\n                <text macro="description-format-bib"/>\n                <names variable="recipient">\n                  <label form="verb" suffix=" "/>\n                  <name and="text" initialize="false"/>\n                </names>\n              </group>\n            </else-if>\n            <else>\n              <names variable="recipient">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </else>\n          </choose>\n          <text variable="event-place"/>\n          <text macro="date-event-full"/>\n        </group>\n      </if>\n      <else>\n        <text macro="description-format-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-letter-note">\n    <choose>\n      <if variable="recipient">\n        <group delimiter=", ">\n          <choose>\n            <if variable="genre number">\n              <!-- `genre` appears with `number` -->\n              <names variable="recipient">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n            <else-if variable="genre">\n              <group delimiter=" ">\n                <text macro="description-format-note"/>\n                <names variable="recipient">\n                  <label form="verb" suffix=" "/>\n                  <name and="text" initialize="false"/>\n                </names>\n              </group>\n            </else-if>\n            <else>\n              <names variable="recipient">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </else>\n          </choose>\n          <text variable="event-place"/>\n          <text macro="date-event-full"/>\n        </group>\n      </if>\n      <else>\n        <text macro="description-format-note"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-letter-short">\n    <!-- shortened notes ideally give author, recipient, place, and date (CMOS18 14.13) -->\n    <group delimiter=", ">\n      <choose>\n        <if variable="genre recipient">\n          <group delimiter=" ">\n            <text macro="description-format-short"/>\n            <names variable="recipient">\n              <label form="verb" suffix=" "/>\n              <name and="text" form="short" initialize="true"/>\n            </names>\n          </group>\n        </if>\n        <else>\n          <text macro="description-format-short"/>\n        </else>\n      </choose>\n      <text variable="event-place"/>\n      <choose>\n        <if variable="event-date">\n          <text macro="date-event-full"/>\n        </if>\n        <else>\n          <text macro="date-issued-full"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="description-paper-conference-bib">\n    <choose>\n      <if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="description-format-bib"/>\n      </if>\n      <else>\n        <!-- serial types -->\n        <group delimiter=". ">\n          <text macro="description-serial-bib"/>\n          <text macro="source-event-bib"/>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-paper-conference-note">\n    <choose>\n      <if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="description-format-bib"/>\n      </if>\n      <else>\n        <!-- serial types -->\n        <group delimiter=", ">\n          <text macro="description-serial-note"/>\n          <text macro="source-event-note"/>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-bib">\n    <!-- Reviewed item -->\n    <group delimiter=". ">\n      <group delimiter=", ">\n        <group delimiter=" ">\n          <text macro="description-review-genre-bib"/>\n          <text macro="description-review-title"/>\n        </group>\n        <choose>\n          <if variable="reviewed-genre reviewed-title title">\n            <names variable="reviewed-author">\n              <label form="verb" suffix=" "/>\n              <name and="text" initialize="false"/>\n            </names>\n          </if>\n          <else-if variable="reviewed-genre"/>\n          <else>\n            <names variable="reviewed-author">\n              <label form="verb" suffix=" "/>\n              <name and="text" initialize="false"/>\n            </names>\n          </else>\n        </choose>\n        <text macro="source-event-place-first"/>\n      </group>\n      <text macro="label-section-capitalized"/>\n    </group>\n  </macro>\n  <macro name="description-review-note">\n    <!-- Reviewed item -->\n    <group delimiter=", ">\n      <group delimiter=", ">\n        <group delimiter=" ">\n          <text macro="description-review-genre-note"/>\n          <text macro="description-review-title"/>\n        </group>\n        <choose>\n          <if variable="reviewed-genre reviewed-title title">\n            <names variable="reviewed-author">\n              <label form="verb" suffix=" "/>\n              <name and="text" initialize="false"/>\n            </names>\n          </if>\n          <else-if variable="reviewed-genre"/>\n          <else>\n            <names variable="reviewed-author">\n              <label form="verb" suffix=" "/>\n              <name and="text" initialize="false"/>\n            </names>\n          </else>\n        </choose>\n        <text macro="source-event-place-first"/>\n      </group>\n      <text macro="label-section"/>\n    </group>\n  </macro>\n  <macro name="description-review-genre-bib">\n    <choose>\n      <if variable="reviewed-genre">\n        <group delimiter=" ">\n          <text macro="description-review-term-unsigned-bib"/>\n          <text variable="reviewed-genre"/>\n          <choose>\n            <if match="none" variable="reviewed-title">\n              <names variable="reviewed-author">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </group>\n      </if>\n      <else-if variable="number">\n        <text macro="description-review-term-unsigned-bib"/>\n      </else-if>\n      <!-- If no `reviewed-genre`, assume that `genre` is entered as \'Review of the book\' or similar -->\n      <else-if variable="genre">\n        <text text-case="capitalize-first" variable="genre"/>\n      </else-if>\n      <else>\n        <text macro="description-review-term-unsigned-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-genre-note">\n    <choose>\n      <if variable="reviewed-genre">\n        <group delimiter=" ">\n          <text macro="description-review-term-unsigned-note"/>\n          <text variable="reviewed-genre"/>\n          <choose>\n            <if match="none" variable="reviewed-title">\n              <names variable="reviewed-author">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </group>\n      </if>\n      <else-if variable="number">\n        <text macro="description-review-term-unsigned-note"/>\n      </else-if>\n      <!-- If no `reviewed-genre`, assume that `genre` is entered as \'Review of the book\' or similar -->\n      <else-if variable="genre">\n        <text variable="genre"/>\n      </else-if>\n      <else>\n        <text macro="description-review-term-unsigned-note"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-short">\n    <choose>\n      <if match="any" position="ibid ibid-with-locator">\n        <text term="review"/>\n      </if>\n      <else>\n        <group delimiter=" ">\n          <text term="review-of"/>\n          <text macro="description-review-title-short"/>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-term-unsigned-bib">\n    <!-- Anonymous reviews appear as \'unsigned\' (CMOS18 14.102) -->\n    <choose>\n      <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n        <text term="review-of" text-case="capitalize-first"/>\n      </if>\n      <else>\n        <group delimiter=" ">\n          <text term="anonymous" text-case="capitalize-first"/>\n          <text term="review-of"/>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-term-unsigned-note">\n    <!-- Anonymous reviews appear as \'unsigned\' (CMOS18 14.102) -->\n    <choose>\n      <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n        <text term="review-of"/>\n      </if>\n      <else>\n        <group delimiter=" ">\n          <text term="anonymous"/>\n          <text term="review-of"/>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-title">\n    <choose>\n      <if match="any" variable="reviewed-genre reviewed-title">\n        <!-- Not possible to distinguish TV series episode from other reviewed works without a reviewed source title -->\n        <!-- Adapt for `reviewed-container-title` or similar if it becomes available -->\n        <text font-style="italic" text-case="title" variable="reviewed-title"/>\n      </if>\n      <else>\n        <!-- Assume title is title of reviewed work -->\n        <text font-style="italic" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-review-title-short">\n    <choose>\n      <if match="any" variable="reviewed-genre reviewed-title">\n        <!-- Not possible to distinguish TV series episode from other reviewed works without a reviewed source title -->\n        <!-- Adapt for `reviewed-container-title` or similar if it becomes available -->\n        <text font-style="italic" form="short" text-case="title" variable="reviewed-title"/>\n      </if>\n      <else>\n        <!-- Assume title is title of reviewed work -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-serial-bib">\n    <group delimiter=". ">\n      <text macro="description-format-bib"/>\n      <!-- `section` provides magazine departments (CMOS18 14.88) and newspaper column names (CMOS18 14.93) -->\n      <text macro="label-section-capitalized"/>\n    </group>\n  </macro>\n  <macro name="description-serial-note">\n    <group delimiter=", ">\n      <text macro="description-format-note"/>\n      <!-- `section` provides magazine departments (CMOS18 14.88) and newspaper column names (CMOS18 14.93) -->\n      <text macro="label-section"/>\n    </group>\n  </macro>\n  <macro name="description-serial-short">\n    <choose>\n      <if variable="title"/>\n      <else-if variable="genre">\n        <text macro="description-format-short"/>\n      </else-if>\n      <else>\n        <text form="short" text-case="title" variable="section"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="description-song-bib">\n    <!-- Performer of classical music works -->\n    <!-- TODO: remove when Zotero fixes mapping of performer to `author` -->\n    <group delimiter=" ">\n      <!-- Based on `description-format` macro -->\n      <choose>\n        <if variable="genre">\n          <text text-case="capitalize-first" variable="genre"/>\n          <text form="verb" term="performer"/>\n        </if>\n        <!-- providing \'performed by\' label for recorded readings (CMOS18 14.164), but it should be omitted for classical music (CMOS18 14.163) -->\n        <else>\n          <text form="verb" term="performer" text-case="capitalize-first"/>\n        </else>\n      </choose>\n      <names variable="author">\n        <name and="text" initialize="false"/>\n        <substitute>\n          <names variable="performer"/>\n        </substitute>\n      </names>\n    </group>\n  </macro>\n  <macro name="description-song-note">\n    <!-- Performer of classical music works -->\n    <!-- TODO: remove when Zotero fixes mapping of performer to `author` -->\n    <group delimiter=" ">\n      <!-- Based on `description-format` macro -->\n      <choose>\n        <if variable="genre">\n          <text variable="genre"/>\n          <text form="verb" term="performer"/>\n        </if>\n        <!-- providing \'performed by\' label for recorded readings (CMOS18 14.164), but it should be omitted for classical music (CMOS18 14.163) -->\n        <else>\n          <text form="verb" term="performer"/>\n        </else>\n      </choose>\n      <names variable="author">\n        <name and="text" initialize="false"/>\n        <substitute>\n          <names variable="performer"/>\n        </substitute>\n      </names>\n    </group>\n  </macro>\n  <!-- 3.3. Identifier (edition, contributors, volume) -->\n  <macro name="identifier-bib">\n    <group delimiter=". ">\n      <choose>\n        <if type="patent">\n          <text macro="identifier-patent"/>\n        </if>\n        <else-if type="report">\n          <text macro="identifier-report-bib"/>\n        </else-if>\n        <else-if match="any" type="post webpage">\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n          <text macro="identifier-number-bib"/>\n          <text macro="label-version-capitalized"/>\n          <text macro="identifier-edition-bib"/>\n          <text macro="identifier-contributors-bib"/>\n        </else-if>\n        <else-if variable="container-title">\n          <choose>\n            <if match="any" type="broadcast graphic map motion_picture">\n              <!-- For audiovisual media, number information comes after `title`, not `container-title`; `song` places album catalogue `number` with `publisher` (CMOS18 14.163-164) -->\n              <text macro="identifier-number-bib"/>\n            </if>\n          </choose>\n          <text macro="identifier-contributors-bib"/>\n        </else-if>\n        <else>\n          <choose>\n            <if match="none" type="song">\n              <text macro="identifier-number-bib"/>\n            </if>\n          </choose>\n          <text macro="label-version-capitalized"/>\n          <text macro="identifier-edition-bib"/>\n          <text macro="identifier-contributors-and-volume-bib"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-note">\n    <group delimiter=", ">\n      <choose>\n        <if type="patent">\n          <text macro="identifier-patent"/>\n        </if>\n        <else-if type="report">\n          <text macro="identifier-report-note"/>\n        </else-if>\n        <else-if match="any" type="post webpage">\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n          <text macro="identifier-number-note"/>\n          <text macro="label-version"/>\n          <text macro="identifier-edition-note"/>\n          <text macro="identifier-contributors-note"/>\n        </else-if>\n        <else-if variable="container-title">\n          <choose>\n            <if match="any" type="broadcast graphic map motion_picture">\n              <!-- For audiovisual media, number information comes after `title`, not `container-title`; `song` places album catalogue `number` with `publisher` (CMOS18 14.163-164) -->\n              <text macro="identifier-number-note"/>\n            </if>\n          </choose>\n          <text macro="identifier-contributors-note"/>\n        </else-if>\n        <else>\n          <choose>\n            <if match="none" type="song">\n              <text macro="identifier-number-note"/>\n            </if>\n          </choose>\n          <text macro="label-version"/>\n          <text macro="identifier-edition-note"/>\n          <text macro="identifier-contributors-and-volume-note"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Identifier elements -->\n  <macro name="identifier-contributors-bib">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="identifier-contributors-serial-bib"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <text macro="identifier-contributors-monographic-bib"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <text macro="identifier-contributors-serial-bib"/>\n      </else-if>\n      <else>\n        <text macro="identifier-contributors-monographic-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-contributors-note">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="identifier-contributors-serial-note"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <text macro="identifier-contributors-monographic-note"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <text macro="identifier-contributors-serial-note"/>\n      </else-if>\n      <else>\n        <text macro="identifier-contributors-monographic-note"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-contributors-monographic-bib">\n    <group delimiter=". ">\n      <choose>\n        <if match="any" type="post webpage">\n          <names variable="container-author">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editor-translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="editor translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editorial-director">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="guest">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="host">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="illustrator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="narrator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="compiler chair organizer curator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="series-creator executive-producer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="producer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="director">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="any" type="broadcast performance">\n              <names variable="script-writer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="performer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" type="thesis">\n              <names variable="contributor">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </if>\n        <else>\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n          <choose>\n            <if match="none" variable="container-title">\n              <names variable="container-author">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="editor-translator">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names delimiter=". " variable="editor translator">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="editorial-director">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="guest">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="host">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="illustrator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="narrator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" variable="container-title">\n              <names delimiter=". " variable="compiler chair organizer curator">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names delimiter=". " variable="series-creator executive-producer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="producer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="director">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <choose>\n                <if match="any" type="broadcast performance">\n                  <names variable="script-writer">\n                    <label form="verb" suffix=" " text-case="capitalize-first"/>\n                    <name and="text" initialize="false"/>\n                  </names>\n                </if>\n              </choose>\n              <names variable="performer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n              <choose>\n                <if match="none" type="song thesis">\n                  <names variable="contributor">\n                    <label form="verb" suffix=" " text-case="capitalize-first"/>\n                    <name and="text" initialize="false"/>\n                  </names>\n                </if>\n              </choose>\n            </if>\n          </choose>\n          <choose>\n            <if type="song">\n              <!-- Song contributors attached to album (CMOS18 14.163) -->\n              <names variable="contributor">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-contributors-monographic-bib-multivolume">\n    <!-- lowercase for attachment to volume; otherwise identical to `identifier-contributors-monographic-bib` -->\n    <group delimiter=", ">\n      <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n      <choose>\n        <if match="none" variable="container-title">\n          <names variable="container-author">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editor-translator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="editor translator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editorial-director">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="guest">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="host">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n      </choose>\n      <names variable="illustrator">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="narrator">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <choose>\n        <if match="none" variable="container-title">\n          <names delimiter=", " variable="compiler chair organizer curator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="series-creator executive-producer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="producer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="director">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="any" type="broadcast performance">\n              <names variable="script-writer">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="performer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" type="song thesis">\n              <names variable="contributor">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </if>\n      </choose>\n      <choose>\n        <if type="song">\n          <!-- Song contributors attached to album (CMOS18 14.163) -->\n          <names variable="contributor">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-contributors-monographic-note">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="post webpage">\n          <names variable="container-author">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editor-translator">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="editor translator">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editorial-director">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="guest">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="host">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="illustrator">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="narrator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="compiler">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="chair organizer curator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="series-creator executive-producer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="producer">\n            <!-- not abbreviated (CMOS18 14.168) -->\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="director">\n            <!-- `director` is not abbreviated (CMOS18 14.165) -->\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="any" type="broadcast performance">\n              <names variable="script-writer">\n                <!-- `script-writer` is not abbreviated (CMOS18 14.165) -->\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="performer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" type="thesis">\n              <names variable="contributor">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </if>\n        <else>\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n          <choose>\n            <if match="none" variable="container-title">\n              <names variable="container-author">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="editor-translator">\n                <label form="verb-short" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names delimiter=", " variable="editor translator">\n                <label form="verb-short" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="editorial-director">\n                <label form="verb-short" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="guest">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="host">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names delimiter=", " variable="illustrator">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="narrator">\n            <!-- narrator is not abbreviated (CMOS18 14.58) -->\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" variable="container-title">\n              <names variable="compiler">\n                <label form="verb-short" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names delimiter=", " variable="chair organizer curator">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names delimiter=", " variable="series-creator executive-producer">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="producer">\n                <!-- not abbreviated (CMOS18 14.168) -->\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <names variable="director">\n                <!-- `director` is not abbreviated (CMOS18 14.165) -->\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <choose>\n                <if match="any" type="broadcast performance">\n                  <names variable="script-writer">\n                    <!-- `script-writer` is not abbreviated (CMOS18 14.165) -->\n                    <label form="verb" suffix=" "/>\n                    <name and="text" initialize="false"/>\n                  </names>\n                </if>\n              </choose>\n              <names variable="performer">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n              <choose>\n                <if match="none" type="song thesis">\n                  <names variable="contributor">\n                    <label form="verb" suffix=" "/>\n                    <name and="text" initialize="false"/>\n                  </names>\n                </if>\n              </choose>\n            </if>\n          </choose>\n          <choose>\n            <if type="song">\n              <!-- Song contributors attached to album (CMOS18 14.163) -->\n              <names variable="contributor">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-contributors-serial-bib">\n    <group delimiter=". ">\n      <names delimiter=". " variable="translator narrator">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names delimiter=". " variable="compiler chair organizer curator">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names delimiter=". " variable="series-creator executive-producer">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="producer">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="director">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="script-writer">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="performer">\n        <label form="verb" suffix=" " text-case="capitalize-first"/>\n        <name and="text" initialize="false"/>\n      </names>\n    </group>\n  </macro>\n  <macro name="identifier-contributors-serial-note">\n    <group delimiter=", ">\n      <names variable="translator">\n        <label form="verb-short" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="narrator">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names delimiter=", " variable="compiler chair organizer curator">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names delimiter=", " variable="series-creator executive-producer">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="producer">\n        <!-- not abbreviated (CMOS18 14.168) -->\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="director">\n        <!-- `director` is not abbreviated (CMOS18 14.165) -->\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="script-writer">\n        <!-- `script-writer` is not abbreviated (CMOS18 14.165) -->\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="performer">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n    </group>\n  </macro>\n  <macro name="identifier-contributors-and-volume-bib">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="identifier-contributors-serial-bib"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="identifier-contributors-and-volume-monographic-bib"/>\n        <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="identifier-contributors-and-volume-monographic-bib-specific-title-first"/> -->\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="identifier-contributors-serial-bib"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <text macro="identifier-contributors-and-volume-monographic-bib"/>\n        <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="identifier-contributors-and-volume-monographic-bib-specific-title-first"/> -->\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-contributors-and-volume-note">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="identifier-contributors-serial-note"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="identifier-contributors-and-volume-monographic-note"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="identifier-contributors-serial-note"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <text macro="identifier-contributors-and-volume-monographic-note"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-contributors-and-volume-monographic-bib">\n    <group delimiter=". ">\n      <choose>\n        <if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n          <!-- cite multivolume `collection-editor`; otherwise it belongs with `collection-title` -->\n          <names variable="collection-editor">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n      </choose>\n      <group delimiter=", ">\n        <text macro="identifier-volume-bib"/>\n        <choose>\n          <if match="any" variable="part-number part-title volume volume-title">\n            <text macro="identifier-contributors-monographic-bib-multivolume"/>\n          </if>\n        </choose>\n      </group>\n      <choose>\n        <if match="none" variable="part-number part-title volume volume-title">\n          <text macro="identifier-contributors-monographic-bib"/>\n          <text macro="label-number-of-volumes"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-contributors-and-volume-monographic-note">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n          <!-- cite multivolume `collection-editor`; otherwise it belongs with `collection-title` -->\n          <names variable="collection-editor">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n      </choose>\n      <text macro="identifier-volume-note"/>\n      <text macro="identifier-contributors-note"/>\n      <choose>\n        <!-- notes only show the number of volumes if there is no physical locator, which should include a volume number, e.g. 4:243 -->\n        <if match="any" variable="part-number part-title volume volume-title"/>\n        <else-if locator="column"/>\n        <else-if locator="folio"/>\n        <else-if locator="page"/>\n        <else>\n          <text macro="label-number-of-volumes"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-edition-bib">\n    <choose>\n      <!-- ensure `source-publication-history-bib` does not duplicate edition -->\n      <if variable="original-title">\n        <text macro="label-edition-capitalized"/>\n      </if>\n      <else-if variable="issued original-date"/>\n      <else>\n        <text macro="label-edition-capitalized"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-edition-note">\n    <choose>\n      <!-- ensure `source-publication-history-note` does not duplicate edition -->\n      <if variable="original-title">\n        <text macro="label-edition"/>\n      </if>\n      <else-if variable="issued original-date"/>\n      <else>\n        <text macro="label-edition"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="identifier-number-bib">\n    <group delimiter=" ">\n      <choose>\n        <if type="thesis"/>\n        <else-if is-numeric="number" type="broadcast" variable="genre">\n          <text text-case="capitalize-first" variable="genre"/>\n          <text variable="number"/>\n        </else-if>\n        <else-if is-numeric="number" type="broadcast">\n          <text text-case="capitalize-first" value="episode"/>\n          <text variable="number"/>\n        </else-if>\n        <else-if variable="number">\n          <text text-case="title" variable="genre"/>\n          <text macro="label-number-capitalized"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-number-note">\n    <group delimiter=" ">\n      <choose>\n        <if type="thesis"/>\n        <else-if is-numeric="number" type="broadcast" variable="genre">\n          <text variable="genre"/>\n          <text variable="number"/>\n        </else-if>\n        <else-if is-numeric="number" type="broadcast">\n          <text value="episode"/>\n          <text variable="number"/>\n        </else-if>\n        <else-if variable="number">\n          <text variable="genre"/>\n          <text macro="label-number"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-patent">\n    <group delimiter=", ">\n      <group delimiter=" ">\n        <!-- `authority`: US ; `genre`: patent ; `number`: 123,445 -->\n        <text form="short" variable="authority"/>\n        <!-- \'US Patent\' capitalized in both bibliography and note forms -->\n        <choose>\n          <if variable="genre">\n            <text text-case="capitalize-first" variable="genre"/>\n          </if>\n          <else>\n            <text term="patent" text-case="capitalize-first"/>\n          </else>\n        </choose>\n        <text variable="number"/>\n      </group>\n      <group delimiter=" ">\n        <text value="filed"/>\n        <date form="text" variable="submitted"/>\n      </group>\n      <group delimiter=" ">\n        <choose>\n          <if variable="issued submitted">\n            <text term="and"/>\n          </if>\n        </choose>\n        <text value="issued"/>\n        <!-- Always give full issue date, even in author-date (CMOS18 14.158) -->\n        <text macro="date-issued-full"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="identifier-report-bib">\n    <group delimiter=". ">\n      <choose>\n        <if variable="container-title">\n          <!-- If the report is a chapter in a larger report, then most identifying information is printed in the source. -->\n          <text macro="identifier-contributors-bib"/>\n        </if>\n        <else-if variable="title">\n          <text macro="identifier-number-bib"/>\n          <text macro="label-version-capitalized"/>\n          <text macro="identifier-edition-bib"/>\n          <text macro="identifier-contributors-and-volume-bib"/>\n        </else-if>\n        <else>\n          <!-- If there is no `title`, then `genre` and `number` are already printed as the title. -->\n          <text macro="label-version-capitalized"/>\n          <text macro="identifier-edition-bib"/>\n          <text macro="identifier-contributors-and-volume-bib"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-report-note">\n    <group delimiter=", ">\n      <choose>\n        <if variable="container-title">\n          <!-- If the report is a chapter in a larger report, then most identifying information is printed in the source. -->\n          <text macro="identifier-contributors-note"/>\n        </if>\n        <else-if variable="title">\n          <text macro="identifier-number-note"/>\n          <text macro="label-version"/>\n          <text macro="identifier-edition-note"/>\n          <text macro="identifier-contributors-and-volume-note"/>\n        </else-if>\n        <else>\n          <!-- If there is no `title`, then `genre` and `number` are already printed as the title. -->\n          <text macro="label-version"/>\n          <text macro="identifier-edition-note"/>\n          <text macro="identifier-contributors-and-volume-note"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-volume-bib">\n    <!-- In notes styles, bibliography entries may be listed beginning with either the general title of the multivolume set or that of the individual volume; the former approach is listed first, but the latter is required in author-date (CMOS18 14.21) -->\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="volume volume-title">\n          <!-- if there is a volume or volume title, the part number is not capitalized -->\n          <text macro="label-volume-capitalized"/>\n          <text macro="title-volume"/>\n          <text macro="label-part-number"/>\n          <text macro="title-part"/>\n        </if>\n        <else-if match="any" variable="part-number part-title">\n          <text macro="label-part-number-capitalized"/>\n          <text macro="title-part"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="identifier-volume-note">\n    <!-- List the general title first in the notes (CMOS18 14.20) -->\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="part-number part-title volume-title">\n          <text macro="label-volume"/>\n          <text macro="title-volume"/>\n          <text macro="label-part-number"/>\n          <text macro="title-part"/>\n        </if>\n        <else-if is-numeric="volume" locator="page">\n          <!-- provide lone `volume` only if it does not appear in `source-monographic-locator-note` (CMOS18 14.20) -->\n          <choose>\n            <!-- check for variables that might come between the volume and page number -->\n            <if match="any" variable="part-number part-title volume-title">\n              <text macro="label-volume"/>\n            </if>\n            <else-if match="any" variable="container-author editor editor-translator translator">\n              <text macro="label-volume"/>\n            </else-if>\n          </choose>\n        </else-if>\n        <else-if is-numeric="volume" variable="page">\n          <choose>\n            <if match="any" variable="part-number part-title volume-title">\n              <text macro="label-volume"/>\n            </if>\n            <else-if match="any" variable="container-author editor editor-translator translator">\n              <text macro="label-volume"/>\n            </else-if>\n            <else-if variable="container-title">\n              <!-- remove condition in styles that print chapter page numbers (CMOS17/classic) -->\n              <text macro="label-volume"/>\n            </else-if>\n          </choose>\n        </else-if>\n        <else-if variable="volume">\n          <text macro="label-volume"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4. Source -->\n  <macro name="source-bib">\n    <choose>\n      <if match="any" type="patent post webpage"/>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="source-serial-bib"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <text macro="source-monographic-bib"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <text macro="source-serial-bib"/>\n      </else-if>\n      <else>\n        <text macro="source-monographic-bib"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-note">\n    <choose>\n      <if match="any" type="patent post webpage"/>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="source-serial-note"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <text macro="source-monographic-note"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <text macro="source-serial-note"/>\n      </else-if>\n      <else>\n        <text macro="source-monographic-note"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.1. Serial sources -->\n  <macro name="source-serial-bib">\n    <group delimiter=". ">\n      <text macro="source-serial-title-volume-bib"/>\n      <choose>\n        <if match="any" type="article-magazine article-newspaper">\n          <!-- magazines and newspapers provide the full date in place of volume/issue numbers (CMOS18 14.87, 14.89) -->\n          <group delimiter=", ">\n            <text macro="source-serial-title-bib"/>\n            <text macro="source-serial-identifier-bib"/>\n          </group>\n        </if>\n        <else-if variable="collection-title volume">\n          <group delimiter=", ">\n            <text macro="source-serial-title-bib"/>\n            <text macro="source-serial-identifier-bib"/>\n          </group>\n        </else-if>\n        <else-if variable="volume">\n          <group delimiter=" ">\n            <text macro="source-serial-title-bib"/>\n            <text macro="source-serial-identifier-bib"/>\n          </group>\n        </else-if>\n        <else>\n          <group delimiter=", ">\n            <text macro="source-serial-title-bib"/>\n            <text macro="source-serial-identifier-bib"/>\n          </group>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-note">\n    <group delimiter=", ">\n      <text macro="source-serial-title-volume-note"/>\n      <choose>\n        <if match="any" type="article-magazine article-newspaper">\n          <!-- magazines and newspapers provide the full date in place of volume/issue numbers (CMOS18 14.87, 14.89) -->\n          <group delimiter=", ">\n            <text macro="source-serial-title-note"/>\n            <text macro="source-serial-identifier-note"/>\n          </group>\n        </if>\n        <else-if variable="collection-title volume">\n          <group delimiter=", ">\n            <text macro="source-serial-title-note"/>\n            <text macro="source-serial-identifier-note"/>\n          </group>\n        </else-if>\n        <else-if variable="volume">\n          <group delimiter=" ">\n            <text macro="source-serial-title-note"/>\n            <text macro="source-serial-identifier-note"/>\n          </group>\n        </else-if>\n        <else>\n          <group delimiter=", ">\n            <text macro="source-serial-title-note"/>\n            <text macro="source-serial-identifier-note"/>\n          </group>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Serial source title -->\n  <macro name="source-serial-name">\n    <group delimiter=" ">\n      <text font-style="italic" text-case="title" variable="container-title"/>\n      <choose>\n        <!-- TODO: remove conditional when Zotero stops double-mapping `event-place` and `publisher-place` -->\n        <if match="none" variable="event-date event-title">\n          <text prefix="(" suffix=")" variable="publisher-place"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-title-bib">\n    <group delimiter=", ">\n      <choose>\n        <!-- Journal special issues (CMOS18 14.77) and supplements (CMOS18 14.78) -->\n        <if match="none" variable="container-title"/>\n        <else-if match="none" type="periodical" variable="supplement-number volume-title"/>\n        <!-- TODO: use `container-genre` here once available to allow a custom description of the journal volume -->\n        <else-if variable="supplement-number volume-title">\n          <text term="supplement" text-case="capitalize-first"/>\n        </else-if>\n        <else-if type="periodical" variable="supplement-number title">\n          <text term="supplement" text-case="capitalize-first"/>\n        </else-if>\n        <else-if variable="volume-title">\n          <text term="special-issue" text-case="capitalize-first"/>\n        </else-if>\n        <else-if type="periodical" variable="title">\n          <text term="special-issue" text-case="capitalize-first"/>\n        </else-if>\n      </choose>\n      <text macro="source-serial-name"/>\n      <choose>\n        <!-- \'ahead of print\' is placed akin to a series (CMOS18 14.75) -->\n        <if match="any" variable="collection-title issue number page supplement-number volume volume-title"/>\n        <else-if match="any" variable="available-date status"/>\n        <else-if type="article-journal" variable="DOI issued">\n          <text term="advance-online-publication"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-title-note">\n    <group delimiter=", ">\n      <choose>\n        <!-- Journal special issues (CMOS18 14.77) and supplements (CMOS18 14.78) -->\n        <if match="none" variable="container-title"/>\n        <else-if match="none" type="periodical" variable="supplement-number volume-title"/>\n        <!-- TODO: use `container-genre` here once available to allow a custom description of the journal volume -->\n        <else-if variable="supplement-number volume-title">\n          <text term="supplement"/>\n        </else-if>\n        <else-if type="periodical" variable="supplement-number title">\n          <text term="supplement"/>\n        </else-if>\n        <else-if variable="volume-title">\n          <text term="special-issue"/>\n        </else-if>\n        <else-if type="periodical" variable="title">\n          <text term="special-issue"/>\n        </else-if>\n      </choose>\n      <text macro="source-serial-name"/>\n      <choose>\n        <!-- \'ahead of print\' is placed akin to a series (CMOS18 14.75) -->\n        <if match="any" variable="collection-title issue number page supplement-number volume volume-title"/>\n        <else-if match="any" variable="available-date status"/>\n        <else-if type="article-journal" variable="DOI issued">\n          <text term="advance-online-publication"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-title-volume-bib">\n    <choose>\n      <if variable="volume-title">\n        <!-- Journal special issues (CMOS18 14.77) and supplements (CMOS18 14.78) -->\n        <group delimiter=", ">\n          <group delimiter=" ">\n            <text macro="source-monographic-preposition-bib"/>\n            <text macro="title-volume"/>\n          </group>\n          <text macro="source-monographic-identifier-contributors-bib"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-serial-title-volume-note">\n    <choose>\n      <if variable="volume-title">\n        <!-- Journal special issues (CMOS18 14.77) and supplements (CMOS18 14.78) -->\n        <group delimiter=", ">\n          <group delimiter=" ">\n            <text macro="source-monographic-preposition-note"/>\n            <text macro="title-volume"/>\n          </group>\n          <text macro="source-monographic-identifier-contributors-note"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <!-- Serial source identifier -->\n  <macro name="source-serial-identifier-bib">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="article-magazine article-newspaper">\n          <group delimiter=". ">\n            <text macro="source-serial-identifier-volume-bib"/>\n            <!-- for author-date: -->\n            <!-- <text macro="source-serial-identifier-volume-author-date"/> -->\n            <!-- newspaper edition always capitalized (CMOS18 14.89) -->\n            <text macro="label-edition-capitalized"/>\n          </group>\n          <text macro="source-serial-locator"/>\n        </if>\n        <else-if match="any" variable="issue supplement-number volume">\n          <group delimiter=": ">\n            <text macro="source-serial-identifier-volume-bib"/>\n            <!-- for author-date: -->\n            <!-- <text macro="source-serial-identifier-volume-author-date"/> -->\n            <text macro="source-serial-locator"/>\n          </group>\n        </else-if>\n        <else>\n          <text macro="source-serial-identifier-volume-bib"/>\n          <!-- for author-date: -->\n          <!-- <text macro="source-serial-identifier-volume-author-date"/> -->\n          <text macro="source-serial-locator"/>\n        </else>\n        <!-- TODO: If CSL adds `date-part` detection, add two further conditions to address CMOS18 14.74: delimiting with ":" if there is a `volume` and no month or `issue` or `supplement number`; delimiting with ", " or there is an `issue` or `supplement number` and no month -->\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-identifier-note">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="article-magazine article-newspaper">\n          <group delimiter=", ">\n            <text macro="source-serial-identifier-volume-note"/>\n            <!-- newspaper edition always capitalized (CMOS18 14.89) -->\n            <text macro="label-edition-capitalized"/>\n          </group>\n          <text macro="source-serial-locator"/>\n        </if>\n        <else-if match="any" variable="issue supplement-number volume">\n          <group delimiter=": ">\n            <text macro="source-serial-identifier-volume-note"/>\n            <text macro="source-serial-locator"/>\n          </group>\n        </else-if>\n        <else>\n          <text macro="source-serial-identifier-volume-note"/>\n          <text macro="source-serial-locator"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-identifier-volume-bib">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="article-magazine article-newspaper">\n          <!-- magazines and newspapers provide the full date in place of volume/issue numbers (CMOS18 14.87, 14.89) -->\n          <text variable="collection-title"/>\n          <text macro="source-serial-volume-status-bib"/>\n        </if>\n        <else-if match="any" variable="issue supplement-number volume">\n          <choose>\n            <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator"/>\n            <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n              <!-- date appears first if the review `container-title` has been substituted for a missing author (CMOS18 14.87, 14.102) -->\n              <text macro="source-date-issued-or-status"/>\n            </else-if>\n          </choose>\n          <!-- `collection-title` is for any serial with multiple series (e.g. \'second series\') -->\n          <text variable="collection-title"/>\n          <group delimiter=" ">\n            <group delimiter=", ">\n              <choose>\n                <if variable="collection-title volume">\n                  <text macro="label-volume"/>\n                </if>\n                <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n                  <!-- date appears first if a review `container-title` has been substituted for a missing author (CMOS18 14.87, 14.102) -->\n                  <choose>\n                    <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n                      <text variable="volume"/>\n                    </if>\n                    <else>\n                      <text macro="label-volume"/>\n                    </else>\n                  </choose>\n                </else-if>\n                <else>\n                  <text variable="volume"/>\n                </else>\n              </choose>\n              <text macro="label-issue"/>\n              <text macro="label-supplement-number"/>\n            </group>\n            <choose>\n              <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n                <!-- date for unsigned reviews only appears here if it did not earlier (CMOS18 14.102) -->\n                <choose>\n                  <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n                    <text macro="source-date-issued-or-status" prefix="(" suffix=")"/>\n                  </if>\n                </choose>\n              </if>\n              <else>\n                <text macro="source-date-issued-or-status" prefix="(" suffix=")"/>\n              </else>\n            </choose>\n          </group>\n        </else-if>\n        <else>\n          <text variable="collection-title"/>\n          <choose>\n            <if match="any" type="interview post-weblog">\n              <!-- publisher possible with broadcast `interview` (CMOS18 14.110) or `post-weblog` (CMOS18 14.105) -->\n              <text variable="publisher"/>\n            </if>\n          </choose>\n          <text macro="source-serial-volume-status-bib"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-identifier-volume-note">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="article-magazine article-newspaper">\n          <!-- magazines and newspapers provide the full date in place of volume/issue numbers (CMOS18 14.87, 14.89) -->\n          <text variable="collection-title"/>\n          <text macro="source-serial-volume-status-note"/>\n        </if>\n        <else-if match="any" variable="issue supplement-number volume">\n          <choose>\n            <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n              <choose>\n                <!-- date appears first if a review `container-title` has been substituted for a missing author (CMOS18 14.89) -->\n                <!-- the conditions below mirror substitution in `author-note` -->\n                <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator"/>\n                <else-if match="any" variable="reviewed-genre reviewed-title title"/>\n                <else-if match="any" variable="genre section">\n                  <text macro="source-date-issued-or-status"/>\n                </else-if>\n              </choose>\n            </if>\n          </choose>\n          <!-- `collection-title` is for any serial with multiple series (e.g. \'second series\') -->\n          <text variable="collection-title"/>\n          <group delimiter=" ">\n            <group delimiter=", ">\n              <choose>\n                <if variable="collection-title volume">\n                  <text macro="label-volume"/>\n                </if>\n                <else-if variable="volume">\n                  <choose>\n                    <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n                      <!-- date appears first if a review `container-title` has been substituted for a missing author (CMOS18 14.89) -->\n                      <choose>\n                        <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n                          <text variable="volume"/>\n                        </if>\n                        <else-if match="any" variable="reviewed-genre reviewed-title title">\n                          <text variable="volume"/>\n                        </else-if>\n                        <else-if match="any" variable="genre section">\n                          <text macro="label-volume"/>\n                        </else-if>\n                        <else>\n                          <text variable="volume"/>\n                        </else>\n                      </choose>\n                    </if>\n                    <else>\n                      <text variable="volume"/>\n                    </else>\n                  </choose>\n                </else-if>\n              </choose>\n              <text macro="label-issue"/>\n              <text macro="label-supplement-number"/>\n            </group>\n            <choose>\n              <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n                <!-- date appears first if a review `container-title` has been substituted for a missing author (CMOS18 14.89) -->\n                <choose>\n                  <if match="any" variable="author chair collection-editor compiler composer curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n                    <text macro="source-date-issued-or-status" prefix="(" suffix=")"/>\n                  </if>\n                  <else-if match="any" variable="reviewed-genre reviewed-title title">\n                    <text macro="source-date-issued-or-status" prefix="(" suffix=")"/>\n                  </else-if>\n                  <else-if match="any" variable="genre section"/>\n                  <else>\n                    <text macro="source-date-issued-or-status" prefix="(" suffix=")"/>\n                  </else>\n                </choose>\n              </if>\n              <else>\n                <text macro="source-date-issued-or-status" prefix="(" suffix=")"/>\n              </else>\n            </choose>\n          </group>\n        </else-if>\n        <else>\n          <text variable="collection-title"/>\n          <choose>\n            <if match="any" type="interview post-weblog">\n              <!-- publisher possible with broadcast `interview` (CMOS18 14.110) or `post-weblog` (CMOS18 14.105) -->\n              <text variable="publisher"/>\n            </if>\n          </choose>\n          <text macro="source-serial-volume-status-note"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-serial-volume-status-bib">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="collection-title issue number page supplement-number volume volume-title"/>\n        <else-if variable="issued"/>\n        <else-if variable="available-date">\n          <group delimiter=" ">\n            <!-- article accepted for publication and available on publisher website (CMOS18 14.75) -->\n            <!-- TODO: use CSL term for `available-date` when available -->\n            <text value="accepted"/>\n            <date form="text" variable="available-date"/>\n          </group>\n        </else-if>\n      </choose>\n      <group delimiter=" ">\n        <text macro="source-date-status-bib"/>\n        <text macro="source-date-issued-or-status"/>\n        <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="source-date-specific-title-first"/> -->\n      </group>\n    </group>\n  </macro>\n  <macro name="source-serial-volume-status-note">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="collection-title issue number page supplement-number volume volume-title"/>\n        <else-if variable="issued"/>\n        <else-if variable="available-date">\n          <group delimiter=" ">\n            <!-- article accepted for publication and available on publisher website (CMOS18 14.75) -->\n            <!-- TODO: use CSL term for `available-date` when available -->\n            <text value="accepted"/>\n            <date form="text" variable="available-date"/>\n          </group>\n        </else-if>\n      </choose>\n      <group delimiter=" ">\n        <text macro="source-date-status-note"/>\n        <text macro="source-date-issued-or-status"/>\n      </group>\n    </group>\n  </macro>\n  <!-- Serial source locator -->\n  <macro name="source-serial-locator">\n    <choose>\n      <if match="any" variable="locator number">\n        <group delimiter=", ">\n          <text macro="label-locator"/>\n          <!-- an article ID appears alongside locators in notes (CMOS18 14.71) -->\n          <choose>\n            <!-- if there is an `archive` with no other reference, `number` appears in `source-archive-database-number` -->\n            <if match="any" variable="archive_collection archive_location archive-place">\n              <text variable="number"/>\n            </if>\n            <else-if variable="archive"/>\n            <else>\n              <text variable="number"/>\n            </else>\n          </choose>\n        </group>\n      </if>\n      <!-- do not give pages for magazines or newspapers (CMOS18 14.87, 14.89) -->\n      <else-if match="any" type="article-magazine article-newspaper"/>\n      <else>\n        <text variable="page"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.2. Monographic sources -->\n  <macro name="source-monographic-bib">\n    <group delimiter=". ">\n      <!-- Monographic sources repeat main reference elements -->\n      <choose>\n        <if variable="container-title">\n          <group delimiter=", ">\n            <group delimiter=" ">\n              <text macro="source-monographic-preposition-bib"/>\n              <text font-style="italic" text-case="title" variable="container-title"/>\n              <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21): -->\n              <!-- <text macro="source-monographic-title-specific-title-first"/> -->\n            </group>\n            <text macro="source-monographic-description"/>\n            <text macro="source-monographic-identifier-bib"/>\n            <text macro="source-monographic-locator"/>\n          </group>\n        </if>\n      </choose>\n      <text macro="source-monographic-identifier-contributors-bib-container-author"/>\n      <text macro="source-series-bib"/>\n      <choose>\n        <!-- show event information here only if not collapsed with `issued` (CMOS18 14.167) -->\n        <if match="any" variable="event-date original-date original-publisher original-publisher-place publisher status">\n          <text macro="source-event-bib"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-monographic-note">\n    <group delimiter=", ">\n      <!-- Monographic sources repeat main reference elements -->\n      <choose>\n        <if variable="container-title">\n          <group delimiter=", ">\n            <group delimiter=" ">\n              <text macro="source-monographic-preposition-note"/>\n              <text font-style="italic" text-case="title" variable="container-title"/>\n            </group>\n            <text macro="source-monographic-description"/>\n            <text macro="source-monographic-identifier-note"/>\n            <!-- no `source-monographic-locator` in note -->\n          </group>\n        </if>\n      </choose>\n      <text macro="source-series-note"/>\n      <text macro="source-event-note"/>\n    </group>\n  </macro>\n  <!-- Monographic source title -->\n  <macro name="source-monographic-preposition-bib">\n    <choose>\n      <if match="any" type="broadcast motion_picture"/>\n      <else-if type="chapter" variable="container-title genre">\n        <text value="to"/>\n      </else-if>\n      <else-if type="article-journal" variable="container-title genre volume-title">\n        <text value="to"/>\n      </else-if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="author composer">\n            <!-- Give preposition only for signed entries; otherwise, title is substituted -->\n            <text term="in" text-case="capitalize-first"/>\n          </if>\n        </choose>\n      </else-if>\n      <!-- if printing chapter page numbers (CMOS17/classic):\n      <else-if variable="chapter-number page title"><text term="in" text-case="capitalize-first"/></else-if>\n      -->\n      <else-if variable="chapter-number">\n        <group delimiter=" ">\n          <text macro="label-chapter-number-capitalized"/>\n          <choose>\n            <if type="song">\n              <text term="on"/>\n            </if>\n            <else>\n              <text term="in"/>\n            </else>\n          </choose>\n        </group>\n      </else-if>\n      <else>\n        <text term="in" text-case="capitalize-first"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-monographic-preposition-note">\n    <choose>\n      <if match="any" type="broadcast motion_picture"/>\n      <else-if type="chapter" variable="container-title genre">\n        <text value="to"/>\n      </else-if>\n      <else-if type="article-journal" variable="container-title genre volume-title">\n        <text value="to"/>\n      </else-if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="author composer">\n            <!-- Give preposition only for signed entries; otherwise, title is substituted -->\n            <text term="in"/>\n          </if>\n        </choose>\n      </else-if>\n      <!-- if printing chapter page numbers (CMOS17/classic):\n      <else-if variable="chapter-number page title"><text term="in"/></else-if>\n      -->\n      <else-if variable="chapter-number">\n        <group delimiter=" ">\n          <text macro="label-chapter-number"/>\n          <choose>\n            <if type="song">\n              <text term="on"/>\n            </if>\n            <else>\n              <text term="in"/>\n            </else>\n          </choose>\n        </group>\n      </else-if>\n      <else>\n        <text term="in"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Monographic source description -->\n  <macro name="source-monographic-description">\n    <choose>\n      <if match="any" type="document report software standard">\n        <!-- place description after `container-title` -->\n        <text macro="description-format-note"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume"/>\n      <else-if match="any" type="event paper-conference performance speech">\n        <!-- unpublished conference presentations should describe the session -->\n        <text macro="description-format-note"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- Monographic source identifier -->\n  <macro name="source-monographic-identifier-bib">\n    <!-- Based on `identifier-bib` -->\n    <choose>\n      <if variable="container-title">\n        <group delimiter=", ">\n          <choose>\n            <if match="none" type="broadcast graphic map motion_picture song">\n              <!-- For audiovisual media, number information comes after `title`, not `container-title`; `song` places album catalogue `number` with `publisher` (CMOS18 14.163-164) -->\n              <text macro="identifier-number-bib"/>\n            </if>\n          </choose>\n          <text macro="label-version"/>\n          <!-- use note form as `edition` is not capitalized here -->\n          <text macro="identifier-edition-note"/>\n          <text macro="source-monographic-identifier-contributors-and-volume-bib"/>\n          <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21): -->\n          <!-- <text macro="source-monographic-identifier-contributors-and-volume-bib-specific-title-first"/> -->\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-monographic-identifier-note">\n    <!-- Based on `identifier-note` -->\n    <choose>\n      <if variable="container-title">\n        <group delimiter=", ">\n          <choose>\n            <if match="none" type="broadcast graphic map motion_picture song">\n              <!-- For audiovisual media, number information comes after `title`, not `container-title`; `song` places album catalogue `number` with `publisher` (CMOS18 14.163-164) -->\n              <text macro="identifier-number-note"/>\n            </if>\n          </choose>\n          <text macro="label-version"/>\n          <text macro="identifier-edition-note"/>\n          <text macro="source-monographic-identifier-contributors-and-volume-note"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-monographic-identifier-contributors-bib">\n    <choose>\n      <if variable="container-author container-title">\n        <!-- set off `container-author` from other contributors in the bibliography (CMOS18 14.12; for page location, CMOS17 14.110) -->\n        <names variable="container-author">\n          <label form="verb" suffix=" "/>\n          <name and="text" initialize="false"/>\n        </names>\n        <!-- other contributors shift to `source-monographic-identifier-contributors-bib-container-author` -->\n      </if>\n      <else>\n        <group delimiter=", ">\n          <names variable="editor-translator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="editor translator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="guest">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="host">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="chair organizer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="illustrator narrator compiler curator">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=", " variable="series-creator executive-producer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="producer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editorial-director">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="any" type="broadcast performance">\n              <names variable="script-writer">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="director">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="performer">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" type="song thesis">\n              <!-- Song contributors attached to album (CMOS18 14.163) -->\n              <names variable="contributor">\n                <label form="verb" suffix=" "/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-monographic-identifier-contributors-bib-container-author">\n    <!-- set off `container-author` from other contributors in the bibliography (CMOS18 14.12; for page location, CMOS17 14.110) -->\n    <choose>\n      <if variable="container-author container-title">\n        <group delimiter=". ">\n          <names variable="editor-translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="editor translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="guest">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="host">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="chair organizer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="illustrator narrator compiler curator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names delimiter=". " variable="series-creator executive-producer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="producer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="editorial-director">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="any" type="broadcast performance">\n              <names variable="script-writer">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n          <names variable="director">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <names variable="performer">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name and="text" initialize="false"/>\n          </names>\n          <choose>\n            <if match="none" type="song thesis">\n              <!-- Song contributors attached to album (CMOS18 14.163) -->\n              <names variable="contributor">\n                <label form="verb" suffix=" " text-case="capitalize-first"/>\n                <name and="text" initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-monographic-identifier-contributors-note">\n    <group delimiter=", ">\n      <names variable="container-author">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="editor-translator">\n        <label form="verb-short" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names delimiter=", " variable="editor translator">\n        <label form="verb-short" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="guest">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="host">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names delimiter=", " variable="chair organizer">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="illustrator">\n        <label form="verb-short" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="narrator">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="compiler">\n        <label form="verb-short" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="curator">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names delimiter=", " variable="series-creator executive-producer">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="producer">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="editorial-director">\n        <label form="verb-short" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <choose>\n        <if match="any" type="broadcast performance">\n          <names variable="script-writer">\n            <!-- `script-writer` is not abbreviated (CMOS18 14.165) -->\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n      </choose>\n      <names variable="director">\n        <!-- `director` is not abbreviated (CMOS18 14.165) -->\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <names variable="performer">\n        <label form="verb" suffix=" "/>\n        <name and="text" initialize="false"/>\n      </names>\n      <choose>\n        <if match="none" type="song thesis">\n          <!-- Song contributors attached to album (CMOS18 14.163) -->\n          <names variable="contributor">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-monographic-identifier-contributors-and-volume-bib">\n    <!-- based on `identifier-contributors-and-volume-monographic-bib` -->\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="number-of-volumes part-number part-number volume volume-title">\n          <!-- cite multivolume `collection-editor`; otherwise it belongs with `collection-title` -->\n          <names variable="collection-editor">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n      </choose>\n      <!-- use the note form for an item with `container-title` -->\n      <text macro="identifier-volume-note"/>\n      <text macro="source-monographic-identifier-contributors-bib"/>\n      <choose>\n        <if match="any" variable="part-number part-title volume volume-title"/>\n        <else-if variable="page"/>\n        <else>\n          <text macro="label-number-of-volumes"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-monographic-identifier-contributors-and-volume-note">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n          <!-- cite multivolume `collection-editor`; otherwise it belongs with `collection-title` -->\n          <names variable="collection-editor">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n        </if>\n      </choose>\n      <text macro="identifier-volume-note"/>\n      <text macro="source-monographic-identifier-contributors-note"/>\n      <choose>\n        <!-- notes only show the number of volumes if there is no physical locator, which should include a volume number, e.g. 4:243 -->\n        <if match="any" variable="part-number part-title volume volume-title"/>\n        <else-if locator="column"/>\n        <else-if locator="folio"/>\n        <else-if locator="page"/>\n        <else-if variable="page"/>\n        <else>\n          <text macro="label-number-of-volumes"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Monographic source locator -->\n  <macro name="source-monographic-locator">\n    <choose>\n      <!-- archival locators appear after the shelfmark (CMOS18 14.127) -->\n      <if locator="column" variable="archive archive_location"/>\n      <else-if locator="folio" variable="archive archive_location"/>\n      <else-if locator="page" variable="archive archive_location"/>\n      <else-if is-numeric="volume" locator="page">\n        <!-- separate a volume and page number with a colon (CMOS18 14.18) -->\n        <group delimiter=":">\n          <choose>\n            <if match="any" variable="part-number part-title volume-title"/>\n            <else-if match="any" variable="container-author editor editor-translator translator"/>\n            <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21), check for name variables falling after the general title: -->\n            <!-- <else-if variable="collection-editor"/> -->\n            <else>\n              <text variable="volume"/>\n            </else>\n          </choose>\n          <text variable="locator"/>\n        </group>\n      </else-if>\n      <else-if variable="locator">\n        <text macro="label-locator"/>\n      </else-if>\n      <!-- remove `container-title` condition in styles that print chapter page numbers (CMOS17/classic) -->\n      <else-if variable="container-title"/>\n      <else-if is-numeric="volume" variable="page">\n        <!-- collapse the volume and page number if adjacent (CMOS18 14.18) -->\n        <group delimiter=":">\n          <choose>\n            <!-- check for variables that might come between the volume and page number -->\n            <if match="any" variable="part-number part-title volume-title"/>\n            <else-if match="any" variable="container-author editor editor-translator translator"/>\n            <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21), check for name variables falling after the general title: -->\n            <!-- <else-if variable="collection-editor"/> -->\n            <else>\n              <text variable="volume"/>\n            </else>\n          </choose>\n          <text variable="page"/>\n        </group>\n      </else-if>\n      <!-- archival locators appear after the shelfmark (CMOS18 14.127) -->\n      <else-if variable="archive archive_location page"/>\n      <else>\n        <text variable="page"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.3. Series -->\n  <macro name="source-series-bib">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n          <text macro="source-series-title"/>\n        </if>\n        <else-if variable="collection-editor collection-title">\n          <!-- `collection-editor` belongs with `collection-title` if the item is not multivolume -->\n          <text text-case="title" variable="collection-title"/>\n          <names variable="collection-editor">\n            <label form="verb" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <text macro="label-collection-number"/>\n          <text macro="label-issue"/>\n        </else-if>\n        <else>\n          <text macro="source-series-title"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-series-note">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="number-of-volumes part-number part-title volume volume-title">\n          <text macro="source-series-title"/>\n        </if>\n        <else-if variable="collection-editor collection-title">\n          <!-- `collection-editor` belongs with `collection-title` if the item is not multivolume -->\n          <text text-case="title" variable="collection-title"/>\n          <names variable="collection-editor">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" initialize="false"/>\n          </names>\n          <text macro="label-collection-number"/>\n          <text macro="label-issue"/>\n        </else-if>\n        <else>\n          <text macro="source-series-title"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-series-title">\n    <group delimiter=", ">\n      <choose>\n        <if variable="issue">\n          <text text-case="title" variable="collection-title"/>\n          <text macro="label-collection-number"/>\n          <text macro="label-issue"/>\n        </if>\n        <else-if is-numeric="collection-number" variable="collection-title">\n          <group delimiter=" ">\n            <text text-case="title" variable="collection-title"/>\n            <text variable="collection-number"/>\n          </group>\n        </else-if>\n        <else-if variable="collection-title">\n          <text text-case="title" variable="collection-title"/>\n          <text variable="collection-number"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4.4. Event -->\n  <macro name="source-event-bib">\n    <group delimiter=" ">\n      <choose>\n        <!-- omit types that provide event information in description  -->\n        <if match="any" type="interview" variable="interviewer"/>\n        <else-if type="personal_communication" variable="recipient"/>\n        <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title"/>\n        <else-if match="any" variable="event event-date event-title">\n          <!-- TODO: To prevent Zotero from printing `event-place`, due to its double-mapping of `publisher-place` and `event-place`. Remove this when that is changed. -->\n          <choose>\n            <if type="paper-conference">\n              <choose>\n                <if match="none" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n                  <!-- Don\'t print event info for conference papers published in proceedings -->\n                  <text macro="source-event-status-bib"/>\n                  <text macro="source-event-description-bib"/>\n                </if>\n              </choose>\n            </if>\n            <else>\n              <!-- For other item types, print event info even if published (e.g. collection catalogs, performance programs). -->\n              <text macro="source-event-status-bib"/>\n              <text macro="source-event-description-bib"/>\n            </else>\n          </choose>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-event-note">\n    <group delimiter=" ">\n      <choose>\n        <!-- omit types that provide event information in description  -->\n        <if match="any" type="interview" variable="interviewer"/>\n        <else-if type="personal_communication" variable="recipient"/>\n        <else-if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title"/>\n        <else-if match="any" variable="event event-date event-title">\n          <!-- TODO: To prevent Zotero from printing `event-place`, due to its double-mapping of `publisher-place` and `event-place`. Remove this when that is changed. -->\n          <choose>\n            <if type="paper-conference">\n              <choose>\n                <if match="none" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n                  <!-- Don\'t print event info for conference papers published in proceedings -->\n                  <text macro="source-event-status-note"/>\n                  <text macro="source-event-description-note"/>\n                </if>\n              </choose>\n            </if>\n            <else>\n              <!-- For other item types, print event info even if published (e.g. collection catalogs, performance programs). -->\n              <text macro="source-event-status-note"/>\n              <text macro="source-event-description-note"/>\n            </else>\n          </choose>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-event-place-first">\n    <!-- for descriptive elements for interviews, reviews, letters -->\n    <choose>\n      <if match="any" variable="event event-date event-title">\n        <group delimiter=", ">\n          <text variable="event-title"/>\n          <text variable="event-place"/>\n          <text macro="date-event-full"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-event-status-bib">\n    <group delimiter=" ">\n      <choose>\n        <if type="broadcast" variable="status">\n          <!-- \'aired\', \'performed\', etc. (CMOS18 14.165) -->\n          <text text-case="capitalize-first" variable="status"/>\n        </if>\n        <else-if type="paper-conference">\n          <choose>\n            <if variable="genre">\n              <text text-case="capitalize-first" value="presented"/>\n            </if>\n            <else>\n              <text form="short" term="paper-conference" text-case="capitalize-first"/>\n              <text value="presented"/>\n            </else>\n          </choose>\n          <choose>\n            <if variable="event-title">\n              <text term="at"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if type="song">\n          <text text-case="capitalize-first" value="recorded"/>\n          <choose>\n            <if variable="event-title">\n              <text term="at"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if variable="event-date issued"/>\n        <else-if variable="issued"/>\n        <else>\n          <text text-case="capitalize-first" variable="status"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-event-status-note">\n    <group delimiter=" ">\n      <choose>\n        <if type="broadcast" variable="status">\n          <!-- \'aired\', \'performed\', etc. (CMOS18 14.165) -->\n          <text variable="status"/>\n        </if>\n        <else-if type="paper-conference">\n          <choose>\n            <if variable="genre">\n              <text value="presented"/>\n            </if>\n            <else>\n              <text form="short" term="paper-conference"/>\n              <text value="presented"/>\n            </else>\n          </choose>\n          <choose>\n            <if match="any" variable="event event-title">\n              <text term="at"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if type="song">\n          <text value="recorded"/>\n          <choose>\n            <if variable="event-title">\n              <text term="at"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if variable="event-date issued"/>\n        <else-if variable="issued"/>\n        <else>\n          <text variable="status"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-event-title">\n    <choose>\n      <!-- TODO: We expect `event-title` to be used, but processors and applications may not be updated yet. This macro ensures that either `event` or `event-title` can be accepted. Remove if processor logic and application adoption can handle this. -->\n      <if variable="event-title">\n        <text variable="event-title"/>\n      </if>\n      <else>\n        <text variable="event"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-event-title-capitalized">\n    <choose>\n      <!-- TODO: We expect `event-title` to be used, but processors and applications may not be updated yet. This macro ensures that either `event` or `event-title` can be accepted. Remove if processor logic and application adoption can handle this. -->\n      <if variable="event-title">\n        <text text-case="capitalize-first" variable="event-title"/>\n      </if>\n      <else>\n        <text text-case="capitalize-first" variable="event"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-event-description-bib">\n    <group delimiter=", ">\n      <choose>\n        <if type="song">\n          <text macro="source-event-title"/>\n        </if>\n        <else-if type="paper-conference" variable="genre">\n          <text macro="source-event-title-capitalized"/>\n        </else-if>\n        <else-if type="paper-conference">\n          <text macro="source-event-title"/>\n        </else-if>\n        <else>\n          <text macro="source-event-title-capitalized"/>\n        </else>\n      </choose>\n      <text macro="date-event-full"/>\n      <text variable="event-place"/>\n    </group>\n  </macro>\n  <macro name="source-event-description-note">\n    <group delimiter=", ">\n      <choose>\n        <if type="song">\n          <text macro="source-event-title"/>\n        </if>\n        <else-if type="paper-conference" variable="genre">\n          <text macro="source-event-title"/>\n        </else-if>\n        <else-if type="paper-conference">\n          <text macro="source-event-title"/>\n        </else-if>\n        <else>\n          <text macro="source-event-title"/>\n        </else>\n      </choose>\n      <text macro="date-event-full"/>\n      <text variable="event-place"/>\n    </group>\n  </macro>\n  <!-- 4.5. Facts of publication -->\n  <macro name="source-monographic-publication-bib">\n    <group delimiter=". ">\n      <choose>\n        <!-- `patent` date in identification (CMOS18 14.158) -->\n        <if type="patent"/>\n        <!-- omit serial types -->\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book"/>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text macro="source-publication-and-date-bib"/>\n        </else-if>\n        <!-- omit serial types -->\n        <else-if match="any" type="interview paper-conference"/>\n        <else>\n          <!-- monographic types -->\n          <text macro="source-publication-and-date-bib"/>\n        </else>\n      </choose>\n      <text macro="source-publication-original-title-bib"/>\n    </group>\n  </macro>\n  <macro name="source-monographic-publication-note">\n    <group delimiter="; ">\n      <choose>\n        <!-- `patent` date in identification (CMOS18 14.158) -->\n        <if type="patent"/>\n        <!-- omit serial types -->\n        <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book"/>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text macro="source-publication-and-date-note"/>\n        </else-if>\n        <!-- omit serial types -->\n        <else-if match="any" type="interview paper-conference"/>\n        <else>\n          <!-- monographic types -->\n          <text macro="source-publication-and-date-note"/>\n        </else>\n      </choose>\n      <text macro="source-publication-original-title-note"/>\n    </group>\n  </macro>\n  <macro name="source-monographic-publication-note-bracketed">\n    <!-- Facts of publication with brackets for print monographic formats -->\n    <choose>\n      <if match="any" type="book chapter classic interview musical_score pamphlet paper-conference report thesis">\n        <text macro="source-monographic-publication-note" prefix="(" suffix=")"/>\n      </if>\n      <else-if type="article" variable="genre publisher">\n        <!-- without brackets for a preprint in a repository (CMOS18 14.76), with brackets for a working paper (CMOS18 14.116) -->\n        <text macro="source-monographic-publication-note" prefix="(" suffix=")"/>\n      </else-if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="publisher publisher-place">\n            <text macro="source-monographic-publication-note" prefix="(" suffix=")"/>\n          </if>\n          <!-- online reference sources without a additional publisher details are unbracketed (CMOS18 14.131) -->\n          <else-if match="any" variable="DOI URL"/>\n          <else>\n            <text macro="source-monographic-publication-note" prefix="(" suffix=")"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if type="motion_picture" variable="publisher">\n        <text macro="source-monographic-publication-note" prefix="(" suffix=")"/>\n      </else-if>\n      <else-if type="personal_communication">\n        <choose>\n          <if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n            <!-- in an edited collection -->\n            <text macro="source-monographic-publication-note" prefix="(" suffix=")"/>\n          </if>\n        </choose>\n      </else-if>\n      <else-if is-uncertain-date="issued">\n        <!-- space before bracketed uncertain date (CMOS18 14.127)  -->\n        <text macro="source-monographic-publication-note"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-monographic-publication-note-unbracketed">\n    <!-- Facts of publication without brackets -->\n    <choose>\n      <if match="any" type="book chapter classic interview musical_score pamphlet paper-conference report thesis"/>\n      <else-if type="article" variable="genre publisher"/>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="publisher publisher-place"/>\n          <!-- online reference sources without a additional publisher details are unbracketed (CMOS18 14.131) -->\n          <else-if match="any" variable="DOI URL">\n            <text macro="source-monographic-publication-note"/>\n          </else-if>\n        </choose>\n      </else-if>\n      <else-if type="motion_picture" variable="publisher"/>\n      <else-if type="personal_communication">\n        <choose>\n          <if match="none" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n            <!-- not in an edited collection -->\n            <text macro="source-monographic-publication-note"/>\n          </if>\n        </choose>\n      </else-if>\n      <else-if is-uncertain-date="issued"/>\n      <else>\n        <text macro="source-monographic-publication-note"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-monographic-publication-short-bracketed">\n    <!-- mirrors `source-monographic-publication-note-bracketed` -->\n    <group delimiter=", " prefix="(" suffix=")">\n      <choose>\n        <if disambiguate="true" match="none"/>\n        <!-- Facts of publication with brackets for print monographic formats -->\n        <else-if match="any" type="book chapter classic interview musical_score pamphlet paper-conference report thesis">\n          <choose>\n            <if disambiguate="true">\n              <text macro="source-publication-publisher-note"/>\n            </if>\n          </choose>\n          <text macro="source-date-issued-or-status"/>\n        </else-if>\n        <else-if type="article" variable="genre publisher">\n          <!-- without brackets for a preprint in a repository (CMOS18 14.76), with brackets for a working paper (CMOS18 14.116) -->\n          <choose>\n            <if disambiguate="true">\n              <text macro="source-publication-publisher-note"/>\n            </if>\n          </choose>\n          <text macro="source-date-issued-or-status"/>\n        </else-if>\n        <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n          <choose>\n            <if match="any" variable="publisher publisher-place">\n              <choose>\n                <if disambiguate="true">\n                  <text macro="source-publication-publisher-note"/>\n                </if>\n              </choose>\n              <text macro="source-date-issued-or-status"/>\n            </if>\n            <!-- online reference sources without a additional publisher details are unbracketed (CMOS18 14.131) -->\n            <else-if match="any" variable="DOI URL"/>\n            <else>\n              <choose>\n                <if disambiguate="true">\n                  <text macro="source-publication-publisher-note"/>\n                </if>\n              </choose>\n              <text macro="source-date-issued-or-status"/>\n            </else>\n          </choose>\n        </else-if>\n        <else-if type="motion_picture" variable="publisher">\n          <choose>\n            <if disambiguate="true">\n              <text macro="source-publication-publisher-note"/>\n            </if>\n          </choose>\n          <text macro="source-date-issued-or-status"/>\n        </else-if>\n        <else-if type="personal_communication">\n          <choose>\n            <if match="any" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n              <!-- in an edited collection -->\n              <text macro="source-date-issued-or-status"/>\n            </if>\n          </choose>\n        </else-if>\n        <else-if is-uncertain-date="issued">\n          <!-- space before bracketed uncertain date (CMOS18 14.127)  -->\n          <text macro="source-date-issued-or-status"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-monographic-publication-short-unbracketed">\n    <!-- mirrors `source-monographic-publication-note-unbracketed` -->\n    <choose>\n      <if disambiguate="true" match="none"/>\n      <!-- Facts of publication without brackets -->\n      <else-if match="any" type="book chapter classic interview musical_score pamphlet paper-conference report thesis"/>\n      <else-if type="article" variable="genre publisher"/>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="publisher publisher-place"/>\n          <!-- online reference sources without a additional publisher details are unbracketed (CMOS18 14.131) -->\n          <else-if match="any" variable="DOI URL">\n            <text macro="source-date-issued-or-status"/>\n          </else-if>\n        </choose>\n      </else-if>\n      <else-if type="motion_picture" variable="publisher"/>\n      <else-if type="personal_communication">\n        <choose>\n          <if match="none" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n            <!-- not in an edited collection -->\n            <text macro="source-date-issued-or-status"/>\n          </if>\n        </choose>\n      </else-if>\n      <else-if is-uncertain-date="issued"/>\n      <else>\n        <text macro="source-date-issued-or-status"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-publication-and-date-bib">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="post webpage">\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n          <text text-case="title" variable="container-title"/>\n          <!-- avoid possible repetition of `container-title` with author-date: -->\n          <!-- <choose><if variable="publisher"><text text-case="title" variable="container-title"/></if><else-if type="webpage" variable="container-title container-title-short"/><else><text text-case="title" variable="container-title"/></else></choose>-->\n        </if>\n      </choose>\n      <choose>\n        <if type="broadcast" variable="DOI">\n          <!-- a podcast publisher appears before the date, whereas the network of an aired show appears after (CMOS18 14.165); unfortunately CSL stores both in `publisher` -->\n          <!-- TODO: `DOI` or `URL` detection is the only way to distinguish radio/TV from podcasts, but it is obviously imprecise; modify if CSL provides a `podcast` type -->\n          <text macro="source-publication-history-bib"/>\n        </if>\n        <else-if type="broadcast" variable="URL">\n          <text macro="source-publication-history-bib"/>\n        </else-if>\n        <else-if type="broadcast"/>\n        <else>\n          <text macro="source-publication-history-bib"/>\n        </else>\n      </choose>\n      <group delimiter=" ">\n        <text macro="source-date-status-bib"/>\n        <text macro="source-date-issued-or-status"/>\n        <!-- for author-date or notes and bibliography leading with volume title (CMOS18 14.21): -->\n        <!-- <text macro="source-date-specific-title-first"/> -->\n      </group>\n      <choose>\n        <if type="broadcast" variable="URL"/>\n        <else-if type="broadcast">\n          <group delimiter=" ">\n            <text term="on"/>\n            <text macro="source-publication-history-bib"/>\n          </group>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-publication-and-date-note">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="post webpage">\n          <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` (CMOS18 14.104-106) -->\n          <text text-case="title" variable="container-title"/>\n        </if>\n      </choose>\n      <choose>\n        <if type="broadcast" variable="DOI">\n          <!-- a podcast publisher appears before the date, whereas the network of an aired show appears after (CMOS18 14.165); unfortunately CSL stores both in `publisher` -->\n          <!-- TODO: `DOI` or `URL` detection is the only way to distinguish radio/TV from podcasts, but it is obviously imprecise; modify if CSL provides a `podcast` type -->\n          <text macro="source-publication-history-note"/>\n        </if>\n        <else-if type="broadcast" variable="URL">\n          <text macro="source-publication-history-note"/>\n        </else-if>\n        <else-if type="broadcast"/>\n        <else>\n          <text macro="source-publication-history-note"/>\n        </else>\n      </choose>\n      <group delimiter=" ">\n        <text macro="source-date-status-note"/>\n        <text macro="source-date-issued-or-status"/>\n      </group>\n      <choose>\n        <if type="broadcast" variable="DOI"/>\n        <else-if type="broadcast" variable="URL"/>\n        <else-if type="broadcast">\n          <group delimiter=" ">\n            <text term="on"/>\n            <text macro="source-publication-history-note"/>\n          </group>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- Facts of publication elements -->\n  <macro name="source-publication-description-bib">\n    <choose>\n      <if type="article" variable="genre"/>\n      <else-if type="article">\n        <!-- `preprint` term attached to repository name, but specific working paper descriptors appear in description (CMOS18 14.76, 14.116) -->\n        <text term="preprint" text-case="capitalize-first"/>\n      </else-if>\n      <else-if type="thesis">\n        <!-- thesis type appears with university name (CMOS18 14.113) -->\n        <text text-case="capitalize-first" variable="genre"/>\n      </else-if>\n      <else-if match="any" variable="original-publisher original-publisher-place">\n        <choose>\n          <!-- `edition` provides an alternative label to `reprint` (CMOS18 14.16) -->\n          <if match="any" variable="edition original-title"/>\n          <else-if match="none" type="book chapter classic entry entry-dictionary entry-encyclopedia interview musical_score pamphlet paper-conference report thesis"/>\n          <else-if variable="issued original-date">\n            <text text-case="capitalize-first" value="reprint"/>\n          </else-if>\n        </choose>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-publication-description-note">\n    <choose>\n      <if type="article" variable="genre"/>\n      <else-if type="article">\n        <!-- `preprint` term attached to repository name, but specific working paper descriptors appear in description (CMOS18 14.76, 14.116) -->\n        <text term="preprint"/>\n      </else-if>\n      <else-if type="thesis">\n        <!-- thesis type appears with university name (CMOS18 14.113) -->\n        <text variable="genre"/>\n      </else-if>\n      <else-if match="any" variable="original-publisher original-publisher-place">\n        <choose>\n          <!-- `edition` provides an alternative label to `reprint` (CMOS18 14.16) -->\n          <if match="any" variable="edition original-title"/>\n          <else-if match="none" type="book chapter classic entry entry-dictionary entry-encyclopedia interview musical_score pamphlet paper-conference report thesis"/>\n          <else-if variable="issued original-date">\n            <text value="repr."/>\n          </else-if>\n        </choose>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-publication-history-bib">\n    <choose>\n      <if variable="original-title">\n        <!-- `original-title` is covered in `source-publication-original-title-bib` -->\n        <group delimiter=", ">\n          <text macro="source-publication-description-bib"/>\n          <text macro="source-publication-publisher-bib"/>\n        </group>\n      </if>\n      <else-if match="any" variable="edition original-publisher original-publisher-place">\n        <group delimiter=". ">\n          <!-- full stop to separate original date if `original-publisher` (CMOS18 14.16) -->\n          <group delimiter=", ">\n            <text macro="source-publication-publisher-original-bib"/>\n            <text macro="source-date-original"/>\n          </group>\n          <group delimiter=". ">\n            <choose>\n              <if variable="issued original-date">\n                <text macro="label-edition-capitalized"/>\n              </if>\n            </choose>\n            <group delimiter=", ">\n              <text macro="source-publication-description-bib"/>\n              <text macro="source-publication-publisher-bib"/>\n            </group>\n          </group>\n        </group>\n      </else-if>\n      <else>\n        <group delimiter="; ">\n          <!-- semicolon to separate original date if no publisher (CMOS18 14.165) -->\n          <text macro="source-date-original"/>\n          <group delimiter=", ">\n            <text macro="source-publication-description-bib"/>\n            <text macro="source-publication-publisher-bib"/>\n          </group>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-publication-history-note">\n    <choose>\n      <if variable="original-title">\n        <!-- `original-title` is covered in `source-publication-original-title-bib` -->\n        <group delimiter=", ">\n          <text macro="source-publication-description-note"/>\n          <text macro="source-publication-publisher-note"/>\n        </group>\n      </if>\n      <else-if match="any" variable="edition original-publisher original-publisher-place">\n        <group delimiter="; ">\n          <!-- semicolon to separate original date if `original-publisher` (CMOS18 14.16) -->\n          <group delimiter=", ">\n            <text macro="source-publication-publisher-original-note"/>\n            <text macro="source-date-original"/>\n          </group>\n          <group delimiter=", ">\n            <choose>\n              <if variable="issued original-date">\n                <text macro="label-edition"/>\n              </if>\n            </choose>\n            <group delimiter=", ">\n              <text macro="source-publication-description-note"/>\n              <text macro="source-publication-publisher-note"/>\n            </group>\n          </group>\n        </group>\n      </else-if>\n      <else>\n        <group delimiter="; ">\n          <!-- semicolon to separate original date if no publisher (CMOS18 14.165) -->\n          <text macro="source-date-original"/>\n          <group delimiter=", ">\n            <text macro="source-publication-description-note"/>\n            <text macro="source-publication-publisher-note"/>\n          </group>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-publication-original-title-bib">\n    <!-- Work originally published under a different title (CMOS18 13.101) -->\n    <choose>\n      <if variable="original-title">\n        <group delimiter=" ">\n          <text term="original-work-published" text-case="capitalize-first"/>\n          <group delimiter=", ">\n            <names variable="original-author">\n              <name and="text" initialize="false"/>\n            </names>\n            <text font-style="italic" text-case="title" variable="original-title"/>\n          </group>\n          <group delimiter=", " prefix="(" suffix=")">\n            <text macro="source-publication-publisher-original-bib"/>\n            <text macro="source-date-original"/>\n          </group>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-publication-original-title-note">\n    <!-- Work originally published under a different title (CMOS18 13.101) -->\n    <choose>\n      <if variable="original-title">\n        <group delimiter=" ">\n          <text term="original-work-published"/>\n          <group delimiter=", ">\n            <names variable="original-author">\n              <name and="text" initialize="false"/>\n            </names>\n            <text font-style="italic" text-case="title" variable="original-title"/>\n          </group>\n          <group delimiter=", " prefix="(" suffix=")">\n            <text macro="source-publication-publisher-original-note"/>\n            <text macro="source-date-original"/>\n          </group>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <macro name="source-publication-publisher-bib">\n    <group delimiter=" ">\n      <choose>\n        <if type="thesis" variable="publisher">\n          <text text-case="capitalize-first" variable="publisher"/>\n        </if>\n        <else-if variable="publisher">\n          <group delimiter=": ">\n            <!-- <text text-case="capitalize-first" variable="publisher-place"/> -->\n            <text text-case="capitalize-first" variable="publisher"/>\n          </group>\n        </else-if>\n        <!-- TODO: remove conditional when Zotero fixes double-mapping of `event-place` -->\n        <else-if match="any" variable="event-date event-title"/>\n        <else>\n          <text text-case="capitalize-first" variable="publisher-place"/>\n        </else>\n      </choose>\n      <choose>\n        <if type="song">\n          <!-- Album catalogue number follows label name (CMOS18 14.163-164) -->\n          <text variable="number"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-publication-publisher-note">\n    <group delimiter=" ">\n      <choose>\n        <if type="thesis" variable="publisher">\n          <text variable="publisher"/>\n        </if>\n        <else-if variable="publisher">\n          <group delimiter=": ">\n            <!-- <text variable="publisher-place"/> -->\n            <text variable="publisher"/>\n          </group>\n        </else-if>\n        <!-- TODO: remove conditional when Zotero fixes double-mapping of `event-place` -->\n        <else-if match="any" variable="event-date event-title"/>\n        <else>\n          <text variable="publisher-place"/>\n        </else>\n      </choose>\n      <choose>\n        <if type="song">\n          <!-- Album catalogue number follows label name (CMOS18 14.163-164) -->\n          <text variable="number"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-publication-publisher-original-bib">\n    <choose>\n      <if variable="original-publisher">\n        <group delimiter=": ">\n          <!-- <text text-case="capitalize-first" variable="original-publisher-place"/> -->\n          <text text-case="capitalize-first" variable="original-publisher"/>\n        </group>\n      </if>\n      <else>\n        <text text-case="capitalize-first" variable="original-publisher-place"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-publication-publisher-original-note">\n    <choose>\n      <if variable="original-publisher">\n        <group delimiter=": ">\n          <!-- <text variable="original-publisher-place"/> -->\n          <text variable="original-publisher"/>\n        </group>\n      </if>\n      <else>\n        <text variable="original-publisher-place"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.6. Date -->\n  <!-- Date elements -->\n  <macro name="source-date-issued-full">\n    <!-- Give full date for more ephemeral types -->\n    <!-- NB: any changes must also be applied to `source-date-original-full` -->\n    <choose>\n      <if type="personal_communication" variable="event-date issued">\n        <!-- Provide issue date for letters listed under event-date -->\n        <text macro="date-issued-year"/>\n      </if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="DOI URL">\n            <!-- Online reference works use full dates (CMOS18 14.131) -->\n            <text macro="date-issued-full"/>\n          </if>\n          <else>\n            <text macro="date-issued-year"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if match="any" type="article broadcast collection dataset document event graphic manuscript map patent performance personal_communication post software song speech standard webpage">\n        <text macro="date-issued-full"/>\n      </else-if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="source-date-issued-full-serial"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="date-issued-year"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="source-date-issued-full-serial"/>\n      </else-if>\n      <!-- monographic types -->\n      <else-if variable="issued">\n        <text macro="date-issued-year"/>\n      </else-if>\n      <else-if variable="event-date">\n        <text macro="date-event-year"/>\n      </else-if>\n      <else-if variable="available-date">\n        <date date-parts="year" form="numeric" variable="available-date"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-date-issued-full-serial">\n    <choose>\n      <if match="any" type="article-magazine article-newspaper">\n        <!-- magazines and newspapers provide the full date in place of volume/issue numbers (CMOS18 14.87, 14.89) -->\n        <text macro="date-issued-full"/>\n      </if>\n      <else-if variable="issue volume">\n        <text macro="date-issued-year"/>\n        <!-- for CMOS17: -->\n        <!-- <text macro="date-issued-year-month"/> -->\n      </else-if>\n      <else-if variable="supplement-number">\n        <text macro="date-issued-year"/>\n        <!-- for CMOS17: -->\n        <!-- <text macro="date-issued-year-month"/> -->\n      </else-if>\n      <else-if match="any" variable="issue volume">\n        <text macro="date-issued-year-month"/>\n      </else-if>\n      <else>\n        <text macro="date-issued-full"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-date-issued-or-status">\n    <choose>\n      <if match="any" variable="event-date issued">\n        <text macro="source-date-issued-full"/>\n      </if>\n      <else-if variable="status">\n        <text text-case="lowercase" variable="status"/>\n      </else-if>\n      <else-if match="any" type="interview personal_communication">\n        <choose>\n          <if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n            <!-- only give n.d. for accessible personal communication (CMOS18 14.111)-->\n            <text form="short" term="no date"/>\n          </if>\n        </choose>\n      </else-if>\n      <!-- types with unusual reference (CMOS18 14.44, 14.127) -->\n      <else-if match="any" type="classic collection entry entry-dictionary entry-encyclopedia webpage"/>\n      <else-if type="manuscript">\n        <!-- do not give n.d. with a bare shelfmark -->\n        <choose>\n          <if match="any" variable="container-title event-date event-place event-title genre title publisher publisher-place">\n            <text form="short" term="no date"/>\n          </if>\n        </choose>\n      </else-if>\n      <else-if type="article-journal">\n        <choose>\n          <if variable="available-date">\n            <!-- label journal articles available but not yet formally published as \'forthcoming\' (CMOS18 14.75) -->\n            <text term="forthcoming"/>\n          </if>\n          <else>\n            <text form="short" term="no date"/>\n          </else>\n        </choose>\n      </else-if>\n      <else>\n        <text form="short" term="no date"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-date-original">\n    <text macro="source-date-original-full"/>\n    <!-- for author-date 18th edition: -->\n    <!-- <text macro="source-date-original-month-day"/> -->\n  </macro>\n  <macro name="source-date-original-full">\n    <!-- Give full date for more ephemeral types -->\n    <!-- Macro derived from `source-date-issued-full` -->\n    <choose>\n      <if type="personal_communication" variable="event-date original-date">\n        <!-- Provide original date for letters listed under event-date -->\n        <text macro="date-original-year"/>\n      </if>\n      <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n        <choose>\n          <if match="any" variable="DOI URL">\n            <!-- Online reference works use full dates (CMOS18 14.131) -->\n            <text macro="date-original-full"/>\n          </if>\n          <else>\n            <text macro="date-original-year"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if match="any" type="article broadcast collection dataset document event graphic manuscript map patent performance personal_communication post software song speech standard webpage">\n        <text macro="date-original-full"/>\n      </else-if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="source-date-original-full-serial"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="date-original-year"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="source-date-original-full-serial"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <text macro="date-original-year"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-date-original-full-serial">\n    <choose>\n      <if variable="issue volume">\n        <text macro="date-original-year"/>\n        <!-- for CMOS17: -->\n        <!-- <text macro="date-original-year-month"/> -->\n      </if>\n      <else-if variable="supplement-number">\n        <text macro="date-original-year"/>\n        <!-- for CMOS17: -->\n        <!-- <text macro="date-original-year-month"/> -->\n      </else-if>\n      <else-if match="any" variable="issue volume">\n        <text macro="date-original-year-month"/>\n      </else-if>\n      <else>\n        <text macro="date-original-full"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-date-status-bib">\n    <choose>\n      <if type="broadcast" variable="event-title issued status"/>\n      <!-- on a `broadcast`, if there is an `event-title`, `status` appears with `event-date` as part of `source-event` (CMOS18 14.165) -->\n      <else-if variable="issued status">\n        <!-- `status` specifies date type, e.g. \'effective\', \'last modified\', \'approved\' (CMOS18 14.104 for `webpage`; CMOS18 14.159 for `standard`) -->\n        <choose>\n          <if type="webpage" variable="container-title">\n            <text variable="status"/>\n          </if>\n          <else-if type="webpage" variable="author publisher">\n            <text variable="status"/>\n          </else-if>\n          <else-if type="webpage" variable="translator publisher">\n            <text variable="status"/>\n          </else-if>\n          <else-if type="webpage">\n            <!-- capitalize `status` if there is nothing else after the `title` (either no website title or substituted publisher) -->\n            <text text-case="capitalize-first" variable="status"/>\n          </else-if>\n          <else-if match="any" variable="original-date original-publisher original-publisher-place original-title publisher">\n            <text variable="status"/>\n          </else-if>\n          <else>\n            <text text-case="capitalize-first" variable="status"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if type="broadcast" variable="issued URL"/>\n      <else-if type="broadcast" variable="issued">\n        <!-- `status` of a radio or TV broadcast is \'aired\' if unspecified (CMOS18 14.165) -->\n        <text text-case="capitalize-first" value="aired"/>\n      </else-if>\n      <else-if type="software" variable="issued publisher">\n        <!-- `status` of software is \'released\' if unspecified (CMOS18 14.169) -->\n        <choose>\n          <if match="any" variable="author chair collection-editor compiler composer contributor curator director editor editor-translator editorial-director executive-producer guest host illustrator organizer producer series-creator translator">\n            <!-- lowercase if `publisher` is adjacent -->\n            <text value="released"/>\n          </if>\n          <else>\n            <text text-case="capitalize-first" value="released"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if type="software" variable="original-date">\n        <!-- lowercase if `original-date` is adjacent -->\n        <text value="released"/>\n      </else-if>\n      <else-if type="software" variable="issued">\n        <!-- capitalize if `publisher` is not present -->\n        <text text-case="capitalize-first" value="released"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-date-status-note">\n    <choose>\n      <if type="broadcast" variable="event-title issued status"/>\n      <!-- on a `broadcast`, if there is an `event-title`, `status` appears with `event-date` as part of `source-event` (CMOS18 14.165) -->\n      <else-if variable="issued status">\n        <!-- `status` specifies date type, e.g. \'effective\', \'last modified\', \'approved\' (CMOS18 14.104 for `webpage`; CMOS18 14.159 for `standard`) -->\n        <text variable="status"/>\n      </else-if>\n      <else-if type="broadcast" variable="issued DOI"/>\n      <else-if type="broadcast" variable="issued URL"/>\n      <else-if type="broadcast" variable="issued">\n        <!-- `status` of a radio or TV broadcast is \'aired\' if unspecified (CMOS18 14.165) -->\n        <text value="aired"/>\n      </else-if>\n      <else-if type="software" variable="issued">\n        <!-- `status` of software is \'released\' if unspecified (CMOS18 14.169) -->\n        <text value="released"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- 4.7. Locator (including page references) -->\n  <macro name="source-locator-subsequent">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text macro="source-locator-subsequent-serial"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="source-locator-subsequent-monographic"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="source-locator-subsequent-serial"/>\n      </else-if>\n      <else>\n        <text macro="source-locator-subsequent-monographic"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="source-locator-subsequent-monographic">\n    <group delimiter=", ">\n      <choose>\n        <if variable="container-title">\n          <!-- Do not provide `volume` or `part-number` for defined section -->\n          <text macro="label-locator"/>\n        </if>\n        <else-if variable="part-number">\n          <!-- label page numbers to balance a part number (CMOS18 14.50) -->\n          <text macro="label-volume"/>\n          <text macro="label-part-number"/>\n          <text macro="label-locator-all"/>\n        </else-if>\n        <else-if is-numeric="volume" locator="page">\n          <!-- separate a volume and page number with a colon (CMOS18 14.18) -->\n          <group delimiter=":">\n            <text variable="volume"/>\n            <text variable="locator"/>\n          </group>\n        </else-if>\n        <else>\n          <text macro="label-volume"/>\n          <text macro="label-locator"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="source-locator-subsequent-serial">\n    <group delimiter=", ">\n      <choose>\n        <if variable="part-number">\n          <!-- label page numbers when using multiple locators (CMOS18 14.50) -->\n          <text macro="label-part-number"/>\n          <text macro="label-locator-all"/>\n        </if>\n        <else>\n          <text macro="label-locator"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4.8. Medium -->\n  <macro name="source-medium-bib">\n    <group delimiter=", ">\n      <text text-case="capitalize-first" variable="medium"/>\n      <text variable="scale"/>\n      <text variable="dimensions"/>\n    </group>\n  </macro>\n  <macro name="source-medium-note">\n    <group delimiter=", ">\n      <text variable="medium"/>\n      <text variable="scale"/>\n      <text variable="dimensions"/>\n    </group>\n  </macro>\n  <!-- 4.9. Archival location -->\n  <macro name="source-archive-bib">\n    <group delimiter=" ">\n      <choose>\n        <if type="graphic">\n          <text macro="source-archive-reference-institution-first"/>\n        </if>\n        <else>\n          <text macro="source-archive-reference-location-first-bib"/>\n        </else>\n      </choose>\n      <text macro="source-archive-database-number" prefix="(" suffix=")"/>\n    </group>\n  </macro>\n  <macro name="source-archive-note">\n    <group delimiter=" ">\n      <choose>\n        <if type="graphic">\n          <text macro="source-archive-reference-institution-first"/>\n        </if>\n        <else>\n          <text macro="source-archive-reference-location-first-note"/>\n        </else>\n      </choose>\n      <text macro="source-archive-database-number" prefix="(" suffix=")"/>\n    </group>\n  </macro>\n  <!-- Archival elements -->\n  <macro name="source-archive-database-number">\n    <!-- database identifier, if not included elsewhere (CMOS18 14.113) -->\n    <choose>\n      <if match="any" variable="archive_collection archive_location archive-place"/>\n      <!-- `number` never shown elsewhere with a thesis -->\n      <else-if type="thesis">\n        <text variable="number"/>\n      </else-if>\n      <!-- `number` shown with `genre` -->\n      <else-if match="any" type="dataset entry song" variable="genre"/>\n      <else-if variable="archive">\n        <text variable="number"/>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-archive-locator">\n    <choose>\n      <!-- physical locators with archival references appear after the shelfmark (CMOS18 14.127) -->\n      <if locator="column" variable="archive archive_location">\n        <!-- archival locators must always be labelled to avoid confusion with `archive_location` (CMOS18 14.123) -->\n        <text macro="label-locator-all"/>\n      </if>\n      <else-if locator="folio" variable="archive archive_location">\n        <text macro="label-locator-all"/>\n      </else-if>\n      <else-if locator="page" variable="archive archive_location">\n        <text macro="label-locator-all"/>\n      </else-if>\n      <else-if variable="archive archive_location page">\n        <choose>\n          <if is-numeric="page">\n            <!-- TODO: remove this conditional when `page` parsing is fixed for different locator types -->\n            <text macro="label-page"/>\n          </if>\n          <else>\n            <text variable="page"/>\n          </else>\n        </choose>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="source-archive-reference-institution-first">\n    <!-- Archive (gallery) name first for art (CMOS18 14.133) -->\n    <group delimiter=", ">\n      <text variable="archive"/>\n      <text variable="archive-place"/>\n      <text variable="archive_collection"/>\n      <text variable="archive_location"/>\n      <text macro="source-archive-locator"/>\n    </group>\n  </macro>\n  <macro name="source-archive-reference-location-first-bib">\n    <!-- Order of elements begins with the most specific (CMOS18 14.128) -->\n    <group delimiter=". ">\n      <group delimiter=", ">\n        <text text-case="capitalize-first" variable="archive_location"/>\n        <text macro="source-archive-locator"/>\n      </group>\n      <text variable="archive_collection"/>\n      <group delimiter=", ">\n        <text variable="archive"/>\n        <text variable="archive-place"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="source-archive-reference-location-first-note">\n    <!-- Order of elements begins with the most specific (CMOS18 14.127) -->\n    <group delimiter=", ">\n      <text variable="archive_location"/>\n      <text macro="source-archive-locator"/>\n      <text variable="archive_collection"/>\n      <text variable="archive"/>\n      <text variable="archive-place"/>\n    </group>\n  </macro>\n  <!-- 4.10. URL or persistent identifier -->\n  <macro name="source-date-accessed-DOI-URL-bib">\n    <group delimiter=". ">\n      <choose>\n        <if variable="DOI"/>\n        <else-if match="any" variable="available-date event-date issued status"/>\n        <else-if variable="accessed URL">\n          <group delimiter=" ">\n            <text term="accessed" text-case="capitalize-first"/>\n            <date form="text" variable="accessed"/>\n          </group>\n        </else-if>\n      </choose>\n      <text macro="source-DOI-URL"/>\n    </group>\n  </macro>\n  <macro name="source-date-accessed-DOI-URL-note">\n    <group delimiter=", ">\n      <choose>\n        <if variable="DOI"/>\n        <else-if match="any" variable="available-date event-date issued status"/>\n        <else-if variable="accessed URL">\n          <group delimiter=" ">\n            <text term="accessed"/>\n            <date form="text" variable="accessed"/>\n          </group>\n        </else-if>\n      </choose>\n      <text macro="source-DOI-URL"/>\n    </group>\n  </macro>\n  <macro name="source-DOI-URL">\n    <choose>\n      <if variable="DOI">\n        <text prefix="https://doi.org/" variable="DOI"/>\n      </if>\n      <else-if variable="URL">\n        <text variable="URL"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- 5. Notes -->\n  <!-- TODO: add variables for distributor and exhibitions if available in CSL -->\n  <!-- 6. Legal references: Bluebook style (shared with APA) -->\n  <!-- Where APA or Chicago diverge from Bluebook, the official manual is followed -->\n  <macro name="legal-reference">\n    <!-- Type usage:\n\n         `bill`\n         : bills, resolutions, federal reports\n\n         `legal_case`\n         : all legal and court cases\n\n         `hearing`\n         : hearings and testimony\n\n         `legislation`\n         : statutes, constitutional items, and charters\n\n         `regulation`\n         : codified regulations, uncodified regulations, executive orders\n\n         `treaty`\n         : treaties\n    -->\n    <group delimiter=", ">\n      <choose>\n        <if type="treaty">\n          <text macro="legal-title"/>\n          <names variable="author">\n            <!-- Treaty parties should be included at least for bilateral treaties (Bluebook 21.4.2) -->\n            <name delimiter="-" et-al-min="100" et-al-use-first="99" form="short" initialize="false"/>\n          </names>\n          <text macro="legal-date"/>\n          <!-- treaty source/report in addition to URL (Bluebook 21.4.5) -->\n          <text macro="legal-source"/>\n        </if>\n        <else>\n          <group delimiter=" ">\n            <group delimiter=", ">\n              <text macro="legal-title"/>\n              <text macro="legal-source"/>\n            </group>\n            <text macro="legal-date"/>\n            <text macro="legal-identifier"/>\n          </group>\n        </else>\n      </choose>\n      <group delimiter=" ">\n        <!-- locator for use in notes -->\n        <choose>\n          <if locator="page" variable="page">\n            <text term="at"/>\n          </if>\n        </choose>\n        <text macro="label-locator"/>\n      </group>\n    </group>\n  </macro>\n  <!-- 6.1. Legal date -->\n  <macro name="legal-date">\n    <choose>\n      <if type="treaty">\n        <text macro="date-issued-full"/>\n      </if>\n      <else-if type="legal_case">\n        <text macro="legal-date-case"/>\n      </else-if>\n      <else-if match="any" type="bill hearing legislation regulation">\n        <group delimiter=" " prefix="(" suffix=")">\n          <group delimiter=" ">\n            <text macro="date-original-year"/>\n            <text form="symbol" term="and"/>\n          </group>\n          <choose>\n            <if variable="issued">\n              <text macro="date-issued-year"/>\n            </if>\n            <else>\n              <!-- Show proposal date for uncodified regulations. Assume date is entered literally ala "proposed May 23, 2016". -->\n              <!-- TODO: Add `proposed` date here if that becomes available -->\n              <date form="text" variable="submitted"/>\n            </else>\n          </choose>\n        </group>\n      </else-if>\n    </choose>\n  </macro>\n  <macro name="legal-date-case">\n    <group delimiter=" " prefix="(" suffix=")">\n      <text variable="authority"/>\n      <choose>\n        <if variable="container-title">\n          <!-- Print only year for cases published in reporters-->\n          <text macro="date-issued-year"/>\n        </if>\n        <else>\n          <text macro="date-issued-full"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 6.2.1. Legal title -->\n  <macro name="legal-title">\n    <choose>\n      <if match="any" type="bill legal_case legislation regulation treaty">\n        <text text-case="title" variable="title"/>\n      </if>\n      <else-if type="hearing">\n        <!-- use standard format (Bluebook 13.3) -->\n        <group delimiter=": " font-style="italic">\n          <text text-case="capitalize-first" variable="title"/>\n          <group delimiter=" ">\n            <text term="hearing" text-case="capitalize-first"/>\n            <group delimiter=" ">\n              <text term="on"/>\n              <text variable="number"/>\n            </group>\n            <group delimiter=" ">\n              <text value="before the"/>\n              <text variable="section"/>\n            </group>\n          </group>\n        </group>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- 6.2.2. Legal identifier -->\n  <macro name="legal-identifier">\n    <group delimiter=" " prefix="(" suffix=")">\n      <choose>\n        <if type="hearing">\n          <!-- Use the \'verb\' form of the hearing term to hold \'testimony of\' -->\n          <text form="verb" term="hearing"/>\n          <names variable="author">\n            <name and="symbol" initialize="false"/>\n          </names>\n        </if>\n        <else-if match="any" type="bill legislation regulation">\n          <!-- For uncodified regulations, assume future code section is in `status`. -->\n          <text variable="status"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="legal-identifier-bill-report">\n    <group delimiter=" ">\n      <text variable="genre"/>\n      <choose>\n        <if match="any" variable="authority chapter-number container-title">\n          <text variable="number"/>\n        </if>\n        <else>\n          <!-- If there is no legislative body, session number, or code/record title, assume the item is a congressional report and include \'No.\' label. -->\n          <text macro="label-number-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 6.3. Legal source -->\n  <macro name="legal-source">\n    <!-- Expect legal item `container-title` to be stored in short form -->\n    <choose>\n      <if type="bill">\n        <text macro="legal-source-bill"/>\n      </if>\n      <else-if type="hearing">\n        <text macro="legal-source-hearing"/>\n      </else-if>\n      <else-if type="legal_case">\n        <text macro="legal-source-case"/>\n      </else-if>\n      <else-if type="legislation">\n        <text macro="legal-source-legislation"/>\n      </else-if>\n      <else-if type="regulation">\n        <text macro="legal-source-regulation"/>\n      </else-if>\n      <else-if type="treaty">\n        <text macro="legal-source-treaty"/>\n      </else-if>\n    </choose>\n  </macro>\n  <!-- Legal source types -->\n  <macro name="legal-source-bill">\n    <group delimiter=", ">\n      <text macro="legal-identifier-bill-report"/>\n      <group delimiter=" ">\n        <text variable="authority"/>\n        <!-- `chapter-number` is a session number -->\n        <text variable="chapter-number"/>\n      </group>\n      <group delimiter=" ">\n        <text variable="volume"/>\n        <text variable="container-title"/>\n        <text variable="page-first"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="legal-source-case">\n    <group delimiter=" ">\n      <choose>\n        <if variable="container-title">\n          <text variable="volume"/>\n          <text variable="container-title"/>\n          <text macro="label-section-symbol"/>\n          <choose>\n            <if match="any" variable="page page-first">\n              <text variable="page-first"/>\n            </if>\n            <else>\n              <text value="___"/>\n            </else>\n          </choose>\n        </if>\n        <else>\n          <text macro="label-number-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="legal-source-hearing">\n    <group delimiter=" ">\n      <text variable="authority"/>\n      <!-- `chapter-number` is a session number -->\n      <text variable="chapter-number"/>\n    </group>\n  </macro>\n  <macro name="legal-source-legislation">\n    <choose>\n      <if variable="number">\n        <!-- `number` is a public law number -->\n        <group delimiter=", ">\n          <group delimiter=" ">\n            <choose>\n              <if variable="genre">\n                <text text-case="capitalize-first" variable="genre"/>\n              </if>\n              <else>\n                <text form="short" term="legislation" text-case="capitalize-first"/>\n              </else>\n            </choose>\n            <text macro="label-number-capitalized"/>\n          </group>\n          <group delimiter=" ">\n            <text variable="volume"/>\n            <text variable="container-title"/>\n            <text variable="page-first"/>\n          </group>\n        </group>\n      </if>\n      <else>\n        <group delimiter=" ">\n          <text variable="volume"/>\n          <text variable="container-title"/>\n          <choose>\n            <if variable="section">\n              <text macro="label-section-symbol"/>\n            </if>\n            <else>\n              <text variable="page-first"/>\n            </else>\n          </choose>\n        </group>\n      </else>\n    </choose>\n  </macro>\n  <macro name="legal-source-regulation">\n    <group delimiter=", ">\n      <group delimiter=" ">\n        <text variable="genre"/>\n        <text macro="label-number-capitalized"/>\n      </group>\n      <group delimiter=" ">\n        <text variable="volume"/>\n        <text variable="container-title"/>\n        <choose>\n          <if variable="section">\n            <text macro="label-section-symbol"/>\n          </if>\n          <else>\n            <text variable="page-first"/>\n          </else>\n        </choose>\n      </group>\n    </group>\n  </macro>\n  <macro name="legal-source-treaty">\n    <group delimiter=" ">\n      <number variable="volume"/>\n      <text variable="container-title"/>\n      <choose>\n        <if match="any" variable="page page-first">\n          <text variable="page-first"/>\n        </if>\n        <else>\n          <text macro="label-number-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- Citation -->\n  <macro name="citation-notes-full">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="bill hearing legal_case legislation regulation treaty">\n          <!-- Legal items have different orders and delimiters -->\n          <text macro="legal-reference"/>\n          <text macro="source-date-accessed-DOI-URL-note"/>\n        </if>\n        <else-if type="personal_communication" variable="genre">\n          <text macro="author-note"/>\n          <text macro="title-and-source-note"/>\n        </else-if>\n        <else-if type="personal_communication" variable="author recipient">\n          <group delimiter=" ">\n            <text macro="author-note"/>\n            <text macro="title-and-source-note"/>\n          </group>\n        </else-if>\n        <else>\n          <text macro="author-note"/>\n          <text macro="title-and-source-note"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="citation-notes-shortened-author-title">\n    <!-- Shortened note styles mirror the filtering approach of author-date -->\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="part-number volume">\n          <!-- comma always needed with volume/part -->\n          <text macro="citation-notes-shortened-author-title-item"/>\n          <text macro="source-locator-subsequent"/>\n        </if>\n        <else-if match="none" type="classic">\n          <text macro="citation-notes-shortened-author-title-item"/>\n          <text macro="source-locator-subsequent"/>\n        </else-if>\n        <!-- with `classic`, a non-numeric canonical reference or identifying number is separated by a space rather than a comma (CMOS18 14.145) -->\n        <else-if is-numeric="locator">\n          <text macro="citation-notes-shortened-author-title-item"/>\n          <text macro="source-locator-subsequent"/>\n        </else-if>\n        <else-if locator="chapter line verse" match="any">\n          <group delimiter=" ">\n            <text macro="citation-notes-shortened-author-title-item"/>\n            <text macro="source-locator-subsequent"/>\n          </group>\n        </else-if>\n        <else>\n          <text macro="citation-notes-shortened-author-title-item"/>\n          <text macro="source-locator-subsequent"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="citation-notes-shortened-author-title-item">\n    <group delimiter=" ">\n      <group delimiter=", ">\n        <text macro="author-short"/>\n        <choose>\n          <if match="any" type="bill hearing legal_case legislation regulation treaty"/>\n          <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n            <group delimiter=" ">\n              <choose>\n                <if locator="sub-verbo"/>\n                <!-- Only print reference entries use `sub-verbo` (CMOS18 14.131) -->\n                <else-if match="any" variable="DOI URL"/>\n                <else-if variable="container-title title">\n                  <text form="short" term="sub-verbo"/>\n                </else-if>\n              </choose>\n              <text macro="title-and-descriptions-short"/>\n            </group>\n          </else-if>\n          <else>\n            <text macro="title-and-descriptions-short"/>\n          </else>\n        </choose>\n        <text macro="citation-notes-shortened-author-title-disambiguate"/>\n        <choose>\n          <!-- inaccessible `interview` or `personal_communication` uses in-text format (CMOS18 14.111): give the date at the first citation in shortened notes -->\n          <if match="any" variable="archive archive-place container-title DOI number publisher references URL"/>\n          <else-if position="first" type="interview">\n            <text macro="date-short"/>\n            <text macro="source-medium-note"/>\n          </else-if>\n          <else-if position="first" type="personal_communication">\n            <text macro="source-medium-note"/>\n          </else-if>\n        </choose>\n        <text macro="source-monographic-publication-short-unbracketed"/>\n      </group>\n      <text macro="source-monographic-publication-short-bracketed"/>\n    </group>\n  </macro>\n  <macro name="citation-notes-shortened-author-title-disambiguate">\n    <!-- CMOS18 gives examples of added dates (CMOS18 14.13) and editors/translators, publisher, date (CMOS18 14.146) -->\n    <group delimiter=", ">\n      <choose>\n        <if disambiguate="true">\n          <choose>\n            <if disambiguate="true">\n              <text macro="label-version"/>\n              <text macro="label-edition"/>\n            </if>\n          </choose>\n          <names variable="editor-translator">\n            <label form="verb-short" suffix=" "/>\n            <name and="text" form="short" initialize="true"/>\n            <substitute>\n              <names variable="editor"/>\n              <names variable="translator"/>\n            </substitute>\n          </names>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <citation disambiguate-add-givenname="true" disambiguate-add-names="true" et-al-min="3" et-al-use-first="1">\n    <layout delimiter="; " suffix=".">\n      <choose>\n        <if position="subsequent">\n          <text macro="citation-notes-shortened-author-title"/>\n        </if>\n        <else>\n          <text macro="citation-notes-full"/>\n        </else>\n      </choose>\n    </layout>\n  </citation>\n  <!-- Bibliography -->\n  <macro name="bibliography-notes">\n    <group delimiter=". ">\n      <choose>\n        <if match="any" type="bill hearing legal_case legislation regulation treaty">\n          <!-- Legal items have different orders and delimiters -->\n          <text macro="legal-reference"/>\n          <text macro="source-date-accessed-DOI-URL-bib"/>\n          <text variable="references"/>\n        </if>\n        <else>\n          <text macro="author-bib"/>\n          <text macro="title-and-source-bib"/>\n          <text variable="references"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <bibliography et-al-min="7" et-al-use-first="3" hanging-indent="true">\n    <sort>\n      <key macro="author-sort"/>\n      <key macro="title-and-descriptions-bib"/>\n      <key macro="source-bib"/>\n      <key variable="volume"/>\n      <key variable="part-number"/>\n      <key variable="event-date"/>\n      <key macro="source-date-issued-or-status"/>\n      <key macro="source-archive-bib"/>\n    </sort>\n    <layout suffix=".">\n      <choose>\n        <if type="classic">\n          <choose>\n            <if match="any" variable="archive editor translator publisher">\n              <text macro="bibliography-notes"/>\n            </if>\n          </choose>\n        </if>\n        <else-if match="any" type="entry entry-dictionary entry-encyclopedia">\n          <choose>\n            <if variable="author">\n              <!-- Signed reference entries appear in the bibliography (CMOS18 14.132) -->\n              <text macro="bibliography-notes"/>\n            </if>\n          </choose>\n        </else-if>\n        <!-- social media content omitted from the bibliography (new in CMOS18 14.106; included in CMOS17 14.209) -->\n        <else-if type="post"/>\n        <else-if match="any" variable="archive archive-place container-title DOI number publisher references URL">\n          <text macro="bibliography-notes"/>\n        </else-if>\n        <!-- Personal communications only appear in the bibliography if the reader can retrieve them (CMOS18 14.13, 14.111) -->\n        <else-if match="any" type="interview personal_communication"/>\n        <!-- In note styles, the bibliography also omits inaccessible manuscripts (CMOS18 14.114), conference papers (new in CMOS18 14.115; included in CMOS17 14.217), and private documents (CMOS18 14.118) -->\n        <else-if match="any" type="document manuscript paper-conference speech"/>\n        <else>\n          <text macro="bibliography-notes"/>\n        </else>\n      </choose>\n    </layout>\n  </bibliography>\n</style>\n';

// renderer/styles/mla.csl
var mla_default = '<?xml version="1.0" encoding="utf-8"?>\n<style xmlns="http://purl.org/net/xbiblio/csl" and="text" class="in-text" demote-non-dropping-particle="never" initialize-with=". " page-range-format="minimal-two" version="1.0">\n  <!-- This file was generated by the Style Variant Builder <https://github.com/citation-style-language/style-variant-builder>. To contribute changes, modify the template and regenerate variants. -->\n  <info>\n    <title>MLA Handbook 9th edition (in-text citations)</title>\n    <title-short>Modern Language Association (in-text citations)</title-short>\n    <id>http://www.zotero.org/styles/modern-language-association</id>\n    <link href="http://www.zotero.org/styles/modern-language-association" rel="self"/>\n    <link href="https://style.mla.org/" rel="documentation"/>\n    <link href="https://zotero.org/groups/2205533/collections/L96HMJXY" rel="documentation"/>\n    <author>\n      <name>Sebastian Karcher</name>\n      <uri>https://orcid.org/0000-0001-8249-7388</uri>\n    </author>\n    <author>\n      <name>Andrew Dunning</name>\n      <uri>https://orcid.org/0000-0003-0464-5036</uri>\n    </author>\n    <contributor>\n      <name>Patrick O\'Brien</name>\n    </contributor>\n    <category citation-format="author"/>\n    <category field="generic-base"/>\n    <category field="humanities"/>\n    <category field="literature"/>\n    <summary>MLA source citations, in-text citations system (chapter 6)</summary>\n    <updated>2026-02-03T00:00:00+00:00</updated>\n    <rights license="http://creativecommons.org/licenses/by-sa/3.0/">This work is licensed under a Creative Commons Attribution-ShareAlike 3.0 License</rights>\n  </info>\n  <locale xml:lang="en">\n    <date form="text">\n      <date-part name="day" suffix=" "/>\n      <date-part form="short" name="month" suffix=" "/>\n      <date-part name="year"/>\n    </date>\n    <terms>\n      <!-- MLA Appendix 1 -->\n      <term form="short" name="chapter">\n        <single>ch.</single>\n        <multiple>chs.</multiple>\n      </term>\n      <term name="collection-editor">\n        <single>general editor</single>\n        <multiple>general editors</multiple>\n      </term>\n      <term name="editor-translator">\n        <single>editor and translator</single>\n        <multiple>editors and translators</multiple>\n      </term>\n      <term name="editortranslator">\n        <single>editor and translator</single>\n        <multiple>editors and translators</multiple>\n      </term>\n      <term form="verb" name="editor-translator">edited and translated by</term>\n      <term form="verb" name="editortranslator">edited and translated by</term>\n      <term name="original-work-published">originally published</term>\n      <term form="short" name="paragraph">\n        <single>par.</single>\n        <multiple>pars.</multiple>\n      </term>\n      <term form="short" name="version">vers.</term>\n    </terms>\n  </locale>\n  <!-- Contents:\n\n       MLA provides the following series of elements for citations:\n\n       1. Author (MLA 5.3-22)\n       2. Title of Source (MLA 5.23-30)\n       3. Supplemental Element after Title of Source (MLA 5.106-109)\n          3.1. Contributor (MLA 5.107)\n          3.2. Original publication date (MLA 5.108)\n          3.3. Section of a work labeled generically (MLA 5.109)\n       4. Container 1\n          4.1. Title of Container (MLA 5.31-37)\n          4.2. Contributor (MLA 5.38-47)\n          4.3. Version (MLA 5.48-50)\n          4.4. Number (MLA 5.51-53)\n          4.5. Publisher (MLA 5.54-67)\n          4.6. Publication Date (MLA 5.68-83)\n          4.7. Location (MLA 5.84-99)\n       5. Supplemental Element Between Containers (MLA 5.119)\n       6. Container 2 (MLA 5.102)\n       7. Supplemental Element at End of Entry (MLA 5.110-118)\n          7.1. Date of access (MLA 5.111)\n          7.2. Medium of publication (MLA 5.112)\n          7.3. Dissertations and theses (MLA 5.113)\n          7.4. Publication history (MLA 5.114)\n          7.5. Book series (MLA 5.115)\n          7.6. Columns, sections, and other recurring titled features (MLA 5.116)\n          7.7. Multivolume works (MLA 5.117)\n  -->\n  <!-- Categories of CSL item types:\n\n       Serial\n       : article-journal article-magazine article-newspaper periodical post-weblog review review-book\n\n       Serial or Monographic\n       : interview paper-conference\n\n         Monographic with any of `collection-editor compiler editor editorial-director`.\n         A serial `paper-conference` is unpublished if it lacks any of `issue page supplement-number volume`.\n\n       Monographic\n       : article book broadcast chapter classic collection dataset document\n         entry entry-dictionary entry-encyclopedia event figure\n         graphic manuscript map motion_picture musical_score\n         pamphlet patent performance personal_communication post report\n         software song speech standard thesis webpage\n\n       Legal\n       : bill hearing legal_case legislation regulation treaty\n  -->\n  <!-- Variable labels -->\n  <macro name="label-edition-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="edition">\n          <number form="ordinal" variable="edition"/>\n          <label form="short" variable="edition"/>\n        </if>\n        <else>\n          <text text-case="capitalize-first" variable="edition"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-issue">\n    <group delimiter=" ">\n      <label form="short" variable="issue"/>\n      <text variable="issue"/>\n    </group>\n  </macro>\n  <macro name="label-locator">\n    <group delimiter=" ">\n      <label form="short" variable="locator"/>\n      <text variable="locator"/>\n    </group>\n  </macro>\n  <macro name="label-number">\n    <group delimiter=" ">\n      <choose>\n        <if type="standard"/>\n        <else-if is-numeric="number">\n          <label form="short" variable="number"/>\n        </else-if>\n      </choose>\n      <text variable="number"/>\n    </group>\n  </macro>\n  <macro name="label-number-of-volumes">\n    <group delimiter=" ">\n      <text variable="number-of-volumes"/>\n      <choose>\n        <if is-numeric="number-of-volumes">\n          <label form="short" variable="number-of-volumes"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="label-page">\n    <group delimiter=" ">\n      <label form="short" variable="page"/>\n      <text variable="page"/>\n    </group>\n  </macro>\n  <macro name="label-part-number">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="part-number">\n          <!-- TODO: Replace with `part-number` label when CSL provides one -->\n          <text form="short" term="part"/>\n        </if>\n      </choose>\n      <text variable="part-number"/>\n    </group>\n  </macro>\n  <macro name="label-part-number-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="part-number">\n          <!-- TODO: Replace with `part-number` label when CSL provides one -->\n          <text form="short" term="part" text-case="capitalize-first"/>\n        </if>\n      </choose>\n      <text text-case="capitalize-first" variable="part-number"/>\n    </group>\n  </macro>\n  <macro name="label-supplement-number">\n    <group delimiter=" ">\n      <choose>\n        <!-- TODO: Replace with `supplement-number` label when CSL provides one -->\n        <if is-numeric="supplement-number">\n          <text form="short" term="supplement"/>\n        </if>\n      </choose>\n      <text variable="supplement-number"/>\n    </group>\n  </macro>\n  <macro name="label-version">\n    <group delimiter=" ">\n      <label variable="version"/>\n      <text variable="version"/>\n    </group>\n  </macro>\n  <macro name="label-version-capitalized">\n    <group delimiter=" ">\n      <label text-case="capitalize-first" variable="version"/>\n      <text variable="version"/>\n    </group>\n  </macro>\n  <macro name="label-volume">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="volume">\n          <label form="short" variable="volume"/>\n        </if>\n      </choose>\n      <text variable="volume"/>\n    </group>\n  </macro>\n  <macro name="label-volume-capitalized">\n    <group delimiter=" ">\n      <choose>\n        <if is-numeric="volume">\n          <label form="short" text-case="capitalize-first" variable="volume"/>\n        </if>\n      </choose>\n      <text text-case="capitalize-first" variable="volume"/>\n    </group>\n  </macro>\n  <!-- 1. Author (MLA 5.3-22) -->\n  <macro name="author">\n    <names variable="composer">\n      <name delimiter-precedes-et-al="always" delimiter-precedes-last="always" initialize="false" name-as-sort-order="first"/>\n      <label prefix=", "/>\n      <substitute>\n        <names variable="author"/>\n        <names variable="guest">\n          <name delimiter-precedes-et-al="always" delimiter-precedes-last="always" initialize="false" name-as-sort-order="first"/>\n          <!-- `guest` has no label (see MLA \'Interview by podcast host\') -->\n        </names>\n        <names variable="editor-translator"/>\n        <names variable="editor"/>\n        <names variable="translator"/>\n        <choose>\n          <if type="standard">\n            <text variable="authority"/>\n          </if>\n        </choose>\n        <text macro="title"/>\n      </substitute>\n    </names>\n  </macro>\n  <macro name="author-short">\n    <group delimiter=", ">\n      <names variable="composer">\n        <name form="short" initialize="true"/>\n        <substitute>\n          <names variable="author"/>\n          <names variable="guest"/>\n          <names variable="editor-translator"/>\n          <names variable="editor"/>\n          <names variable="translator"/>\n          <choose>\n            <if type="standard">\n              <text variable="authority"/>\n            </if>\n          </choose>\n          <text macro="title-short"/>\n        </substitute>\n      </names>\n      <choose>\n        <if disambiguate="true">\n          <text macro="title-short"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <!-- 2. Title of Source (MLA 5.23-30) -->\n  <macro name="title">\n    <choose>\n      <if match="any" type="post webpage">\n        <!-- print `container-title` on `post` or `webpage` in the same way as `publisher` -->\n        <text macro="title-and-part-filter-review"/>\n      </if>\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="title-and-part-filter-review"/>\n      </else-if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <text macro="title-monographic"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="title-and-part-filter-review"/>\n      </else-if>\n      <else>\n        <text macro="title-monographic"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-short">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- If a review has no `reviewed-title`, assume that `title` contains the title of the reviewed work; the description provides it. -->\n        <choose>\n          <if variable="reviewed-genre title">\n            <!-- Quotes, title case -->\n            <text form="short" quotes="true" text-case="title" variable="title"/>\n          </if>\n          <else-if variable="reviewed-genre reviewed-title title">\n            <!-- Quotes, title case -->\n            <text form="short" quotes="true" text-case="title" variable="title"/>\n          </else-if>\n          <else>\n            <text macro="supplemental-generic-label-short"/>\n          </else>\n        </choose>\n      </if>\n      <else-if variable="title">\n        <text macro="title-primary-short"/>\n      </else-if>\n      <else>\n        <text macro="supplemental-generic-label-short"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Title elements -->\n  <macro name="title-and-part-filter-review">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <!-- `title` is only the review title if there is a separate `reviewed-genre` or `reviewed-title`; otherwise, it is the title of the reviewed work, printed in the description -->\n        <choose>\n          <if match="any" variable="reviewed-genre reviewed-title">\n            <text macro="title-and-part-title"/>\n          </if>\n        </choose>\n      </if>\n      <else>\n        <text macro="title-and-part-title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-and-part-title">\n    <group delimiter=", ">\n      <text macro="title-primary"/>\n      <text macro="label-part-number"/>\n      <text macro="title-part"/>\n    </group>\n  </macro>\n  <macro name="title-monographic">\n    <!-- For monographic items, assume `part-number` and `part-title` refer to the book/volume. -->\n    <choose>\n      <if variable="container-title">\n        <text macro="title-primary"/>\n      </if>\n      <!-- For monographic items without `container-title`, bibliography entries list `part-title` or `volume-title` first if available -->\n      <else-if variable="part-title">\n        <text font-style="italic" text-case="title" variable="part-title"/>\n      </else-if>\n      <else-if variable="volume-title">\n        <text font-style="italic" text-case="title" variable="volume-title"/>\n      </else-if>\n      <else>\n        <text macro="title-primary"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-part">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <text quotes="true" text-case="title" variable="part-title"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text font-style="italic" text-case="title" variable="part-title"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text quotes="true" text-case="title" variable="part-title"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <text font-style="italic" text-case="title" variable="part-title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-primary">\n    <choose>\n      <if match="any" type="bill collection legislation regulation treaty">\n        <!-- No italics or quotes, title case -->\n        <text text-case="title" variable="title"/>\n      </if>\n      <else-if type="legal_case">\n        <!-- Italicized, sentence case -->\n        <text font-style="italic" variable="title"/>\n      </else-if>\n      <else-if match="any" type="book classic graphic hearing map periodical">\n        <!-- Italicized, title case (regardless of `container-title`) -->\n        <text font-style="italic" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="post">\n        <!-- Quotes, sentence case -->\n        <text quotes="true" variable="title"/>\n      </else-if>\n      <!-- Other types are formatted based on presence of `container-title` -->\n      <else-if variable="container-title">\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if match="any" type="article dataset document interview manuscript paper-conference personal_communication speech">\n        <!-- Container-like but not necessarily with `container-title` -->\n        <!-- Quotes, title case -->\n        <text quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else>\n        <!-- Italicized, title case (default) -->\n        <text font-style="italic" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="title-primary-short">\n    <choose>\n      <if match="any" type="bill collection legislation regulation treaty">\n        <!-- No italics or quotes, title case -->\n        <text form="short" text-case="title" variable="title"/>\n      </if>\n      <else-if type="legal_case">\n        <!-- Italicized, sentence case -->\n        <text font-style="italic" form="short" variable="title"/>\n      </else-if>\n      <else-if match="any" type="book classic graphic hearing map periodical">\n        <!-- Italicized, title case (regardless of `container-title`) -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else-if>\n      <else-if type="post">\n        <!-- Quotes, sentence case -->\n        <text form="short" quotes="true" variable="title"/>\n      </else-if>\n      <!-- Other types are formatted based on presence of `container-title` -->\n      <else-if variable="container-title">\n        <!-- Quotes, title case -->\n        <text form="short" quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else-if match="any" type="article dataset document interview manuscript paper-conference personal_communication speech">\n        <!-- Container-like but not necessarily with `container-title` -->\n        <!-- Quotes, title case -->\n        <text form="short" quotes="true" text-case="title" variable="title"/>\n      </else-if>\n      <else>\n        <!-- Italicized, title case (default) -->\n        <text font-style="italic" form="short" text-case="title" variable="title"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 3. Supplemental Element after Title of Source (MLA 5.106-109) -->\n  <macro name="supplemental-element-after-title">\n    <group delimiter=", ">\n      <text macro="supplemental-contributor"/>\n      <text macro="supplemental-original-date"/>\n      <text macro="supplemental-generic-label"/>\n    </group>\n  </macro>\n  <!-- 3.1. Contributor (MLA 5.107) -->\n  <macro name="supplemental-contributor">\n    <names delimiter=", " variable="interviewer">\n      <label form="verb" suffix=" " text-case="capitalize-first"/>\n      <name initialize="false"/>\n    </names>\n  </macro>\n  <!-- 3.2. Original publication date (MLA 5.108) -->\n  <macro name="supplemental-original-date">\n    <choose>\n      <if type="personal_communication">\n        <!-- date and place of composition for letters -->\n        <text macro="container1-location-event"/>\n      </if>\n      <else-if match="any" variable="original-publisher original-publisher-place"/>\n      <else-if is-uncertain-date="original-date">\n        <date form="text" prefix="[" suffix="?]" variable="original-date"/>\n      </else-if>\n      <else>\n        <date form="text" variable="original-date"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 3.3. Section of a work labeled generically (MLA 5.109) -->\n  <macro name="supplemental-generic-label">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <text macro="supplemental-generic-label-review"/>\n      </if>\n      <else-if type="thesis"/>\n      <else-if variable="number"/>\n      <else>\n        <text text-case="capitalize-first" variable="genre"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="supplemental-generic-label-short">\n    <choose>\n      <if match="any" type="review review-book" variable="reviewed-author reviewed-genre reviewed-title">\n        <text macro="supplemental-generic-label-review-short"/>\n      </if>\n      <else>\n        <text form="short" text-case="capitalize-first" variable="genre"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- Generic label elements -->\n  <macro name="supplemental-generic-label-review">\n    <group delimiter=" ">\n      <choose>\n        <if variable="reviewed-genre">\n          <text term="review-of" text-case="capitalize-first"/>\n          <text variable="reviewed-genre"/>\n          <choose>\n            <if match="none" variable="reviewed-title">\n              <names variable="reviewed-author">\n                <label form="verb" suffix=" "/>\n                <name initialize="false"/>\n              </names>\n            </if>\n          </choose>\n        </if>\n        <else-if variable="number">\n          <text term="review-of" text-case="capitalize-first"/>\n        </else-if>\n        <!-- If no `reviewed-genre`, assume that `genre` is entered as \'Review of the book\' or similar -->\n        <else-if variable="genre">\n          <text text-case="capitalize-first" variable="genre"/>\n        </else-if>\n        <else>\n          <text term="review-of" text-case="capitalize-first"/>\n        </else>\n      </choose>\n      <choose>\n        <if match="any" variable="reviewed-genre reviewed-title">\n          <!-- Not possible to distinguish TV series episode from other reviewed works without a reviewed source title -->\n          <!-- Adapt for `reviewed-container-title` or similar if it becomes available -->\n          <text font-style="italic" text-case="title" variable="reviewed-title"/>\n        </if>\n        <else>\n          <!-- Assume title is title of reviewed work -->\n          <text font-style="italic" text-case="title" variable="title"/>\n        </else>\n      </choose>\n    </group>\n    <choose>\n      <if variable="reviewed-genre reviewed-title title">\n        <names variable="reviewed-author">\n          <label form="verb" suffix=" "/>\n          <name initialize="false"/>\n        </names>\n      </if>\n      <else-if variable="reviewed-genre"/>\n      <else>\n        <names variable="reviewed-author">\n          <label form="verb" suffix=" "/>\n          <name initialize="false"/>\n        </names>\n      </else>\n    </choose>\n  </macro>\n  <macro name="supplemental-generic-label-review-short">\n    <group delimiter=" ">\n      <text term="review-of"/>\n      <choose>\n        <if match="any" variable="reviewed-genre reviewed-title">\n          <!-- Not possible to distinguish TV series episode from other reviewed works without a reviewed source title -->\n          <!-- Adapt for `reviewed-container-title` or similar if it becomes available -->\n          <text font-style="italic" form="short" text-case="title" variable="reviewed-title"/>\n        </if>\n        <else>\n          <!-- Assume title is title of reviewed work -->\n          <text font-style="italic" form="short" text-case="title" variable="title"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4. Container 1 -->\n  <macro name="container1">\n    <group delimiter=", ">\n      <text macro="container1-title"/>\n      <text macro="container1-contributor"/>\n      <text macro="container1-version"/>\n      <text macro="container1-number"/>\n      <text macro="container1-publisher"/>\n      <text macro="container1-publication-date"/>\n      <text macro="container1-location"/>\n    </group>\n  </macro>\n  <!-- 4.1. Title of Container (MLA 5.31-37) -->\n  <macro name="container1-title">\n    <choose>\n      <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n        <!-- serial types -->\n        <text macro="container1-title-serial"/>\n      </if>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="container1-title-monographic"/>\n      </else-if>\n      <else-if match="any" type="interview paper-conference">\n        <!-- serial types -->\n        <text macro="container1-title-serial"/>\n      </else-if>\n      <else>\n        <!-- monographic types -->\n        <text macro="container1-title-monographic"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="container1-title-serial">\n    <group delimiter=", ">\n      <text font-style="italic" text-case="title" variable="volume-title"/>\n      <group delimiter=" ">\n        <choose>\n          <!-- Journal special issues and supplements (MLA 7.4) -->\n          <if match="none" variable="container-title"/>\n          <else-if variable="supplement-number volume-title">\n            <text term="supplement"/>\n            <text value="to"/>\n          </else-if>\n          <else-if type="periodical" variable="supplement-number title">\n            <text term="supplement" text-case="capitalize-first"/>\n            <text value="to"/>\n          </else-if>\n          <else-if type="periodical" variable="volume-title">\n            <text term="special-issue" text-case="capitalize-first"/>\n            <text value="of"/>\n          </else-if>\n          <else-if type="periodical" variable="title">\n            <text term="special-issue" text-case="capitalize-first"/>\n            <text value="of"/>\n          </else-if>\n          <else-if variable="volume-title">\n            <text term="special-issue"/>\n            <text value="of"/>\n          </else-if>\n        </choose>\n        <text font-style="italic" text-case="title" variable="container-title"/>\n        <text prefix="[" suffix="]" variable="publisher-place"/>\n      </group>\n    </group>\n  </macro>\n  <macro name="container1-title-monographic">\n    <choose>\n      <if variable="container-title part-title">\n        <text font-style="italic" text-case="title" variable="part-title"/>\n      </if>\n      <else-if variable="container-title volume-title">\n        <text font-style="italic" text-case="title" variable="volume-title"/>\n      </else-if>\n      <else>\n        <text font-style="italic" text-case="title" variable="container-title"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.2. Contributor (MLA 5.38-47) -->\n  <macro name="container1-contributor">\n    <group delimiter=", ">\n      <names delimiter=", " variable="container-author">\n        <label form="verb" suffix=" "/>\n        <name initialize="false"/>\n      </names>\n      <choose>\n        <if variable="container-title">\n          <names delimiter=", " variable="editor-translator">\n            <label form="verb" suffix=" "/>\n            <name initialize="false"/>\n          </names>\n          <names delimiter=", " variable="editor translator">\n            <label form="verb" suffix=" "/>\n            <name initialize="false"/>\n          </names>\n          <names delimiter=", " variable="director series-creator illustrator host narrator contributor">\n            <label form="verb" suffix=" "/>\n            <name initialize="false"/>\n          </names>\n        </if>\n        <else>\n          <names delimiter=", " variable="editor-translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name initialize="false"/>\n          </names>\n          <names delimiter=", " variable="editor translator">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name initialize="false"/>\n          </names>\n          <names delimiter=", " variable="director series-creator illustrator host narrator contributor">\n            <label form="verb" suffix=" " text-case="capitalize-first"/>\n            <name initialize="false"/>\n          </names>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4.3. Version (MLA 5.48-50) -->\n  <macro name="container1-version">\n    <group delimiter=", ">\n      <text macro="label-edition-capitalized"/>\n      <choose>\n        <if variable="edition">\n          <text macro="label-version"/>\n        </if>\n        <else>\n          <text macro="label-version-capitalized"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 4.4. Number (MLA 5.51-53) -->\n  <macro name="container1-number">\n    <group delimiter=", ">\n      <choose>\n        <!-- `collection-title` is for any serial with multiple series (e.g. \'second series\') -->\n        <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n          <!-- serial types -->\n          <text variable="collection-title"/>\n          <text macro="label-volume"/>\n        </if>\n        <else-if match="any" variable="collection-editor compiler editor editorial-director">\n          <!-- monographic types -->\n          <text macro="label-volume"/>\n        </else-if>\n        <else-if match="any" type="interview paper-conference">\n          <!-- serial types -->\n          <text variable="collection-title"/>\n          <text macro="label-volume"/>\n        </else-if>\n        <!-- in monographic types, lowercase with a preceding element -->\n        <else-if match="any" variable="part-title volume-title">\n          <!-- monographic types -->\n          <text macro="label-volume"/>\n        </else-if>\n        <else-if match="any" variable="edition container-title">\n          <text macro="label-volume"/>\n        </else-if>\n        <!--other contributors preceding the volume-->\n        <else-if variable="author">\n          <choose>\n            <if match="any" variable="container-author contributor director editor editor-translator illustrator interviewer translator">\n              <text macro="label-volume"/>\n            </if>\n          </choose>\n        </else-if>\n        <else>\n          <text macro="label-volume-capitalized"/>\n        </else>\n      </choose>\n      <text macro="label-issue"/>\n      <text macro="label-supplement-number"/>\n      <group delimiter=" ">\n        <choose>\n          <if is-numeric="number" type="broadcast" variable="genre">\n            <text variable="genre"/>\n            <text variable="number"/>\n          </if>\n          <else-if is-numeric="number" type="broadcast">\n            <text value="episode"/>\n            <text variable="number"/>\n          </else-if>\n          <else-if variable="number">\n            <text variable="genre"/>\n            <text macro="label-number"/>\n          </else-if>\n        </choose>\n      </group>\n    </group>\n  </macro>\n  <!-- 4.5. Publisher (MLA 5.54-67) -->\n  <macro name="container1-publisher">\n    <choose>\n      <if type="thesis"/>\n      <!-- omit serial types -->\n      <else-if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book"/>\n      <else-if match="any" variable="collection-editor compiler editor editorial-director">\n        <!-- monographic types -->\n        <text macro="container1-publisher-or-place"/>\n      </else-if>\n      <!-- omit serial types -->\n      <else-if match="any" type="interview paper-conference"/>\n      <else>\n        <!-- monographic types -->\n        <text macro="container1-publisher-or-place"/>\n      </else>\n    </choose>\n  </macro>\n  <macro name="container1-publisher-or-place">\n    <choose>\n      <if variable="publisher">\n        <text variable="publisher"/>\n      </if>\n      <else>\n        <!-- use place of publication as fallback (cf. MLA 5.67) -->\n        <text variable="publisher-place"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.6. Publication Date (MLA 5.68-83) -->\n  <macro name="container1-publication-date">\n    <choose>\n      <if match="any" type="book chapter motion_picture paper-conference thesis">\n        <choose>\n          <if is-uncertain-date="issued">\n            <date date-parts="year" form="numeric" prefix="[" suffix="?]" variable="issued"/>\n          </if>\n          <else>\n            <date date-parts="year" form="numeric" variable="issued"/>\n          </else>\n        </choose>\n      </if>\n      <else-if type="article-journal">\n        <choose>\n          <if is-uncertain-date="issued">\n            <date date-parts="year-month" form="text" prefix="[" suffix="?]" variable="issued"/>\n          </if>\n          <else>\n            <date date-parts="year-month" form="text" variable="issued"/>\n          </else>\n        </choose>\n      </else-if>\n      <else-if type="speech"/>\n      <else>\n        <choose>\n          <if is-uncertain-date="issued">\n            <group delimiter=" ">\n              <text term="circa" text-case="capitalize-first"/>\n              <date form="text" variable="issued"/>\n            </group>\n          </if>\n          <else>\n            <date form="text" variable="issued"/>\n          </else>\n        </choose>\n      </else>\n    </choose>\n  </macro>\n  <!-- 4.7. Location (MLA 5.84-99) -->\n  <macro name="container1-location">\n    <!-- location of a physical object or event (MLA 5.99) -->\n    <group delimiter=", ">\n      <choose>\n        <!-- serials cannot be part of an event -->\n        <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book"/>\n        <!-- `event-date` supplies date of composition for letters, handled in `supplemental-original-date` -->\n        <else-if type="personal_communication"/>\n        <else-if type="paper-conference">\n          <choose>\n            <if match="none" variable="collection-editor compiler editor editorial-director issue page supplement-number volume">\n              <!-- Don\'t print event info for conference papers published in a proceedings volume -->\n              <text macro="container1-location-event"/>\n            </if>\n          </choose>\n        </else-if>\n        <else>\n          <!-- For other item types, print event info even if published (e.g. collection catalogs, performance programs). -->\n          <text macro="container1-location-event"/>\n        </else>\n      </choose>\n      <text variable="archive"/>\n      <text variable="archive-place"/>\n      <text variable="archive_collection"/>\n      <text variable="archive_location"/>\n      <text macro="label-page"/>\n      <choose>\n        <if match="none" variable="source">\n          <text macro="container1-location-URI"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="container1-location-event">\n    <group delimiter=", ">\n      <choose>\n        <if match="any" variable="event event-date event-title">\n          <!-- TODO: We expect `event-title` to be used, but processors and applications may not be updated yet. This macro ensures that either `event` or `event-title` can be accepted. Remove if processor logic and application adoption can handle this. -->\n          <choose>\n            <if variable="event-title">\n              <text text-case="capitalize-first" variable="event-title"/>\n            </if>\n            <else>\n              <text text-case="capitalize-first" variable="event"/>\n            </else>\n          </choose>\n          <choose>\n            <if is-uncertain-date="event-date">\n              <date form="text" prefix="[" suffix="?]" variable="event-date"/>\n            </if>\n            <else>\n              <date form="text" variable="event-date"/>\n            </else>\n          </choose>\n          <text variable="event-place"/>\n        </if>\n      </choose>\n    </group>\n  </macro>\n  <macro name="container1-location-URI">\n    <choose>\n      <if variable="DOI">\n        <text prefix="https://doi.org/" variable="DOI"/>\n      </if>\n      <else>\n        <text variable="URL"/>\n      </else>\n    </choose>\n  </macro>\n  <!-- 5. Supplemental Element Between Containers (MLA 5.119) -->\n  <macro name="supplemental-element-between">\n    <choose>\n      <if variable="source">\n        <text macro="supplemental-element-movable"/>\n      </if>\n    </choose>\n  </macro>\n  <!-- 6. Container 2 (MLA 5.102) -->\n  <macro name="container2">\n    <group delimiter=", ">\n      <choose>\n        <if match="none" variable="source"/>\n        <else-if match="any" variable="DOI URL">\n          <!-- Title of Container -->\n          <text font-style="italic" variable="source"/>\n          <!-- Location -->\n          <text macro="container1-location-URI"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- 7. Supplemental Element at End of Entry (MLA 5.110-118) -->\n  <macro name="supplemental-element-end">\n    <group delimiter=", ">\n      <text macro="supplemental-date-access"/>\n      <text macro="supplemental-medium"/>\n      <choose>\n        <if variable="source"/>\n        <else>\n          <text macro="supplemental-element-movable"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <macro name="supplemental-element-movable">\n    <!-- information relevant only to one container appears either in `supplemental-element-between` or `supplemental-element-end` depending on the presence of `source` -->\n    <group delimiter=", ">\n      <choose>\n        <if match="any" type="article-journal article-magazine article-newspaper periodical post-weblog review review-book">\n          <!-- serial types -->\n          <text macro="supplemental-columns-sections"/>\n        </if>\n        <else-if match="any" type="interview paper-conference">\n          <choose>\n            <if match="any" variable="collection-editor compiler editor editorial-director">\n              <!-- monographic types -->\n              <text macro="supplemental-dissertations-theses"/>\n              <text macro="supplemental-publication-history"/>\n              <text macro="supplemental-book-series"/>\n              <text macro="supplemental-multivolume-works"/>\n            </if>\n            <else>\n              <!-- serial types -->\n              <text macro="supplemental-columns-sections"/>\n            </else>\n          </choose>\n        </else-if>\n        <else>\n          <!-- monographic types -->\n          <text macro="supplemental-dissertations-theses"/>\n          <text macro="supplemental-publication-history"/>\n          <text macro="supplemental-book-series"/>\n          <text macro="supplemental-multivolume-works"/>\n        </else>\n      </choose>\n    </group>\n  </macro>\n  <!-- 7.1. Date of access (MLA 5.111) -->\n  <macro name="supplemental-date-access">\n    <choose>\n      <if match="none" variable="issued">\n        <group delimiter=" ">\n          <text term="accessed" text-case="capitalize-first"/>\n          <date form="text" variable="accessed"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <!-- 7.2. Medium of publication (MLA 5.112) -->\n  <macro name="supplemental-medium">\n    <text text-case="capitalize-first" variable="medium"/>\n  </macro>\n  <!-- 7.3. Dissertations and theses (MLA 5.113) -->\n  <macro name="supplemental-dissertations-theses">\n    <choose>\n      <if type="thesis">\n        <group delimiter=", ">\n          <text variable="publisher"/>\n          <text variable="genre"/>\n        </group>\n      </if>\n    </choose>\n  </macro>\n  <!-- 7.4. Publication history (MLA 5.114) -->\n  <macro name="supplemental-publication-history">\n    <group delimiter=" ">\n      <choose>\n        <if match="any" variable="original-publisher original-publisher-place original-title">\n          <text term="original-work-published" text-case="capitalize-first"/>\n        </if>\n      </choose>\n      <group delimiter=", ">\n        <group delimiter=" ">\n          <text value="as"/>\n          <text font-style="italic" text-case="title" variable="original-title"/>\n        </group>\n        <choose>\n          <if match="any" variable="original-publisher original-publisher-place">\n            <choose>\n              <if variable="original-publisher">\n                <group delimiter=" ">\n                  <choose>\n                    <if match="none" variable="original-title">\n                      <text term="by"/>\n                    </if>\n                  </choose>\n                  <text variable="original-publisher"/>\n                </group>\n              </if>\n              <else>\n                <text variable="original-publisher-place"/>\n              </else>\n            </choose>\n            <choose>\n              <if is-uncertain-date="original-date">\n                <date date-parts="year" form="numeric" prefix="[" suffix="?]" variable="original-date"/>\n              </if>\n              <else>\n                <date date-parts="year" form="numeric" variable="original-date"/>\n              </else>\n            </choose>\n          </if>\n        </choose>\n      </group>\n    </group>\n  </macro>\n  <!-- 7.5. Book series (MLA 5.115) -->\n  <macro name="supplemental-book-series">\n    <group delimiter=", ">\n      <choose>\n        <if is-numeric="collection-number" variable="collection-title">\n          <group delimiter=" ">\n            <text text-case="title" variable="collection-title"/>\n            <text variable="collection-number"/>\n          </group>\n        </if>\n        <else-if variable="collection-title">\n          <text text-case="title" variable="collection-title"/>\n          <text variable="collection-number"/>\n        </else-if>\n      </choose>\n    </group>\n  </macro>\n  <!-- 7.6. Columns, sections, and other recurring titled features (MLA 5.116) -->\n  <macro name="supplemental-columns-sections">\n    <text text-case="title" variable="section"/>\n  </macro>\n  <!-- 7.7. Multivolume works (MLA 5.117) -->\n  <macro name="supplemental-multivolume-works">\n    <group delimiter=", ">\n      <choose>\n        <if variable="part-number part-title volume volume-title">\n          <!-- part and title with individual titles -->\n          <group delimiter=" ">\n            <text macro="label-part-number-capitalized"/>\n            <text value="of"/>\n            <text font-style="italic" text-case="title" variable="volume-title"/>\n          </group>\n          <group delimiter=" ">\n            <text macro="label-volume"/>\n            <text value="of"/>\n            <group delimiter=", ">\n              <choose>\n                <if variable="container-title">\n                  <text font-style="italic" text-case="title" variable="container-title"/>\n                </if>\n                <else>\n                  <text macro="title-primary"/>\n                </else>\n              </choose>\n              <names variable="collection-editor">\n                <name initialize="false"/>\n                <label prefix=", "/>\n              </names>\n            </group>\n          </group>\n        </if>\n        <else-if match="any" variable="part-title volume-title">\n          <group delimiter=" ">\n            <choose>\n              <if variable="part-number volume">\n                <group delimiter=", ">\n                  <text macro="label-volume-capitalized"/>\n                  <text macro="label-part-number"/>\n                  <text value="of"/>\n                </group>\n              </if>\n              <else-if variable="part-number">\n                <text macro="label-part-number-capitalized"/>\n                <text value="of"/>\n              </else-if>\n              <else-if variable="volume">\n                <text macro="label-volume-capitalized"/>\n                <text value="of"/>\n              </else-if>\n            </choose>\n            <group delimiter=", ">\n              <choose>\n                <if variable="container-title">\n                  <text font-style="italic" text-case="title" variable="container-title"/>\n                </if>\n                <else>\n                  <text macro="title-primary"/>\n                </else>\n              </choose>\n              <names variable="collection-editor">\n                <name initialize="false"/>\n                <label prefix=", "/>\n              </names>\n            </group>\n          </group>\n        </else-if>\n        <!-- numbers without a volume title appear in `container1-number` -->\n      </choose>\n      <choose>\n        <if match="none" variable="volume">\n          <text macro="label-number-of-volumes"/>\n        </if>\n      </choose>\n      <!-- TODO: provide container date here when available -->\n    </group>\n  </macro>\n  <citation disambiguate-add-givenname="true" disambiguate-add-names="true" et-al-min="3" et-al-use-first="1">\n    <layout delimiter="; " prefix="(" suffix=")">\n      <choose>\n        <if locator="line page timestamp" match="any">\n          <group delimiter=" ">\n            <text macro="author-short"/>\n            <text variable="locator"/>\n          </group>\n        </if>\n        <else>\n          <group delimiter=", ">\n            <text macro="author-short"/>\n            <text macro="label-locator"/>\n          </group>\n        </else>\n      </choose>\n    </layout>\n  </citation>\n  <bibliography entry-spacing="0" et-al-min="3" et-al-use-first="1" hanging-indent="true" line-spacing="2" subsequent-author-substitute="&#8212;&#8212;&#8212;">\n    <sort>\n      <key macro="author"/>\n      <key macro="title"/>\n      <key macro="supplemental-element-after-title"/>\n      <key macro="container1"/>\n      <key macro="supplemental-element-between"/>\n      <key macro="container2"/>\n      <key macro="supplemental-element-end"/>\n    </sort>\n    <layout suffix=".">\n      <group delimiter=". ">\n        <text macro="author"/>\n        <text macro="title"/>\n        <text macro="supplemental-element-after-title"/>\n        <text macro="container1"/>\n        <text macro="supplemental-element-between"/>\n        <text macro="container2"/>\n        <text macro="supplemental-element-end"/>\n      </group>\n    </layout>\n  </bibliography>\n</style>\n';

// renderer/tables.py
var tables_default = `#!/usr/bin/env python3
"""Rewrite pipe-table separator rows so column widths are proportional to
real cell content, instead of whatever pandoc defaults to.

Pandoc's pipe-table reader takes each column's *relative* width straight
from the dash-run length in the header/body separator row -- it never looks
at actual cell content to size columns. Verified experimentally: a table
whose separator is a minimal "|---|---|---|" renders every column at an
equal 1/3 width in LaTeX, no matter how long the cells are. A table whose
separator dashes are already padded to match each column's widest cell (as
Obsidian's own table formatter does) renders with sane proportional widths.
That's the whole difference between a table that looks right after
conversion and one that doesn't -- this script does that padding
mechanically for every pipe table in a file, without touching cell content,
so it doesn't matter whether the source table was ever run through a
formatter.

Usage: tables.py <input.md> <output.md>
"""
import re
import sys

SEP_CELL = re.compile(r'^\\s*(:?)-+(:?)\\s*$')
FENCE = re.compile(r'^\\s*(\`\`\`|~~~)')


def split_row(line):
    line = line.rstrip('\\n')
    stripped = line.strip()
    if stripped.startswith('|'):
        stripped = stripped[1:]
    if stripped.endswith('|') and not stripped.endswith('\\\\|'):
        stripped = stripped[:-1]
    return re.split(r'(?<!\\\\)\\|', stripped)


def is_separator_row(cells):
    return len(cells) > 0 and all(SEP_CELL.match(c) for c in cells)


def rebuild_separator(cells, widths):
    out = []
    for cell, width in zip(cells, widths):
        m = SEP_CELL.match(cell)
        left, right = (m.group(1), m.group(2)) if m else ('', '')
        dash_len = max(3, width) - len(left) - len(right)
        dash_len = max(1, dash_len)
        out.append(left + '-' * dash_len + right)
    return '| ' + ' | '.join(out) + ' |'


def process(text):
    lines = text.split('\\n')
    n = len(lines)
    out = []
    i = 0
    in_fence = False
    while i < n:
        line = lines[i]

        if FENCE.match(line):
            in_fence = not in_fence
            out.append(line)
            i += 1
            continue

        if (not in_fence and '|' in line and i + 1 < n and '|' in lines[i + 1]):
            header_cells = split_row(line)
            sep_cells = split_row(lines[i + 1])
            if len(sep_cells) == len(header_cells) and is_separator_row(sep_cells):
                j = i + 2
                body = []
                while j < n and lines[j].strip() != '' and '|' in lines[j]:
                    body.append(split_row(lines[j]))
                    j += 1

                ncols = len(header_cells)
                widths = [len(c.strip()) for c in header_cells]
                for row in body:
                    for c in range(min(ncols, len(row))):
                        widths[c] = max(widths[c], len(row[c].strip()))

                out.append(line)
                out.append(rebuild_separator(sep_cells, widths))
                out.extend(lines[i + 2:j])
                i = j
                continue

        out.append(line)
        i += 1

    return '\\n'.join(out)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding='utf-8') as fh:
        text = fh.read()
    with open(dst, 'w', encoding='utf-8') as fh:
        fh.write(process(text))


if __name__ == '__main__':
    main()
`;

// renderer/wikilinks.py
var wikilinks_default = '#!/usr/bin/env python3\n"""Rewrite Obsidian embed and link syntax into plain Markdown.\n\nPandoc\'s Markdown reader has no idea what ``![[target]]`` means, so it passes it\nthrough as literal text and the image silently never reaches the PDF. This turns\neach embed into ``![](target)`` so the normal pandoc pipeline (including\n--extract-media) can pick it up.\n\nTwo target flavours show up in these vaults:\n\n* a percent-encoded remote URL (``https%3A%2F%2F...``), which just needs decoding\n* a bare attachment name (``file-2026....jpg``), which has to be found on disk --\n  Obsidian stores it by name, not by path\n\nPlain page links (``[[Note]]`` / ``[[Note|Alias]]``) don\'t point at a file this\npipeline can typeset as a hyperlink, so instead of leaving the literal brackets\n(which pandoc\'s writer escapes to ``\\\\[\\\\[Note\\\\]\\\\]`` in the PDF) they\'re\nflattened to plain text using the alias when given, the bare target otherwise\n(matching the Obsidian plugin\'s export).\n\nUsage: wikilinks.py <input.md> <output.md>   (or import rewrite())\nPrints one "unresolved: <target>" line per embed it could not locate.\n"""\n\nimport os\nimport re\nimport sys\nfrom urllib.parse import unquote\n\nEMBED = re.compile(r"!\\[\\[([^\\]|]+?)(?:\\|([^\\]]*))?\\]\\]")\nWIKILINK = re.compile(r"(?<!!)\\[\\[([^\\]|]+?)(?:\\|([^\\]]*))?\\]\\]")\nIMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".tif", ".bmp",\n              ".svg", ".pdf", ".heic", ".avif"}\n\n\ndef find_attachment(name, doc_dir, doc_stem):\n    """Locate an attachment by bare name, mirroring Obsidian\'s lookup order."""\n    candidates = [\n        os.path.join(doc_dir, name),\n        os.path.join(doc_dir, "assets", doc_stem, name),\n        os.path.join(doc_dir, "assets", name),\n        os.path.join(doc_dir, "attachments", name),\n    ]\n    for c in candidates:\n        if os.path.isfile(c):\n            return os.path.relpath(c, doc_dir)\n\n    # Fall back to a bounded walk of the document\'s own directory tree.\n    base = os.path.basename(name)\n    for root, dirs, files in os.walk(doc_dir):\n        dirs[:] = [d for d in dirs if not d.startswith(".")]\n        if base in files:\n            return os.path.relpath(os.path.join(root, base), doc_dir)\n    return None\n\n\ndef rewrite(text, src):\n    """Return (rewritten_text, unresolved_targets) for a note at path `src`."""\n    doc_dir = os.path.dirname(os.path.abspath(src)) or "."\n    doc_stem = os.path.splitext(os.path.basename(src))[0]\n    unresolved = []\n\n    def replace(match):\n        raw, suffix = match.group(1).strip(), (match.group(2) or "").strip()\n\n        # A percent-encoded URL survives unquote into something with a scheme.\n        decoded = unquote(raw)\n        if decoded.startswith(("http://", "https://")):\n            target = decoded\n        elif raw.startswith(("http://", "https://")):\n            target = raw\n        else:\n            # Non-image embeds (e.g. transcluded notes) are left untouched.\n            if os.path.splitext(raw)[1].lower() not in IMAGE_EXTS:\n                return match.group(0)\n            found = find_attachment(raw, doc_dir, doc_stem)\n            if found is None:\n                unresolved.append(raw)\n                return match.group(0)\n            target = found\n\n        # Obsidian\'s "|300" means width in pixels; anything else is alt text.\n        attrs, alt = "", ""\n        if suffix.isdigit():\n            attrs = "{width=%spx}" % suffix\n        elif suffix:\n            alt = suffix\n\n        link = "<%s>" % target if re.search(r"[ ()]", target) else target\n        return "![%s](%s)%s" % (alt, link, attrs)\n\n    def flatten_link(match):\n        target, alias = match.group(1).strip(), (match.group(2) or "").strip()\n        return alias or target\n\n    text = EMBED.sub(replace, text)\n    text = WIKILINK.sub(flatten_link, text)\n    return text, unresolved\n\n\ndef main():\n    src, dst = sys.argv[1], sys.argv[2]\n    with open(src, encoding="utf-8") as fh:\n        text, unresolved = rewrite(fh.read(), src)\n\n    with open(dst, "w", encoding="utf-8") as fh:\n        fh.write(text)\n\n    for u in unresolved:\n        print("unresolved: %s" % u)\n\n\nif __name__ == "__main__":\n    main()\n';

// renderer/quickaction/Info.plist
var Info_default = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n	<key>NSServices</key>\n	<array>\n		<dict>\n			<key>NSBackgroundColorName</key>\n			<string>background</string>\n			<key>NSIconName</key>\n			<string>NSActionTemplate</string>\n			<key>NSMenuItem</key>\n			<dict>\n				<key>default</key>\n				<string>@@NAME@@</string>\n			</dict>\n			<key>NSMessage</key>\n			<string>runWorkflowAsService</string>\n			<key>NSSendFileTypes</key>\n			<array>\n				<string>public.item</string>\n			</array>\n		</dict>\n	</array>\n</dict>\n</plist>\n';

// renderer/quickaction/document.wflow
var document_default = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n	<key>AMApplicationBuild</key>\n	<string>534</string>\n	<key>AMApplicationVersion</key>\n	<string>2.10</string>\n	<key>AMDocumentVersion</key>\n	<string>2</string>\n	<key>actions</key>\n	<array>\n		<dict>\n			<key>action</key>\n			<dict>\n				<key>AMAccepts</key>\n				<dict>\n					<key>Container</key>\n					<string>List</string>\n					<key>Optional</key>\n					<true/>\n					<key>Types</key>\n					<array>\n						<string>com.apple.cocoa.string</string>\n					</array>\n				</dict>\n				<key>AMActionVersion</key>\n				<string>2.0.3</string>\n				<key>AMApplication</key>\n				<array>\n					<string>Automator</string>\n				</array>\n				<key>AMParameterProperties</key>\n				<dict>\n					<key>COMMAND_STRING</key>\n					<dict/>\n					<key>CheckedForUserDefaultShell</key>\n					<dict/>\n					<key>inputMethod</key>\n					<dict/>\n					<key>shell</key>\n					<dict/>\n					<key>source</key>\n					<dict/>\n				</dict>\n				<key>AMProvides</key>\n				<dict>\n					<key>Container</key>\n					<string>List</string>\n					<key>Types</key>\n					<array>\n						<string>com.apple.cocoa.string</string>\n					</array>\n				</dict>\n				<key>ActionBundlePath</key>\n				<string>/System/Library/Automator/Run Shell Script.action</string>\n				<key>ActionName</key>\n				<string>Run Shell Script</string>\n				<key>ActionParameters</key>\n				<dict>\n					<key>COMMAND_STRING</key>\n					<string>@@COMMAND@@</string>\n					<key>CheckedForUserDefaultShell</key>\n					<true/>\n					<key>inputMethod</key>\n					<integer>1</integer>\n					<key>shell</key>\n					<string>/bin/zsh</string>\n					<key>source</key>\n					<string></string>\n				</dict>\n				<key>BundleIdentifier</key>\n				<string>com.apple.RunShellScript</string>\n				<key>CFBundleVersion</key>\n				<string>2.0.3</string>\n				<key>CanShowSelectedItemsWhenRun</key>\n				<false/>\n				<key>CanShowWhenRun</key>\n				<true/>\n				<key>Category</key>\n				<array>\n					<string>AMCategoryUtilities</string>\n				</array>\n				<key>Class Name</key>\n				<string>RunShellScriptAction</string>\n				<key>InputUUID</key>\n				<string>DCE15577-5BE1-4BCB-B0B1-A959D67557BD</string>\n				<key>Keywords</key>\n				<array>\n					<string>Shell</string>\n					<string>Script</string>\n					<string>Command</string>\n					<string>Run</string>\n					<string>Unix</string>\n				</array>\n				<key>OutputUUID</key>\n				<string>B186E034-10F5-4A68-AF4F-4879E832CBEB</string>\n				<key>UUID</key>\n				<string>166A74FD-2F6F-4326-88BB-216303E0D32F</string>\n				<key>UnlocalizedApplications</key>\n				<array>\n					<string>Automator</string>\n				</array>\n				<key>arguments</key>\n				<dict>\n					<key>0</key>\n					<dict>\n						<key>default value</key>\n						<integer>0</integer>\n						<key>name</key>\n						<string>inputMethod</string>\n						<key>required</key>\n						<string>0</string>\n						<key>type</key>\n						<string>0</string>\n						<key>uuid</key>\n						<string>0</string>\n					</dict>\n					<key>1</key>\n					<dict>\n						<key>default value</key>\n						<false/>\n						<key>name</key>\n						<string>CheckedForUserDefaultShell</string>\n						<key>required</key>\n						<string>0</string>\n						<key>type</key>\n						<string>0</string>\n						<key>uuid</key>\n						<string>1</string>\n					</dict>\n					<key>2</key>\n					<dict>\n						<key>default value</key>\n						<string></string>\n						<key>name</key>\n						<string>source</string>\n						<key>required</key>\n						<string>0</string>\n						<key>type</key>\n						<string>0</string>\n						<key>uuid</key>\n						<string>2</string>\n					</dict>\n					<key>3</key>\n					<dict>\n						<key>default value</key>\n						<string></string>\n						<key>name</key>\n						<string>COMMAND_STRING</string>\n						<key>required</key>\n						<string>0</string>\n						<key>type</key>\n						<string>0</string>\n						<key>uuid</key>\n						<string>3</string>\n					</dict>\n					<key>4</key>\n					<dict>\n						<key>default value</key>\n						<string>/bin/sh</string>\n						<key>name</key>\n						<string>shell</string>\n						<key>required</key>\n						<string>0</string>\n						<key>type</key>\n						<string>0</string>\n						<key>uuid</key>\n						<string>4</string>\n					</dict>\n				</dict>\n				<key>isViewVisible</key>\n				<integer>1</integer>\n				<key>location</key>\n				<string>471.000000:784.000000</string>\n				<key>nibPath</key>\n				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>\n			</dict>\n			<key>isViewVisible</key>\n			<integer>1</integer>\n		</dict>\n	</array>\n	<key>connectors</key>\n	<dict/>\n	<key>workflowMetaData</key>\n	<dict>\n		<key>applicationBundleIDsByPath</key>\n		<dict/>\n		<key>applicationPaths</key>\n		<array/>\n		<key>inputTypeIdentifier</key>\n		<string>com.apple.Automator.fileSystemObject</string>\n		<key>outputTypeIdentifier</key>\n		<string>com.apple.Automator.nothing</string>\n		<key>presentationMode</key>\n		<integer>15</integer>\n		<key>processesInput</key>\n		<false/>\n		<key>serviceInputTypeIdentifier</key>\n		<string>com.apple.Automator.fileSystemObject</string>\n		<key>serviceOutputTypeIdentifier</key>\n		<string>com.apple.Automator.nothing</string>\n		<key>serviceProcessesInput</key>\n		<false/>\n		<key>systemImageName</key>\n		<string>NSActionTemplate</string>\n		<key>useAutomaticInputType</key>\n		<false/>\n		<key>workflowTypeIdentifier</key>\n		<string>com.apple.Automator.servicesMenu</string>\n	</dict>\n</dict>\n</plist>\n';

// src/export/rendererFiles.ts
var RENDERER_FILES = {
  "render-pdf.sh": render_pdf_default,
  "lib.sh": lib_default,
  "job.py": job_default,
  "tables.py": tables_default,
  "lists.py": lists_default,
  "rowlines.py": rowlines_default,
  "wikilinks.py": wikilinks_default,
  "quick-action.sh": quick_action_default,
  "default-preamble.tex": default_preamble_default,
  "styles/mla.csl": mla_default,
  "styles/apa.csl": apa_default,
  "styles/chicago.csl": chicago_default,
  "styles/chicago-notes.csl": chicago_notes_default
};
var DEFAULT_PREAMBLE = default_preamble_default;
var QUICK_ACTION_TEMPLATE = {
  info: Info_default,
  document: document_default
};

// src/export/installer.ts
var KEEP_VERSIONS = 3;
var BUILD_DIR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
var QUICK_ACTION_NAME = "Convert Md to PDF (Virtual Outliner)";
function supportDir() {
  const { path, os } = node();
  return path.join(os.homedir(), "Library", "Application Support", "virtual-outliner");
}
function buildRoot() {
  const { path, os } = node();
  return path.join(os.tmpdir(), "virtual-outliner-export");
}
function rendererHash() {
  var _a;
  const hash = node().crypto.createHash("sha256");
  for (const name of Object.keys(RENDERER_FILES).sort()) {
    hash.update(name).update("\0").update((_a = RENDERER_FILES[name]) != null ? _a : "").update("\0");
  }
  return hash.digest("hex").slice(0, 8);
}
async function ensureRenderer(pluginVersion) {
  const { fs, path } = node();
  const root = path.join(supportDir(), "renderer");
  const name = `${pluginVersion}-${rendererHash()}`;
  const dir = path.join(root, name);
  await fs.promises.mkdir(root, { recursive: true });
  if (!fs.existsSync(path.join(dir, "render-pdf.sh"))) {
    const tmp = `${dir}.partial-${node().crypto.randomBytes(4).toString("hex")}`;
    for (const [rel, content] of Object.entries(RENDERER_FILES)) {
      const file = path.join(tmp, rel);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, content, "utf8");
    }
    try {
      await fs.promises.rename(tmp, dir);
    } catch (e) {
      await fs.promises.rm(tmp, { recursive: true, force: true });
    }
  }
  const link = path.join(root, "current");
  const tmpLink = `${link}.partial-${node().crypto.randomBytes(4).toString("hex")}`;
  await fs.promises.symlink(name, tmpLink);
  await fs.promises.rename(tmpLink, link);
  await pruneVersions(root, name);
  return dir;
}
async function pruneVersions(root, keep) {
  const { fs, path } = node();
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(root, e.name);
    if (e.name.includes(".partial-")) {
      const stat = await fs.promises.stat(full);
      if (Date.now() - stat.mtimeMs > 60 * 60 * 1e3) await fs.promises.rm(full, { recursive: true, force: true });
      continue;
    }
    dirs.push({ name: e.name, mtime: (await fs.promises.stat(full)).mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  const survivors = /* @__PURE__ */ new Set([keep, ...dirs.slice(0, KEEP_VERSIONS).map((d) => d.name)]);
  for (const d of dirs) {
    if (!survivors.has(d.name)) await fs.promises.rm(path.join(root, d.name), { recursive: true, force: true });
  }
}
async function writeVaultConfig(vaultName, config) {
  const { fs, path } = node();
  const dir = path.join(supportDir(), "vaults", vaultName.replace(/[/:]/g, "_"));
  await fs.promises.mkdir(dir, { recursive: true });
  const preamblePath = path.join(dir, "preamble.tex");
  const preamble = config.export.preamble.trim() !== "" ? config.export.preamble : config.defaultPreamble;
  await fs.promises.writeFile(preamblePath, preamble, "utf8");
  const json = {
    sigil: config.sigil,
    author: config.export.author,
    preamblePath,
    defaults: {
      headnum: config.export.headnum,
      toc: config.export.toc,
      notes: config.export.notes,
      cite: config.export.cite
    }
  };
  await fs.promises.writeFile(path.join(dir, "config.json"), JSON.stringify(json, null, 2), "utf8");
}
var SEARCH_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/Library/TeX/texbin", "/usr/bin", "/bin"];
function findTool(name) {
  const { fs, path } = node();
  for (const dir of SEARCH_PATH) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (e) {
    }
  }
  return null;
}
var REQUIRED_TOOLS = ["pandoc", "latexmk", "lualatex", "python3"];
function missingTools() {
  return REQUIRED_TOOLS.filter((t) => findTool(t) === null);
}
async function pruneBuildDirs() {
  const { fs, path } = node();
  const root = buildRoot();
  if (!fs.existsSync(root)) return;
  for (const vault of await fs.promises.readdir(root)) {
    const vaultDir = path.join(root, vault);
    for (const note of await fs.promises.readdir(vaultDir).catch(() => [])) {
      const dir = path.join(vaultDir, note);
      const stat = await fs.promises.stat(dir).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > BUILD_DIR_MAX_AGE_MS) {
        await fs.promises.rm(dir, { recursive: true, force: true });
      }
    }
  }
}
function xmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function installQuickAction() {
  const { fs, path, os, childProcess } = node();
  const command = [
    "#!/bin/zsh",
    'R="$HOME/Library/Application Support/virtual-outliner/renderer/current/quick-action.sh"',
    'if [[ ! -f "$R" ]]; then',
    `  osascript -e 'display dialog "Open Obsidian with Virtual Outliner enabled once to install the PDF renderer." buttons {"OK"} default button "OK" with icon caution'`,
    "  exit 1",
    "fi",
    'exec /bin/zsh "$R" "$@"',
    ""
  ].join("\n");
  const dir = path.join(os.homedir(), "Library", "Services", `${QUICK_ACTION_NAME}.workflow`, "Contents");
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(
    path.join(dir, "Info.plist"),
    QUICK_ACTION_TEMPLATE.info.replace("@@NAME@@", xmlEscape(QUICK_ACTION_NAME)),
    "utf8"
  );
  await fs.promises.writeFile(
    path.join(dir, "document.wflow"),
    QUICK_ACTION_TEMPLATE.document.replace("@@COMMAND@@", xmlEscape(command)),
    "utf8"
  );
  childProcess.execFile("/System/Library/CoreServices/pbs", ["-update"], () => void 0);
  return path.dirname(dir);
}

// src/export/zotero.ts
function zoteroManager(app) {
  var _a, _b;
  const plugins = (_a = app.plugins) == null ? void 0 : _a.plugins;
  const api = (_b = plugins == null ? void 0 : plugins["zotero-manager"]) == null ? void 0 : _b.api;
  if (!api || typeof api.version !== "number" || api.version < 1) return null;
  if (typeof api.isAvailable !== "function" || typeof api.getItemJSON !== "function" || typeof api.getAllCiteKeys !== "function") {
    return null;
  }
  return api;
}
async function fetchCitations(app, keys) {
  const api = zoteroManager(app);
  if (!api) {
    return {
      ok: false,
      reason: "not-installed",
      message: "This note cites sources, but the Zotero Manager plugin is not installed or enabled."
    };
  }
  if (!await api.isAvailable()) {
    return {
      ok: false,
      reason: "not-running",
      message: "Zotero isn't running. Start Zotero (with Better BibTeX) and export again."
    };
  }
  const { byLibrary, unknown } = groupKeysByLibrary(keys, await api.getAllCiteKeys(true));
  const items = [];
  for (const [library, libKeys] of byLibrary) {
    const got = await api.getItemJSON(
      libKeys.map((key) => ({ key, library })),
      library
    );
    if (got === null) {
      return { ok: false, reason: "failed", message: "Zotero Manager could not export citation data from Zotero." };
    }
    items.push(...got);
  }
  return { ok: true, items, unknownKeys: unknown };
}

// src/export/exporter.ts
var RENDER_TIMEOUT_MS = 5 * 60 * 1e3;
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "bmp", "svg", "heic", "avif"]);
function vaultBasePath(app) {
  const adapter = app.vault.adapter;
  return adapter instanceof import_obsidian3.FileSystemAdapter ? adapter.getBasePath() : null;
}
function sha(text2) {
  return node().crypto.createHash("sha1").update(text2).digest("hex").slice(0, 12);
}
var PdfExporter = class {
  constructor(host) {
    this.host = host;
  }
  async plan(file, doc) {
    var _a, _b, _c, _d;
    const base = vaultBasePath(this.host.app);
    if (base === null) return "PDF export needs a vault stored on this computer.";
    const { path, os } = node();
    const settings = this.host.settings();
    const extraction = extractBody(doc, this.host.sigilChar());
    if (extraction.isEmpty) return `${file.basename} has no body text to export yet \u2014 only outline entries.`;
    const fm = (_a = this.host.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
    const options = resolveExportOptions(
      fm,
      { headnum: settings.headnum, toc: settings.toc, notes: settings.notes, cite: settings.cite },
      file.basename
    );
    const noteDir = path.join(base, (_c = (_b = file.parent) == null ? void 0 : _b.path) != null ? _c : "");
    return {
      file,
      extraction,
      options,
      fontsize: (_d = options.fontsize) != null ? _d : settings.lastFontSize,
      outputPath: resolvePdfOutput(options.pdfOutput, noteDir, file.basename, os.homedir()),
      preambleSource: (await this.resolvePreamble(file, options)).label
    };
  }
  // Frontmatter latex-preamble → Pre*.tex beside the note → settings → bundled.
  async resolvePreamble(file, options) {
    var _a;
    const { vault, metadataCache } = this.host.app;
    if (options.latexPreamble !== "") {
      const target = (_a = metadataCache.getFirstLinkpathDest(options.latexPreamble, file.path)) != null ? _a : vault.getFileByPath(options.latexPreamble);
      if (target) return { text: await vault.read(target), label: target.path };
    }
    const parent = file.parent;
    if (parent instanceof import_obsidian3.TFolder) {
      const local = parent.children.filter((c) => "extension" in c && c.name.startsWith("Pre") && c.name.endsWith(".tex")).sort((a, b) => a.name.localeCompare(b.name))[0];
      if (local) return { text: await vault.read(local), label: local.path };
    }
    const fromSettings = this.host.settings().preamble;
    if (fromSettings.trim() !== "") return { text: fromSettings, label: "Settings \u2192 LaTeX preamble" };
    return { text: DEFAULT_PREAMBLE, label: "Built-in default preamble" };
  }
  async run(plan, progress) {
    var _a, _b, _c, _d, _e, _f;
    const { fs, path } = node();
    const { app } = this.host;
    const base = vaultBasePath(app);
    if (base === null) return { ok: false, stage: "vault", message: "PDF export needs a vault stored on this computer.", buildDir: null, logPath: null };
    const missing = missingTools();
    if (missing.length > 0) {
      return {
        ok: false,
        stage: "tools",
        message: `Missing ${missing.join(", ")}. PDF export needs pandoc, MacTeX (latexmk, lualatex) and python3.`,
        buildDir: null,
        logPath: null
      };
    }
    progress("Preparing renderer\u2026");
    const renderer = await ensureRenderer(this.host.pluginVersion);
    const buildDir = path.join(buildRoot(), sha(base), sha(plan.file.path));
    await fs.promises.rm(buildDir, { recursive: true, force: true });
    await fs.promises.mkdir(path.join(buildDir, "assets"), { recursive: true });
    const fail = (stage, message) => ({ ok: false, stage, message, buildDir, logPath: null });
    progress("Converting note\u2026");
    const staged = /* @__PURE__ */ new Map();
    const resolver = {
      resolveLink: (linkpath, fromPath) => {
        const target = app.metadataCache.getFirstLinkpathDest(linkpath, fromPath);
        if (!target) return null;
        const ext = target.extension.toLowerCase();
        return { path: target.path, kind: ext === "md" ? "markdown" : IMAGE_EXTENSIONS.has(ext) ? "image" : "other" };
      },
      readNote: async (notePath) => {
        const f = app.vault.getFileByPath(notePath);
        return f ? app.vault.cachedRead(f) : "";
      },
      stageImage: (imagePath) => {
        let rel = staged.get(imagePath);
        if (rel === void 0) {
          rel = `assets/${staged.size + 1}-${path.basename(imagePath)}`;
          staged.set(imagePath, rel);
        }
        return rel;
      }
    };
    const converted = await toPandocMarkdown(plan.extraction.body, plan.file.path, this.host.sigilChar(), resolver);
    for (const [vaultPath, rel] of staged) {
      await fs.promises.copyFile(path.join(base, vaultPath), path.join(buildDir, rel));
    }
    let bibliography = "";
    let unknownKeys = [];
    const keys = collectCiteKeys(converted.markdown);
    if (keys.length > 0) {
      if (plan.options.bibliography !== "") {
        const bib = app.metadataCache.getFirstLinkpathDest(plan.options.bibliography, plan.file.path);
        const abs = bib ? path.join(base, bib.path) : path.resolve(path.join(base, (_b = (_a = plan.file.parent) == null ? void 0 : _a.path) != null ? _b : ""), plan.options.bibliography);
        if (!fs.existsSync(abs)) return fail("citations", `The bibliography file in this note's frontmatter wasn't found: ${plan.options.bibliography}`);
        bibliography = abs;
      } else {
        progress("Fetching citations from Zotero\u2026");
        const fetched = await fetchCitations(app, keys);
        if (!fetched.ok) return fail("citations", `${fetched.message} (${keys.length} cited source${keys.length === 1 ? "" : "s"}).`);
        unknownKeys = fetched.unknownKeys;
        await fs.promises.writeFile(path.join(buildDir, "refs.json"), JSON.stringify(fetched.items, null, 2), "utf8");
        bibliography = "refs.json";
      }
    }
    const preamble = await this.resolvePreamble(plan.file, plan.options);
    const settings = this.host.settings();
    await fs.promises.writeFile(path.join(buildDir, "preamble.tex"), preamble.text, "utf8");
    await fs.promises.writeFile(path.join(buildDir, "source.md"), `${converted.markdown}
`, "utf8");
    const job = {
      version: 1,
      source: "source.md",
      output: plan.outputPath,
      fontsize: plan.fontsize,
      headnum: plan.options.headnum,
      toc: plan.options.toc,
      notes: plan.options.notes,
      preamble: "preamble.tex",
      bibliography,
      cite: plan.options.cite,
      title: plan.options.title,
      author: (_c = plan.options.author) != null ? _c : settings.author,
      resourcePath: path.join(base, (_e = (_d = plan.file.parent) == null ? void 0 : _d.path) != null ? _e : "")
    };
    const jobPath = path.join(buildDir, "job.json");
    await fs.promises.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");
    progress("Typesetting PDF\u2026");
    const status = await runRenderer(path.join(renderer, "render-pdf.sh"), jobPath, buildDir);
    if (!status.ok) {
      const log = (_f = ["doc.log", "render.log"].map((f) => path.join(buildDir, f)).find((f) => fs.existsSync(f))) != null ? _f : null;
      return { ok: false, stage: status.stage, message: status.message, buildDir, logPath: log };
    }
    if (!settings.keepBuildFiles) await fs.promises.rm(buildDir, { recursive: true, force: true });
    return { ok: true, output: status.output, issues: converted.issues, unknownKeys };
  }
};
function runRenderer(script, jobPath, cwd) {
  const { childProcess, process } = node();
  return new Promise((resolve) => {
    var _a, _b;
    const env = { ...process.env, PATH: [...SEARCH_PATH, "/usr/sbin", "/sbin", (_a = process.env.PATH) != null ? _a : ""].join(":") };
    const child = childProcess.execFile(
      "/bin/zsh",
      [script, "--job", jobPath],
      { cwd, env, timeout: RENDER_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        var _a2, _b2, _c;
        const last = (_a2 = stdout.trim().split("\n").pop()) != null ? _a2 : "";
        try {
          const parsed = JSON.parse(last);
          if (parsed.ok === true && typeof parsed.output === "string") {
            resolve({ ok: true, output: parsed.output });
            return;
          }
          resolve({ ok: false, stage: (_b2 = parsed.stage) != null ? _b2 : "render", message: (_c = parsed.message) != null ? _c : "The renderer failed." });
        } catch (e) {
          const detail = (error == null ? void 0 : error.killed) ? "The renderer timed out." : (stderr || stdout || (error == null ? void 0 : error.message) || "").trim().slice(-2e3);
          resolve({ ok: false, stage: "render", message: detail || "The renderer failed without a message." });
        }
      }
    );
    (_b = child.stdin) == null ? void 0 : _b.end();
  });
}

// src/settingsTab.ts
var import_obsidian4 = require("obsidian");

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
var VirtualOutlinerSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian4.Setting(containerEl).setName("Depth sigil").setDesc(
      'The character repeated at line start to mark an outline entry (e.g. "@@ text" is a level-2 entry). Exactly one character.'
    ).addText((text2) => {
      text2.setValue(this.plugin.settings.sigil).onChange(async (value) => {
        const char = value.trim();
        if (char.length !== 1 || /\s/.test(char)) return;
        this.plugin.settings.sigil = char;
        await this.plugin.saveSettings();
        this.display();
      });
      text2.inputEl.maxLength = 1;
    });
    if (isRiskySigil(this.plugin.settings.sigil)) {
      containerEl.createEl("p", {
        cls: "vo-fixture-note",
        text: `"${this.plugin.settings.sigil}" already opens a markdown block construct (heading, list, quote, \u2026) at line start and may collide with it.`
      });
    }
    new import_obsidian4.Setting(containerEl).setName("Default view state").setDesc("The view a note opens in when it has no view state recorded yet.").addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(VIEW_STATE_OPTIONS)) dropdown.addOption(value, label);
      dropdown.setValue(this.plugin.settings.defaultViewState).onChange(async (value) => {
        this.plugin.settings.defaultViewState = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian4.Setting(containerEl).setName("Indent body under its outline level").setDesc("Visual only \u2014 the file itself is never re-indented.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.indentBody).onChange(async (value) => {
        this.plugin.settings.indentBody = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian4.Setting(containerEl).setName("Enter at the end of an entry").setDesc(
      "Where the new same-level entry goes. After the whole section keeps the current entry's body and sub-entries with it; on the next line puts the new entry directly below, so that body and those sub-entries move under the new entry. Pressing return in the middle of an entry always splits it in place."
    ).addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(ENTER_BEHAVIOR_OPTIONS)) dropdown.addOption(value, label);
      dropdown.setValue(this.plugin.settings.enterBehavior).onChange(async (value) => {
        this.plugin.settings.enterBehavior = value === "line" ? "line" : "section";
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian4.Setting(containerEl).setName("Level format").setHeading();
    containerEl.createEl("p", {
      cls: "vo-fixture-note",
      text: 'One format applied to every outline level (e.g. "1.2.1" from repeated Number style + Separator). Indent step and Space above still accumulate with depth, so deeper levels sit further right and further apart even though the format itself is shared.'
    });
    this.renderLevelSetting(containerEl);
    new import_obsidian4.Setting(containerEl).setName("Metadata fields").setHeading();
    containerEl.createEl("p", {
      cls: "vo-fixture-note",
      text: "Per-node fields (status, note, \u2026) exposed to Dataview/Datacore and stored in the end-of-file %%md-outline block."
    });
    this.renderMetaFields(containerEl);
    this.renderToolbarSection(containerEl);
    this.renderPdfExportSection(containerEl);
  }
  // ── PDF export ──
  renderPdfExportSection(containerEl) {
    new import_obsidian4.Setting(containerEl).setName("PDF export").setHeading();
    if (!import_obsidian4.Platform.isDesktopApp) {
      containerEl.createEl("p", { cls: "vo-fixture-note", text: "PDF export runs on desktop only." });
      return;
    }
    const pdf = this.plugin.settings.pdfExport;
    containerEl.createEl("p", {
      cls: "vo-fixture-note",
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- headnum, TOC, notes, cite, pdf-output are literal frontmatter keys
      text: "Export to PDF typesets only the body text, never the outline. These are the defaults; a note's frontmatter (headnum, TOC, notes, cite, pdf-output) overrides them."
    });
    new import_obsidian4.Setting(containerEl).setName("Author").setDesc("Shown in the running header. Frontmatter: author.").addText(
      (text2) => text2.setValue(pdf.author).onChange(async (value) => {
        pdf.author = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Number headings").addToggle(
      (t) => t.setValue(pdf.headnum).onChange(async (v) => {
        pdf.headnum = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Table of contents").addToggle(
      (t) => t.setValue(pdf.toc).onChange(async (v) => {
        pdf.toc = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Notes").addDropdown(
      (dd) => dd.addOption("f", "Footnotes at the bottom of the page").addOption("e", "Endnotes at the end of the document").setValue(pdf.notes).onChange(async (v) => {
        pdf.notes = v === "e" ? "e" : "f";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Citation style").setDesc("Citation data comes from Zotero through the Zotero Manager plugin; Zotero must be running.").addDropdown((dd) => {
      for (const style of CITE_STYLES) dd.addOption(style, style.replace("-", " "));
      dd.setValue(CITE_STYLES.includes(pdf.cite) ? pdf.cite : "MLA").onChange(async (v) => {
        pdf.cite = v;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian4.Setting(containerEl).setName("Open PDF after export").addToggle(
      (t) => t.setValue(pdf.openAfterExport).onChange(async (v) => {
        pdf.openAfterExport = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Keep build files").setDesc("Keep the generated .tex, log and converted Markdown after a successful export. They are always kept after a failure.").addToggle(
      (t) => t.setValue(pdf.keepBuildFiles).onChange(async (v) => {
        pdf.keepBuildFiles = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("LaTeX preamble").setDesc("Included in every export, after pandoc's own setup. A Pre*.tex beside a note, or latex-preamble: in its frontmatter, takes precedence.").addButton(
      (b) => b.setButtonText("Import from file\u2026").onClick(() => {
        const input = activeDocument.createElement("input");
        input.type = "file";
        input.accept = ".tex,text/plain";
        input.onchange = async () => {
          var _a;
          const file = (_a = input.files) == null ? void 0 : _a[0];
          if (!file) return;
          pdf.preamble = await file.text();
          await this.plugin.saveSettings();
          new import_obsidian4.Notice(`Preamble imported from ${file.name}`);
          this.display();
        };
        input.click();
      })
    ).addButton(
      (b) => b.setButtonText("Reset to default").onClick(async () => {
        pdf.preamble = this.plugin.defaultPreamble();
        await this.plugin.saveSettings();
        this.display();
      })
    );
    const area = containerEl.createEl("textarea", { cls: "vo-preamble-editor" });
    area.value = pdf.preamble;
    area.spellcheck = false;
    area.rows = 25;
    const warnings = containerEl.createDiv({ cls: "vo-preamble-warnings" });
    const showWarnings = () => {
      warnings.empty();
      for (const w of checkPreamble(area.value)) warnings.createDiv({ text: w });
    };
    showWarnings();
    let timer = null;
    area.addEventListener("input", () => {
      showWarnings();
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        pdf.preamble = area.value;
        void this.plugin.saveSettings();
      }, 600);
    });
    const status = this.plugin.pdfToolStatus();
    new import_obsidian4.Setting(containerEl).setName("Renderer").setDesc(status).addButton(
      (b) => b.setButtonText("Install quick action").onClick(async () => {
        await this.plugin.installQuickActionFromSettings();
      })
    );
  }
  // ── Note Toolbar buttons (ported from md-annotation's Note Toolbar tab) ──
  renderToolbarSection(containerEl) {
    new import_obsidian4.Setting(containerEl).setName("Note Toolbar buttons").setHeading();
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
    new import_obsidian4.Setting(containerEl).setName(name).setDesc("Toolbar, then the button within it").addDropdown((dropdown) => {
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
      for (const [text2, opt] of [
        ["On", highlight.on[theme]],
        ["Off", highlight.off[theme]]
      ]) {
        const span = exampleTd.createEl("span", { text: text2 });
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
    new import_obsidian4.Setting(containerEl).setName("Number style").setDesc(`How each level's segment of the composite label is numbered (e.g. "1" + "." gives "1.2.1").`).addDropdown((dropdown) => {
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
    new import_obsidian4.Setting(containerEl).setName("Italic").setDesc("Renders every level's number and entry text in italics.").addToggle((toggle) => {
      toggle.setValue(format.italic);
      toggle.onChange(async (value) => {
        await applyToAllLevels((level) => {
          level.italic = value;
        });
      });
    });
    new import_obsidian4.Setting(containerEl).setName("Colour").setDesc("Colour of every level's number and entry text.").addColorPicker((picker) => {
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
    new import_obsidian4.Setting(containerEl).setName(name).setDesc(desc).addText((text2) => {
      text2.setValue(value);
      text2.onChange(async (next) => {
        await apply(next);
      });
    });
  }
  renderMetaFields(containerEl) {
    const fields = this.plugin.settings.metaFields;
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field) continue;
      const setting = new import_obsidian4.Setting(containerEl).setName(`Field ${i + 1}`);
      setting.addText((text2) => {
        text2.setPlaceholder("Name").setValue(field.name);
        text2.onChange(async (value) => {
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
        setting.addText((text2) => {
          text2.setPlaceholder("Options, comma-separated").setValue(field.options.join(", "));
          text2.onChange(async (value) => {
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
    new import_obsidian4.Setting(containerEl).addButton((button) => {
      button.setButtonText("Add field").onClick(async () => {
        fields.push({ name: `Field ${fields.length + 1}`, type: "text", options: [] });
        await this.plugin.saveSettings();
        this.display();
      });
    });
  }
};

// src/ui/exportModal.ts
var import_obsidian5 = require("obsidian");
var LOST_LABELS = {
  footnote: "footnote",
  citation: "citation",
  link: "link",
  embed: "embed"
};
var ExportPdfModal = class extends import_obsidian5.Modal {
  constructor(app, plan, onSubmit) {
    super(app);
    this.plan = plan;
    this.onSubmit = onSubmit;
    this.submitted = false;
  }
  onOpen() {
    const { contentEl, plan } = this;
    this.setTitle(`Export "${plan.file.basename}" to PDF`);
    contentEl.addClass("vo-export-modal");
    new import_obsidian5.Setting(contentEl).setName("Font size").addDropdown((dd) => {
      for (const size of FONT_SIZES) dd.addOption(size, `${size} pt`);
      dd.setValue(plan.fontsize).onChange((v) => plan.fontsize = v);
    });
    new import_obsidian5.Setting(contentEl).setName("Number headings").setDesc("Frontmatter: headnum").addToggle((t) => t.setValue(plan.options.headnum).onChange((v) => plan.options.headnum = v));
    new import_obsidian5.Setting(contentEl).setName("Table of contents").setDesc("Frontmatter: TOC").addToggle((t) => t.setValue(plan.options.toc).onChange((v) => plan.options.toc = v));
    new import_obsidian5.Setting(contentEl).setName("Notes").setDesc("Frontmatter: notes (e or f)").addDropdown(
      (dd) => dd.addOption("f", "Footnotes at the bottom of the page").addOption("e", "Endnotes at the end of the document").setValue(plan.options.notes).onChange((v) => plan.options.notes = v === "e" ? "e" : "f")
    );
    new import_obsidian5.Setting(contentEl).setName("Citation style").setDesc("Frontmatter: cite \u2014 used only when the note cites sources").addDropdown((dd) => {
      for (const style of CITE_STYLES) dd.addOption(style, style.replace("-", " "));
      if (!CITE_STYLES.some((s) => s.toLowerCase() === plan.options.cite.toLowerCase())) {
        dd.addOption(plan.options.cite, plan.options.cite);
      }
      const match = CITE_STYLES.find((s) => s.toLowerCase() === plan.options.cite.toLowerCase());
      dd.setValue(match != null ? match : plan.options.cite).onChange((v) => plan.options.cite = v);
    });
    const where = contentEl.createDiv({ cls: "vo-export-where" });
    where.createDiv({ text: "Output", cls: "vo-export-label" });
    where.createDiv({ text: plan.outputPath, cls: "vo-export-path" });
    where.createDiv({
      text: plan.options.pdfOutput !== "" ? "From the note's pdf-output." : "Beside the note. Set pdf-output: in the frontmatter to change it.",
      cls: "setting-item-description"
    });
    where.createDiv({ text: `Preamble: ${plan.preambleSource}`, cls: "setting-item-description" });
    if (plan.extraction.lost.length > 0) {
      const warn = contentEl.createDiv({ cls: "vo-export-warnings" });
      warn.createDiv({ text: "Written on outline entries, so left out of the PDF:", cls: "vo-export-label" });
      const list = warn.createEl("ul");
      for (const item of plan.extraction.lost) {
        const kinds = item.kinds.map((k) => LOST_LABELS[k]).join(", ");
        list.createEl("li", { text: `Line ${item.line + 1} \u2014 ${kinds}: ${item.text}` });
      }
    }
    new import_obsidian5.Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Export").setCta().onClick(() => this.submit())
    );
    this.scope.register([], "Enter", (evt) => {
      evt.preventDefault();
      this.submit();
      return false;
    });
  }
  submit() {
    if (this.submitted) return;
    this.submitted = true;
    this.close();
    this.onSubmit(this.plan);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ExportErrorModal = class extends import_obsidian5.Modal {
  constructor(app, stage, message, buildDir, logPath, openPath) {
    super(app);
    this.stage = stage;
    this.message = message;
    this.buildDir = buildDir;
    this.logPath = logPath;
    this.openPath = openPath;
  }
  onOpen() {
    const { contentEl } = this;
    this.setTitle("PDF export failed");
    contentEl.addClass("vo-export-modal");
    contentEl.createDiv({ text: `Stage: ${this.stage}`, cls: "setting-item-description" });
    contentEl.createEl("pre", { text: this.message, cls: "vo-export-error" });
    if (this.buildDir !== null) {
      contentEl.createDiv({ text: `Build files were kept in ${this.buildDir}`, cls: "setting-item-description" });
    }
    const buttons = new import_obsidian5.Setting(contentEl);
    const { buildDir, logPath } = this;
    if (buildDir !== null) buttons.addButton((b) => b.setButtonText("Open build folder").onClick(() => this.openPath(buildDir)));
    if (logPath !== null) buttons.addButton((b) => b.setButtonText("Open log").onClick(() => this.openPath(logPath)));
    buttons.addButton(
      (b) => b.setButtonText("Close").setCta().onClick(() => this.close())
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ui/sidebar.ts
var import_obsidian6 = require("obsidian");
var SIDEBAR_VIEW_TYPE = "virtual-outliner-sidebar";
var OutlineSidebarView = class extends import_obsidian6.ItemView {
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
    for (const node2 of parsed.flat) {
      if (!node2.text.toLowerCase().includes(trimmed)) continue;
      let cur = node2;
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
    for (const node2 of parsed.roots) {
      this.renderNode(treeEl, path, node2, levels, matches, trimmedQuery);
    }
  }
  renderNode(container, path, node2, levels, matches, trimmedQuery) {
    if (matches && !matches.has(node2)) return;
    const row = container.createDiv({ cls: "vo-node" });
    if (trimmedQuery !== "" && node2.text.toLowerCase().includes(trimmedQuery)) {
      row.addClass("vo-node-match");
    }
    const hasChildren = node2.children.length > 0;
    const hasOwnBody = node2.ownBodyStart < node2.ownBodyEnd;
    const canToggle = hasChildren || hasOwnBody;
    const collapsed = node2.id !== null && this.host.isCollapsed(path, node2.id);
    const toggle = row.createDiv({ cls: `vo-node-toggle${canToggle ? "" : " vo-node-toggle-empty"}` });
    if (canToggle) {
      (0, import_obsidian6.setIcon)(toggle, collapsed ? "chevron-right" : "chevron-down");
      toggle.addEventListener("click", (evt) => {
        evt.stopPropagation();
        this.host.toggleCollapsed(path, node2);
      });
    }
    row.createSpan({ cls: "vo-node-label", text: computeLabel(levels, node2) });
    row.createSpan({ cls: "vo-node-text", text: node2.text === "" ? "(empty)" : node2.text });
    row.addEventListener("click", () => this.host.jumpToNode(path, node2));
    if (hasChildren) {
      const expanded = matches !== null || !collapsed;
      const childrenEl = container.createDiv({
        cls: `vo-node-children${expanded ? "" : " vo-collapsed"}`
      });
      for (const child of node2.children) {
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
var VirtualOutlinerPlugin = class extends import_obsidian7.Plugin {
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
    this.pdfExporter = null;
    this.exportRunning = false;
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
    if (this.settings.pdfExport.preamble.trim() === "") {
      this.settings.pdfExport.preamble = DEFAULT_PREAMBLE;
      await this.persist();
    }
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
        new import_obsidian7.Notice("Hidden text is not deleted from this view \u2014 switch to outline and body to edit it.");
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
        new import_obsidian7.Notice(this.settings.indentBody ? "Indent body with outline: on" : "Indent body with outline: off");
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
        new import_obsidian7.Notice(
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
    if (import_obsidian7.Platform.isDesktopApp) {
      this.pdfExporter = new PdfExporter({
        app: this.app,
        pluginVersion: this.manifest.version,
        sigilChar: () => this.settings.sigil,
        settings: () => this.settings.pdfExport
      });
      this.addCommand({
        id: "export-pdf",
        name: "Export to PDF",
        checkCallback: (checking) => {
          const file = this.activeMarkdownFile();
          if (!file) return false;
          if (checking) return true;
          void this.exportPdf(file);
          return true;
        }
      });
      this.app.workspace.onLayoutReady(() => void this.setupPdfRenderer());
    }
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
    if (import_obsidian7.Platform.isDesktopApp) void this.syncVaultConfig();
    this.applyLevelCssVars();
    for (const view of this.editors) this.decorate(view);
    this.rerenderPreviews(null);
    this.notifyChange();
    this.scheduleToolbarRefresh();
  }
  // ── PDF export ──
  defaultPreamble() {
    return DEFAULT_PREAMBLE;
  }
  async setupPdfRenderer() {
    try {
      await ensureRenderer(this.manifest.version);
      await this.syncVaultConfig();
      await pruneBuildDirs();
    } catch (e) {
      console.error("Virtual Outliner: could not install the PDF renderer", e);
    }
  }
  async syncVaultConfig() {
    try {
      await writeVaultConfig(this.app.vault.getName(), {
        sigil: this.settings.sigil,
        export: this.settings.pdfExport,
        defaultPreamble: DEFAULT_PREAMBLE
      });
    } catch (e) {
      console.error("Virtual Outliner: could not write the vault config for the quick action", e);
    }
  }
  pdfToolStatus() {
    const missing = new Set(missingTools());
    const tools = REQUIRED_TOOLS.map((t) => `${t} ${missing.has(t) ? "\u2717 missing" : "\u2713"}`).join(" \xB7 ");
    return `${tools}. Installed in ${supportDir()}/renderer. The Finder quick action "Convert Md to PDF" uses the same renderer and refuses notes that have an outline.`;
  }
  async installQuickActionFromSettings() {
    try {
      await ensureRenderer(this.manifest.version);
      await this.syncVaultConfig();
      const path = await installQuickAction();
      new import_obsidian7.Notice(`Quick action installed: ${path}`);
    } catch (e) {
      new import_obsidian7.Notice(`Could not install the quick action: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  openPath(path) {
    const shell = electronShell();
    if (shell) void shell.openPath(path);
  }
  async exportPdf(file) {
    const exporter = this.pdfExporter;
    if (!exporter) return;
    if (vaultBasePath(this.app) === null) {
      new import_obsidian7.Notice("PDF export needs a vault stored on this computer.");
      return;
    }
    if (this.exportRunning) {
      new import_obsidian7.Notice("A PDF export is already running.");
      return;
    }
    const view = this.editorFor(file.path);
    const doc = view ? view.state.doc.toString() : await this.app.vault.read(file);
    const plan = await exporter.plan(file, doc);
    if (typeof plan === "string") {
      new import_obsidian7.Notice(plan);
      return;
    }
    new ExportPdfModal(this.app, plan, (finalPlan) => void this.runExport(exporter, finalPlan)).open();
  }
  async runExport(exporter, plan) {
    var _a;
    this.exportRunning = true;
    const progress = new import_obsidian7.Notice("Exporting PDF\u2026", 0);
    try {
      if (plan.fontsize !== this.settings.pdfExport.lastFontSize) {
        this.settings.pdfExport.lastFontSize = plan.fontsize;
        await this.persist();
      }
      const outcome = await exporter.run(plan, (msg) => progress.setMessage(msg));
      progress.hide();
      if (!outcome.ok) {
        new ExportErrorModal(
          this.app,
          outcome.stage,
          outcome.message,
          outcome.buildDir,
          outcome.logPath,
          (p) => this.openPath(p)
        ).open();
        return;
      }
      new import_obsidian7.Notice(`PDF saved to ${outcome.output}`, 8e3);
      if (outcome.unknownKeys.length > 0) {
        new import_obsidian7.Notice(`Zotero doesn't know these cite keys: ${outcome.unknownKeys.join(", ")}`, 12e3);
      }
      if (outcome.issues.length > 0) {
        const targets = outcome.issues.map((i) => `${i.target} (${i.kind})`).join(", ");
        new import_obsidian7.Notice(`Left out of the PDF: ${targets}`, 12e3);
      }
      if (this.settings.pdfExport.openAfterExport) this.openPath(outcome.output);
    } catch (e) {
      progress.hide();
      new ExportErrorModal(
        this.app,
        "plugin",
        e instanceof Error ? (_a = e.stack) != null ? _a : e.message : String(e),
        null,
        null,
        (p) => this.openPath(p)
      ).open();
    } finally {
      this.exportRunning = false;
    }
  }
  // Reading view is a one-shot post-processor render, so anything that
  // changes what it should draw (settings, view state, a collapse) has to
  // ask Obsidian to run it again — the editor's decoration path has no
  // equivalent effect on it. `path === null` means every open preview.
  rerenderPreviews(path) {
    var _a;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian7.MarkdownView)) continue;
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
    const node2 = ownerNodeAtLine(body, lineIndex, this.settings.sigil);
    if (!node2) {
      new import_obsidian7.Notice("Put the cursor on an outline entry or its body to collapse it.");
      return;
    }
    if (!hasFoldableContent(body.split("\n"), node2)) {
      new import_obsidian7.Notice("Nothing to collapse under this entry.");
      return;
    }
    const collapsing = node2.id === null || !this.collapsedIdsFor(path).has(node2.id);
    let moveCaret = false;
    if (collapsing && caretView) {
      const caretLine = caretView.state.doc.lineAt(caretView.state.selection.main.head).number - 1;
      moveCaret = caretLine > node2.entryLine && caretLine < node2.subtreeEnd;
    }
    this.toggleCollapsed(path, node2, moveCaret ? caretView : null);
  }
  toggleCollapsed(path, node2, caretView = null) {
    var _a, _b;
    if (node2.id !== null) {
      if (caretView) {
        const line = caretView.state.doc.line(node2.entryLine + 1);
        const idMatch = ID_SUFFIX_RE.exec(line.text);
        const visibleEnd = line.from + (idMatch ? idMatch.index : line.text.length);
        caretView.dispatch({ selection: { anchor: visibleEnd } });
      }
      this.flipCollapse(path, node2.id);
      return;
    }
    const view = this.editorFor(path);
    if (!view) {
      new import_obsidian7.Notice("Open this note to collapse an entry that doesn't have a stable ID yet.");
      return;
    }
    const doc = view.state.doc.toString();
    const { body } = parseMetaDocument(doc);
    const lines = body.split("\n");
    const lineText = (_a = lines[node2.entryLine]) != null ? _a : "";
    const offsets = lineStartOffsets(lines);
    const lineStart = (_b = offsets[node2.entryLine]) != null ? _b : 0;
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
      for (const node2 of eligible) {
        if (node2.id !== null) {
          entry.collapsedIds.add(node2.id);
          continue;
        }
        const lineText = (_a = lines[node2.entryLine]) != null ? _a : "";
        const lineStart = (_b = offsets[node2.entryLine]) != null ? _b : 0;
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
      for (const node2 of eligible) {
        if (node2.id !== null) entry.collapsedIds.add(node2.id);
        else missingIdSkipped = true;
      }
    }
    void this.persist();
    this.decorateAllFor(path);
    this.notifyChange();
    if (missingIdSkipped) new import_obsidian7.Notice("Open this note to fold every entry \u2014 some don't have a stable ID yet.");
  }
  expandAll(path) {
    this.fileStateEntry(path).collapsedIds.clear();
    void this.persist();
    this.decorateAllFor(path);
    this.notifyChange();
  }
  // ── Per-file parse/decoration state ──────────────────────────────────────
  async ensureFileState(path) {
    const cached2 = this.states.get(path);
    if (cached2) return cached2;
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
    new import_obsidian7.Notice(`Generated ${target}`);
  }
  pruneOrphanedIn(view, path) {
    const doc = view.state.doc.toString();
    const { body } = parseMetaDocument(doc);
    const parsed = parseOutline(body, this.settings.sigil);
    const liveIds = /* @__PURE__ */ new Set();
    for (const node2 of parsed.flat) if (node2.id !== null) liveIds.add(node2.id);
    const result = pruneOrphaned(doc, liveIds);
    if (result.removedIds.length === 0) {
      new import_obsidian7.Notice("Virtual Outliner: nothing to prune.");
      return;
    }
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result.doc } });
    new import_obsidian7.Notice(`Virtual Outliner: pruned ${result.removedIds.length} orphaned record(s).`);
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
      toggleCollapsed: (path, node2) => this.toggleCollapsed(path, node2),
      collapseAll: (path) => this.collapseAll(path),
      expandAll: (path) => this.expandAll(path),
      jumpToNode: (path, node2) => void this.jumpToNode(path, node2),
      onStateChange: (listener) => this.onStateChange(listener)
    };
  }
  async jumpToNode(path, node2) {
    var _a, _b;
    let view = this.app.workspace.getActiveViewOfType(import_obsidian7.MarkdownView);
    if (!view || ((_a = view.file) == null ? void 0 : _a.path) !== path) {
      await this.app.workspace.openLinkText(path, "", false);
      view = this.app.workspace.getActiveViewOfType(import_obsidian7.MarkdownView);
    }
    if (!view || ((_b = view.file) == null ? void 0 : _b.path) !== path) return;
    const targetLine = node2.ownBodyStart < node2.ownBodyEnd ? node2.ownBodyStart : node2.entryLine;
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
    const markdownView = this.app.workspace.getActiveViewOfType(import_obsidian7.MarkdownView);
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
