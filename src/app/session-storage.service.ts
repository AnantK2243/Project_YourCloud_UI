// File: src/app/session-storage.service.ts - Encrypted in-session credential cache with timeout.

import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface SessionData {
	timestamp: number;
	encryptedPassword: string;
	salt: string;
	sessionId: string;
}

@Injectable({
	providedIn: 'root'
})
/** Session credential encryption & retrieval. */
export class SessionStorageService {
	private readonly SESSION_DATA_KEY = 'user_session_data';
	private readonly SESSION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours
	private sessionKey: CryptoKey | null = null;
	private currentSessionId: string | null = null;

	constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

	private isBrowser(): boolean {
		return isPlatformBrowser(this.platformId);
	}

	private async ensureSession(): Promise<void> {
		if (this.sessionKey && this.currentSessionId) return;

		if (!this.isBrowser()) return;

		const existingData = this.getSessionData();
		if (existingData && this.isSessionValid(existingData)) {
			this.currentSessionId = existingData.sessionId;
			this.sessionKey = await this.deriveSessionKey(existingData.sessionId);
		} else {
			this.currentSessionId = crypto.randomUUID();
			this.sessionKey = await this.deriveSessionKey(this.currentSessionId);
		}
	}

	private getSessionData(): SessionData | null {
		if (!this.isBrowser()) return null;

		try {
			const data = sessionStorage.getItem(this.SESSION_DATA_KEY);
			return data ? JSON.parse(data) : null;
		} catch {
			return null;
		}
	}

	private setSessionData(data: SessionData): void {
		if (!this.isBrowser()) return;
		sessionStorage.setItem(this.SESSION_DATA_KEY, JSON.stringify(data));
	}

	private isSessionValid(data: SessionData): boolean {
		const sessionAge = Date.now() - data.timestamp;
		return (
			sessionAge <= this.SESSION_TIMEOUT &&
			!!data.sessionId &&
			!!data.encryptedPassword &&
			!!data.salt
		);
	}

	/** Store encrypted credentials for active session. */
	async storeCredentials(password: string, salt: string): Promise<void> {
		if (!this.isBrowser()) return;

		await this.ensureSession();

		const encryptedPassword = await this.encryptData(password);
		const sessionData: SessionData = {
			timestamp: Date.now(),
			encryptedPassword,
			salt,
			sessionId: this.currentSessionId!
		};

		this.setSessionData(sessionData);
	}

	/** Retrieve decrypted credentials if session valid; null otherwise. */
	async retrieveCredentials(): Promise<{
		password: string;
		salt: string;
	} | null> {
		if (!this.isBrowser()) return null;

		await this.ensureSession();

		const sessionData = this.getSessionData();
		if (!sessionData || !this.isSessionValid(sessionData)) {
			this.clearCredentials();
			return null;
		}

		// Update session key if session ID changed
		if (sessionData.sessionId !== this.currentSessionId) {
			this.currentSessionId = sessionData.sessionId;
			this.sessionKey = await this.deriveSessionKey(sessionData.sessionId);
		}

		try {
			const password = await this.decryptData(sessionData.encryptedPassword);
			return { password, salt: sessionData.salt };
		} catch (error) {
			this.clearCredentials();
			return null;
		}
	}

	/** Remove stored credentials and reset state. */
	clearCredentials(): void {
		if (!this.isBrowser()) return;
		sessionStorage.removeItem(this.SESSION_DATA_KEY);
		this.sessionKey = null;
		this.currentSessionId = null;
	}

	/** True if session still active. */
	async isSessionActive(): Promise<boolean> {
		if (!this.isBrowser()) return false;

		await this.ensureSession();

		const data = this.getSessionData();
		return data ? this.isSessionValid(data) : false;
	}

	/** Internal encryption helper (AES-GCM). */
	private async encryptData(data: string): Promise<string> {
		if (!this.sessionKey) throw new Error('No session key available');

		const dataBuffer = new TextEncoder().encode(data);
		const iv = crypto.getRandomValues(new Uint8Array(12));

		const encryptedData = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			this.sessionKey,
			dataBuffer
		);

		const combined = new Uint8Array(iv.length + encryptedData.byteLength);
		combined.set(iv);
		combined.set(new Uint8Array(encryptedData), iv.length);

		return btoa(String.fromCharCode(...combined));
	}

	/** Internal decryption helper (AES-GCM). */
	private async decryptData(encryptedData: string): Promise<string> {
		if (!this.sessionKey) throw new Error('No session key available');

		const combined = new Uint8Array([...atob(encryptedData)].map(char => char.charCodeAt(0)));
		const iv = combined.slice(0, 12);
		const data = combined.slice(12);

		const decryptedData = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv },
			this.sessionKey,
			data
		);

		return new TextDecoder().decode(decryptedData);
	}

	private async deriveSessionKey(sessionId: string): Promise<CryptoKey> {
		const keyMaterial = `${sessionId}-${navigator.userAgent}-${window.location.origin}`;
		const saltData = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionId));
		const salt = new Uint8Array(saltData).slice(0, 16);

		const baseKey = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(keyMaterial),
			'PBKDF2',
			false,
			['deriveKey']
		);

		return await crypto.subtle.deriveKey(
			{ name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' },
			baseKey,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);
	}

	/** Free ephemeral key material. */
	async cleanup(): Promise<void> {
		this.sessionKey = null;
		this.currentSessionId = null;
	}
}
