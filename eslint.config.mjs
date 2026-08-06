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
					brands: ['Virtual Outliner', 'Dataview', 'Datacore'],
				},
			],
		},
	},
	// Turn off rules that conflict with Prettier — keep this last.
	prettier,
);
