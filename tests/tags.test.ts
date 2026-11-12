// Update015: which text the "hide tags" toggle hides — tag detection, the
// attached %%comment%%, the places a `#` is not a tag — and how the editor
// field shows the cursor line's tags again.

import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';

import { findTagRanges } from '../src/core/tags';
import { setTagsHidden, tagHideField } from '../src/editor/tagHide';

const hidden = (doc: string): string[] => findTagRanges(doc).map((r) => doc.slice(r.from, r.to));

describe('findTagRanges', () => {
	it('extends a tag over the comment attached to it', () => {
		expect(hidden('Check #fix%%confirm accuracy%% now')).toEqual([' #fix%%confirm accuracy%%']);
	});

	it('takes a comment separated from the tag only by spaces', () => {
		expect(hidden('a #fix  %%later%% b')).toEqual([' #fix  %%later%%']);
	});

	it('leaves a comment that is not next to the tag', () => {
		expect(hidden('a #fix then %%other%% b')).toEqual([' #fix']);
	});

	it('follows an attached comment onto later lines', () => {
		const doc = 'x #todo%%line one\nline two%% y';
		expect(hidden(doc)).toEqual([' #todo%%line one\nline two%%']);
	});

	it('finds plain, nested and multiple tags', () => {
		expect(hidden('#start mid #a/b-c_d, #e.')).toEqual(['#start', ' #a/b-c_d', ' #e']);
	});

	it('skips # that cannot start a tag', () => {
		expect(
			hidden(
				'# Heading\n## Sub\n#123 issue\n[[Note#Head]] [x](#anchor) a\\#b c#d https://x.org/p#frag &#38; [[#Head]]',
			),
		).toEqual([]);
	});

	it('skips frontmatter, code and comments', () => {
		const doc = [
			'---',
			'tags: #notatag',
			'---',
			'`#code` text',
			'```',
			'#fenced',
			'```',
			'%% #insidecomment %%',
			'#real',
			'%%md-outline',
			'#meta',
			'%%',
		].join('\n');
		expect(hidden(doc)).toEqual(['#real']);
	});

	it('hides only the tag when its comment never closes', () => {
		expect(hidden('a #fix%%unclosed\n#notseen')).toEqual([' #fix']);
	});

	it('takes a tag after sentence punctuation, keeping the punctuation', () => {
		expect(hidden('as "polarization").#cite%%confirm no consensus%%\nnext')).toEqual(['#cite%%confirm no consensus%%']);
		expect(hidden('done!#a; (x)#b')).toEqual(['#a', '#b']);
	});

	it('keeps line-start indentation but takes spaces after text', () => {
		expect(hidden('  #a text\npublic   #b and')).toEqual(['#a', '   #b']);
	});
});

function drawn(state: EditorState): string[] {
	const deco: DecorationSet = state.field(tagHideField).deco;
	const out: string[] = [];
	for (const it = deco.iter(); it.value !== null; it.next()) out.push(state.doc.sliceString(it.from, it.to));
	return out;
}

describe('tagHideField', () => {
	const doc = 'line one #a%%note%%\nline two #b\nline three';

	it('hides nothing until switched on, and shows the cursor line', () => {
		let state = EditorState.create({ doc, extensions: [tagHideField], selection: EditorSelection.cursor(doc.length) });
		expect(drawn(state)).toEqual([]);
		state = state.update({ effects: setTagsHidden.of(true) }).state;
		expect(drawn(state)).toEqual([' #a%%note%%', ' #b']);
		state = state.update({ selection: EditorSelection.cursor(2) }).state;
		expect(drawn(state)).toEqual([' #b']);
		state = state.update({ effects: setTagsHidden.of(false) }).state;
		expect(drawn(state)).toEqual([]);
	});

	it('maps hidden ranges through an edit elsewhere', () => {
		let state = EditorState.create({ doc, extensions: [tagHideField], selection: EditorSelection.cursor(doc.length) });
		state = state.update({ effects: setTagsHidden.of(true) }).state;
		state = state.update({ changes: { from: doc.length, insert: '!!' } }).state;
		state = state.update({ changes: { from: 0, insert: 'NEW ' } }).state;
		expect(drawn(state)).toEqual([' #a%%note%%', ' #b']);
	});
});
