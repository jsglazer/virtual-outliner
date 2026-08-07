import { defineConfig } from 'vitest/config';

// Headless tests. Everything under tests/ is pure: src/core/ has zero
// dependencies on 'obsidian' or the DOM, and the one editor-layer module
// covered here (src/editor/livePreview.ts, for decoration GEOMETRY — which
// character ranges get hidden, and how they map through an edit) touches
// 'obsidian' only for a type-level field it never reads in these tests, so a
// one-line stub is enough. CodeMirror itself runs fine headlessly: EditorState
// is DOM-free, which is what makes the decoration-mapping regression test in
// tests/livePreview.test.ts possible without a browser.
export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			include: ['src/core/**/*.ts'],
			reporter: ['text', 'html'],
		},
	},
	resolve: {
		alias: {
			obsidian: new URL('./tests/stubs/obsidian.ts', import.meta.url).pathname,
		},
	},
});
