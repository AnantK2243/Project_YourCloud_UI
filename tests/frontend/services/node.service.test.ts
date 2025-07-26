// tests/frontend/services/node.service.test.ts

// Mock Angular dependencies
jest.mock('@angular/core', () => ({
	Injectable: () => (target: any) => target
}));

// Mock Angular HTTP module
jest.mock('@angular/common/http', () => ({
	HttpClient: jest.fn().mockImplementation(() => mockHttpClient),
	HttpHeaders: jest.fn().mockImplementation(headers => headers)
}));

// Mock the AuthService module to avoid importing Angular dependencies
jest.mock('../../../src/app/auth.service', () => ({
	AuthService: jest.fn().mockImplementation(() => mockAuthService)
}));

// Mock the AuthService
const mockAuthService = {
	getApiUrl: jest.fn(() => 'https://example.com/api'),
	getAuthHeaders: jest.fn(() => ({
		Authorization: 'Bearer test-token',
		'Content-Type': 'application/json'
	}))
};

// Mock HttpClient
const mockHttpClient = {
	get: jest.fn(),
	post: jest.fn(),
	delete: jest.fn()
};

// Mock firstValueFrom
jest.mock('rxjs', () => ({
	firstValueFrom: jest.fn(observable => Promise.resolve(observable)),
	BehaviorSubject: jest.fn().mockImplementation(initialValue => ({
		value: initialValue,
		next: jest.fn(),
		asObservable: jest.fn(() => ({
			subscribe: jest.fn()
		})),
		getValue: jest.fn(() => initialValue)
	})),
	Observable: jest.fn()
}));

const { firstValueFrom } = require('rxjs');

import { NodeService } from '../../../src/app/node.service';

describe('NodeService', () => {
	let service: NodeService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new NodeService(mockHttpClient as any, mockAuthService as any);
	});

	describe('Service Initialization', () => {
		test('should create service instance', () => {
			expect(service).toBeDefined();
		});

		test('should initialize with empty node ID', () => {
			expect(service.nodeId).toBe('');
		});
	});

	describe('Node Registration', () => {
		test('should register node successfully', async () => {
			const mockResponse = {
				success: true,
				data: {
					nodeName: 'test-node',
					nodeId: 'node-123',
					authToken: 'auth-token-456'
				}
			};

			(firstValueFrom as jest.Mock).mockResolvedValue(mockResponse);

			const result = await service.registerNode('test-node');

			expect(mockHttpClient.post).toHaveBeenCalledWith(
				'https://example.com/api/nodes',
				{ node_name: 'test-node' },
				{
					headers: {
						Authorization: 'Bearer test-token',
						'Content-Type': 'application/json'
					}
				}
			);

			expect(result).toEqual({
				success: true,
				registration_result: {
					node_name: 'test-node',
					node_id: 'node-123',
					auth_token: 'auth-token-456'
				}
			});
		});

		test('should handle registration failure', async () => {
			const mockResponse = {
				success: false,
				error: 'Node name already exists'
			};

			(firstValueFrom as jest.Mock).mockResolvedValue(mockResponse);

			const result = await service.registerNode('existing-node');

			expect(result).toEqual({
				success: false,
				message: 'Node name already exists'
			});
		});

		test('should handle registration network error', async () => {
			(firstValueFrom as jest.Mock).mockRejectedValue(new Error('Network error'));

			const result = await service.registerNode('test-node');

			expect(result).toEqual({
				success: false,
				message: 'Network error'
			});
		});

		test('should handle registration error without message', async () => {
			(firstValueFrom as jest.Mock).mockRejectedValue({});

			const result = await service.registerNode('test-node');

			expect(result).toEqual({
				success: false,
				message: 'Node registration failed'
			});
		});
	});

	describe('Load User Storage Nodes', () => {
		test('should load storage nodes successfully', async () => {
			const mockResponse = {
				success: true,
				data: [
					{
						node_name: 'node1',
						node_id: 'id1',
						status: 'online',
						total_available_space: 1000000,
						used_space: 500000,
						num_chunks: 10,
						last_seen: '2024-01-15T10:30:00Z'
					},
					{
						node_name: 'node2',
						node_id: 'id2',
						status: 'offline',
						total_available_space: 2000000,
						used_space: 1000000,
						num_chunks: 20,
						last_seen: '2024-01-14T15:20:00Z'
					}
				]
			};

			(firstValueFrom as jest.Mock).mockResolvedValue(mockResponse);

			const result = await service.loadUserStorageNodes();

			expect(mockHttpClient.get).toHaveBeenCalledWith('https://example.com/api/nodes', {
				headers: {
					Authorization: 'Bearer test-token',
					'Content-Type': 'application/json'
				}
			});

			expect(result).toEqual({ success: true });
		});

		test('should handle load failure', async () => {
			const mockResponse = {
				success: false,
				error: 'Failed to fetch nodes'
			};

			(firstValueFrom as jest.Mock).mockResolvedValue(mockResponse);

			const result = await service.loadUserStorageNodes();

			expect(result).toEqual({
				success: false,
				message: 'Failed to fetch nodes'
			});
		});

		test('should handle load network error', async () => {
			(firstValueFrom as jest.Mock).mockRejectedValue(new Error('Network timeout'));

			const result = await service.loadUserStorageNodes();

			expect(result).toEqual({
				success: false,
				message: 'Network timeout'
			});
		});
	});

	describe('Update Node Status', () => {
		test('should update node status successfully', async () => {
			const mockResponse = {
				success: true,
				data: {
					status: 'online',
					last_seen: '2024-01-15T10:30:00Z'
				}
			};

			(firstValueFrom as jest.Mock).mockResolvedValue(mockResponse);

			const result = await service.updateNodeStatus('node-123');

			expect(mockHttpClient.get).toHaveBeenCalledWith(
				'https://example.com/api/nodes/node-123/status',
				{
					headers: {
						Authorization: 'Bearer test-token',
						'Content-Type': 'application/json'
					}
				}
			);

			expect(result).toEqual({ success: true });
		});

		test('should handle status update failure', async () => {
			const mockResponse = {
				success: false,
				error: 'Node not found'
			};

			(firstValueFrom as jest.Mock).mockResolvedValue(mockResponse);

			const result = await service.updateNodeStatus('invalid-node');

			expect(result).toEqual({
				success: false,
				message: 'Node not found'
			});
		});
	});

	describe('Delete Storage Node', () => {
		test('should delete node successfully', async () => {
			const mockResponse = {
				success: true
			};

			(firstValueFrom as jest.Mock).mockResolvedValue(mockResponse);

			const result = await service.deleteStorageNode('node-123');

			expect(mockHttpClient.delete).toHaveBeenCalledWith(
				'https://example.com/api/nodes/node-123',
				{
					headers: {
						Authorization: 'Bearer test-token',
						'Content-Type': 'application/json'
					}
				}
			);

			expect(result).toEqual({ success: true });
		});

		test('should handle delete failure', async () => {
			const mockResponse = {
				success: false,
				error: 'Cannot delete node with active storage'
			};

			(firstValueFrom as jest.Mock).mockResolvedValue(mockResponse);

			const result = await service.deleteStorageNode('node-123');

			expect(result).toEqual({
				success: false,
				message: 'Cannot delete node with active storage'
			});
		});

		test('should handle delete network error', async () => {
			(firstValueFrom as jest.Mock).mockRejectedValue(new Error('Delete failed'));

			const result = await service.deleteStorageNode('node-123');

			expect(result).toEqual({
				success: false,
				message: 'Delete failed'
			});
		});
	});
});
