// File: src/app/login/login.component.spec.ts - Tests LoginComponent form validation and submission flow
import { LoginComponent } from './login.component';
import { ValidationService } from '../validation.service';

class AuthServiceStub {
	login() {
		return { subscribe: ({ next }: any) => next?.({ success: true, token: 't' }) } as any;
	}
	setToken() {}
}
class RouterStub {
	public navigatedTo: any[] | null = null;
	navigate(commands: any[]) {
		this.navigatedTo = commands;
	}
}
class ActivatedRouteStub {
	queryParams = { subscribe: (_: any) => {} };
}

describe('LoginComponent (unit)', () => {
	// Suite: ensures form validation and login navigation
	it('creates component', () => {
		const comp = new LoginComponent(
			new AuthServiceStub() as any,
			new RouterStub() as any,
			new ActivatedRouteStub() as any,
			new ValidationService(),
			'browser' as any
		);
		expect(comp).toBeTruthy();
	});

	it('validates form and blocks submit when invalid', () => {
		const comp = new LoginComponent(
			new AuthServiceStub() as any,
			new RouterStub() as any,
			new ActivatedRouteStub() as any,
			new ValidationService(),
			'browser' as any
		);
		comp.email = 'bad-email';
		comp.password = '';
		comp.onLogin();
		expect(comp.errorMessage).toContain('Please fix');
		expect(comp.isSubmitting).toBe(false);
	});

	it('navigates to dashboard on successful login', () => {
		const router = new RouterStub();
		const comp = new LoginComponent(
			new AuthServiceStub() as any,
			router as any,
			new ActivatedRouteStub() as any,
			new ValidationService(),
			'browser' as any
		);
		comp.email = 'user@example.com';
		comp.password = 'Password123!';
		comp.onLogin();
		expect(router.navigatedTo).toEqual(['/dashboard']);
	});

	it('shows API error message when backend responds with error', () => {
		class FailingAuthStub extends AuthServiceStub {
			override login() {
				return {
					subscribe: ({ error }: any) =>
						error?.({ status: 401, error: { message: 'Invalid login' } })
				} as any;
			}
		}
		const comp = new LoginComponent(
			new FailingAuthStub() as any,
			new RouterStub() as any,
			new ActivatedRouteStub() as any,
			new ValidationService(),
			'browser' as any
		);
		comp.email = 'user@example.com';
		comp.password = 'bad';
		comp.onLogin();
		expect(comp.errorMessage).toBe('Invalid login');
	});
});
