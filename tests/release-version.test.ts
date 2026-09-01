import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RELEASE_SCRIPT = resolve('scripts/release-version.mjs');

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createMetadata(
	root: string,
	version = '0.0.1000',
	versions: Record<string, string> = { [version]: '1.7.2' },
): void {
	writeJson(join(root, 'manifest.json'), {
		id: 'html-document-viewer',
		minAppVersion: '1.7.2',
		version,
	});
	writeJson(join(root, 'package.json'), {
		name: 'html-document-viewer',
		version,
	});
	writeJson(join(root, 'package-lock.json'), {
		lockfileVersion: 3,
		name: 'html-document-viewer',
		packages: { '': { name: 'html-document-viewer', version } },
		version,
	});
	writeJson(join(root, 'versions.json'), versions);
}

function runVersion(root: string, ...argumentsList: string[]): string {
	return execFileSync(
		process.execPath,
		[RELEASE_SCRIPT, '--root', root, ...argumentsList],
		{ encoding: 'utf8' },
	).trim();
}

describe('timestamp release versioning', () => {
	it('uses the current UTC seconds and updates all metadata consistently', () => {
		const root = mkdtempSync(join(tmpdir(), 'html-viewer-version-'));
		createMetadata(root);

		const version = runVersion(root, '--now', '2000');

		expect(version).toBe('0.0.2000');
		const manifest = JSON.parse(
			readFileSync(join(root, 'manifest.json'), 'utf8'),
		) as { version: string };
		const packageJson = JSON.parse(
			readFileSync(join(root, 'package.json'), 'utf8'),
		) as { version: string };
		const packageLock = JSON.parse(
			readFileSync(join(root, 'package-lock.json'), 'utf8'),
		) as {
			packages: Record<string, { version?: string }>;
			version: string;
		};
		const versions = JSON.parse(
			readFileSync(join(root, 'versions.json'), 'utf8'),
		) as Record<string, string>;

		expect(packageJson.version).toBe(manifest.version);
		expect(packageLock.version).toBe(manifest.version);
		expect(packageLock.packages['']?.version).toBe(manifest.version);
		expect(versions).toEqual({
			'0.0.1000': '1.7.2',
			'0.0.2000': '1.7.2',
		});
	});

	it('increments the previous patch when two releases share a second', () => {
		const root = mkdtempSync(join(tmpdir(), 'html-viewer-same-second-'));
		createMetadata(root, '0.0.2000');

		expect(runVersion(root, '--now', '2000')).toBe('0.0.2001');
	});

	it('imports published history without deleting existing mappings', () => {
		const root = mkdtempSync(join(tmpdir(), 'html-viewer-history-'));
		createMetadata(root, '0.0.2000', {
			'0.0.1000': '1.6.0',
			'0.0.2000': '1.7.2',
		});

		const version = runVersion(
			root,
			'--now',
			'2000',
			'--published',
			'0.0.2001=1.7.2',
		);
		const versions = JSON.parse(
			readFileSync(join(root, 'versions.json'), 'utf8'),
		) as Record<string, string>;

		expect(version).toBe('0.0.2002');
		expect(versions).toEqual({
			'0.0.1000': '1.6.0',
			'0.0.2000': '1.7.2',
			'0.0.2001': '1.7.2',
			'0.0.2002': '1.7.2',
		});
	});

	it('fails closed when release metadata is inconsistent', () => {
		const root = mkdtempSync(join(tmpdir(), 'html-viewer-bad-version-'));
		createMetadata(root);
		writeJson(join(root, 'package.json'), {
			name: 'html-document-viewer',
			version: '0.0.999',
		});

		const result = spawnSync(
			process.execPath,
			[RELEASE_SCRIPT, '--root', root, '--now', '2000'],
			{ encoding: 'utf8' },
		);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(
			'package.json version does not match manifest.json',
		);
	});
});
