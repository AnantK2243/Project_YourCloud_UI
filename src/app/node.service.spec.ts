import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { NodeService } from './node.service';
import { AuthService } from './auth.service';

class AuthServiceStub {
	getApiUrl() {
		return 'https://api.test.com';
	}
	getAuthHeaders() {
		return {} as any;
	}
}

describe('NodeService', () => {
	let service: NodeService;
	let httpMock: HttpTestingController;
	const apiUrl = 'https://api.test.com';

	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [HttpClientTestingModule],
			providers: [
				HttpClient,
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

	describe('registerNode', () => {
		it('registers a new node successfully', async () => {
			const promise = service.registerNode('My Node');
			const req = httpMock.expectOne(`${apiUrl}/nodes`);
			expect(req.request.method).toBe('POST');
			req.flush({
				success: true,
				data: { nodeName: 'My Node', nodeId: 'node-123', authToken: 'tok-abc' }
			});
			await expect(promise).resolves.toEqual({
				success: true,
				registration_result: {
					node_name: 'My Node',
					node_id: 'node-123',
					auth_token: 'tok-abc'
				}
			});
		});

		it('rejects duplicate node name', async () => {
			// Seed existing node name
			(service as any)['userStorageNodes'].next([
				{
					node_name: 'Existing',
					node_id: 'id',
					status: 'offline',
					total_available_space: 0,
					used_space: 0,
					num_chunks: 0,
					last_seen: null
				}
			]);
			await expect(service.registerNode('Existing')).resolves.toEqual({
				success: false,
				message: 'Node Already Exists. Please Choose a Different Name.'
			});
		});

		it('handles server error', async () => {
			const promise = service.registerNode('ErrNode');
			const req = httpMock.expectOne(`${apiUrl}/nodes`);
			req.error(new ErrorEvent('net'), { status: 500, statusText: 'Server Error' });
			const result = await promise;
			expect(result.success).toBe(false);
			expect(result.message).toBeTruthy();
		});
	});

	describe('loadUserStorageNodes', () => {
		it('loads nodes and updates observable', async () => {
			const p = service.loadUserStorageNodes();
			const req = httpMock.expectOne(`${apiUrl}/nodes`);
			expect(req.request.method).toBe('GET');
			req.flush({
				success: true,
				data: [
					{
						node_name: 'Node A',
						node_id: 'a',
						status: 'offline',
						total_available_space: 1,
						used_space: 0,
						num_chunks: 0,
						last_seen: null
					}
				]
			});
			const res = await p;
			expect(res.success).toBe(true);
			const nodes = await firstValueFrom(service.userStorageNodes$);
			expect(nodes?.length).toBeGreaterThan(0);
		});

		it('handles error response and clears list', async () => {
			// Seed some nodes then fail
			(service as any)['userStorageNodes'].next([
				{
					node_name: 'Seed',
					node_id: 'seed',
					status: 'offline',
					total_available_space: 0,
					used_space: 0,
					num_chunks: 0,
					last_seen: null
				}
			]);
			const p = service.loadUserStorageNodes();
			const req = httpMock.expectOne(`${apiUrl}/nodes`);
			req.flush({ success: false, error: 'failure' }, { status: 400, statusText: 'Bad' });
			const res = await p;
			expect(res.success).toBe(false);
			expect((service as any)['userStorageNodes'].value).toEqual([]);
		});
	});

	describe('updateNodeStatus', () => {
		it('updates node details when backend returns status', async () => {
			// Seed node
			(service as any)['userStorageNodes'].next([
				{
					node_name: 'Node A',
					node_id: 'a',
					status: 'offline',
					total_available_space: 0,
					used_space: 0,
					num_chunks: 0,
					last_seen: null
				}
			]);

			const p = service.updateNodeStatus('a');
			const req = httpMock.expectOne(`${apiUrl}/nodes/a/status`);
			req.flush({
				success: true,
				data: {
					status: 'online',
					total_available_space: 100,
					used_space: 10,
					num_chunks: 2,
					last_seen: new Date().toISOString()
				}
			});
			const res = await p;
			expect(res.success).toBe(true);
			expect((service as any)['userStorageNodes'].value[0].status).toBe('online');
		});

		it('handles backend failure gracefully', async () => {
			(service as any)['userStorageNodes'].next([
				{
					node_name: 'Node B',
					node_id: 'b',
					status: 'offline',
					total_available_space: 0,
					used_space: 0,
					num_chunks: 0,
					last_seen: null
				}
			]);
			const p = service.updateNodeStatus('b');
			const req = httpMock.expectOne(`${apiUrl}/nodes/b/status`);
			req.flush({ success: false, error: 'oops' }, { status: 500, statusText: 'Err' });
			const res = await p;
			expect(res.success).toBe(false);
		});
	});

	describe('deleteStorageNode', () => {
		it('deletes node and updates list', async () => {
			(service as any)['userStorageNodes'].next([
				{
					node_name: 'Del',
					node_id: 'to-del',
					status: 'offline',
					total_available_space: 0,
					used_space: 0,
					num_chunks: 0,
					last_seen: null
				}
			]);
			const p = service.deleteStorageNode('to-del');
			const req = httpMock.expectOne(`${apiUrl}/nodes/to-del`);
			expect(req.request.method).toBe('DELETE');
			req.flush({ success: true });
			const res = await p;
			expect(res.success).toBe(true);
			expect(
				(service as any)['userStorageNodes'].value.find((n: any) => n.node_id === 'to-del')
			).toBeUndefined();
		});

		it('handles backend error', async () => {
			const p = service.deleteStorageNode('x');
			const req = httpMock.expectOne(`${apiUrl}/nodes/x`);
			req.error(new ErrorEvent('net'), { status: 500 });
			const res = await p;
			expect(res.success).toBe(false);
		});
	});
});
