import { TestBed } from '@angular/core/testing';
import { CryptoService } from './crypto.service';

// Note: These tests run in jsdom with WebCrypto available via setup

describe('CryptoService', () => {
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
});
