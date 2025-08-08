import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { SessionStorageService } from './session-storage.service';
import { CryptoService } from './crypto.service';

describe('AuthService', () => {
	let service: AuthService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [HttpClientTestingModule],
			providers: [
				CryptoService,
				SessionStorageService,
				{ provide: PLATFORM_ID, useValue: 'browser' },
				{
					provide: AuthService,
					useFactory: (
						http: HttpClient,
						platformId: Object,
						crypto: CryptoService,
						session: SessionStorageService
					) => new AuthService(http, platformId, crypto, session),
					deps: [HttpClient, PLATFORM_ID, CryptoService, SessionStorageService]
				}
			]
		});

		service = TestBed.inject(AuthService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		httpMock.verify();
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('getApiUrl returns a string', () => {
		const url = service.getApiUrl();
		expect(typeof url).toBe('string');
		expect(url.length).toBeGreaterThan(0);
	});
});
