import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {
  private masterRecoveryKey: CryptoKey | null = null;
  private userSalt: Uint8Array | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  async generateMasterKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    if (!this.isBrowser()) {
      throw new Error('Crypto operations not available on server');
    }

    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );

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

  generateSalt(): Uint8Array {
    if (!this.isBrowser()) {
      throw new Error('Crypto operations not available on server');
    }
    return crypto.getRandomValues(new Uint8Array(32));
  }

  generateUUID(): string {
    if (!this.isBrowser()) {
      return 'server-uuid-' + Date.now();
    }
    return crypto.randomUUID();
  }

  setUserSalt(salt: Uint8Array): void {
    this.userSalt = salt;
  }

  getMasterKey(): CryptoKey | null {
    return this.masterRecoveryKey;
  }

  hasMasterKey(): boolean {
    return this.masterRecoveryKey !== null;
  }
  
  async getRootChunk(password: string): Promise<string> {
    if (!this.isBrowser()) {
      throw new Error('Crypto operations not available on server');
    }

    if (!this.userSalt) {
      throw new Error('User salt not available - ensure master key is derived first');
    }

    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    const saltBuffer = this.userSalt;

    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
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
    
    // Convert to hex string and take first 32 characters for chunk ID
    const hexString = Array.from(hashArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return hexString.substring(0, 32);
  }

  async encryptData(data: ArrayBuffer, iv?: Uint8Array): Promise<{ encryptedData: ArrayBuffer, iv: Uint8Array }> {
    if (!this.isBrowser()) {
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

  async decryptData(encryptedData: ArrayBuffer, iv: Uint8Array): Promise<ArrayBuffer> {
    if (!this.isBrowser()) {
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

  clearKeys(): void {
    this.masterRecoveryKey = null;
    this.userSalt = null;
  }

  uint8ArrayToBase64(array: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < array.byteLength; i++) {
      binary += String.fromCharCode(array[i]);
    }
    return btoa(binary);
  }

  base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
