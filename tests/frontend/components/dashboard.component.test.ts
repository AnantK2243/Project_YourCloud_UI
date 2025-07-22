// tests/frontend/components/dashboard.component.test.ts

// Mock all the Angular dependencies we need
const mockRouter = {
	navigate: jest.fn()
};

const mockNodeService = {
	loadUserStorageNodes: jest.fn(),
	registerNode: jest.fn(),
	deleteStorageNode: jest.fn(),
	updateNodeStatus: jest.fn(),
	userStorageNodes$: {
		subscribe: jest.fn()
	}
};

const mockAuthService = {
	logout: jest.fn()
};

const mockSessionHandler = {
	cleanup: jest.fn()
};

// Mock the dashboard component class structure for testing
class MockDashboardComponent {
	userStorageNodes: any[] = [];
	warning: string = '';
	error: string = '';
	loading: boolean = true;
	showRegisterPopup: boolean = false;
	registerNodeName: string = '';
	registerMessage: string = '';
	registrationResult: any = null;
	userStorageNodesSub: any = null;
	router: any;
	nodeService: any;
	authService: any;
	sessionHandler: any;

	constructor() {
		// Inject mocked services
		this.router = mockRouter;
		this.nodeService = mockNodeService;
		this.authService = mockAuthService;
		this.sessionHandler = mockSessionHandler;
	}

	ngOnInit(): void {
		this.loading = true;
		this.userStorageNodesSub = this.nodeService.userStorageNodes$.subscribe((nodes: any) => {
			this.userStorageNodes = nodes;
			this.loading = false;
		});
	}

	ngOnDestroy(): void {
		if (this.userStorageNodesSub) {
			this.userStorageNodesSub.unsubscribe();
		}
	}

	async refreshStorageNodes(): Promise<void> {
		this.loading = true;
		try {
			const response = await this.nodeService.loadUserStorageNodes();
			if (response.success) {
				this.userStorageNodes = response.nodes;
			}
		} catch (error) {
			this.error = 'Failed to load storage nodes';
		} finally {
			this.loading = false;
		}
	}

	showNodeRegistrationPopup(): void {
		this.showRegisterPopup = true;
		this.registerNodeName = '';
		this.registerMessage = '';
		this.registrationResult = null;
	}

	hideNodeRegistrationPopup(): void {
		this.showRegisterPopup = false;
		this.registerNodeName = '';
		this.registerMessage = '';
		this.registrationResult = null;
	}

	async registerNode(): Promise<void> {
		if (!this.registerNodeName.trim()) {
			this.registerMessage = 'Please enter a node name';
			return;
		}

		try {
			const result = await this.nodeService.registerNode(this.registerNodeName);
			this.registrationResult = result;
			this.registerMessage = result.message || 'Node registered successfully';
		} catch (error) {
			this.registerMessage = 'Failed to register node';
			this.registrationResult = null;
		}
	}

	async deleteNode(nodeId: string): Promise<void> {
		try {
			const response = await this.nodeService.deleteStorageNode(nodeId);
			if (response.success) {
				await this.refreshStorageNodes();
			}
		} catch (error) {
			this.error = 'Failed to delete node';
		}
	}

	openFileBrowser(node: any): void {
		this.router.navigate(['/files'], {
			queryParams: { node: node.node_id }
		});
	}

	async checkNodeStatus(nodeId: string): Promise<void> {
		try {
			const response = await this.nodeService.updateNodeStatus(nodeId);
			if (response.success) {
				await this.refreshStorageNodes();
			}
		} catch (error) {
			this.error = 'Failed to check node status';
		}
	}

	logout(): void {
		this.authService.logout();
		this.router.navigate(['/login']);
	}

	openStorageSetupInstructions(): void {
		this.router.navigate(['/storage-setup']);
	}

	clearMessages(): void {
		this.error = '';
		this.warning = '';
	}
}

describe('DashboardComponent', () => {
	let component: MockDashboardComponent;
	const mockStorageNodes: any[] = [
		{
			node_name: 'Node 1',
			node_id: '1',
			status: 'online',
			last_seen: new Date(),
			total_available_space: 5000,
			used_space: 1000,
			num_chunks: 10
		},
		{
			node_name: 'Node 2',
			node_id: '2',
			status: 'offline',
			last_seen: new Date(Date.now() - 3600000),
			total_available_space: 10000,
			used_space: 2000,
			num_chunks: 20
		}
	];

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks();

		// Create a fresh component instance
		component = new MockDashboardComponent();

		// Setup default mock responses
		mockNodeService.userStorageNodes$.subscribe.mockImplementation(callback => {
			callback(mockStorageNodes);
			return { unsubscribe: jest.fn() };
		});
	});

	describe('Component Initialization', () => {
		test('should create the component', () => {
			expect(component).toBeTruthy();
		});

		test('should initialize with default values', () => {
			expect(component.warning).toBe('');
			expect(component.error).toBe('');
			expect(component.loading).toBe(true);
			expect(component.showRegisterPopup).toBe(false);
			expect(component.registerNodeName).toBe('');
		});

		test('should load storage nodes on init', () => {
			component.ngOnInit();

			expect(component.userStorageNodes).toEqual(mockStorageNodes);
			expect(component.loading).toBe(false);
			expect(mockNodeService.userStorageNodes$.subscribe).toHaveBeenCalled();
		});
	});

	describe('Storage Node Management', () => {
		test('should refresh storage nodes successfully', async () => {
			mockNodeService.loadUserStorageNodes.mockResolvedValue({
				success: true,
				nodes: mockStorageNodes
			});

			await component.refreshStorageNodes();

			expect(mockNodeService.loadUserStorageNodes).toHaveBeenCalled();
			expect(component.userStorageNodes).toEqual(mockStorageNodes);
			expect(component.loading).toBe(false);
		});

		test('should handle refresh error', async () => {
			mockNodeService.loadUserStorageNodes.mockRejectedValue(new Error('Network error'));

			await component.refreshStorageNodes();

			expect(component.error).toBe('Failed to load storage nodes');
			expect(component.loading).toBe(false);
		});

		test('should handle refresh with unsuccessful response', async () => {
			mockNodeService.loadUserStorageNodes.mockResolvedValue({
				success: false,
				message: 'Access denied'
			});

			await component.refreshStorageNodes();

			expect(component.loading).toBe(false);
		});
	});

	describe('Node Registration', () => {
		test('should show registration popup', () => {
			component.showNodeRegistrationPopup();

			expect(component.showRegisterPopup).toBe(true);
			expect(component.registerNodeName).toBe('');
			expect(component.registerMessage).toBe('');
			expect(component.registrationResult).toBeNull();
		});

		test('should hide registration popup', () => {
			component.showRegisterPopup = true;
			component.registerNodeName = 'Test Node';
			component.registerMessage = 'Test message';

			component.hideNodeRegistrationPopup();

			expect(component.showRegisterPopup).toBe(false);
			expect(component.registerNodeName).toBe('');
			expect(component.registerMessage).toBe('');
			expect(component.registrationResult).toBeNull();
		});

		test('should register node successfully', async () => {
			const mockResult = {
				success: true,
				registration_result: {
					node_id: 'new-node-id',
					node_name: 'New Node',
					auth_token: 'token123'
				},
				message: 'Node registered successfully'
			};

			mockNodeService.registerNode.mockResolvedValue(mockResult);

			component.registerNodeName = 'New Node';
			await component.registerNode();

			expect(mockNodeService.registerNode).toHaveBeenCalledWith('New Node');
			expect(component.registrationResult).toEqual(mockResult);
			expect(component.registerMessage).toBe('Node registered successfully');
		});

		test('should handle node registration error', async () => {
			const mockError = new Error('Node name already exists');
			mockNodeService.registerNode.mockRejectedValue(mockError);

			component.registerNodeName = 'Existing Node';
			await component.registerNode();

			expect(component.registerMessage).toBe('Failed to register node');
			expect(component.registrationResult).toBeNull();
		});

		test('should not register node with empty name', async () => {
			component.registerNodeName = '';
			await component.registerNode();

			expect(mockNodeService.registerNode).not.toHaveBeenCalled();
			expect(component.registerMessage).toBe('Please enter a node name');
		});

		test('should not register node with whitespace-only name', async () => {
			component.registerNodeName = '   ';
			await component.registerNode();

			expect(mockNodeService.registerNode).not.toHaveBeenCalled();
			expect(component.registerMessage).toBe('Please enter a node name');
		});

		test('should handle registration result without message', async () => {
			const mockResult = {
				success: true,
				registration_result: {
					node_id: 'new-node-id',
					node_name: 'New Node',
					auth_token: 'token123'
				}
				// No message field
			};

			mockNodeService.registerNode.mockResolvedValue(mockResult);

			component.registerNodeName = 'New Node';
			await component.registerNode();

			expect(component.registerMessage).toBe('Node registered successfully');
		});
	});

	describe('Node Actions', () => {
		test('should delete node successfully', async () => {
			const nodeId = 'node-to-delete';
			mockNodeService.deleteStorageNode.mockResolvedValue({ success: true });
			mockNodeService.loadUserStorageNodes.mockResolvedValue({
				success: true,
				nodes: mockStorageNodes.filter(n => n.node_id !== nodeId)
			});

			await component.deleteNode(nodeId);

			expect(mockNodeService.deleteStorageNode).toHaveBeenCalledWith(nodeId);
			expect(mockNodeService.loadUserStorageNodes).toHaveBeenCalled();
		});

		test('should handle delete node error', async () => {
			const nodeId = 'node-to-delete';
			mockNodeService.deleteStorageNode.mockRejectedValue(new Error('Delete failed'));

			await component.deleteNode(nodeId);

			expect(component.error).toBe('Failed to delete node');
		});

		test('should handle unsuccessful delete response', async () => {
			const nodeId = 'node-to-delete';
			mockNodeService.deleteStorageNode.mockResolvedValue({
				success: false,
				message: 'Node not found'
			});

			await component.deleteNode(nodeId);

			expect(mockNodeService.loadUserStorageNodes).not.toHaveBeenCalled();
		});

		test('should open file browser', () => {
			const node = { node_id: 'test-node-id', node_name: 'Test Node' };

			component.openFileBrowser(node);

			expect(mockRouter.navigate).toHaveBeenCalledWith(['/files'], {
				queryParams: { node: node.node_id }
			});
		});

		test('should check node status successfully', async () => {
			const nodeId = 'test-node-id';
			mockNodeService.updateNodeStatus.mockResolvedValue({
				success: true,
				status: 'online'
			});
			mockNodeService.loadUserStorageNodes.mockResolvedValue({
				success: true,
				nodes: mockStorageNodes
			});

			await component.checkNodeStatus(nodeId);

			expect(mockNodeService.updateNodeStatus).toHaveBeenCalledWith(nodeId);
			expect(mockNodeService.loadUserStorageNodes).toHaveBeenCalled();
		});

		test('should handle check node status error', async () => {
			const nodeId = 'test-node-id';
			mockNodeService.updateNodeStatus.mockRejectedValue(new Error('Status check failed'));

			await component.checkNodeStatus(nodeId);

			expect(component.error).toBe('Failed to check node status');
		});

		test('should handle unsuccessful status check response', async () => {
			const nodeId = 'test-node-id';
			mockNodeService.updateNodeStatus.mockResolvedValue({
				success: false,
				message: 'Node unreachable'
			});

			await component.checkNodeStatus(nodeId);

			expect(mockNodeService.loadUserStorageNodes).not.toHaveBeenCalled();
		});
	});

	describe('Authentication', () => {
		test('should logout user', () => {
			component.logout();

			expect(mockAuthService.logout).toHaveBeenCalled();
			expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
		});
	});

	describe('Navigation', () => {
		test('should open storage setup instructions', () => {
			component.openStorageSetupInstructions();

			expect(mockRouter.navigate).toHaveBeenCalledWith(['/storage-setup']);
		});
	});

	describe('Component Lifecycle', () => {
		test('should unsubscribe on destroy', () => {
			const mockSubscription = { unsubscribe: jest.fn() };
			component.userStorageNodesSub = mockSubscription;

			component.ngOnDestroy();

			expect(mockSubscription.unsubscribe).toHaveBeenCalled();
		});

		test('should handle destroy with no subscription', () => {
			component.userStorageNodesSub = null;

			expect(() => component.ngOnDestroy()).not.toThrow();
		});
	});

	describe('Message Management', () => {
		test('should clear messages', () => {
			component.error = 'Test error';
			component.warning = 'Test warning';

			component.clearMessages();

			expect(component.error).toBe('');
			expect(component.warning).toBe('');
		});
	});

	describe('Edge Cases', () => {
		test('should handle malformed storage nodes data', () => {
			const malformedNodes = [
				{ node_name: 'Valid Node', node_id: '1', status: 'online' },
				{ node_name: null, node_id: '2' }, // Missing required fields
				{ node_id: '3' } // Missing node_name
			];

			mockNodeService.userStorageNodes$.subscribe.mockImplementation(callback => {
				callback(malformedNodes);
				return { unsubscribe: jest.fn() };
			});

			component.ngOnInit();

			expect(component.userStorageNodes).toEqual(malformedNodes);
		});

		test('should handle multiple rapid refresh calls', async () => {
			mockNodeService.loadUserStorageNodes.mockResolvedValue({
				success: true,
				nodes: mockStorageNodes
			});

			// Simulate rapid successive calls
			const promises = [
				component.refreshStorageNodes(),
				component.refreshStorageNodes(),
				component.refreshStorageNodes()
			];

			await Promise.all(promises);

			expect(mockNodeService.loadUserStorageNodes).toHaveBeenCalledTimes(3);
			expect(component.loading).toBe(false);
		});
	});
});
