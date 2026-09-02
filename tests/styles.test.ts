import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

const stylesheet = readFileSync('styles.css', 'utf8');

describe('viewer styles', () => {
	afterEach(() => {
		document.head.replaceChildren();
		document.body.replaceChildren();
	});

	it.each([
		['iframe', 'html-document-viewer__frame'],
		['div', 'html-document-viewer__links'],
		['pre', 'html-document-viewer__source'],
	])('keeps a hidden %s hidden despite its display rule', (tagName, className) => {
		const parsedStyles = new DOMParser().parseFromString(
			`<style>${stylesheet}</style>`,
			'text/html',
		);
		const style = parsedStyles.head.firstElementChild;
		if (style === null) {
			throw new Error('Could not parse viewer stylesheet');
		}
		document.head.append(style);

		const element = document.body.createEl(
			tagName as keyof HTMLElementTagNameMap,
			{ cls: className },
		);
		element.hidden = true;

		expect(getComputedStyle(element).display).toBe('none');
	});
});
