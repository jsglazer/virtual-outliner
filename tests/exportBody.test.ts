import { describe, expect, it } from 'vitest';

import { collectCiteKeys, extractBody, groupKeysByLibrary, stripFrontmatter } from '../src/core/exportBody';

describe('extractBody', () => {
	it('joins prose across a dropped entry into one paragraph', () => {
		const out = extractBody(['Prose A', '@@ Entry', 'Prose B'].join('\n'), '@');
		expect(out.body).toBe(['Prose A', 'Prose B'].join('\n'));
	});

	it('starts a new paragraph at an entry carrying the p flag', () => {
		const out = extractBody(['Prose A', '@@p Entry', 'Prose B'].join('\n'), '@');
		expect(out.body).toBe(['Prose A', '', 'Prose B'].join('\n'));
	});

	it('breaks only once when several entries in a row carry the flag', () => {
		const out = extractBody(['A', '@ One', '@@p Two', '@@ Three', 'B'].join('\n'), '@');
		expect(out.body).toBe(['A', '', 'B'].join('\n'));
	});

	it('keeps the blank line when either side of the seam is not plain prose', () => {
		const list = extractBody(['- item', '@@ Entry', 'Prose'].join('\n'), '@');
		expect(list.body).toBe(['- item', '', 'Prose'].join('\n'));
		const heading = extractBody(['Prose', '@@ Entry', '## Heading'].join('\n'), '@');
		expect(heading.body).toBe(['Prose', '', '## Heading'].join('\n'));
		const table = extractBody(['| a | b |', '@@ Entry', 'Prose'].join('\n'), '@');
		expect(table.body).toBe(['| a | b |', '', 'Prose'].join('\n'));
		const quote = extractBody(['> quoted', '@@ Entry', 'Prose'].join('\n'), '@');
		expect(quote.body).toBe(['> quoted', '', 'Prose'].join('\n'));
	});

	it('leaves a blank line the note already has alone', () => {
		const out = extractBody(['A', '', '@@ Entry', 'B'].join('\n'), '@');
		expect(out.body).toBe(['A', '', 'B'].join('\n'));
	});

	it('ignores the flag when the sigil character IS p', () => {
		expect(extractBody(['A', 'pp Entry', 'B'].join('\n'), 'p').body).toBe(['A', 'B'].join('\n'));
	});

	it('keeps consecutive body lines together (they stay line breaks in the PDF)', () => {
		const out = extractBody(['@ Intro', 'Line one.', 'Line two.'].join('\n'), '@');
		expect(out.body).toBe('Line one.\nLine two.');
	});

	it('drops entries at every level, including blank entries awaiting text', () => {
		const doc = ['@ One', '@@ Two', '@@@ Three', '@@@@@@ Six', '@@ ', 'Body'].join('\n');
		expect(extractBody(doc, '@').body).toBe('Body');
	});

	it('collapses an outline skeleton to nothing and flags it empty', () => {
		const out = extractBody(['@ A', '', '@@ B', '@ C', ''].join('\n'), '@');
		expect(out.body).toBe('');
		expect(out.isEmpty).toBe(true);
	});

	it('keeps prose before the first entry and drops frontmatter', () => {
		const doc = ['---', 'headnum: n', 'TOC: y', '---', '### Title', '@ Intro', 'Text'].join('\n');
		expect(extractBody(doc, '@').body).toBe(['### Title', '', 'Text'].join('\n'));
	});

	it('reads the flag on an entry that also carries an id', () => {
		const doc = ['A', '@@p Entry ^o-00az6fpc', 'B'].join('\n');
		expect(extractBody(doc, '@').body).toBe(['A', '', 'B'].join('\n'));
	});

	it('never exports the flag itself', () => {
		expect(extractBody(['@@p Entry', 'Body'].join('\n'), '@').body).not.toContain('p');
	});

	it('never exports ids or the metadata block', () => {
		const doc = ['@ Tax ^o-00az6fpc', '## Formulaic tax', 'Body.', '%%md-outline', '{"id":"^o-00az6fpc","Status":"Open"}', '%%', ''].join('\n');
		const out = extractBody(doc, '@').body;
		expect(out).toBe('## Formulaic tax\nBody.');
		expect(out).not.toContain('^o-');
		expect(out).not.toContain('Status');
	});

	it('keeps a sigil line inside a code fence', () => {
		const doc = ['@ Entry', '```', '@ not an entry', '', '', 'x', '```', 'After'].join('\n');
		expect(extractBody(doc, '@').body).toBe(['', '```', '@ not an entry', '', '', 'x', '```', 'After'].join('\n').replace(/^\n/, ''));
	});

	it('honours a custom sigil', () => {
		expect(extractBody(['~ Entry', 'Body', '@ stays'].join('\n'), '~').body).toBe('Body\n@ stays');
	});

	it('reports footnotes, citations, links and embeds written on entry lines', () => {
		const doc = ['@ Budget[^1] per [@smith2020]', '@@ See [[Other note]] and ![[chart.png]]', '@@ Plain', 'Body'].join('\n');
		const { lost } = extractBody(doc, '@');
		expect(lost).toHaveLength(2);
		expect(lost[0]?.kinds).toEqual(['footnote', 'citation']);
		expect(lost[1]?.kinds).toEqual(['link', 'embed']);
		expect(lost[1]?.line).toBe(1);
	});

	it('is idempotent on outline-free input', () => {
		const once = extractBody(['Para', '', '', 'Next', '```', '', '', '```'].join('\n'), '@').body;
		expect(extractBody(once, '@').body).toBe(once);
	});
});

describe('stripFrontmatter', () => {
	it('leaves a document without frontmatter alone', () => {
		expect(stripFrontmatter('---\nno close')).toBe('---\nno close');
		expect(stripFrontmatter('Text')).toBe('Text');
	});
});

describe('collectCiteKeys', () => {
	it('finds bracketed, bare, suppressed-author and multiple citations once each', () => {
		const md = 'As [see @smith2020, p. 4; @doe:2019] and @jones_1999 said [-@smith2020]. Also @{key with space}.';
		expect(collectCiteKeys(md)).toEqual(['smith2020', 'doe:2019', 'jones_1999', 'key with space']);
	});

	it('ignores email addresses, code spans and fenced code', () => {
		const md = ['Mail me at josh@example.com.', 'Use `@notakey` here.', '```', '@alsonot', '```', 'Real @key.'].join('\n');
		expect(collectCiteKeys(md)).toEqual(['key']);
	});
});

describe('groupKeysByLibrary', () => {
	it('groups known keys by library and lists unknown ones', () => {
		const { byLibrary, unknown } = groupKeysByLibrary(
			['a', 'b', 'c'],
			[
				{ citekey: 'a', libraryID: 1 },
				{ citekey: 'b', libraryID: 7 },
				{ citekey: 'a', libraryID: 7 },
			],
		);
		expect([...byLibrary.entries()]).toEqual([
			[1, ['a']],
			[7, ['b']],
		]);
		expect(unknown).toEqual(['c']);
	});
});

describe('line-number anchors', () => {
	const doc = ['---', 'title: T', '---', '@ Intro', 'First sentence.', 'Second sentence.', '', '## Heading', '- item'].join('\n');

	it('numbers plain prose by its line in the editor, frontmatter counted', () => {
		const { body } = extractBody(doc, '@', { lineNumbers: true });
		expect(body.split('\n')[0]).toBe('`\\voline{5}`{=latex}First sentence.');
		expect(body.split('\n')[1]).toBe('`\\voline{6}`{=latex}Second sentence.');
	});

	it('leaves headings, list items and fenced code unanchored', () => {
		const body = extractBody(doc, '@', { lineNumbers: true }).body;
		expect(body).toContain('\n## Heading');
		expect(body).toContain('\n- item');
		const fenced = extractBody(['Prose.', '', '```', 'code line', '```'].join('\n'), '@', { lineNumbers: true }).body;
		expect(fenced).toContain('\ncode line');
	});

	it('is off by default, and changes nothing else about the body', () => {
		expect(extractBody(doc, '@').body).toBe(
			extractBody(doc, '@', { lineNumbers: true }).body.replace(/`\\voline\{\d+\}`\{=latex\}/g, ''),
		);
	});
});
