import type { WorkspaceLeaf } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => {
	class MockFileView {
		app: unknown;
		contentEl: HTMLElement;
		file: {
			basename: string;
			path: string;
			stat: { size: number };
		} | null = null;

		constructor(leaf: { app: unknown }) {
			this.app = leaf.app;
			this.contentEl = document.body.createDiv();
		}

		getDisplayText(): string {
			return '';
		}

		getViewType(): string {
			return '';
		}

		onClose(): Promise<void> {
			return Promise.resolve();
		}

		onLoadFile(file: {
			basename: string;
			path: string;
			stat: { size: number };
		}): Promise<void> {
			this.file = file;
			return Promise.resolve();
		}

		onOpen(): Promise<void> {
			return Promise.resolve();
		}

		onRename(_file: {
			basename: string;
			path: string;
			stat: { size: number };
		}): Promise<void> {
			return Promise.resolve();
		}

		onUnloadFile(_file: {
			basename: string;
			path: string;
			stat: { size: number };
		}): Promise<void> {
			return Promise.resolve();
		}

		registerEvent(_event: unknown): void {}
	}

	class MockTFile {}

	return {
		FileView: MockFileView,
		TAbstractFile: class {},
		TFile: MockTFile,
		WorkspaceLeaf: class {},
		arrayBufferToBase64: () => 'AA==',
	};
});

import { HtmlDocumentView } from '../src/html-document-view';
import { MAX_HTML_SOURCE_BYTES } from '../src/prepare-html';

interface ClosableView {
	onClose(): Promise<void>;
}

interface TestVault {
	cachedRead: ReturnType<typeof vi.fn>;
	getFileByPath: ReturnType<typeof vi.fn>;
	on: ReturnType<typeof vi.fn>;
	readBinary: ReturnType<typeof vi.fn>;
}

function createView(source: string): {
	file: { basename: string; path: string; stat: { size: number } };
	vault: TestVault;
	view: HtmlDocumentView;
} {
	const vault: TestVault = {
		cachedRead: vi.fn(async () => source),
		getFileByPath: vi.fn(() => null),
		on: vi.fn(() => ({})),
		readBinary: vi.fn(),
	};
	const leaf = { app: { vault } } as unknown as WorkspaceLeaf;
	return {
		file: {
			basename: 'index',
			path: 'folder/index.html',
			stat: { size: source.length },
		},
		vault,
		view: new HtmlDocumentView(leaf),
	};
}

describe('HtmlDocumentView behavior', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		Object.defineProperty(window.URL, 'revokeObjectURL', {
			configurable: true,
			value: vi.fn(),
		});
	});

	it('renders prepared CSS and MathML only into the sandboxed iframe', async () => {
		const css = 'main > p { color: red; } .card { & > strong { color: blue; } }';
		const { file, view } = createView(
			`<style>${css}</style><main><p>Rendered</p><math><msup><mi>x</mi><mn>2</mn></msup></math></main>`,
		);

		await view.onLoadFile(file as never);

		const iframe = view.contentEl.querySelector('iframe');
		const status = view.contentEl.querySelector<HTMLDivElement>(
			'.html-document-viewer__status',
		);
		expect(iframe?.getAttribute('sandbox')).toBe('');
		expect(iframe?.srcdoc).toContain(css);
		expect(iframe?.srcdoc).toContain('<math');
		expect(view.contentEl.querySelector('main, math')).toBeNull();
		expect(status?.hidden).toBe(true);
	});

	it('renders safe warning text without covering preparation output', async () => {
		const { file, view } = createView(
			'<h1>Visible content</h1><img src="missing.png">',
		);

		await view.onLoadFile(file as never);

		const iframe = view.contentEl.querySelector('iframe');
		const status = view.contentEl.querySelector<HTMLDivElement>(
			'.html-document-viewer__status',
		);
		expect(iframe?.srcdoc).toContain('Visible content');
		expect(status?.dataset.state).toBe('warning');
		expect(status?.textContent).toBe('Image not found: “missing.png”.');
		expect(status?.querySelector('*')).toBeNull();
	});

	it('uses the production base64 path for a validated local raster image', async () => {
		const { file, vault, view } = createView('<img src="image.png">');
		vault.getFileByPath.mockReturnValue({});
		vault.readBinary.mockResolvedValue(new ArrayBuffer(1));

		await view.onLoadFile(file as never);

		const iframe = view.contentEl.querySelector('iframe');
		const prepared = new DOMParser().parseFromString(
			iframe?.srcdoc ?? '',
			'text/html',
		);
		expect(prepared.querySelector('img')?.getAttribute('src')).toBe(
			'data:image/png;base64,AA==',
		);
		expect(vault.readBinary).toHaveBeenCalledOnce();
	});

	it('rejects an oversized HTML file before reading it into memory', async () => {
		const { file, vault, view } = createView('<h1>Too large</h1>');
		file.stat.size = MAX_HTML_SOURCE_BYTES + 1;

		await view.onLoadFile(file as never);

		const iframe = view.contentEl.querySelector('iframe');
		const status = view.contentEl.querySelector<HTMLDivElement>(
			'.html-document-viewer__status',
		);
		expect(vault.cachedRead).not.toHaveBeenCalled();
		expect(iframe?.getAttribute('src')).toBe('about:blank');
		expect(status?.dataset.state).toBe('error');
	});

	it('discards an older read after a newer render starts', async () => {
		const { file, vault, view } = createView('unused');
		let finishFirstRead: ((source: string) => void) | undefined;
		vault.cachedRead
			.mockImplementationOnce(
				async () =>
					await new Promise<string>((resolveRead) => {
						finishFirstRead = resolveRead;
					}),
			)
			.mockResolvedValueOnce('<h1>Newest render</h1>');

		const olderRender = view.onLoadFile(file as never);
		await Promise.resolve();
		const newerRender = view.onLoadFile(file as never);
		await newerRender;
		finishFirstRead?.('<h1>Stale render</h1>');
		await olderRender;

		const iframe = view.contentEl.querySelector('iframe');
		expect(iframe?.srcdoc).toContain('Newest render');
		expect(iframe?.srcdoc).not.toContain('Stale render');
	});

	it('blanks and removes the frame on close', async () => {
		const { file, view } = createView('<h1>Close me</h1>');
		await view.onLoadFile(file as never);
		const iframe = view.contentEl.querySelector('iframe');

		await (view as unknown as ClosableView).onClose();

		expect(iframe?.hasAttribute('srcdoc')).toBe(false);
		expect(iframe?.getAttribute('src')).toBe('about:blank');
		expect(view.contentEl.childElementCount).toBe(0);
	});
});
