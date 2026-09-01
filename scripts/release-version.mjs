import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const VERSION_PATTERN = /^0\.0\.(0|[1-9]\d*)$/u;
const VERSION_FILES = [
	'manifest.json',
	'package.json',
	'package-lock.json',
	'versions.json',
];

function parseArguments(argumentsList) {
	const options = {
		nowSeconds: Math.floor(Date.now() / 1000),
		publishedVersions: new Map(),
		requestedVersion: null,
		root: process.cwd(),
	};

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		const value = argumentsList[index + 1];

		if (argument === '--root' && value !== undefined) {
			options.root = resolve(value);
			index += 1;
		} else if (argument === '--now' && value !== undefined) {
			options.nowSeconds = parseInteger(value, '--now');
			index += 1;
		} else if (argument === '--version' && value !== undefined) {
			parsePatch(value);
			options.requestedVersion = value;
			index += 1;
		} else if (argument === '--published' && value !== undefined) {
			const separatorIndex = value.indexOf('=');
			if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
				throw new Error(
					'--published must use the form <version>=<minAppVersion>.',
				);
			}

			const version = value.slice(0, separatorIndex);
			const minAppVersion = value.slice(separatorIndex + 1);
			parsePatch(version);
			options.publishedVersions.set(version, minAppVersion);
			index += 1;
		} else {
			throw new Error(`Unknown or incomplete argument: ${argument ?? ''}`);
		}
	}

	return options;
}

function parseInteger(value, label) {
	if (!/^\d+$/u.test(value)) {
		throw new Error(`${label} must be a non-negative integer.`);
	}

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) {
		throw new Error(`${label} must be a safe integer.`);
	}

	return parsed;
}

export function parsePatch(version) {
	const match = VERSION_PATTERN.exec(version);
	if (match?.[1] === undefined) {
		throw new Error(`Invalid timestamp version: ${version}`);
	}

	return parseInteger(match[1], 'Version patch');
}

export function calculateNextVersion(nowSeconds, knownVersions) {
	if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
		throw new Error('Current UTC epoch seconds must be a safe integer.');
	}

	let patch = nowSeconds;
	for (const version of knownVersions) {
		patch = Math.max(patch, parsePatch(version) + 1);
	}

	return `0.0.${patch}`;
}

function requireObject(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${label} must contain a JSON object.`);
	}

	return value;
}

async function readJson(root, filename) {
	const text = await readFile(join(root, filename), 'utf8');
	return requireObject(JSON.parse(text), filename);
}

function requireStringProperty(object, property, label) {
	const value = object[property];
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${label}.${property} must be a non-empty string.`);
	}

	return value;
}

function validateCurrentMetadata(manifest, packageJson, packageLock, versions) {
	const manifestVersion = requireStringProperty(
		manifest,
		'version',
		'manifest.json',
	);
	parsePatch(manifestVersion);

	if (packageJson.version !== manifestVersion) {
		throw new Error('package.json version does not match manifest.json.');
	}

	if (packageLock.version !== manifestVersion) {
		throw new Error('package-lock.json version does not match manifest.json.');
	}

	const packages = requireObject(
		packageLock.packages,
		'package-lock.json packages',
	);
	const rootPackage = requireObject(
		packages[''],
		'package-lock.json root package',
	);
	if (rootPackage.version !== manifestVersion) {
		throw new Error(
			'package-lock.json root package version does not match manifest.json.',
		);
	}

	if (typeof versions[manifestVersion] !== 'string') {
		throw new Error('versions.json does not map the current manifest version.');
	}
}

export async function updateReleaseFiles({
	nowSeconds,
	publishedVersions = new Map(),
	requestedVersion = null,
	root,
}) {
	const [manifest, packageJson, packageLock, versions] = await Promise.all(
		VERSION_FILES.map((filename) => readJson(root, filename)),
	);
	validateCurrentMetadata(manifest, packageJson, packageLock, versions);

	for (const [version, minAppVersion] of publishedVersions) {
		const existingMinimum = versions[version];
		if (
			existingMinimum !== undefined &&
			existingMinimum !== minAppVersion
		) {
			throw new Error(
				`Published version ${version} has conflicting minimum app versions.`,
			);
		}
		versions[version] = minAppVersion;
	}

	const knownVersions = new Set([
		...Object.keys(versions),
		...publishedVersions.keys(),
	]);
	const version =
		requestedVersion ?? calculateNextVersion(nowSeconds, knownVersions);
	parsePatch(version);

	const minAppVersion = requireStringProperty(
		manifest,
		'minAppVersion',
		'manifest.json',
	);
	const existingMinimum = versions[version];
	if (
		existingMinimum !== undefined &&
		existingMinimum !== minAppVersion
	) {
		throw new Error(
			`Version ${version} already maps to a different minimum app version.`,
		);
	}

	manifest.version = version;
	packageJson.version = version;
	packageLock.version = version;
	requireObject(packageLock.packages, 'package-lock.json packages')[
		''
	].version = version;
	versions[version] = minAppVersion;

	await Promise.all(
		[
			['manifest.json', manifest],
			['package.json', packageJson],
			['package-lock.json', packageLock],
			['versions.json', versions],
		].map(([filename, value]) =>
			writeFile(join(root, filename), `${JSON.stringify(value, null, 2)}\n`),
		),
	);

	return version;
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	const version = await updateReleaseFiles(options);
	process.stdout.write(`${version}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await main().catch((error) => {
		const message = error instanceof Error ? error.message : 'Unknown error.';
		process.stderr.write(`Release version update failed: ${message}\n`);
		process.exitCode = 1;
	});
}
