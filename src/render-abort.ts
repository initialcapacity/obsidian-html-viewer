export class RenderAbortedError extends Error {
	constructor() {
		super('HTML document rendering was canceled.');
		this.name = 'AbortError';
	}
}

export function throwIfRenderAborted(signal?: AbortSignal): void {
	if (signal?.aborted === true) {
		throw new RenderAbortedError();
	}
}

export function isRenderAborted(error: unknown): boolean {
	return error instanceof RenderAbortedError;
}
