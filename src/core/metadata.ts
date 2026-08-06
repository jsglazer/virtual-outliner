// End-of-file metadata block: parsing, serialization, and whole-document
// edits. Pure module — no 'obsidian', no DOM, no I/O. Mirrors
// md-annotation's src/core/block.ts resilience rules verbatim (Architecture):
//
//   %%md-outline
//   {"id":"^o-a3f2k9pq","status":"Open","note":"…"}
//   %%
//
// Resilience rules (non-negotiable, Decision #19 / Builder constraint §4):
//   - The block is parsed line-by-line; a corrupt line loses only itself.
//   - Unparseable lines are preserved VERBATIM on every rewrite.
//   - The body text above the block is never modified by any function here.
//   - Exactly one block, at true end-of-file; a later duplicate open marker
//     always wins (the block always moves back to true EOF on rewrite).

export const BLOCK_OPEN = '%%md-outline';
export const BLOCK_CLOSE = '%%';

export interface OutlineMetaRecord {
	id: string;
	// All non-id fields as free-form strings. Field names are user-configured
	// (Status, Note, …) so this module does not know or care what they are —
	// it only requires values to be strings, which keeps round-tripping safe
	// even after a field is renamed or removed in settings (Decision #5:
	// orphaned metadata is retained forever, never silently dropped).
	fields: Record<string, string>;
}

export interface ParsedMetaDocument {
	body: string;
	records: OutlineMetaRecord[];
	unparseable: string[];
}

function isMarkerLine(line: string, marker: string): boolean {
	return line.trimEnd() === marker;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseRecordValue(v: unknown): OutlineMetaRecord | null {
	if (!isRecord(v)) return null;
	if (typeof v.id !== 'string' || v.id === '') return null;
	const fields: Record<string, string> = {};
	for (const [key, value] of Object.entries(v)) {
		if (key === 'id') continue;
		if (typeof value !== 'string') return null; // whole line is corrupt
		fields[key] = value;
	}
	return { id: v.id, fields };
}

export function parseMetaDocument(doc: string): ParsedMetaDocument {
	const lines = doc.split('\n');

	// The LAST opening marker, so a stray literal earlier in the body cannot
	// hijack the real block at the bottom.
	let openIdx = -1;
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (line !== undefined && isMarkerLine(line, BLOCK_OPEN)) {
			openIdx = i;
			break;
		}
	}
	if (openIdx === -1) return { body: doc, records: [], unparseable: [] };

	let closeIdx = -1;
	for (let i = openIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line !== undefined && isMarkerLine(line, BLOCK_CLOSE)) {
			closeIdx = i;
			break;
		}
	}

	const contentEnd = closeIdx === -1 ? lines.length : closeIdx;
	const contentLines = lines.slice(openIdx + 1, contentEnd);

	const tailLines = closeIdx === -1 ? [] : lines.slice(closeIdx + 1);
	const tail = tailLines.join('\n');
	const bodyLines = lines.slice(0, openIdx);
	const body = tail.trim() === '' ? bodyLines.join('\n') : bodyLines.join('\n') + '\n' + tail;

	const records: OutlineMetaRecord[] = [];
	const unparseable: string[] = [];
	for (const raw of contentLines) {
		const trimmed = raw.trim();
		if (trimmed === '') continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			unparseable.push(raw);
			continue;
		}
		const record = parseRecordValue(parsed);
		if (record) records.push(record);
		else unparseable.push(raw);
	}

	return { body, records, unparseable };
}

export function serializeRecordLine(r: OutlineMetaRecord): string {
	return JSON.stringify({ id: r.id, ...r.fields });
}

export function composeMetaDocument(
	body: string,
	records: ReadonlyArray<OutlineMetaRecord>,
	unparseable: ReadonlyArray<string>,
): string {
	if (records.length === 0 && unparseable.length === 0) return body;

	const bodyLines = body === '' ? [] : body.split('\n');
	const last = bodyLines[bodyLines.length - 1];
	if (bodyLines.length > 0 && last !== undefined && last.trimEnd() !== '') bodyLines.push('');

	const blockLines = [
		BLOCK_OPEN,
		...records.map(serializeRecordLine),
		...unparseable,
		BLOCK_CLOSE,
		'',
	];
	return [...bodyLines, ...blockLines].join('\n');
}

export function upsertRecord(doc: string, record: OutlineMetaRecord): string {
	const { body, records, unparseable } = parseMetaDocument(doc);
	const idx = records.findIndex((r) => r.id === record.id);
	if (idx === -1) records.push(record);
	else records[idx] = record;
	return composeMetaDocument(body, records, unparseable);
}

export function updateRecord(doc: string, id: string, patch: Record<string, string>): string {
	const { body, records, unparseable } = parseMetaDocument(doc);
	const idx = records.findIndex((r) => r.id === id);
	if (idx === -1) return doc;
	const current = records[idx];
	if (!current) return doc;
	records[idx] = { id, fields: { ...current.fields, ...patch } };
	return composeMetaDocument(body, records, unparseable);
}

export function removeRecord(doc: string, id: string): string {
	const { body, records, unparseable } = parseMetaDocument(doc);
	const next = records.filter((r) => r.id !== id);
	if (next.length === records.length) return doc;
	return composeMetaDocument(body, next, unparseable);
}

export function removeUnparseableLine(doc: string, raw: string): string {
	const { body, records, unparseable } = parseMetaDocument(doc);
	const idx = unparseable.indexOf(raw);
	if (idx === -1) return doc;
	const next = [...unparseable.slice(0, idx), ...unparseable.slice(idx + 1)];
	return composeMetaDocument(body, records, next);
}

export interface PruneResult {
	doc: string;
	removedIds: string[];
}

// Explicit, reporting prune: removes metadata records whose id no longer
// appears in `liveIds` (Decision #5 — orphaning is otherwise permanent and
// silent; this is the one deliberate, user-initiated exception).
export function pruneOrphaned(doc: string, liveIds: ReadonlySet<string>): PruneResult {
	const { body, records, unparseable } = parseMetaDocument(doc);
	const kept: OutlineMetaRecord[] = [];
	const removedIds: string[] = [];
	for (const record of records) {
		if (liveIds.has(record.id)) kept.push(record);
		else removedIds.push(record.id);
	}
	if (removedIds.length === 0) return { doc, removedIds: [] };
	return { doc: composeMetaDocument(body, kept, unparseable), removedIds };
}
