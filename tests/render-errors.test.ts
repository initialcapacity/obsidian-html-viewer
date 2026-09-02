import { describe, expect, it } from 'vitest';
import {
	RenderFailure,
	classifyRenderFailure,
} from '../src/render-errors';

describe('render failure classification', () => {
	it('preserves typed failures', () => {
		const failure = new RenderFailure('read-failed', 'Unable to read.');
		expect(classifyRenderFailure(failure)).toBe(failure);
		expect(failure.name).toBe('RenderFailure');
	});

	it.each([
		['too many elements', 'document-too-complex'],
		['nested too deeply', 'document-too-complex'],
		['safe rendering size limit', 'document-too-large'],
		['too many asset references', 'document-too-large'],
	] as const)('maps parser errors containing %s', (message, code) => {
		expect(classifyRenderFailure(new Error(message)).code).toBe(code);
	});

	it('hides unexpected error details', () => {
		const failure = classifyRenderFailure(new Error('filesystem secret'));
		expect(failure.code).toBe('render-failed');
		expect(failure.message).not.toContain('secret');
		expect(classifyRenderFailure('not an error').code).toBe('render-failed');
	});
});
