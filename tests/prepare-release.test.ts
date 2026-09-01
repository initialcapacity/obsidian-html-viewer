import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PREPARE_SCRIPT = resolve('scripts/prepare-release.mjs');

interface ReleaseResult {
	createdTag: boolean;
	createdVersion: boolean;
	mainCommit: string;
	releaseCommit: string;
	sourceCommit: string;
	version: string;
}

function git(root: string, ...argumentsList: string[]): string {
	return execFileSync('git', ['-C', root, ...argumentsList], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createRepository(): { root: string; source: string } {
	const root = mkdtempSync(join(tmpdir(), 'html-viewer-release-'));
	git(root, 'init', '--initial-branch=main');
	git(root, 'config', 'user.name', 'Release Test');
	git(root, 'config', 'user.email', 'release-test@example.invalid');
	writeJson(join(root, 'manifest.json'), {
		id: 'html-document-viewer',
		minAppVersion: '1.7.2',
		version: '0.0.2000',
	});
	writeJson(join(root, 'package.json'), {
		name: 'html-document-viewer',
		version: '0.0.2000',
	});
	writeJson(join(root, 'package-lock.json'), {
		lockfileVersion: 3,
		name: 'html-document-viewer',
		packages: {
			'': { name: 'html-document-viewer', version: '0.0.2000' },
		},
		version: '0.0.2000',
	});
	writeJson(join(root, 'versions.json'), { '0.0.2000': '1.7.2' });
	writeFileSync(join(root, 'content.txt'), 'source content\n');
	git(root, 'add', '.');
	git(root, 'commit', '-m', 'Source commit');
	const source = git(root, 'rev-parse', 'HEAD');
	git(root, 'update-ref', 'refs/remotes/origin/main', source);
	return { root, source };
}

function prepare(
	root: string,
	source: string,
	now = '2000',
): ReleaseResult {
	return JSON.parse(
		execFileSync(
			process.execPath,
			[
				PREPARE_SCRIPT,
				'--root',
				root,
				'--source',
				source,
				'--now',
				now,
			],
			{ encoding: 'utf8' },
		),
	) as ReleaseResult;
}

describe('retry-safe release preparation', () => {
	it('creates an annotated monotonic tag and reuses it on a partial rerun', () => {
		const { root, source } = createRepository();

		const first = prepare(root, source);
		expect(first.version).toBe('0.0.2001');
		expect(first.createdVersion).toBe(true);
		expect(first.createdTag).toBe(true);
		expect(git(root, 'cat-file', '-t', `refs/tags/${first.version}`)).toBe(
			'tag',
		);
		expect(git(root, 'rev-parse', `${first.version}^{commit}`)).toBe(
			first.releaseCommit,
		);
		expect(git(root, 'show', '-s', '--format=%P', first.releaseCommit)).toBe(
			source,
		);

		git(root, 'update-ref', 'refs/remotes/origin/main', first.mainCommit);
		const rerun = prepare(root, source, '3000');
		expect(rerun.version).toBe(first.version);
		expect(rerun.releaseCommit).toBe(first.releaseCommit);
		expect(rerun.mainCommit).toBe(first.mainCommit);
		expect(rerun.createdVersion).toBe(false);
		expect(rerun.createdTag).toBe(false);
	});

	it('makes same-second releases unique for consecutive source commits', () => {
		const { root, source } = createRepository();
		const first = prepare(root, source);
		git(root, 'update-ref', 'refs/remotes/origin/main', first.mainCommit);
		git(root, 'checkout', '--detach', first.mainCommit);
		writeFileSync(join(root, 'content.txt'), 'second source\n');
		git(root, 'add', 'content.txt');
		git(root, 'commit', '-m', 'Second source commit');
		const secondSource = git(root, 'rev-parse', 'HEAD');
		git(root, 'update-ref', 'refs/remotes/origin/main', secondSource);

		const second = prepare(root, secondSource);

		expect(second.version).toBe('0.0.2002');
		expect(second.releaseCommit).not.toBe(first.releaseCommit);
	});

	it('preserves a newer main commit and records the release commit in history', () => {
		const { root, source } = createRepository();
		writeFileSync(join(root, 'content.txt'), 'newer user content\n');
		git(root, 'add', 'content.txt');
		git(root, 'commit', '-m', 'Newer user commit');
		const newerMain = git(root, 'rev-parse', 'HEAD');
		git(root, 'update-ref', 'refs/remotes/origin/main', newerMain);

		const result = prepare(root, source);

		expect(
			spawnSync('git', [
				'-C',
				root,
				'merge-base',
				'--is-ancestor',
				newerMain,
				result.mainCommit,
			]).status,
		).toBe(0);
		expect(
			spawnSync('git', [
				'-C',
				root,
				'merge-base',
				'--is-ancestor',
				result.releaseCommit,
				result.mainCommit,
			]).status,
		).toBe(0);
		expect(git(root, 'show', `${result.mainCommit}:content.txt`)).toBe(
			'newer user content',
		);
		expect(git(root, 'show', `${result.releaseCommit}:content.txt`)).toBe(
			'source content',
		);
	});

	it('refuses to release a source removed from main history', () => {
		const { root, source } = createRepository();
		git(root, 'checkout', '--orphan', 'rewritten');
		git(root, 'rm', '-rf', '.');
		writeFileSync(join(root, 'replacement.txt'), 'replacement\n');
		git(root, 'add', '.');
		git(root, 'commit', '-m', 'Rewritten main');
		git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

		const result = spawnSync(
			process.execPath,
			[
				PREPARE_SCRIPT,
				'--root',
				root,
				'--source',
				source,
				'--now',
				'2000',
			],
			{ encoding: 'utf8' },
		);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('is no longer an ancestor of origin/main');
	});
});
