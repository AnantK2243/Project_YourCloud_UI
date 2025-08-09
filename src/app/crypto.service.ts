// File: src/app/crypto.service.ts - Browser crypto utils: key derivation, encrypt/decrypt, UUID.

import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
	providedIn: 'root'
})
/** Crypto helpers for key derivation and AES-GCM ops. */
export class CryptoService {
	private masterRecoveryKey: CryptoKey | null = null;
	private userSalt: Uint8Array | null = null;

	constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

	/** Derive master AES-GCM key from password + salt. */
	async generateMasterKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
		if (!isPlatformBrowser(this.platformId)) {
			throw new Error('Crypto operations not available on server');
		}

		const encoder = new TextEncoder();
		const passwordBuffer = encoder.encode(password);

		const baseKey = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, [
			'deriveKey'
		]);

		// Derive the master key using PBKDF2
		const masterKey = await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: salt,
				iterations: 100000,
				hash: 'SHA-256'
			},
			baseKey,
			{
				name: 'AES-GCM',
				length: 256
			},
			false,
			['encrypt', 'decrypt']
		);

		this.masterRecoveryKey = masterKey;
		this.userSalt = salt;
		return masterKey;
	}

	/** Generate cryptographically secure 32-byte salt. */
	generateSalt(): Uint8Array {
		if (!isPlatformBrowser(this.platformId)) {
			throw new Error('Crypto operations not available on server');
		}
		return crypto.getRandomValues(new Uint8Array(32));
	}

	/** Generate UUID (native in browser, simple fallback on server). */
	generateUUID(): string {
		if (!isPlatformBrowser(this.platformId)) {
			return 'server-uuid-' + Date.now();
		}
		return crypto.randomUUID();
	}

	/** Cache user salt. */
	setUserSalt(salt: Uint8Array): void {
		this.userSalt = salt;
	}

	/** Return derived master key. */
	getMasterKey(): CryptoKey | null {
		return this.masterRecoveryKey;
	}

	/** True if master key present. */
	hasMasterKey(): boolean {
		return this.masterRecoveryKey !== null;
	}

	/** Deterministically derive root directory chunk UUID. */
	async getRootChunk(password: string): Promise<string> {
		if (!isPlatformBrowser(this.platformId)) {
			throw new Error('Crypto operations not available on server');
		}

		if (!this.userSalt) {
			throw new Error('User salt not available - ensure master key is derived first');
		}

		const encoder = new TextEncoder();
		const passwordBuffer = encoder.encode(password);

		const saltBuffer = this.userSalt;

		const baseKey = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, [
			'deriveKey'
		]);

		// Derive a key for generating the root directory chunk ID
		const derivedKey = await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: saltBuffer,
				iterations: 10000, // Lower iterations for chunk ID derivation
				hash: 'SHA-256'
			},
			baseKey,
			{
				name: 'HMAC',
				hash: 'SHA-256'
			},
			true,
			['sign']
		);

		// Export the key and use it to generate a deterministic chunk ID
		const keyBuffer = await crypto.subtle.exportKey('raw', derivedKey);
		const hash = await crypto.subtle.digest('SHA-256', keyBuffer);

		const hashArray = new Uint8Array(hash);

		// Create UUID v4 format with proper version and variant bits
		const hex = Array.from(hashArray)
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');

		// Format as proper UUID v4
		const uuid = [
			hex.substring(0, 8),
			hex.substring(8, 12),
			'4' + hex.substring(12, 15), // Version 4: '4' + 3 chars = 4 chars total
			((parseInt(hex.substring(16, 17), 16) & 0x3) | 0x8).toString(16) +
				hex.substring(17, 20), // Variant bits
			hex.substring(20, 32)
		].join('-');

		return uuid;
	}

	/** Encrypt data with AES-GCM returning ciphertext + IV. */
	async encryptData(
		data: ArrayBuffer,
		iv?: Uint8Array
	): Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array }> {
		if (!isPlatformBrowser(this.platformId)) {
			throw new Error('Crypto operations not available on server');
		}

		if (!this.masterRecoveryKey) {
			throw new Error('Encryption key does not exist');
		}

		// Generate a random IV
		iv = iv || crypto.getRandomValues(new Uint8Array(12));

		// Encrypt the data
		const encryptedData = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv: iv
			},
			this.masterRecoveryKey,
			data
		);

		return { encryptedData, iv };
	}

	/** Decrypt AES-GCM ciphertext. */
	async decryptData(encryptedData: ArrayBuffer, iv: Uint8Array): Promise<ArrayBuffer> {
		if (!isPlatformBrowser(this.platformId)) {
			throw new Error('Crypto operations not available on server');
		}

		if (!this.masterRecoveryKey) {
			throw new Error('Decryption key does not exist');
		}

		const decryptedData = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: iv
			},
			this.masterRecoveryKey,
			encryptedData
		);

		return decryptedData;
	}

	/** Clear cryptographic material from memory. */
	clearKeys(): void {
		this.masterRecoveryKey = null;
		this.userSalt = null;
	}
}
