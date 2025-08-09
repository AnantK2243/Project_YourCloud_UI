// File: src/app/dashboard/dashboard.component.spec.ts - Tests DashboardComponent creation & service interactions
import { DashboardComponent } from './dashboard.component';

class NodeServiceStub {
	userStorageNodes$ = { subscribe: () => ({ unsubscribe() {} }) } as any;
	loadUserStorageNodes() {
		return Promise.resolve({ success: true });
	}
}
class AuthServiceStub {
	getUserName() {
		return 'User';
	}
	logout() {}
}
class RouterStub {
	navigate() {}
}
class SessionHandlerServiceStub {
	checkAndHandleSessionError() {
		return false;
	}
}

describe('DashboardComponent (unit)', () => {
	// Suite: instantiation only; heavy logic in NodeService / AuthService
	it('creates component', () => {
		const comp = new DashboardComponent(
			new NodeServiceStub() as any,
			new AuthServiceStub() as any,
			new RouterStub() as any,
			new SessionHandlerServiceStub() as any,
			'browser' as any
		);
		expect(comp).toBeTruthy();
	});
});
