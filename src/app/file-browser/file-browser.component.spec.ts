import { FileBrowserComponent } from './file-browser.component';

class ActivatedRouteStub {
	params = {
		subscribe: (fn: any) => {
			fn({ nodeId: '1', nodeName: 'N' });
			return { unsubscribe() {} };
		}
	};
	queryParams = { subscribe: (_: any) => {} };
}
class RouterStub {
	navigate() {}
}
class FileServiceStub {
	directory = { subscribe: (_: any) => ({ unsubscribe() {} }) } as any;
	getDirectoryContents() {
		return Promise.resolve([]);
	}
	getUploadProgress() {
		return { subscribe: (_: any) => ({ unsubscribe() {} }) } as any;
	}
	getDownloadProgress() {
		return { subscribe: (_: any) => ({ unsubscribe() {} }) } as any;
	}
}
class AuthServiceStub {}
class SessionHandlerServiceStub {
	checkAndHandleSessionError() {
		return false;
	}
}

describe('FileBrowserComponent (unit)', () => {
	it('creates component', () => {
		const comp = new FileBrowserComponent(
			new ActivatedRouteStub() as any,
			new RouterStub() as any,
			new FileServiceStub() as any,
			new AuthServiceStub() as any,
			new SessionHandlerServiceStub() as any
		);
		expect(comp).toBeTruthy();
	});
});
