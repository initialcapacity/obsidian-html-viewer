import { FileView, TFile, WorkspaceLeaf } from 'obsidian';
import { createViewerIframe, navigateIframeToBlank } from './iframe-boundary';
import { prepareHtml } from './prepare-html';

export const HTML_DOCUMENT_VIEW_TYPE = 'html-document-view';

export class HtmlDocumentView extends FileView {
	private iframe: HTMLIFrameElement | null = null;
	private status: HTMLDivElement | null = null;
	private renderGeneration = 0;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	override getViewType(): string {
		return HTML_DOCUMENT_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return this.file?.basename ?? 'HTML document';
	}

	override async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		this.ensureViewElements();
		await this.renderFile(file);
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		this.renderGeneration += 1;
		if (this.iframe !== null) {
			navigateIframeToBlank(this.iframe);
		}
		await super.onUnloadFile(file);
	}

	protected override async onClose(): Promise<void> {
		this.renderGeneration += 1;
		if (this.iframe !== null) {
			navigateIframeToBlank(this.iframe);
		}
		this.contentEl.replaceChildren();
		this.iframe = null;
		this.status = null;
		await super.onClose();
	}

	private ensureViewElements(): void {
		if (this.iframe !== null && this.status !== null) {
			return;
		}

		const ownerDocument = this.contentEl.ownerDocument;
		const status = ownerDocument.createElement('div');
		status.className = 'html-document-viewer__status';
		status.setAttribute('role', 'status');
		status.setAttribute('aria-live', 'polite');

		const iframe = createViewerIframe(ownerDocument);
		this.contentEl.classList.add('html-document-viewer');
		this.contentEl.replaceChildren(status, iframe);
		this.status = status;
		this.iframe = iframe;
	}

	private async renderFile(file: TFile): Promise<void> {
		const iframe = this.iframe;
		const status = this.status;
		if (iframe === null || status === null) {
			return;
		}

		const generation = ++this.renderGeneration;
		status.textContent = 'Loading HTML document…';
		status.hidden = false;

		try {
			const source = await this.app.vault.cachedRead(file);
			const prepared = prepareHtml(source);

			if (generation !== this.renderGeneration) {
				return;
			}

			iframe.removeAttribute('src');
			iframe.srcdoc = prepared;
			iframe.hidden = false;
			status.textContent = '';
			status.hidden = true;
		} catch {
			if (generation !== this.renderGeneration) {
				return;
			}

			navigateIframeToBlank(iframe);
			status.textContent = `Unable to display “${file.path}”.`;
			status.hidden = false;
		}
	}
}
