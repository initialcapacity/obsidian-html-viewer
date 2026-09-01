import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const greenSquare =
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEUixV6m7fCsAAAADElEQVQI12NgIA0AAAAwAAHHqoWOAAAAAElFTkSuQmCC';
const target = fileURLToPath(
	new URL('../tests/fixtures/same-folder-assets/image.png', import.meta.url),
);

await writeFile(target, Buffer.from(greenSquare, 'base64'));
