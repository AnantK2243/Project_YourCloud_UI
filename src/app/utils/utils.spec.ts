// File: src/app/utils/utils.spec.ts - Tests general formatting and base64 helpers
import { formatFileSize, formatDate, uint8ArrayToBase64, base64ToUint8Array } from './utils';

describe('utils', () => {
	// Suite: file size/date + base64 conversions
	it('formats file sizes', () => {
		expect(formatFileSize(undefined)).toBe('');
		expect(formatFileSize(0)).toBe('0 Bytes');
		expect(formatFileSize(1024)).toMatch(/KB/);
	});

	it('formats dates', () => {
		expect(formatDate(undefined)).toBe('');
		const d = new Date('2020-01-01T00:00:00Z').toISOString();
		expect(formatDate(d)).toBeTruthy();
	});

	it('converts between base64 and Uint8Array', () => {
		const original = new Uint8Array([104, 105]); // 'hi'
		const b64 = uint8ArrayToBase64(original);
		const roundtrip = base64ToUint8Array(b64);
		expect(Array.from(roundtrip)).toEqual(Array.from(original));
	});
});
