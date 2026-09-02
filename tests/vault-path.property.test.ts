import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveVaultReference } from '../src/vault-path';

describe('vault path properties', () => {
	it('never resolves outside the vault or leaves dot segments', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 200 }), (reference) => {
				const result = resolveVaultReference(
					'documents/pages/index.html',
					reference,
					{ allowFragment: true },
				);
				if (result.ok) {
					expect(result.path.startsWith('/')).toBe(false);
					expect(result.path.includes('\\')).toBe(false);
					expect(result.path.split('/')).not.toContain('.');
					expect(result.path.split('/')).not.toContain('..');
				}
			}),
			{ numRuns: 1_000 },
		);
	});
});
