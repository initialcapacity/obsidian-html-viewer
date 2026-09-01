function createTestElement<K extends keyof HTMLElementTagNameMap>(
	this: Node,
	tag: K,
	options?: DomElementInfo | string,
	callback?: (element: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] {
	const ownerDocument =
		this.nodeType === Node.DOCUMENT_NODE
			? (this as Document)
			: this.ownerDocument;
	if (ownerDocument === null) {
		throw new Error('Test DOM node does not have an owning document.');
	}

	const parsed = new DOMParser().parseFromString(
		`<${tag}></${tag}>`,
		'text/html',
	);
	const parsedElement = parsed.querySelector(tag);
	if (parsedElement === null) {
		throw new Error(`Unable to create test element “${tag}”.`);
	}
	const element = ownerDocument.adoptNode(parsedElement);
	if (typeof options === 'string') {
		element.className = options;
	} else if (options !== undefined) {
		if (options.cls !== undefined) {
			element.className = Array.isArray(options.cls)
				? options.cls.join(' ')
				: options.cls;
		}
		if (options.text !== undefined) {
			element.append(options.text);
		}
		for (const [name, value] of Object.entries(options.attr ?? {})) {
			if (value !== null) {
				element.setAttribute(name, String(value));
			}
		}
		if (options.title !== undefined) {
			element.title = options.title;
		}
	}

	const parent =
		typeof options === 'object' && options.parent !== undefined
			? options.parent
			: this;
	if (typeof options === 'object' && options.prepend === true) {
		parent.insertBefore(element, parent.firstChild);
	} else {
		parent.appendChild(element);
	}
	callback?.(element);
	return element;
}

Object.defineProperty(Node.prototype, 'createEl', {
	configurable: true,
	value: createTestElement,
	writable: true,
});
