// File: src/app/auth.service.ts - Auth: register, login, token & master key handling.

import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { CryptoService } from './crypto.service';
import { SessionStorageService } from './session-storage.service';
import { base64ToUint8Array, uint8ArrayToBase64 } from './utils/utils';

@Injectable({
	providedIn: 'root'
})
/** Auth/session operations & key derivation. */
export class AuthService {
	private apiUrl = this.getApiUrl();
	private userPassword: string | null = null;
	private userName: string | null = null;

	constructor(
		private http: HttpClient,
		@Inject(PLATFORM_ID) private platformId: Object,
		private cryptoService: CryptoService,
		private sessionStorage: SessionStorageService
	) {
		this.restoreMasterKey();
		this.restoreUserName();
	}

	/** Get API base URL (browser origin aware, SSR fallback). */
	getApiUrl(): string {
		if (typeof window !== 'undefined') {
			return `${window.location.origin}/api`;
		}
		return 'https://127.0.0.1:4200/api';
	}

	/** Build Authorization + JSON headers using current token. */
	getAuthHeaders(): HttpHeaders {
		const token = this.getToken();
		const headersConfig: { [header: string]: string } = {
			'Content-Type': 'application/json'
		};
		if (token) {
			headersConfig['Authorization'] = `Bearer ${token}`;
		}
		return new HttpHeaders(headersConfig);
	}

	/** Restore cached user name post-refresh if logged in. */
	private restoreUserName(): void {
		if (!isPlatformBrowser(this.platformId) || !this.isLoggedIn()) return;
		this.userName = localStorage.getItem('userName');
	}

	/** Restore master key & password from session storage if active. */
	private async restoreMasterKey(): Promise<void> {
		if (!isPlatformBrowser(this.platformId) || !this.isLoggedIn()) return;

		try {
			// Check if session is still active before attempting restoration
			const sessionActive = await this.sessionStorage.isSessionActive();
			if (!sessionActive) {
				this.sessionStorage.clearCredentials();
				return;
			}

			const credentials = await this.sessionStorage.retrieveCredentials();
			if (credentials) {
				const salt = base64ToUint8Array(credentials.salt);

				this.userPassword = credentials.password;
				await this.cryptoService.generateMasterKey(credentials.password, salt);
			}
		} catch (error) {
			this.sessionStorage.clearCredentials();
			throw error;
		}
	}

	/** Register new user (salt generated client-side). */
	register(userData: any): Observable<any> {
		// Generate salt for new user
		if (isPlatformBrowser(this.platformId)) {
			const salt = this.cryptoService.generateSalt();
			userData.salt = uint8ArrayToBase64(salt);
		}
		return this.http.post(`${this.apiUrl}/register`, userData);
	}

	/** Authenticate and derive master key on success. */
	login(credentials: any): Observable<any> {
		return this.http.post(`${this.apiUrl}/login`, credentials).pipe(
			tap(async (response: any) => {
				if (response.success && response.data && isPlatformBrowser(this.platformId)) {
					this.setToken(response.data.token);
					this.userPassword = credentials.password;
					if (response.data.user?.name) {
						this.userName = response.data.user.name;
						localStorage.setItem('userName', response.data.user.name);
					}
					if (response.data.user?.salt) {
						const salt = base64ToUint8Array(response.data.user.salt);
						await this.cryptoService.generateMasterKey(credentials.password, salt);
						await this.sessionStorage.storeCredentials(
							credentials.password,
							response.data.user.salt
						);
					}
				}
			})
		);
	}

	/** Clear auth artifacts and cryptographic material. */
	logout(): void {
		if (!isPlatformBrowser(this.platformId)) return;
		localStorage.removeItem('token');
		localStorage.removeItem('userName');
		this.userPassword = null;
		this.userName = null;
		this.cryptoService.clearKeys();
		this.sessionStorage.clearCredentials();
		this.sessionStorage.cleanup();
	}

	/** True if browser localStorage contains a token. */
	isLoggedIn(): boolean {
		if (!isPlatformBrowser(this.platformId)) {
			return false;
		}
		return !!localStorage.getItem('token');
	}

	/** Cached or restored display name. */
	getUserName(): string | null {
		if (this.userName) {
			return this.userName;
		}

		if (isPlatformBrowser(this.platformId) && this.isLoggedIn()) {
			this.userName = localStorage.getItem('userName');
			return this.userName;
		}

		return null;
	}

	/** Retrieve (and lazily restore) plain password. */
	async getUserPassword(): Promise<string | null> {
		if (this.userPassword) {
			return this.userPassword;
		}

		if (isPlatformBrowser(this.platformId) && this.isLoggedIn()) {
			await this.restoreMasterKey();
			return this.userPassword;
		}

		return null;
	}

	/** Read token from localStorage. */
	getToken(): string | null {
		if (!isPlatformBrowser(this.platformId)) {
			return null;
		}
		return localStorage.getItem('token');
	}

	/** Persist JWT token to localStorage. */
	setToken(token: string): void {
		if (!isPlatformBrowser(this.platformId)) {
			return;
		}
		localStorage.setItem('token', token);
	}
}
