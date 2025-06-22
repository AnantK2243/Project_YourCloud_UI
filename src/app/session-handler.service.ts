import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SessionHandlerService {

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  // Check if an error indicates session expiration or authentication failure
  isSessionError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = (error.message || '').toLowerCase();
    const errorStatus = error.status;
    
    // Check for common session expiration indicators
    return (
      errorMessage.includes('password') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('session') ||
      errorMessage.includes('not authenticated') ||
      errorMessage.includes('token') ||
      errorStatus === 401 ||
      errorStatus === 403
    );
  }

  // Handle session expiration by clearing auth data and redirecting to login
  handleSessionExpired(customMessage?: string): void {
    // Clear any stored authentication data
    this.authService.logout();
    
    // Navigate to login with a message
    const message = customMessage || 'Your session has expired. Please log in again.';
    this.router.navigate(['/login'], {
      queryParams: { message }
    });
  }

  // Convenience method to check error and handle session expiration in one call
  checkAndHandleSessionError(error: any, customMessage?: string): boolean {
    if (this.isSessionError(error)) {
      this.handleSessionExpired(customMessage);
      return true;
    }
    return false;
  }
}
