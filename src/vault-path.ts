export const MAX_VAULT_REFERENCE_LENGTH = 1_024;

export interface ResolvedVaultReference {
	fileName: string;
	fragment: string | null;
	ok: true;
	path: string;
}

export interface RejectedVaultReference {
	ok: false;
	reason: 'invalid-path';
}

export type VaultReferenceResult =
	| RejectedVaultReference
	| ResolvedVaultReference;

interface ResolveVaultReferenceOptions {
	allowFragment?: boolean;
	maxLength?: number;
}

export function parentPath(path: string): string {
	const separator = path.lastIndexOf('/');
	return separator === -1 ? '' : path.slice(0, separator);
}

function reject(): RejectedVaultReference {
	return { ok: false, reason: 'invalid-path' };
}

export function resolveVaultReference(
	documentPath: string,
	authoredReference: string,
	options: ResolveVaultReferenceOptions = {},
): VaultReferenceResult {
	const maximumLength = Math.min(
		options.maxLength ?? MAX_VAULT_REFERENCE_LENGTH,
		MAX_VAULT_REFERENCE_LENGTH,
	);
	let reference = authoredReference.trim();
	if (
		reference.length === 0 ||
		reference.length > maximumLength ||
		reference.includes('\0') ||
		reference.includes('\\') ||
		reference.startsWith('/') ||
		reference.startsWith('//') ||
		/^[a-z][a-z\d+.-]*:/iu.test(reference) ||
		/%(?:00|2f|5c)/iu.test(reference)
	) {
		return reject();
	}

	let fragment: string | null = null;
	const fragmentIndex = reference.indexOf('#');
	if (fragmentIndex !== -1) {
		if (options.allowFragment !== true) {
			return reject();
		}
		fragment = reference.slice(fragmentIndex + 1);
		reference = reference.slice(0, fragmentIndex);
	}
	if (reference.includes('?') || reference.length === 0) {
		return reject();
	}

	const rawSegments = reference.split('/');
	const resolvedSegments = parentPath(documentPath)
		.split('/')
		.filter((segment) => segment.length > 0);
	for (const rawSegment of rawSegments) {
		if (rawSegment.length === 0) {
			return reject();
		}

		let segment: string;
		try {
			segment = decodeURIComponent(rawSegment);
		} catch {
			return reject();
		}
		if (
			segment.length === 0 ||
			segment.includes('\0') ||
			segment.includes('/') ||
			segment.includes('\\') ||
			segment.includes('?') ||
			segment.includes('#')
		) {
			return reject();
		}
		if ((segment === '.' || segment === '..') && segment !== rawSegment) {
			return reject();
		}
		if (segment === '.') {
			continue;
		}
		if (segment === '..') {
			if (resolvedSegments.length === 0) {
				return reject();
			}
			resolvedSegments.pop();
			continue;
		}
		resolvedSegments.push(segment);
	}

	const fileName = resolvedSegments[resolvedSegments.length - 1];
	if (fileName === undefined) {
		return reject();
	}
	return {
		fileName,
		fragment,
		ok: true,
		path: resolvedSegments.join('/'),
	};
}

export function isRelevantVaultChange(
	currentFilePath: string,
	dependencies: ReadonlySet<string>,
	changedPath: string,
	oldPath?: string,
): boolean {
	const isRelevantPath = (path: string): boolean =>
		path === currentFilePath || dependencies.has(path);
	return (
		isRelevantPath(changedPath) ||
		(oldPath !== undefined && isRelevantPath(oldPath))
	);
}
