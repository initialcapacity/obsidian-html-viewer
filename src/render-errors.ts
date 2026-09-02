export type RenderFailureCode =
	| 'document-too-complex'
	| 'document-too-large'
	| 'read-failed'
	| 'render-failed';

export class RenderFailure extends Error {
	constructor(
		readonly code: RenderFailureCode,
		message: string,
	) {
		super(message);
		this.name = 'RenderFailure';
	}
}

export function classifyRenderFailure(error: unknown): RenderFailure {
	if (error instanceof RenderFailure) {
		return error;
	}
	if (error instanceof Error) {
		if (error.message.includes('too many elements') || error.message.includes('nested too deeply')) {
			return new RenderFailure(
				'document-too-complex',
				'The HTML document is too complex to display safely.',
			);
		}
		if (
			error.message.includes('safe rendering size limit') ||
			error.message.includes('too many asset references')
		) {
			return new RenderFailure(
				'document-too-large',
				'The HTML document exceeds a safe rendering limit.',
			);
		}
	}
	return new RenderFailure('render-failed', 'Unable to prepare the HTML document.');
}
