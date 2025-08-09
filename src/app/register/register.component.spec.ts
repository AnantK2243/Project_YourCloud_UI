// File: src/app/register/register.component.spec.ts - Tests RegisterComponent creation & basic wiring
import { RegisterComponent } from './register.component';
import { ValidationService } from '../validation.service';

class AuthServiceStub {
	register() {
		return { subscribe: () => {} } as any;
	}
}
class RouterStub {
	navigate() {
		/* noop */
	}
}

describe('RegisterComponent (unit)', () => {
	// Suite: minimal instantiation test (logic mostly in services)
	it('creates component', () => {
		const comp = new RegisterComponent(
			new AuthServiceStub() as any,
			new RouterStub() as any,
			new ValidationService()
		);
		expect(comp).toBeTruthy();
	});
});
