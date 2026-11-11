// Obsidian plugin ESLint flat config (from ~/Dev/devkit).
// typescript-eslint (type-checked) + eslint-plugin-obsidianmd + Prettier compat.
// Lint with: `eslint src`
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{
		ignores: ['main.js', 'node_modules/', 'coverage/', '**/*.config.mjs', '**/*.config.ts'],
	},
	// Brings typescript-eslint base + recommended-type-checked + Obsidian rules.
	...obsidianmd.configs.recommended,
	{
		// obsidianmd enables type-checked rules but leaves project resolution to us.
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['src/**/*.ts'],
		rules: {
			'obsidianmd/ui/sentence-case': [
				'error',
				{
					// "Virtual Outliner" is the plugin's proper name; Dataview and
					// Datacore are third-party plugin names, not generic nouns.
					brands: ['Virtual Outliner', 'Dataview', 'Datacore', 'Zotero Manager', 'Zotero', 'Markdown', 'PDF', 'Note Toolbar'],
					// Help paragraphs that quote setting names, column names and frontmatter keys
					// verbatim. eslint-plugin-obsidianmd 0.5 forbids inline eslint-disable of its
					// rules, so these exceptions live here.
					ignoreRegex: [
						'^One format applied to every outline level',
						'^Export to PDF typesets the body text',
						'^Pick the toolbar button that runs each toggle command',
					],
				},
			],
		},
	},
	// Turn off rules that conflict with Prettier — keep this last.
	prettier,
);
