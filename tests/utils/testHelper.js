// tests/utils/testHelper.js

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, StorageNode } = require('../../src/models/User');

class TestHelper {
	/**
	 * Create a test user with provided data
	 */
	static async createTestUser(userData = {}) {
		const defaultData = {
			name: 'Test User',
			email: 'test@example.com',
			password: 'hashedpassword123',
			salt: 'randomsalt123'
		};

		const user = new User({ ...defaultData, ...userData });
		return await user.save();
	}

	/**
	 * Create multiple test users
	 */
	static async createTestUsers(count = 2) {
		const users = [];
		for (let i = 0; i < count; i++) {
			const user = await this.createTestUser({
				name: `Test User ${i + 1}`,
				email: `test${i + 1}@example.com`
			});
			users.push(user);
		}
		return users;
	}

	/**
	 * Generate JWT token for a user
	 */
	static generateAuthToken(userId, options = {}) {
		const defaultOptions = {
			expiresIn: '24h',
			issuer: 'yourcloud-api',
			audience: 'yourcloud-users'
		};

		return jwt.sign({ userId: userId.toString() }, process.env.JWT_SECRET, {
			...defaultOptions,
			...options
		});
	}

	/**
	 * Generate expired JWT token
	 */
	static generateExpiredToken(userId) {
		return this.generateAuthToken(userId, { expiresIn: '-1h' });
	}

	/**
	 * Create a test storage node
	 */
	static async createTestStorageNode(nodeData = {}, userId = null) {
		if (!userId) {
			const user = await this.createTestUser();
			userId = user._id;
		}

		const defaultData = {
			node_name: 'Test Storage Node',
			node_id: `test-node-${Date.now()}`,
			auth_token: await bcrypt.hash('testtoken123', 10),
			status: 'offline',
			total_available_space: 1000000,
			used_space: 0,
			num_chunks: 0,
			owner_user_id: userId
		};

		const node = new StorageNode({ ...defaultData, ...nodeData });
		const savedNode = await node.save();

		// Add node to user's storage_nodes array
		await User.findByIdAndUpdate(userId, { $addToSet: { storage_nodes: savedNode.node_id } });

		return { node: savedNode, userId };
	}

	/**
	 * Create multiple storage nodes for a user
	 */
	static async createTestStorageNodes(count = 2, userId = null) {
		if (!userId) {
			const user = await this.createTestUser();
			userId = user._id;
		}

		const nodes = [];
		for (let i = 0; i < count; i++) {
			const { node } = await this.createTestStorageNode(
				{
					node_name: `Test Node ${i + 1}`,
					node_id: `test-node-${i + 1}-${Date.now()}`
				},
				userId
			);
			nodes.push(node);
		}

		return { nodes, userId };
	}

	/**
	 * Mock WebSocket manager for testing
	 */
	static createMockWSManager(options = {}) {
		const connections = new Map();
		const pendingCommands = new Map();

		if (options.connectedNodes) {
			options.connectedNodes.forEach(nodeId => {
				connections.set(nodeId, {
					readyState: 1,
					send: jest.fn(),
					close: jest.fn()
				});
			});
		}

		return {
			getNodeConnections: jest.fn(() => connections),
			getPendingCommands: jest.fn(() => pendingCommands),
			addNodeConnection: jest.fn((nodeId, ws, _ip, _nodeData) => {
				connections.set(nodeId, ws);
			}),
			removeConnection: jest.fn(nodeId => {
				connections.delete(nodeId);
			}),
			handleCommandResponse: jest.fn((commandId, response) => {
				const callback = pendingCommands.get(commandId);
				if (callback) {
					callback(response);
					pendingCommands.delete(commandId);
				}
			})
		};
	}

	/**
	 * Create mock Express request object
	 */
	static createMockRequest(options = {}) {
		return {
			headers: options.headers || {},
			body: options.body || {},
			params: options.params || {},
			query: options.query || {},
			user: options.user || null,
			token: options.token || null,
			app: {
				locals: {
					wsManager: options.wsManager || this.createMockWSManager()
				}
			},
			...options
		};
	}

	/**
	 * Create mock Express response object
	 */
	static createMockResponse() {
		return {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
			set: jest.fn().mockReturnThis(),
			cookie: jest.fn().mockReturnThis(),
			clearCookie: jest.fn().mockReturnThis()
		};
	}

	/**
	 * Generate random string for testing
	 */
	static generateRandomString(length = 10) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}

	/**
	 * Generate valid UUID v4 for testing
	 */
	static generateUUIDv4() {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			const r = (Math.random() * 16) | 0;
			const v = c === 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}

	/**
	 * Wait for a specified amount of time (for testing async operations)
	 */
	static async wait(ms = 100) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Clean up test data (called in afterEach)
	 */
	static async cleanup() {
		// This is handled by the global test setup which clears all collections
		// But can be extended for specific cleanup needs
	}

	/**
	 * Validate response structure for API endpoints
	 */
	static validateAPIResponse(response, expectedStatus, shouldHaveSuccess = true) {
		expect(response.status).toBe(expectedStatus);
		if (shouldHaveSuccess) {
			expect(response.body).toHaveProperty('success');
		}
		return response.body;
	}

	/**
	 * Create test binary data
	 */
	static createTestBinaryData(size = 1024) {
		return Buffer.allocUnsafe(size).fill(Math.floor(Math.random() * 256));
	}

	/**
	 * Mock environment variables for testing
	 */
	static mockEnvVars(envVars) {
		const originalEnv = { ...process.env };
		Object.assign(process.env, envVars);

		return () => {
			process.env = originalEnv;
		};
	}
}

module.exports = TestHelper;
