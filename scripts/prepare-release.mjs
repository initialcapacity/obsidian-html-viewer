import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	parsePatch,
	updateReleaseFiles,
} from './release-version.mjs';

const RELEASE_FILES = [
	'manifest.json',
	'package.json',
	'package-lock.json',
	'versions.json',
];

function parseArguments(argumentsList) {
	const options = {
		nowSeconds: Math.floor(Date.now() / 1000),
		root: process.cwd(),
		sourceSha: null,
	};

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		const value = argumentsList[index + 1];

		if (argument === '--root' && value !== undefined) {
			options.root = resolve(value);
			index += 1;
		} else if (argument === '--source' && value !== undefined) {
			options.sourceSha = value;
			index += 1;
		} else if (argument === '--now' && value !== undefined) {
			if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
				throw new Error('--now must be a non-negative safe integer.');
			}
			options.nowSeconds = Number(value);
			index += 1;
		} else {
			throw new Error(`Unknown or incomplete argument: ${argument ?? ''}`);
		}
	}

	if (options.sourceSha === null) {
		throw new Error('--source is required.');
	}
	if (!/^[0-9a-f]{40}$/u.test(options.sourceSha)) {
		throw new Error('--source must be a full 40-character commit SHA.');
	}

	return options;
}

function git(root, argumentsList) {
	return execFileSync('git', ['-C', root, ...argumentsList], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function gitSucceeds(root, argumentsList) {
	return (
		spawnSync('git', ['-C', root, ...argumentsList], {
			stdio: 'ignore',
		}).status === 0
	);
}

function resolveCommit(root, reference) {
	if (!gitSucceeds(root, ['cat-file', '-e', `${reference}^{commit}`])) {
		throw new Error(`Git reference is not a commit: ${reference}`);
	}

	return git(root, ['rev-parse', `${reference}^{commit}`]);
}

function isAncestor(root, ancestor, descendant) {
	return gitSucceeds(root, [
		'merge-base',
		'--is-ancestor',
		ancestor,
		descendant,
	]);
}

function parseJsonAtCommit(root, commit, filename) {
	return JSON.parse(git(root, ['show', `${commit}:${filename}`]));
}

function verifyVersionAtCommit(root, commit, expectedVersion) {
	const manifest = parseJsonAtCommit(root, commit, 'manifest.json');
	const packageJson = parseJsonAtCommit(root, commit, 'package.json');
	const packageLock = parseJsonAtCommit(root, commit, 'package-lock.json');
	const versions = parseJsonAtCommit(root, commit, 'versions.json');

	if (
		manifest.version !== expectedVersion ||
		packageJson.version !== expectedVersion ||
		packageLock.version !== expectedVersion ||
		packageLock.packages?.['']?.version !== expectedVersion ||
		versions[expectedVersion] !== manifest.minAppVersion
	) {
		throw new Error(
			`Release metadata is inconsistent at ${commit} for ${expectedVersion}.`,
		);
	}

	return manifest.minAppVersion;
}

function sourceTrailer(root, commit) {
	const message = git(root, ['show', '-s', '--format=%B', commit]);
	const matches = [...message.matchAll(/^Source-Commit: ([0-9a-f]+)$/gmu)];
	if (matches.length !== 1) {
		return null;
	}

	return matches[0]?.[1] ?? null;
}

function candidateVersion(root, commit, sourceSha) {
	const parents = git(root, ['show', '-s', '--format=%P', commit]).split(' ');
	if (parents.length !== 1 || parents[0] !== sourceSha) {
		return null;
	}

	if (sourceTrailer(root, commit) !== sourceSha) {
		return null;
	}

	const subject = git(root, ['show', '-s', '--format=%s', commit]);
	const match = /^chore\(release\): (0\.0\.\d+)$/u.exec(subject);
	if (match?.[1] === undefined) {
		return null;
	}

	verifyVersionAtCommit(root, commit, match[1]);
	return match[1];
}

function listReleaseTags(root) {
	const output = git(root, [
		'for-each-ref',
		'--format=%(refname:short)',
		'refs/tags',
	]);
	return output.length === 0
		? []
		: output.split('\n').filter((tag) => /^0\.0\.\d+$/u.test(tag));
}

function inspectReleaseTags(root, sourceSha) {
	const publishedVersions = new Map();
	const sourceCandidates = [];

	for (const tag of listReleaseTags(root)) {
		parsePatch(tag);
		if (git(root, ['cat-file', '-t', `refs/tags/${tag}`]) !== 'tag') {
			throw new Error(`Release tag ${tag} is not annotated.`);
		}

		const commit = resolveCommit(root, `refs/tags/${tag}`);
		const minAppVersion = verifyVersionAtCommit(root, commit, tag);
		publishedVersions.set(tag, minAppVersion);

		if (sourceTrailer(root, commit) === sourceSha) {
			const version = candidateVersion(root, commit, sourceSha);
			if (version !== tag) {
				throw new Error(
					`Tag ${tag} claims source ${sourceSha} but is not its release commit.`,
				);
			}
			sourceCandidates.push({ commit, tag });
		}
	}

	if (sourceCandidates.length > 1) {
		throw new Error(`Source ${sourceSha} already has multiple release tags.`);
	}

	return { publishedVersions, sourceCandidate: sourceCandidates[0] ?? null };
}

function findUntaggedCandidate(root, sourceSha, taggedCandidate) {
	const output = git(root, [
		'log',
		'--all',
		'--format=%H',
		'--fixed-strings',
		`--grep=Source-Commit: ${sourceSha}`,
	]);
	const commits = output.length === 0 ? [] : output.split('\n');
	const candidates = [];

	for (const commit of commits) {
		const version = candidateVersion(root, commit, sourceSha);
		if (version !== null) {
			candidates.push({ commit, tag: version });
		}
	}

	const uniqueCandidates = new Map(
		candidates.map((candidate) => [candidate.commit, candidate]),
	);
	if (taggedCandidate !== null) {
		uniqueCandidates.set(taggedCandidate.commit, taggedCandidate);
	}

	if (uniqueCandidates.size > 1) {
		throw new Error(`Source ${sourceSha} has multiple release commits.`);
	}

	return [...uniqueCandidates.values()][0] ?? null;
}

function ensureCleanTrackedTree(root) {
	if (
		!gitSucceeds(root, ['diff', '--quiet']) ||
		!gitSucceeds(root, ['diff', '--cached', '--quiet'])
	) {
		throw new Error('Tracked working tree changes must be committed first.');
	}
}

function stageOnlyReleaseFiles(root, requireEveryFile = true) {
	git(root, ['add', '--', ...RELEASE_FILES]);
	const staged = git(root, ['diff', '--cached', '--name-only']);
	const stagedFiles = staged.length === 0 ? [] : staged.split('\n').sort();
	const expectedFiles = [...RELEASE_FILES].sort();
	const hasUnexpectedFile = stagedFiles.some(
		(filename) => !RELEASE_FILES.includes(filename),
	);
	if (
		hasUnexpectedFile ||
		(requireEveryFile &&
			JSON.stringify(stagedFiles) !== JSON.stringify(expectedFiles))
	) {
		throw new Error(
			`Expected only release metadata changes, found: ${stagedFiles.join(', ')}`,
		);
	}
}

async function createCandidate(
	root,
	sourceSha,
	nowSeconds,
	publishedVersions,
) {
	git(root, ['checkout', '--detach', sourceSha]);
	const version = await updateReleaseFiles({
		nowSeconds,
		publishedVersions,
		root,
	});
	stageOnlyReleaseFiles(root);
	git(root, [
		'commit',
		'-m',
		`chore(release): ${version}`,
		'-m',
		`Source-Commit: ${sourceSha}\nRelease-Workflow: true`,
	]);
	const commit = resolveCommit(root, 'HEAD');

	return { commit, tag: version };
}

function createMissingTag(root, candidate, sourceSha) {
	if (gitSucceeds(root, ['show-ref', '--verify', '--quiet', `refs/tags/${candidate.tag}`])) {
		const taggedCommit = resolveCommit(root, `refs/tags/${candidate.tag}`);
		if (taggedCommit !== candidate.commit) {
			throw new Error(
				`Tag ${candidate.tag} already points to a different commit.`,
			);
		}
		return false;
	}

	git(root, [
		'tag',
		'-a',
		candidate.tag,
		candidate.commit,
		'-m',
		`HTML Document Viewer ${candidate.tag}`,
		'-m',
		`Source-Commit: ${sourceSha}`,
	]);
	return true;
}

function highestVersion(versions) {
	return [...versions].sort((left, right) => parsePatch(right) - parsePatch(left))[0];
}

async function integrateCandidate(
	root,
	sourceSha,
	candidate,
	latestMain,
	publishedVersions,
) {
	if (isAncestor(root, latestMain, candidate.commit)) {
		return candidate.commit;
	}

	if (isAncestor(root, candidate.commit, latestMain)) {
		return latestMain;
	}

	git(root, ['checkout', '--detach', latestMain]);
	git(root, ['merge', '--no-ff', '--no-commit', '-s', 'ours', candidate.commit]);
	const headVersion = highestVersion(publishedVersions.keys());
	if (headVersion === undefined) {
		throw new Error('No published version is available for main integration.');
	}
	await updateReleaseFiles({
		nowSeconds: 0,
		publishedVersions,
		requestedVersion: headVersion,
		root,
	});
	stageOnlyReleaseFiles(root, false);
	git(root, [
		'commit',
		'-m',
		`chore(release): integrate ${candidate.tag}`,
		'-m',
		`Source-Commit: ${sourceSha}\nRelease-Workflow: true`,
	]);
	return resolveCommit(root, 'HEAD');
}

export async function prepareRelease({ nowSeconds, root, sourceSha }) {
	if (!/^[0-9a-f]{40}$/u.test(sourceSha)) {
		throw new Error('Source must be a full 40-character commit SHA.');
	}
	ensureCleanTrackedTree(root);
	const sourceCommit = resolveCommit(root, sourceSha);
	const latestMain = resolveCommit(root, 'refs/remotes/origin/main');
	if (!isAncestor(root, sourceCommit, latestMain)) {
		throw new Error(
			`Source ${sourceCommit} is no longer an ancestor of origin/main.`,
		);
	}

	const tagState = inspectReleaseTags(root, sourceCommit);
	let candidate = findUntaggedCandidate(
		root,
		sourceCommit,
		tagState.sourceCandidate,
	);
	const createdVersion = candidate === null;
	if (candidate === null) {
		candidate = await createCandidate(
			root,
			sourceCommit,
			nowSeconds,
			tagState.publishedVersions,
		);
	}

	const createdTag = createMissingTag(root, candidate, sourceCommit);
	const minAppVersion = verifyVersionAtCommit(
		root,
		candidate.commit,
		candidate.tag,
	);
	tagState.publishedVersions.set(candidate.tag, minAppVersion);
	const mainCommit = await integrateCandidate(
		root,
		sourceCommit,
		candidate,
		latestMain,
		tagState.publishedVersions,
	);

	return {
		createdTag,
		createdVersion,
		mainCommit,
		releaseCommit: candidate.commit,
		sourceCommit,
		version: candidate.tag,
	};
}

async function main() {
	const result = await prepareRelease(parseArguments(process.argv.slice(2)));
	process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await main().catch((error) => {
		const message = error instanceof Error ? error.message : 'Unknown error.';
		process.stderr.write(`Release preparation failed: ${message}\n`);
		process.exitCode = 1;
	});
}
