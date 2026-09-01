import { copyFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

const PLUGIN_ID = 'html-document-viewer';
const RUNTIME_FILES = ['main.js', 'manifest.json', 'styles.css'];

function readVaultArgument(argumentsList) {
	const vaultIndex = argumentsList.indexOf('--vault');
	if (vaultIndex === -1 || argumentsList[vaultIndex + 1] === undefined) {
		throw new Error(
			'Usage: npm run install:local -- --vault <path-to-test-vault>',
		);
	}

	return resolve(argumentsList[vaultIndex + 1]);
}

async function requireDirectory(path, label) {
	const details = await stat(path).catch(() => null);
	if (details === null || !details.isDirectory()) {
		throw new Error(`${label} is not an existing directory: ${path}`);
	}
}

async function install() {
	const repositoryRoot = resolve(import.meta.dirname, '..');
	const vaultPath = readVaultArgument(process.argv.slice(2));
	const configPath = join(vaultPath, '.obsidian');
	const pluginPath = join(configPath, 'plugins', PLUGIN_ID);

	await requireDirectory(vaultPath, 'Vault path');
	await requireDirectory(configPath, 'Obsidian configuration directory');

	for (const file of RUNTIME_FILES) {
		const sourcePath = join(repositoryRoot, file);
		const details = await stat(sourcePath).catch(() => null);
		if (details === null || !details.isFile()) {
			throw new Error(`Build artifact is missing: ${file}`);
		}
	}

	await mkdir(pluginPath, { recursive: true });
	for (const file of RUNTIME_FILES) {
		await copyFile(join(repositoryRoot, file), join(pluginPath, file));
	}

	console.info(`Installed ${PLUGIN_ID} in ${pluginPath}`);
}

await install().catch((error) => {
	const message = error instanceof Error ? error.message : 'Unknown install error.';
	console.error(message);
	process.exitCode = 1;
});
