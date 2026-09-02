import { describe, expect, it } from 'vitest';
import {
	MAX_IMAGE_DIMENSION,
	validateRasterImage,
} from '../src/image-validation';

function png(width: number, height: number): ArrayBuffer {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
	bytes.set([73, 72, 68, 82], 12);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes.buffer;
}

function gif(width: number, height: number): ArrayBuffer {
	const bytes = new Uint8Array(10);
	bytes.set(new TextEncoder().encode('GIF89a'));
	const view = new DataView(bytes.buffer);
	view.setUint16(6, width, true);
	view.setUint16(8, height, true);
	return bytes.buffer;
}

function jpeg(width: number, height: number): ArrayBuffer {
	const bytes = new Uint8Array(21);
	bytes.set([0xff, 0xd8, 0xff, 0xc0, 0, 17]);
	const view = new DataView(bytes.buffer);
	view.setUint16(7, height);
	view.setUint16(9, width);
	return bytes.buffer;
}

function webp(
	type: 'VP8 ' | 'VP8L' | 'VP8X',
	width: number,
	height: number,
): ArrayBuffer {
	const bytes = new Uint8Array(30);
	bytes.set(new TextEncoder().encode('RIFF'), 0);
	bytes.set(new TextEncoder().encode('WEBP'), 8);
	bytes.set(new TextEncoder().encode(type), 12);
	const view = new DataView(bytes.buffer);
	const payload = 20;
	if (type === 'VP8X') {
		view.setUint32(16, 10, true);
		const storedWidth = width - 1;
		const storedHeight = height - 1;
		bytes[payload + 4] = storedWidth & 0xff;
		bytes[payload + 5] = (storedWidth >> 8) & 0xff;
		bytes[payload + 6] = (storedWidth >> 16) & 0xff;
		bytes[payload + 7] = storedHeight & 0xff;
		bytes[payload + 8] = (storedHeight >> 8) & 0xff;
		bytes[payload + 9] = (storedHeight >> 16) & 0xff;
	} else if (type === 'VP8 ') {
		view.setUint32(16, 10, true);
		bytes.set([0x9d, 0x01, 0x2a], payload + 3);
		view.setUint16(payload + 6, width, true);
		view.setUint16(payload + 8, height, true);
	} else {
		view.setUint32(16, 5, true);
		const storedWidth = width - 1;
		const storedHeight = height - 1;
		bytes[payload] = 0x2f;
		bytes[payload + 1] = storedWidth & 0xff;
		bytes[payload + 2] =
			((storedHeight & 0x03) << 6) | ((storedWidth >> 8) & 0x3f);
		bytes[payload + 3] = (storedHeight >> 2) & 0xff;
		bytes[payload + 4] = (storedHeight >> 10) & 0x0f;
	}
	return bytes.buffer;
}

function avif(width: number, height: number): ArrayBuffer {
	const bytes = new Uint8Array(40);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, 20);
	bytes.set(new TextEncoder().encode('ftypavif'), 4);
	view.setUint32(16, 20);
	bytes.set(new TextEncoder().encode('ispe'), 20);
	view.setUint32(28, width);
	view.setUint32(32, height);
	return bytes.buffer;
}

describe('raster image validation', () => {
	it('accepts a matching bounded raster header', () => {
		expect(validateRasterImage(png(640, 480), 'image/png')).toEqual({
			height: 480,
			ok: true,
			width: 640,
		});
	});

	it('rejects mismatched, incomplete, and decompression-bomb dimensions', () => {
		expect(validateRasterImage(png(1, 1), 'image/gif')).toEqual({ ok: false });
		expect(validateRasterImage(new ArrayBuffer(4), 'image/png')).toEqual({
			ok: false,
		});
		expect(
			validateRasterImage(png(MAX_IMAGE_DIMENSION + 1, 1), 'image/png'),
		).toEqual({ ok: false });
		expect(validateRasterImage(png(10_000, 10_000), 'image/png')).toEqual({
			ok: false,
		});
	});

	it.each([
		['GIF', gif(320, 200), 'image/gif', 320, 200],
		['JPEG', jpeg(800, 600), 'image/jpeg', 800, 600],
		['extended WebP', webp('VP8X', 900, 700), 'image/webp', 900, 700],
		['lossy WebP', webp('VP8 ', 640, 360), 'image/webp', 640, 360],
		['lossless WebP', webp('VP8L', 513, 257), 'image/webp', 513, 257],
		['AVIF', avif(1_024, 768), 'image/avif', 1_024, 768],
	] as const)('accepts %s dimensions', (_label, data, mime, width, height) => {
		expect(validateRasterImage(data, mime)).toEqual({ height, ok: true, width });
	});

	it.each([
		['GIF header', new TextEncoder().encode('GIF00a0000').buffer, 'image/gif'],
		['JPEG frame', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer, 'image/jpeg'],
		['WebP header', new Uint8Array(30).buffer, 'image/webp'],
		['AVIF brand', new Uint8Array(40).buffer, 'image/avif'],
	] as const)('rejects an invalid %s', (_label, data, mime) => {
		expect(validateRasterImage(data, mime)).toEqual({ ok: false });
	});

	it('rejects malformed WebP chunks and AVIF without dimensions', () => {
		const truncatedWebp = new Uint8Array(webp('VP8X', 2, 2));
		new DataView(truncatedWebp.buffer).setUint32(16, 100, true);
		expect(validateRasterImage(truncatedWebp.buffer, 'image/webp')).toEqual({
			ok: false,
		});

		const noDimensions = new Uint8Array(avif(2, 2));
		noDimensions.fill(0, 20);
		expect(validateRasterImage(noDimensions.buffer, 'image/avif')).toEqual({
			ok: false,
		});
	});
});
