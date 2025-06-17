import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = this.getApiUrl();

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  private getApiUrl(): string {
    // In production/container, API is served from the same origin
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return `${window.location.origin}/api`;
    }
    // Development fallback
    return 'http://127.0.0.1:3000/api';
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  register(userData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, userData);
  }

  login(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, credentials);
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
    if (!this.isBrowser()) {
      return;
    }
    localStorage.removeItem('token');
  }

  getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    if (!token) {
      // Return headers without authorization when no token is available (SSR)
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
    // Skip API call during SSR when no token is available
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
}
