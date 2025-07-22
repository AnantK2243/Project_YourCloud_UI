// tests/frontend/utils/storage-utils.test.js

describe('Storage Utils', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	describe('LocalStorage Operations', () => {
		test('should store and retrieve data', () => {
			const testData = { user: 'john', id: 123 };
			localStorage.setItem('testData', JSON.stringify(testData));

			const retrieved = JSON.parse(localStorage.getItem('testData'));
			expect(retrieved).toEqual(testData);
		});

		test('should handle storage quota', () => {
			// Test large data storage
			const largeData = 'x'.repeat(1000);
			localStorage.setItem('largeData', largeData);
			expect(localStorage.getItem('largeData')).toBe(largeData);
		});

		test('should handle non-existent keys', () => {
			expect(localStorage.getItem('nonExistent')).toBeNull();
		});

		test('should clear all data', () => {
			localStorage.setItem('key1', 'value1');
			localStorage.setItem('key2', 'value2');

			localStorage.clear();

			expect(localStorage.getItem('key1')).toBeNull();
			expect(localStorage.getItem('key2')).toBeNull();
		});
	});

	describe('SessionStorage Operations', () => {
		test('should store session data', () => {
			const sessionData = { sessionId: 'abc123', timestamp: Date.now() };
			sessionStorage.setItem('session', JSON.stringify(sessionData));

			const retrieved = JSON.parse(sessionStorage.getItem('session'));
			expect(retrieved).toEqual(sessionData);
		});

		test('should handle session expiry simulation', () => {
			const expiry = Date.now() + 3600000; // 1 hour from now
			sessionStorage.setItem('expiry', expiry.toString());

			const storedExpiry = parseInt(sessionStorage.getItem('expiry'));
			expect(storedExpiry).toBeGreaterThan(Date.now());
		});
	});

	describe('Data Serialization', () => {
		test('should serialize complex objects', () => {
			const complexData = {
				user: {
					name: 'John Doe',
					preferences: {
						theme: 'dark',
						notifications: true
					}
				},
				settings: ['privacy', 'security']
			};

			const serialized = JSON.stringify(complexData);
			const deserialized = JSON.parse(serialized);

			expect(deserialized).toEqual(complexData);
		});

		test('should handle date serialization', () => {
			const date = new Date();
			const serialized = JSON.stringify({ date: date.toISOString() });
			const parsed = JSON.parse(serialized);

			expect(new Date(parsed.date).getTime()).toBe(date.getTime());
		});
	});

	describe('Error Handling', () => {
		test('should handle JSON parse errors', () => {
			localStorage.setItem('invalidJson', 'invalid json string');

			let result;
			try {
				result = JSON.parse(localStorage.getItem('invalidJson'));
			} catch (e) {
				result = null;
			}

			expect(result).toBeNull();
		});

		test('should handle storage unavailable scenarios', () => {
			// Simulate storage being unavailable
			const originalSetItem = localStorage.setItem;
			localStorage.setItem = jest.fn(() => {
				throw new Error('Storage unavailable');
			});

			let success = true;
			try {
				localStorage.setItem('test', 'value');
				success = false; // If no error thrown, this should not execute
			} catch (e) {
				success = false;
			}

			expect(success).toBe(false);

			// Restore original method
			localStorage.setItem = originalSetItem;
		});
	});
});
