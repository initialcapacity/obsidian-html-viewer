import { Plugin } from 'obsidian';
import {
	HTML_DOCUMENT_VIEW_TYPE,
	HtmlDocumentView,
} from './html-document-view';

export default class HtmlDocumentViewerPlugin extends Plugin {
	override onload(): void {
		this.registerView(
			HTML_DOCUMENT_VIEW_TYPE,
			(leaf) => new HtmlDocumentView(leaf),
		);
		this.registerExtensions(['html', 'htm'], HTML_DOCUMENT_VIEW_TYPE);
	}
}
