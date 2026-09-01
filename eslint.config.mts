import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'coverage',
		'test-results',
		'esbuild.config.mjs',
		'scripts/*.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: [
			'src/html-document-view.ts',
			'src/iframe-boundary.ts',
			'src/prepare-html.ts',
		],
		rules: {
			// These security-sensitive modules use cross-window standard DOM APIs.
			'obsidianmd/prefer-create-el': 'off',
		},
	},
	{
		files: ['tests/**/*.ts'],
		rules: {
			// Tests run under Node.js; no Node APIs are bundled into the plugin.
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
