import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	fullyParallel: true,
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
	],
	reporter: 'line',
	testDir: 'tests/e2e',
	use: { trace: 'retain-on-failure' },
});
