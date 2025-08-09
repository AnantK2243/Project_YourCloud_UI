// File: src/app/crypto.service.spec.ts - Tests CryptoService key derivation, encrypt/decrypt ops
import { TestBed } from '@angular/core/testing';
import { CryptoService } from './crypto.service';

// Note: These tests run in jsdom with WebCrypto available via setup

describe('CryptoService', () => {
	// Suite: validates primitives (salt, key, encrypt/decrypt, root chunk)
	let service: CryptoService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [CryptoService]
		});
		service = TestBed.inject(CryptoService);
	});

	it('generates salt', () => {
		const salt = service.generateSalt();
		expect(salt).toBeInstanceOf(Uint8Array);
		expect(salt.length).toBe(32);
	});

	it('derives master key, encrypts/decrypts and computes root chunk', async () => {
		const salt = service.generateSalt();
		const key = await service.generateMasterKey('password123', salt);
		expect(key).toBeTruthy();
		expect(service.hasMasterKey()).toBe(true);
		expect(service.getMasterKey()).toBeTruthy();

		const encoder = new TextEncoder();
		const data = encoder.encode('hello world').buffer;
		const { encryptedData, iv } = await service.encryptData(data);
		expect(encryptedData.byteLength).toBeGreaterThan(0);
		const decrypted = await service.decryptData(encryptedData, iv);
		expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(data));

		const rootChunk = await service.getRootChunk('password123');
		// rudimentary UUID v4 shape check
		expect(rootChunk).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);

		service.clearKeys();
		expect(service.hasMasterKey()).toBe(false);
		expect(service.getMasterKey()).toBeNull();
	});

	it('server platform uses fallback UUID and blocks crypto ops', () => {
		// Construct service with server platform id
		const serverService = new (CryptoService as any)('server');
		const uuid = serverService.generateUUID();
		expect(uuid.startsWith('server-uuid-')).toBe(true);

		expect(() => serverService.generateSalt()).toThrow(/not available on server/);
	});
});
