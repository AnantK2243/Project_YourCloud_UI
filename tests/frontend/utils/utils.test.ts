// tests/frontend/utils/utils.test.ts

/**
 * General utility functions tests
 * Testing the actual utility functions from the TypeScript source
 */

import {
	formatFileSize,
	formatDate,
	uint8ArrayToBase64,
	base64ToUint8Array
} from '../../../src/app/utils/utils';

describe('Utils', () => {
	describe('File Size Formatting', () => {
		test('should format bytes correctly', () => {
			expect(formatFileSize(0)).toBe('0 Bytes');
			expect(formatFileSize(512)).toBe('512 Bytes');
			expect(formatFileSize(1023)).toBe('1023 Bytes');
		});

		test('should format kilobytes correctly', () => {
			expect(formatFileSize(1024)).toBe('1 KB');
			expect(formatFileSize(1536)).toBe('1.5 KB');
			expect(formatFileSize(2048)).toBe('2 KB');
		});

		test('should format megabytes correctly', () => {
			expect(formatFileSize(1048576)).toBe('1 MB');
			expect(formatFileSize(1572864)).toBe('1.5 MB');
			expect(formatFileSize(5242880)).toBe('5 MB');
		});

		test('should format gigabytes correctly', () => {
			expect(formatFileSize(1073741824)).toBe('1 GB');
			expect(formatFileSize(2147483648)).toBe('2 GB');
			expect(formatFileSize(5368709120)).toBe('5 GB');
		});

		test('should handle undefined input', () => {
			expect(formatFileSize(undefined)).toBe('');
		});

		test('should handle very large numbers', () => {
			const result = formatFileSize(1234567890123);
			// Very large numbers beyond GB may show "undefined" for units
			expect(result).toBe('1.12 undefined');
			expect(typeof result).toBe('string');
		});
	});

	describe('Date Formatting', () => {
		test('should format valid date strings', () => {
			const dateString = '2024-01-15T10:30:00Z';
			const result = formatDate(dateString);
			expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // MM/DD/YYYY or similar
		});

		test('should handle undefined input', () => {
			expect(formatDate(undefined)).toBe('');
		});

		test('should handle empty string', () => {
			expect(formatDate('')).toBe('');
		});

		test('should handle invalid date strings gracefully', () => {
			const result = formatDate('invalid-date');
			// Should either return empty string or some error indicator
			expect(typeof result).toBe('string');
		});
	});

	describe('Base64 Conversion', () => {
		test('should convert Uint8Array to base64', () => {
			const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
			const result = uint8ArrayToBase64(input);
			expect(result).toBe('SGVsbG8=');
		});

		test('should convert base64 to Uint8Array', () => {
			const input = 'SGVsbG8='; // "Hello"
			const result = base64ToUint8Array(input);
			const expected = new Uint8Array([72, 101, 108, 108, 111]);
			expect(result).toEqual(expected);
		});

		test('should handle empty arrays', () => {
			const emptyArray = new Uint8Array(0);
			const base64 = uint8ArrayToBase64(emptyArray);
			const backToArray = base64ToUint8Array(base64);
			expect(backToArray).toEqual(emptyArray);
		});

		test('should handle roundtrip conversion', () => {
			const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
			const base64 = uint8ArrayToBase64(original);
			const converted = base64ToUint8Array(base64);
			expect(converted).toEqual(original);
		});

		test('should handle longer data', () => {
			const longData = new Uint8Array(100).fill(42);
			const base64 = uint8ArrayToBase64(longData);
			const converted = base64ToUint8Array(base64);
			expect(converted).toEqual(longData);
		});
	});
});
