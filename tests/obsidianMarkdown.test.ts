import { describe, expect, it } from 'vitest';

import type { ExportResolver, ResolvedLink } from '../src/core/obsidianMarkdown';
import { extractSubpath, stripComments, toPandocMarkdown, wikilinkText } from '../src/core/obsidianMarkdown';

function resolver(notes: Record<string, string>, images: string[] = []): ExportResolver & { staged: string[] } {
	const staged: string[] = [];
	return {
		staged,
		resolveLink(linkpath: string): ResolvedLink | null {
			const md = `${linkpath.replace(/\.md$/, '')}.md`;
			if (md in notes) return { path: md, kind: 'markdown' };
			if (images.includes(linkpath)) return { path: `attachments/${linkpath}`, kind: 'image' };
			if (linkpath.endsWith('.pdf')) return { path: linkpath, kind: 'other' };
			return null;
		},
		readNote: (path: string) => Promise.resolve(notes[path] ?? ''),
		stageImage(path: string): string {
			staged.push(path);
			return `assets/${staged.length}-${path.split('/').pop() ?? ''}`;
		},
	};
}

describe('toPandocMarkdown', () => {
	it('flattens wikilinks and note links to plain text, keeping web links', () => {
		const r = resolver({});
		return toPandocMarkdown('See [[Budget#Intro|the intro]], [[Tax#Why not]], [a note](Other.md) and [web](https://x.org).', 'N.md', '@', r).then(
			(out) => expect(out.markdown).toBe('See the intro, Tax > Why not, a note and [web](https://x.org).'),
		);
	});

	it('stages image embeds with their width and leaves code alone', async () => {
		const r = resolver({}, ['chart.png']);
		const out = await toPandocMarkdown('![[chart.png|300]] and `![[chart.png]]`', 'N.md', '@', r);
		expect(out.markdown).toBe('![](assets/1-chart.png){width=300px} and `![[chart.png]]`');
		expect(r.staged).toEqual(['attachments/chart.png']);
	});

	it('inlines an embedded note section with its own outline stripped', async () => {
		const r = resolver({ 'Lit.md': '# Lit\n@ Entry\nIntro text\n## Methods\n@@ Sub\nMethod text\n## Other\nNo' });
		const out = await toPandocMarkdown('Before\n![[Lit#Methods]]\nAfter', 'N.md', '@', r);
		expect(out.markdown).toBe('Before\n\n## Methods\n\nMethod text\n\nAfter');
	});

	it('reports unresolved, unsupported and cyclic embeds without output', async () => {
		const r = resolver({ 'Loop.md': '![[Loop]]\nText' });
		const out = await toPandocMarkdown('![[Missing]]\n![[paper.pdf]]\n![[Loop]]', 'N.md', '@', r);
		expect(out.issues.map((i) => i.kind)).toEqual(['unresolved', 'unsupported', 'cycle']);
		expect(out.markdown).toBe('Text');
	});

	it('removes comments, block ids and callout markers', async () => {
		const md = ['Keep %%hidden%% this ^abc-1', '%%', 'gone', '%%', '> [!warning]- Careful', '> Body', '> [!note]', '> More'].join('\n');
		const out = await toPandocMarkdown(md, 'N.md', '@', resolver({}));
		expect(out.markdown).toBe(['Keep  this', '> **Careful**', '> Body', '> **Note**', '> More'].join('\n'));
	});

	it('never rewrites inside fenced code', async () => {
		const md = ['```', '[[link]] %%c%%', '', '', '```'].join('\n');
		const out = await toPandocMarkdown(md, 'N.md', '@', resolver({}));
		expect(out.markdown).toBe(md);
	});
});

describe('helpers', () => {
	it('stripComments drops comment-only lines but keeps real blank lines', () => {
		expect(stripComments('a\n%%x%%\n\nb')).toBe('a\n\nb');
	});
	it('wikilinkText prefers the alias and hides block refs', () => {
		expect(wikilinkText('Note#^blk')).toBe('Note');
		expect(wikilinkText('#Heading')).toBe('Heading');
	});
	it('extractSubpath finds a block by id', () => {
		expect(extractSubpath('x\n\nline one\nline two ^blk\n\ny', '^blk')).toBe('line one\nline two ^blk');
	});
});
