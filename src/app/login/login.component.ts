import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  email: string = '';
  password: string = '';
  errorMessage: string = '';
  successMessage: string = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  onLogin() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Please fill in all fields';
      return;
    }

    this.authService
      .login({ email: this.email, password: this.password })
      .subscribe({
        next: (response) => {
          if (response.success) {
            // Use auth service to store token (handles SSR properly)
            this.authService.setToken(response.token);
            this.successMessage = 'Login successful!';
            this.errorMessage = '';
            // Navigate to main app after successful login
            setTimeout(() => {
              this.router.navigate(['/dashboard']);
            }, 1000);
          } else {
            this.errorMessage = response.message || 'Login failed';
            this.successMessage = '';
          }
        },
        error: (error) => {
          this.errorMessage = error.error?.message || 'Login failed';
          this.successMessage = '';
        },
      });
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }
}
