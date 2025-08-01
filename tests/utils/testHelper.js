// tests/utils/testHelper.js
// Consolidated test utilities - single source of truth for test helpers

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { User, StorageNode } = require('../../src/models/User');

class TestHelper {
	/**
	 * Create a test user with provided data
	 */
	static async createTestUser(userData = {}) {
		const defaultData = {
			name: 'Test User',
			email: `test-${Date.now()}@example.com`,
			password: 'hashedpassword123',
			salt: 'randomsalt123',
			isVerified: true // Test users should be verified by default
		};

		const user = new User({ ...defaultData, ...userData });
		return await user.save();
	}

	/**
	 * Generate JWT token for a user
	 */
	static generateAuthToken(userId, options = {}) {
		const defaultOptions = { expiresIn: '24h' };
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
	 * Make authenticated request
	 */
	static makeAuthenticatedRequest(app, token) {
		return request(app).set('Authorization', `Bearer ${token}`);
	}

	/**
	 * Common test data generators
	 */
	static getValidUserData(overrides = {}) {
		return {
			name: 'John Doe',
			email: 'john@example.com',
			password: 'StrongPass123',
			salt: 'randomsalt123',
			...overrides
		};
	}

	static getValidLoginData(overrides = {}) {
		return {
			email: 'john@example.com',
			password: 'password123',
			...overrides
		};
	}

	static getValidNodeData(overrides = {}) {
		return {
			node_name: 'Test Storage Node',
			...overrides
		};
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
	 * Mock WebSocket manager for testing
	 */
	static createMockWSManager(connectedNodes = []) {
		const connections = new Map();
		connectedNodes.forEach(nodeId => {
			connections.set(nodeId, { readyState: 1, send: jest.fn() });
		});

		return {
			getNodeConnections: () => connections,
			getPendingCommands: () => new Map()
		};
	}
}

module.exports = TestHelper;
