// File: src/app/session-storage.service.spec.ts - Tests SessionStorageService credential storage/clear logic
import { TestBed } from '@angular/core/testing';
import { SessionStorageService } from './session-storage.service';

describe('SessionStorageService', () => {
	// Suite: verifies store/retrieve/clear credential flows
	let service: SessionStorageService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [SessionStorageService]
		});
		service = TestBed.inject(SessionStorageService);
		sessionStorage.clear();
	});

	it('stores and retrieves credentials', async () => {
		const password = 'Aa1!good';
		const salt = btoa(String.fromCharCode(...new Uint8Array(32)));

		await service.storeCredentials(password, salt);
		const creds = await service.retrieveCredentials();

		expect(creds?.password).toBe(password);
		expect(creds?.salt).toBe(salt);
	});

	it('clears credentials', async () => {
		await service.storeCredentials('x', 'y');
		service.clearCredentials();
		const creds = await service.retrieveCredentials();
		expect(creds).toBeNull();
	});
});
