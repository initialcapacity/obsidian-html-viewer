import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(name: string): string {
	return readFileSync(resolve('src', name), 'utf8');
}

describe('runtime source boundary', () => {
	it('never inserts document strings into the Obsidian-owned DOM', () => {
		const runtime = [
			source('main.ts'),
			source('html-document-view.ts'),
			source('iframe-boundary.ts'),
			source('prepare-html.ts'),
		].join('\n');

		expect(runtime).not.toMatch(/\.innerHTML\s*=/u);
		expect(runtime).not.toMatch(/\.outerHTML\s*=/u);
		expect(runtime).not.toContain('insertAdjacentHTML');
	});

	it('uses srcdoc only for prepared output and textContent for status messages', () => {
		const viewSource = source('html-document-view.ts');

		expect(viewSource).toContain('iframe.srcdoc = prepared');
		expect(viewSource).toContain('status.textContent =');
		expect(viewSource).not.toContain('contentEl.createEl');
	});

	it('registers both extensions without leading dots', () => {
		const mainSource = source('main.ts');

		expect(mainSource).toContain(
			"this.registerExtensions(['html', 'htm'], HTML_DOCUMENT_VIEW_TYPE)",
		);
		expect(mainSource).not.toContain("['.html'");
		expect(mainSource).not.toContain("'.htm'");
	});

	it('contains no desktop-only runtime imports or network APIs', () => {
		const runtime = [source('main.ts'), source('html-document-view.ts')].join(
			'\n',
		);

		expect(runtime).not.toMatch(/from ['"](?:node:|fs|path|electron)/u);
		expect(runtime).not.toMatch(/\b(?:fetch|requestUrl|XMLHttpRequest)\s*\(/u);
	});
});
