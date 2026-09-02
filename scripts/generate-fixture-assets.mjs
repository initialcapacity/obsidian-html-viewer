import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const greenSquare =
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEUixV6m7fCsAAAADElEQVQI12NgIA0AAAAwAAHHqoWOAAAAAElFTkSuQmCC';
const targets = [
	fileURLToPath(
		new URL('../tests/fixtures/same-folder-assets/image.png', import.meta.url),
	),
	fileURLToPath(
		new URL('../tests/fixtures/feature-smoke/images/proof.png', import.meta.url),
	),
];

for (const target of targets) {
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, Buffer.from(greenSquare, 'base64'));
}
