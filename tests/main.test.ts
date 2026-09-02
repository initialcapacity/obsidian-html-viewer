import type { App, PluginManifest } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';

const registerView = vi.fn();
const registerExtensions = vi.fn();

vi.mock('obsidian', () => ({
	FileView: class {},
	Plugin: class {
		app: unknown;

		constructor(app: unknown) {
			this.app = app;
		}

		registerExtensions = registerExtensions;
		registerView = registerView;
	},
	TAbstractFile: class {},
	TFile: class {},
	WorkspaceLeaf: class {},
	arrayBufferToBase64: vi.fn(),
}));

import HtmlDocumentViewerPlugin from '../src/main';
import { HTML_DOCUMENT_VIEW_TYPE } from '../src/html-document-view';

describe('plugin lifecycle', () => {
	it('registers both extensions and detaches every viewer on unload', () => {
		const firstLeaf = { detach: vi.fn() };
		const secondLeaf = { detach: vi.fn() };
		const app = {
			workspace: {
				getLeavesOfType: vi.fn(() => [firstLeaf, secondLeaf]),
			},
		};
		const plugin = new HtmlDocumentViewerPlugin(
			app as unknown as App,
			{} as PluginManifest,
		);

		plugin.onload();
		expect(registerView).toHaveBeenCalledWith(
			HTML_DOCUMENT_VIEW_TYPE,
			expect.any(Function),
		);
		expect(registerExtensions).toHaveBeenCalledWith(
			['html', 'htm'],
			HTML_DOCUMENT_VIEW_TYPE,
		);

		plugin.onunload();
		expect(app.workspace.getLeavesOfType).toHaveBeenCalledWith(
			HTML_DOCUMENT_VIEW_TYPE,
		);
		expect(firstLeaf.detach).toHaveBeenCalledOnce();
		expect(secondLeaf.detach).toHaveBeenCalledOnce();
	});
});
