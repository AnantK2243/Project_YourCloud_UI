import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpHandler } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NodeService } from './node.service';
import { AuthService } from './auth.service';

class AuthServiceStub {
	getApiUrl() {
		return 'https://127.0.0.1:4200/api';
	}
	getAuthHeaders() {
		return {} as any;
	}
}

describe('NodeService', () => {
	let service: NodeService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [HttpClientTestingModule],
			providers: [
				HttpClient,
				HttpHandler,
				{ provide: AuthService, useClass: AuthServiceStub },
				{
					provide: NodeService,
					useFactory: (http: HttpClient, auth: AuthService) =>
						new NodeService(http, auth),
					deps: [HttpClient, AuthService]
				}
			]
		});

		service = TestBed.inject(NodeService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		httpMock.verify();
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
