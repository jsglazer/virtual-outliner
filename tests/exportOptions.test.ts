import { describe, expect, it } from 'vitest';

import {
	checkPreamble,
	normalizeFontSize,
	resolveExportOptions,
	numberedPdfPath,
	resolvePdfOutput,
} from '../src/core/exportOptions';

describe('numberedPdfPath', () => {
	it('starts at -01 beside the original', () => {
		expect(numberedPdfPath('/a/b/Puzzle Statement.pdf', () => false)).toBe('/a/b/Puzzle Statement-01.pdf');
	});
	it('skips numbers already taken and keeps the extension case', () => {
		const taken = new Set(['/a/Final-01.PDF', '/a/Final-02.PDF']);
		expect(numberedPdfPath('/a/Final.PDF', (p) => taken.has(p))).toBe('/a/Final-03.PDF');
	});
	it('grows past two digits', () => {
		expect(numberedPdfPath('/a/N.pdf', (p) => !p.endsWith('-100.pdf'))).toBe('/a/N-100.pdf');
	});
});

const defaults = { headnum: false, toc: false, notes: 'f' as const, cite: 'MLA' };

describe('resolveExportOptions', () => {
	it('reads the keys a real note uses, case-insensitively', () => {
		const opts = resolveExportOptions(
			{ notetoolbar: 'Outliner', 'pdf-output': '~/Dev/TEMP/Puzzle', headnum: 'n', TOC: 'y', cite: 'APA', notes: 'e' },
			defaults,
			'Puzzle Statement',
		);
		expect(opts).toMatchObject({
			headnum: false,
			toc: true,
			notes: 'e',
			cite: 'APA',
			pdfOutput: '~/Dev/TEMP/Puzzle',
			title: 'Puzzle Statement',
			author: null,
			fontsize: null,
		});
	});

	it('falls back to settings defaults and accepts YAML booleans', () => {
		const opts = resolveExportOptions({ headnum: true, toc: 'maybe' }, { ...defaults, toc: true, cite: 'Chicago' }, 'N');
		expect(opts.headnum).toBe(true);
		expect(opts.toc).toBe(true);
		expect(opts.cite).toBe('Chicago');
		expect(resolveExportOptions(null, defaults, 'N').notes).toBe('f');
	});

	it('reads title, author and fontsize overrides', () => {
		const opts = resolveExportOptions({ title: 'Final', author: 'J. Doe', fontsize: '14pt' }, defaults, 'N');
		expect([opts.title, opts.author, opts.fontsize]).toEqual(['Final', 'J. Doe', '14']);
	});
});

describe('normalizeFontSize', () => {
	it('accepts extarticle sizes only', () => {
		expect(normalizeFontSize(12)).toBe('12');
		expect(normalizeFontSize('17pt')).toBe('17');
		expect(normalizeFontSize('13')).toBeNull();
		expect(normalizeFontSize(undefined)).toBeNull();
	});
});

describe('resolvePdfOutput', () => {
	const noteDir = '/Users/j/Vault/Classes/Assignment';
	it('defaults to beside the note', () => {
		expect(resolvePdfOutput('', noteDir, 'Puzzle Statement', '/Users/j')).toBe(`${noteDir}/Puzzle Statement.pdf`);
	});
	it('treats a path without .pdf as a folder and expands ~', () => {
		expect(resolvePdfOutput('~/Dev/TEMP/Puzzle', noteDir, 'Puzzle Statement', '/Users/j')).toBe(
			'/Users/j/Dev/TEMP/Puzzle/Puzzle Statement.pdf',
		);
	});
	it('uses a .pdf path as the file, relative to the note folder', () => {
		expect(resolvePdfOutput('../Out/Final.PDF', noteDir, 'X', '/Users/j')).toBe('/Users/j/Vault/Classes/Out/Final.PDF');
	});
});

describe('checkPreamble', () => {
	it('passes a balanced preamble with escaped braces and comments', () => {
		expect(checkPreamble('\\usepackage{hyperref} % {\n\\newcommand{\\x}{\\{}')).toEqual([]);
	});
	it('flags unbalanced braces and full-document commands', () => {
		const w = checkPreamble('\\documentclass{article}\n\\newcommand{\\x}{');
		expect(w[0]).toMatch(/unbalanced/);
		expect(w.some((s) => s.includes('documentclass'))).toBe(true);
	});
});
