import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: new URL(
				'./tests/obsidian-runtime-stub.ts',
				import.meta.url,
			).pathname,
		},
	},
	test: {
		coverage: {
			all: true,
			include: ['src/**/*.ts'],
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			thresholds: {
				branches: 75,
				functions: 85,
				lines: 85,
				statements: 85,
			},
		},
		environment: 'jsdom',
		include: ['tests/**/*.test.ts'],
		setupFiles: ['tests/setup.ts'],
	},
});
