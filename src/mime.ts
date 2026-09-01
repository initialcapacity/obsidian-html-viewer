export const RASTER_MIME_TYPES = {
	avif: 'image/avif',
	gif: 'image/gif',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
} as const;

export type RasterMimeType = (typeof RASTER_MIME_TYPES)[keyof typeof RASTER_MIME_TYPES];

export function getRasterMimeType(path: string): RasterMimeType | null {
	const separator = path.lastIndexOf('.');
	if (separator === -1 || separator === path.length - 1) {
		return null;
	}

	const extension = path.slice(separator + 1).toLowerCase();
	return RASTER_MIME_TYPES[
		extension as keyof typeof RASTER_MIME_TYPES
	] ?? null;
}

export function isCssPath(path: string): boolean {
	return path.toLowerCase().endsWith('.css');
}
