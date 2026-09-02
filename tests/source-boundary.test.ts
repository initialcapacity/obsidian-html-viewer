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
			source('asset-loader.ts'),
			source('mime.ts'),
			source('render-coordinator.ts'),
			source('render-abort.ts'),
		].join('\n');

		expect(runtime).not.toMatch(/\.innerHTML\s*=/u);
		expect(runtime).not.toMatch(/\.outerHTML\s*=/u);
		expect(runtime).not.toContain('insertAdjacentHTML');
		expect(runtime).not.toContain('.createElement(');
	});

	it('uses srcdoc only for prepared output and textContent for status messages', () => {
		const viewSource = source('html-document-view.ts');
		const layoutWaitIndex = viewSource.indexOf('await waitForIframeLayout(');
		const srcdocIndex = viewSource.indexOf('iframe.srcdoc = prepared');

		expect(layoutWaitIndex).toBeGreaterThanOrEqual(0);
		expect(srcdocIndex).toBeGreaterThanOrEqual(0);
		expect(layoutWaitIndex).toBeLessThan(srcdocIndex);
		expect(viewSource).toContain('status.textContent =');
		expect(viewSource).toContain('await prepareHtmlWithAssets(');
		expect(viewSource).toContain('new SameFolderAssetLoader(');
		expect(viewSource).toContain('arrayBufferToBase64(data)');
		expect(viewSource).toContain('this.contentEl.createDiv({');
		expect(viewSource).toContain('createViewerIframe(this.contentEl)');
	});

	it('keeps the Obsidian DOM-helper lint rule enabled', () => {
		const lintConfig = readFileSync(resolve('eslint.config.mts'), 'utf8');

		expect(lintConfig).not.toContain("'obsidianmd/prefer-create-el': 'off'");
	});

	it('registers both extensions without leading dots', () => {
		const mainSource = source('main.ts');

		expect(mainSource).toContain(
			"this.registerExtensions(['html', 'htm'], HTML_DOCUMENT_VIEW_TYPE)",
		);
		expect(mainSource).not.toContain("['.html'");
		expect(mainSource).not.toContain("'.htm'");
	});

	it('detaches every HTML view when the plugin is disabled', () => {
		const mainSource = source('main.ts');

		expect(mainSource).toContain('override onunload(): void');
		expect(mainSource).toContain('this.app.workspace.getLeavesOfType(');
		expect(mainSource).toContain('leaf.detach()');
	});

	it('registers every required vault event on each view', () => {
		const viewSource = source('html-document-view.ts');

		for (const event of ['create', 'modify', 'delete', 'rename']) {
			expect(viewSource).toContain(`this.app.vault.on('${event}'`);
		}
		expect(viewSource).toContain('this.registerEvent(');
		expect(viewSource.match(/this\.app\.vault\.on\(/gu)).toHaveLength(4);
	});

	it('contains no desktop-only runtime imports or network APIs', () => {
		const runtime = [
			source('main.ts'),
			source('html-document-view.ts'),
			source('iframe-boundary.ts'),
			source('prepare-html.ts'),
			source('asset-loader.ts'),
			source('mime.ts'),
			source('render-coordinator.ts'),
			source('render-abort.ts'),
		].join('\n');

		expect(runtime).not.toMatch(/from ['"](?:node:|fs|path|electron)/u);
		expect(runtime).not.toMatch(/\b(?:fetch|requestUrl|XMLHttpRequest)\s*\(/u);
	});

	it('keeps warnings in layout flow and uses theme-safe status colors', () => {
		const styles = readFileSync(resolve('styles.css'), 'utf8');
		const warningRule = styles.slice(
			styles.indexOf("[data-state='warning']"),
		);

		expect(styles).toContain('background: var(--background-primary);');
		expect(styles).toContain('color: var(--text-normal);');
		expect(warningRule).toContain('position: static;');
		expect(warningRule).toContain('flex: 0 1 auto;');
	});
});
