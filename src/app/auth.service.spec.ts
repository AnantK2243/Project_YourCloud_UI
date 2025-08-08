import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { SessionStorageService } from './session-storage.service';
import { CryptoService } from './crypto.service';
import { vi, afterEach, describe, it, expect, beforeEach } from 'vitest';

describe('AuthService', () => {
	let service: AuthService;
	let httpMock: HttpTestingController;
	let crypto: CryptoService;
	let session: SessionStorageService;

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
						cryptoSvc: CryptoService,
						sessionSvc: SessionStorageService
					) => new AuthService(http, platformId, cryptoSvc, sessionSvc),
					deps: [HttpClient, PLATFORM_ID, CryptoService, SessionStorageService]
				}
			]
		});

		service = TestBed.inject(AuthService);
		httpMock = TestBed.inject(HttpTestingController);
		crypto = TestBed.inject(CryptoService);
		session = TestBed.inject(SessionStorageService);
		localStorage.clear();
	});

	afterEach(() => {
		httpMock.verify();
		vi.restoreAllMocks();
		localStorage.clear();
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('getApiUrl returns a string', () => {
		const url = service.getApiUrl();
		expect(typeof url).toBe('string');
		expect(url.length).toBeGreaterThan(0);
	});

	describe('headers and tokens', () => {
		it('produces auth headers with token when set', () => {
			service.setToken('abc');
			const headers = service.getAuthHeaders();
			expect(headers.get('Authorization')).toBe('Bearer abc');
		});

		it('produces headers without Authorization when no token', () => {
			localStorage.removeItem('token');
			const headers = service.getAuthHeaders();
			expect(headers.get('Authorization')).toBeNull();
		});

		it('isLoggedIn reflects token presence', () => {
			localStorage.removeItem('token');
			expect(service.isLoggedIn()).toBe(false);
			service.setToken('t');
			expect(service.isLoggedIn()).toBe(true);
		});

		it('getToken/setToken round-trip', () => {
			service.setToken('xyz');
			expect(service.getToken()).toBe('xyz');
		});
	});

	describe('login/logout flow', () => {
		it('login stores token, userName and initializes crypto/session storage', async () => {
			const genKeySpy = vi
				.spyOn(crypto, 'generateMasterKey')
				.mockResolvedValue(undefined as any);
			const storeCredsSpy = vi
				.spyOn(session, 'storeCredentials')
				.mockResolvedValue(undefined as any);

			const resp = {
				success: true,
				token: 'tok-123',
				user: { name: 'Alice', salt: btoa('salt-bytes') }
			};

			let completed = false;
			service
				.login({ email: 'a@b.com', password: 'Passw0rd!' })
				.subscribe(() => (completed = true));

			const req = httpMock.expectOne(req => req.url.endsWith('/api/login'));
			expect(req.request.method).toBe('POST');
			req.flush(resp);

			await Promise.resolve();
			await Promise.resolve();

			expect(completed).toBe(true);
			expect(localStorage.getItem('token')).toBe('tok-123');
			expect(localStorage.getItem('userName')).toBe('Alice');
			expect(genKeySpy).toHaveBeenCalledTimes(1);
			expect(storeCredsSpy).toHaveBeenCalledTimes(1);
		});

		it('logout clears storage and calls cleanup', () => {
			const clearKeysSpy = vi.spyOn(crypto, 'clearKeys').mockImplementation(() => {});
			const clearCredsSpy = vi
				.spyOn(session, 'clearCredentials')
				.mockImplementation(() => {});
			const cleanupSpy = vi.spyOn(session, 'cleanup').mockResolvedValue(undefined as any);

			localStorage.setItem('token', 't');
			localStorage.setItem('userName', 'U');

			service.logout();

			expect(localStorage.getItem('token')).toBeNull();
			expect(localStorage.getItem('userName')).toBeNull();
			expect(clearKeysSpy).toHaveBeenCalled();
			expect(clearCredsSpy).toHaveBeenCalled();
			expect(cleanupSpy).toHaveBeenCalled();
		});

		it('getUserName returns value after login, otherwise null', async () => {
			expect(service.getUserName()).toBeNull();
			localStorage.setItem('token', 't');
			localStorage.setItem('userName', 'Bob');
			expect(service.getUserName()).toBe('Bob');
		});

		it('getUserPassword returns null when not logged in, returns cached after login', async () => {
			const p1 = await service.getUserPassword();
			expect(p1).toBeNull();

			(service as any)['userPassword'] = 'Secret1!';
			localStorage.setItem('token', 'tok');
			const p2 = await service.getUserPassword();
			expect(p2).toBe('Secret1!');
		});
	});
});
