import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { CryptoService } from './crypto.service';
import { SessionStorageService } from './session-storage.service';

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

  private getApiUrl(): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api`;
    }
    return 'https://localhost:4200/api';
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // Auto-restore master key on page refresh
  private async restoreMasterKey(): Promise<void> {
    if (!this.isBrowser() || !this.isLoggedIn()) return;

    try {
      // Check if session is still active before attempting restoration
      const sessionActive = await this.sessionStorage.isSessionActive();
      if (!sessionActive) {
        this.sessionStorage.clearCredentials();
        return;
      }

      const credentials = await this.sessionStorage.retrieveCredentials();
      if (credentials) {
        const salt = this.cryptoService.base64ToUint8Array(credentials.salt);
        
        this.userPassword = credentials.password;
        await this.cryptoService.generateMasterKey(credentials.password, salt);
      }
    } catch (error) {
      console.warn('Failed to restore master key from session:', error);
      this.sessionStorage.clearCredentials();
    }
  }

  register(userData: any): Observable<any> {
    // Generate salt for new user
    if (this.isBrowser()) {
      const salt = this.cryptoService.generateSalt();
      userData.salt = this.cryptoService.uint8ArrayToBase64(salt);
    }
    return this.http.post(`${this.apiUrl}/register`, userData);
  }

  login(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, credentials).pipe(
      tap(async (response: any) => {
        if (response.success && this.isBrowser()) {
          this.setToken(response.token);
          this.userPassword = credentials.password;
          
          if (response.user?.salt) {
            const salt = this.cryptoService.base64ToUint8Array(response.user.salt);
            await this.cryptoService.generateMasterKey(credentials.password, salt);
            await this.sessionStorage.storeCredentials(credentials.password, response.user.salt);
          }
        }
      })
    );
  }

  isLoggedIn(): boolean {
    if (!this.isBrowser()) {
      return false;
    }
    return !!localStorage.getItem('token');
  }

  getToken(): string | null {
    if (!this.isBrowser()) {
      return null;
    }
    return localStorage.getItem('token');
  }

  setToken(token: string): void {
    if (!this.isBrowser()) {
      return;
    }
    localStorage.setItem('token', token);
  }

  logout(): void {
    if (!this.isBrowser()) return;
    localStorage.removeItem('token');
    this.userPassword = null;
    this.cryptoService.clearKeys();
    this.sessionStorage.clearCredentials();
    this.sessionStorage.cleanup();
  }

  getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    if (!token) {
      // Return headers without authorization when no token is available
      return new HttpHeaders({
        'Content-Type': 'application/json',
      });
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  registerNode(nodeData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register-node`, nodeData, {
      headers: this.getAuthHeaders(),
    });
  }

  getUserStorageNodes(): Observable<any> {
    // Skip API call when no token is available
    if (!this.isBrowser() || !this.getToken()) {
      return new Observable(observer => {
        observer.next({ success: false, message: 'Not authenticated or running on server' });
        observer.complete();
      });
    }
    
    return this.http.get(`${this.apiUrl}/user/storage-nodes`, {
      headers: this.getAuthHeaders(),
    });
  }

  async getUserPassword(): Promise<string | null> {
    if (this.userPassword) {
      return this.userPassword;
    }
    
    if (this.isBrowser() && this.isLoggedIn()) {
      await this.restoreMasterKey();
      return this.userPassword;
    }
    
    return null;
  }
}
