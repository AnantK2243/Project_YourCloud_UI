// src/app/auth.service.ts

import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { CryptoService } from './crypto.service';
import { SessionStorageService } from './session-storage.service';
import { base64ToUint8Array, uint8ArrayToBase64 } from './utils/utils';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = this.getApiUrl();
  private userPassword: string | null = null;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object,
    private cryptoService: CryptoService,
    private sessionStorage: SessionStorageService
  ) {
    this.restoreMasterKey();
  }

  getApiUrl(): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api`;
    }
    return 'https://127.0.0.1:4200/api';
  }

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

  // Auto-restore master key on page refresh
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

  register(userData: any): Observable<any> {
    // Generate salt for new user
    if (isPlatformBrowser(this.platformId)) {
      const salt = this.cryptoService.generateSalt();
      userData.salt = uint8ArrayToBase64(salt);
    }
    return this.http.post(`${this.apiUrl}/register`, userData);
  }

  login(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, credentials).pipe(
      tap(async (response: any) => {
        if (response.success && isPlatformBrowser(this.platformId)) {
          this.setToken(response.token);
          this.userPassword = credentials.password;
          
          if (response.user?.salt) {
            const salt = base64ToUint8Array(response.user.salt);
            await this.cryptoService.generateMasterKey(credentials.password, salt);
            await this.sessionStorage.storeCredentials(credentials.password, response.user.salt);
          }
        }
      })
    );
  }

  logout(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.removeItem('token');
    this.userPassword = null;
    this.cryptoService.clearKeys();
    this.sessionStorage.clearCredentials();
    this.sessionStorage.cleanup();
  }

  isLoggedIn(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }
    return !!localStorage.getItem('token');
  }

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

  getToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    return localStorage.getItem('token');
  }

  setToken(token: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    localStorage.setItem('token', token);
  }
}
