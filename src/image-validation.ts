import type { RasterMimeType } from './mime';

export const MAX_IMAGE_DIMENSION = 16_384;
export const MAX_IMAGE_PIXELS = 40_000_000;

export type ImageValidationResult =
	| { height: number; ok: true; width: number }
	| { ok: false };

function dimensions(width: number, height: number): ImageValidationResult {
	return Number.isSafeInteger(width) &&
		Number.isSafeInteger(height) &&
		width > 0 &&
		height > 0 &&
		width <= MAX_IMAGE_DIMENSION &&
		height <= MAX_IMAGE_DIMENSION &&
		width * height <= MAX_IMAGE_PIXELS
		? { height, ok: true, width }
		: { ok: false };
}

function matches(bytes: Uint8Array, offset: number, expected: number[]): boolean {
	return expected.every((value, index) => bytes[offset + index] === value);
}

function png(bytes: Uint8Array, view: DataView): ImageValidationResult {
	if (
		bytes.length < 24 ||
		!matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10]) ||
		!matches(bytes, 12, [73, 72, 68, 82])
	) {
		return { ok: false };
	}
	return dimensions(view.getUint32(16), view.getUint32(20));
}

function gif(bytes: Uint8Array, view: DataView): ImageValidationResult {
	const header = String.fromCharCode(...bytes.slice(0, 6));
	return bytes.length < 10 || (header !== 'GIF87a' && header !== 'GIF89a')
		? { ok: false }
		: dimensions(view.getUint16(6, true), view.getUint16(8, true));
}

function jpeg(bytes: Uint8Array, view: DataView): ImageValidationResult {
	if (bytes.length < 4 || !matches(bytes, 0, [0xff, 0xd8])) {
		return { ok: false };
	}
	const startOfFrame = new Set([
		0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
		0xcf,
	]);
	let offset = 2;
	while (offset + 3 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = bytes[offset + 1];
		offset += 2;
		if (marker === undefined || marker === 0xd9 || marker === 0xda) {
			break;
		}
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			continue;
		}
		if (offset + 2 > bytes.length) {
			break;
		}
		const length = view.getUint16(offset);
		if (length < 2 || offset + length > bytes.length) {
			break;
		}
		if (startOfFrame.has(marker) && length >= 7) {
			return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
		}
		offset += length;
	}
	return { ok: false };
}

function webp(bytes: Uint8Array, view: DataView): ImageValidationResult {
	if (
		bytes.length < 30 ||
		!matches(bytes, 0, [82, 73, 70, 70]) ||
		!matches(bytes, 8, [87, 69, 66, 80])
	) {
		return { ok: false };
	}
	let offset = 12;
	while (offset + 8 <= bytes.length) {
		const type = String.fromCharCode(...bytes.slice(offset, offset + 4));
		const size = view.getUint32(offset + 4, true);
		const payload = offset + 8;
		if (payload + size > bytes.length) {
			return { ok: false };
		}
		if (type === 'VP8X' && size >= 10) {
			const width = 1 + (bytes[payload + 4] ?? 0) + ((bytes[payload + 5] ?? 0) << 8) + ((bytes[payload + 6] ?? 0) << 16);
			const height = 1 + (bytes[payload + 7] ?? 0) + ((bytes[payload + 8] ?? 0) << 8) + ((bytes[payload + 9] ?? 0) << 16);
			return dimensions(width, height);
		}
		if (type === 'VP8 ' && size >= 10 && matches(bytes, payload + 3, [0x9d, 0x01, 0x2a])) {
			return dimensions(
				view.getUint16(payload + 6, true) & 0x3fff,
				view.getUint16(payload + 8, true) & 0x3fff,
			);
		}
		if (type === 'VP8L' && size >= 5 && bytes[payload] === 0x2f) {
			const first = bytes[payload + 1] ?? 0;
			const second = bytes[payload + 2] ?? 0;
			const third = bytes[payload + 3] ?? 0;
			const fourth = bytes[payload + 4] ?? 0;
			return dimensions(
				1 + first + ((second & 0x3f) << 8),
				1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
			);
		}
		offset = payload + size + (size % 2);
	}
	return { ok: false };
}

function avif(bytes: Uint8Array, view: DataView): ImageValidationResult {
	if (bytes.length < 24 || !matches(bytes, 4, [102, 116, 121, 112])) {
		return { ok: false };
	}
	const brandHeader = String.fromCharCode(...bytes.slice(8, Math.min(64, bytes.length)));
	if (!brandHeader.includes('avif') && !brandHeader.includes('avis')) {
		return { ok: false };
	}
	for (let offset = 4; offset + 16 <= bytes.length; offset += 1) {
		if (matches(bytes, offset, [105, 115, 112, 101])) {
			return dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
		}
	}
	return { ok: false };
}

export function validateRasterImage(
	data: ArrayBuffer,
	mimeType: RasterMimeType,
): ImageValidationResult {
	const bytes = new Uint8Array(data);
	const view = new DataView(data);
	switch (mimeType) {
		case 'image/png':
			return png(bytes, view);
		case 'image/gif':
			return gif(bytes, view);
		case 'image/jpeg':
			return jpeg(bytes, view);
		case 'image/webp':
			return webp(bytes, view);
		case 'image/avif':
			return avif(bytes, view);
	}
}
