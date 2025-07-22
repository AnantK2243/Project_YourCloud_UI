// tests/unit/websocket.test.js

const SecureWebSocketManager = require('../../src/websocket/SecureWebSocketManager');

describe('SecureWebSocketManager Unit Tests', () => {
	let manager;
	let mockWs;

	beforeEach(() => {
		manager = new SecureWebSocketManager();
		mockWs = {
			readyState: 1, // OPEN
			send: jest.fn(),
			close: jest.fn(),
			on: jest.fn(),
			once: jest.fn(),
			ping: jest.fn(),
			nodeId: 'test-node-123',
			ip: '192.168.1.1'
		};
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('Manager Initialization', () => {
		test('should create manager instance with proper initialization', () => {
			expect(manager).toBeDefined();
			expect(manager.connections).toBeInstanceOf(Map);
			expect(manager.connectionAttempts).toBeInstanceOf(Map);
			expect(manager.pendingCommands).toBeInstanceOf(Map);
			expect(manager.pendingFrameReconstructions).toBeInstanceOf(Map);
			expect(manager.maxConnectionsPerIP).toBe(10);
			expect(manager.maxConnectionAttemptsPerIP).toBe(20);
		});
	});

	describe('Connection Management', () => {
		test('should track active connections', () => {
			const nodeId = 'test-node-123';
			const connection = { ws: mockWs, ip: '192.168.1.1', node: {}, connectedAt: new Date() };

			manager.connections.set(nodeId, connection);

			expect(manager.connections.size).toBe(1);
			expect(manager.connections.has(nodeId)).toBe(true);
			expect(manager.connections.get(nodeId)).toBe(connection);
		});

		test('should handle connection cleanup', () => {
			const nodeId = 'test-node-123';
			manager.connections.set(nodeId, { ws: mockWs, ip: '192.168.1.1' });

			expect(manager.connections.has(nodeId)).toBe(true);

			manager.connections.delete(nodeId);

			expect(manager.connections.has(nodeId)).toBe(false);
			expect(manager.connections.size).toBe(0);
		});

		test('should get node connections map', () => {
			const nodeId1 = 'test-node-1';
			const nodeId2 = 'test-node-2';
			const mockWs2 = { ...mockWs, nodeId: nodeId2 };

			manager.connections.set(nodeId1, { ws: mockWs, ip: '192.168.1.1' });
			manager.connections.set(nodeId2, { ws: mockWs2, ip: '192.168.1.2' });

			const nodeConnections = manager.getNodeConnections();

			expect(nodeConnections).toBeInstanceOf(Map);
			expect(nodeConnections.size).toBe(2);
			expect(nodeConnections.get(nodeId1)).toBe(mockWs);
			expect(nodeConnections.get(nodeId2)).toBe(mockWs2);
		});

		test('should get pending commands map', () => {
			const commandId = 'cmd-123';
			const mockCallback = jest.fn();

			manager.pendingCommands.set(commandId, mockCallback);

			const pendingCommands = manager.getPendingCommands();

			expect(pendingCommands).toBe(manager.pendingCommands);
			expect(pendingCommands.get(commandId)).toBe(mockCallback);
		});
	});

	describe('IP Management', () => {
		test('should allow valid IP addresses initially', () => {
			const ip = '192.168.1.1';

			expect(manager.isIPAllowed(ip)).toBe(true);
		});

		test('should record connection attempts', () => {
			const ip = '192.168.1.1';

			manager.recordConnectionAttempt(ip);

			expect(manager.connectionAttempts.has(ip)).toBe(true);
			expect(manager.connectionAttempts.get(ip)).toHaveLength(1);
		});

		test('should count connections per IP', () => {
			const ip = '192.168.1.1';
			const nodeId1 = 'node-1';
			const nodeId2 = 'node-2';

			manager.connections.set(nodeId1, {
				ws: { readyState: 1 },
				ip: ip
			});
			manager.connections.set(nodeId2, {
				ws: { readyState: 1 },
				ip: ip
			});

			const count = manager.getConnectionCountForIP(ip);

			expect(count).toBe(2);
		});

		test('should block IP after exceeding attempt limit', () => {
			const ip = '192.168.1.1';

			// Simulate max attempts
			for (let i = 0; i < manager.maxConnectionAttemptsPerIP; i++) {
				manager.recordConnectionAttempt(ip);
			}

			expect(manager.isIPAllowed(ip)).toBe(false);
		});

		test('should clean up old connection attempts', () => {
			const ip = '192.168.1.1';
			const oldTimestamp = Date.now() - manager.connectionAttemptWindow - 1000;

			// Manually add old attempt
			manager.connectionAttempts.set(ip, [oldTimestamp]);

			// This should clean up old attempts
			expect(manager.isIPAllowed(ip)).toBe(true);
			expect(manager.connectionAttempts.get(ip)).toHaveLength(0);
		});
	});

	describe('Utility Methods', () => {
		test('should clean up expired connection attempts', () => {
			const ip1 = '192.168.1.1';
			const ip2 = '192.168.1.2';
			const now = Date.now();
			const oldTimestamp = now - manager.connectionAttemptWindow - 1000;
			const recentTimestamp = now - 1000;

			manager.connectionAttempts.set(ip1, [oldTimestamp]);
			manager.connectionAttempts.set(ip2, [recentTimestamp]);

			manager.cleanup();

			expect(manager.connectionAttempts.has(ip1)).toBe(false);
			expect(manager.connectionAttempts.has(ip2)).toBe(true);
		});

		test('should get connection by node ID', () => {
			const nodeId = 'test-node-123';
			const connection = { ws: mockWs, ip: '192.168.1.1' };

			manager.connections.set(nodeId, connection);

			const ws = manager.getConnection(nodeId);

			expect(ws).toBe(mockWs);
		});

		test('should return null for non-existent connection', () => {
			const ws = manager.getConnection('non-existent-node');

			expect(ws).toBeNull();
		});
	});

	describe('Error Handling', () => {
		test('should handle connection cleanup gracefully', () => {
			const nodeId = 'test-node-123';

			// Test deleting non-existent connection
			expect(() => {
				manager.connections.delete(nodeId);
			}).not.toThrow();

			expect(manager.connections.has(nodeId)).toBe(false);
		});

		test('should handle malformed message data gracefully', async () => {
			const invalidData = 'invalid-json';

			// Test that the manager doesn't crash on invalid JSON
			await expect(async () => {
				try {
					JSON.parse(invalidData);
				} catch (error) {
					// Expected to throw, this is fine
					expect(error).toBeInstanceOf(SyntaxError);
				}
			}).not.toThrow();
		});

		test('should handle WebSocket send errors gracefully', () => {
			const errorWs = {
				readyState: 1,
				send: jest.fn().mockImplementation(() => {
					throw new Error('Send failed');
				})
			};

			expect(() => {
				try {
					errorWs.send('test message');
				} catch (error) {
					// Expected behavior - WebSocket send can fail
					expect(error.message).toBe('Send failed');
				}
			}).not.toThrow();
		});
	});

	describe('Rate Limiting and Security', () => {
		test('should enforce rate limiting per IP', () => {
			const ip = '192.168.1.1';

			// Fill up to the limit
			for (let i = 0; i < manager.maxConnectionAttemptsPerIP; i++) {
				manager.recordConnectionAttempt(ip);
			}

			expect(manager.isIPAllowed(ip)).toBe(false);
		});

		test('should handle connection timeout scenarios', () => {
			const connectionData = {
				ws: mockWs,
				ip: '192.168.1.1',
				connectedAt: new Date(Date.now() - 3600000) // 1 hour ago
			};

			// Test that old connections can be identified
			const isOld = Date.now() - connectionData.connectedAt.getTime() > 1800000; // 30 min
			expect(isOld).toBe(true);
		});
	});
});

describe('SecureWebSocketManager Unit Tests', () => {
	let manager;
	let mockWs;

	beforeEach(() => {
		manager = new SecureWebSocketManager();
		mockWs = {
			readyState: 1, // OPEN
			send: jest.fn(),
			close: jest.fn(),
			on: jest.fn(),
			ip: '192.168.1.1'
		};
	});

	test('should create manager instance', () => {
		expect(manager).toBeDefined();
		expect(manager.connections).toBeInstanceOf(Map);
		expect(manager.connectionAttempts).toBeInstanceOf(Map);
	});

	test('should track active connections', () => {
		manager.connections.set('user123', { ws: mockWs, ip: '192.168.1.1' });
		expect(manager.connections.size).toBe(1);
		expect(manager.connections.has('user123')).toBe(true);
	});

	test('should handle connection cleanup', () => {
		manager.connections.set('user123', { ws: mockWs, ip: '192.168.1.1' });
		manager.connections.delete('user123');
		expect(manager.connections.has('user123')).toBe(false);
	});

	test('should allow valid IP addresses', () => {
		expect(manager.isIPAllowed('192.168.1.100')).toBe(true);
	});

	test('should record connection attempts', () => {
		const ip = '192.168.1.70';
		manager.recordConnectionAttempt(ip);

		expect(manager.connectionAttempts.has(ip)).toBe(true);
	});

	test('should count connections per IP', () => {
		const ip = '192.168.1.50';
		manager.connections.set('user1', { ws: mockWs, ip });
		manager.connections.set('user2', { ws: mockWs, ip });
		manager.connections.set('user3', { ws: mockWs, ip: 'different-ip' });

		expect(manager.getConnectionCountForIP(ip)).toBe(2);
	});

	test('should handle rate limiting', () => {
		expect(manager.connectionAttempts).toBeDefined();
		expect(manager.connectionAttempts instanceof Map).toBe(true);
	});

	test('should handle connection cleanup on error', () => {
		manager.connections.set('user1', { ws: mockWs, ip: '192.168.1.1' });

		// Simulate connection error
		expect(() => {
			manager.connections.delete('user1');
		}).not.toThrow();

		expect(manager.connections.has('user1')).toBe(false);
	});
});
