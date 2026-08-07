// Minimal 'obsidian' stand-in so decoration-geometry tests can import
// src/editor/livePreview.ts headlessly. Only the bindings that module
// actually pulls from 'obsidian' need to exist; `editorInfoField` is used
// solely by editorViewPath(), which these tests never call.
export const editorInfoField = {} as never;
