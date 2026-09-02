import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

const stylesheet = readFileSync('styles.css', 'utf8');

describe('viewer styles', () => {
	afterEach(() => {
		document.head.replaceChildren();
		document.body.replaceChildren();
	});

	it('keeps a hidden status message out of layout', () => {
		const parsedStyles = new DOMParser().parseFromString(
			`<style>${stylesheet}</style>`,
			'text/html',
		);
		const style = parsedStyles.head.firstElementChild;
		if (style === null) {
			throw new Error('Could not parse viewer stylesheet');
		}
		document.head.append(style);

		const element = document.body.createDiv({
			cls: 'html-document-viewer__status',
		});
		element.hidden = true;

		expect(getComputedStyle(element).display).toBe('none');
	});

	it('contains no toolbar, source, zoom, or print presentation rules', () => {
		for (const obsoleteSelector of [
			'__toolbar',
			'__links',
			'__source',
			'--printing',
			'@media print',
		]) {
			expect(stylesheet).not.toContain(obsoleteSelector);
		}
	});
});
