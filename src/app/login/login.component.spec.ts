import { LoginComponent } from './login.component';
import { ValidationService } from '../validation.service';

class AuthServiceStub {
	login() {
		return { subscribe: () => {} } as any;
	}
	setToken() {}
}
class RouterStub {
	navigate() {
		/* noop */
	}
}
class ActivatedRouteStub {
	queryParams = { subscribe: (_: any) => {} };
}

describe('LoginComponent (unit)', () => {
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
});
