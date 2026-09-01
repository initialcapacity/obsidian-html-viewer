import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Manifest {
	id: string;
	name: string;
	version: string;
	minAppVersion: string;
	author: string;
	isDesktopOnly: boolean;
}

describe('project identity', () => {
	it('keeps manifest, package, and versions metadata consistent', () => {
		const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as Manifest;
		const packageJson = JSON.parse(
			readFileSync('package.json', 'utf8'),
		) as { version: string };
		const packageLock = JSON.parse(
			readFileSync('package-lock.json', 'utf8'),
		) as {
			version: string;
			packages: Record<string, { version?: string }>;
		};
		const versions = JSON.parse(
			readFileSync('versions.json', 'utf8'),
		) as Record<string, string>;

		expect(manifest.id).toBe('html-document-viewer');
		expect(manifest.name).toBe('HTML Document Viewer');
		expect(manifest.author).toBe('Tyson Gern');
		expect(manifest.isDesktopOnly).toBe(false);
		expect(manifest.version).toMatch(/^0\.0\.\d+$/u);
		expect(packageJson.version).toBe(manifest.version);
		expect(packageLock.version).toBe(manifest.version);
		expect(packageLock.packages['']?.version).toBe(manifest.version);
		expect(versions[manifest.version]).toBe(manifest.minAppVersion);
	});
});
