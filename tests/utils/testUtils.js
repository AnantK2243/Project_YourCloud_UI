// tests/utils/testUtils.js

/**
 * Common testing utilities and helpers
 */

const _request = require('supertest');
const jwt = require('jsonwebtoken');
const { User, StorageNode } = require('../../src/models/User');

class TestUtils {
	/**
	 * Create a test user with default or custom data
	 */
	static async createTestUser(userData = {}) {
		const defaultUserData = {
			name: 'Test User',
			email: `test-${Date.now()}@example.com`,
			password: 'hashedpassword123',
			salt: 'randomsalt123'
		};

		const user = new User({ ...defaultUserData, ...userData });
		return await user.save();
	}

	/**
	 * Generate a JWT token for testing
	 */
	static generateAuthToken(userId, options = {}) {
		const defaultOptions = { expiresIn: '24h' };
		return jwt.sign({ userId: userId.toString() }, process.env.JWT_SECRET, {
			...defaultOptions,
			...options
		});
	}

	/**
	 * Generate an expired JWT token for testing
	 */
	static generateExpiredToken(userId) {
		return jwt.sign(
			{ userId: userId.toString() },
			process.env.JWT_SECRET,
			{ expiresIn: '-1h' } // Expired 1 hour ago
		);
	}

	/**
	 * Create a test storage node
	 */
	static async createTestStorageNode(userId, nodeData = {}) {
		const defaultNodeData = {
			node_name: `Test Node ${Date.now()}`,
			node_id: `test-node-${Date.now()}`,
			auth_token: 'hashed-auth-token-123',
			status: 'offline',
			user_id: userId
		};

		const node = new StorageNode({ ...defaultNodeData, ...nodeData });
		return await node.save();
	}

	/**
	 * Create mock WebSocket manager for testing
	 */
	static createMockWSManager(options = {}) {
		const connections = new Map();
		const pendingCommands = new Map();

		// Add any predefined connections
		if (options.connectedNodes) {
			options.connectedNodes.forEach(nodeId => {
				connections.set(nodeId, {
					readyState: 1, // OPEN
					send: jest.fn(),
					close: jest.fn(),
					on: jest.fn()
				});
			});
		}

		return {
			getNodeConnections: jest.fn(() => connections),
			getPendingCommands: jest.fn(() => pendingCommands),
			addNodeConnection: jest.fn((nodeId, ws) => {
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
			}),
			...options.overrides
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
			ip: options.ip || '127.0.0.1',
			app: {
				locals: {
					wsManager: options.wsManager || this.createMockWSManager()
				}
			},
			...options.overrides
		};
	}

	/**
	 * Create mock Express response object
	 */
	static createMockResponse() {
		const res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
			set: jest.fn().mockReturnThis(),
			cookie: jest.fn().mockReturnThis(),
			clearCookie: jest.fn().mockReturnThis(),
			end: jest.fn().mockReturnThis()
		};

		// Track the response data for assertions
		res.getStatus = () => res.status.mock.calls[res.status.mock.calls.length - 1]?.[0];
		res.getJsonData = () => res.json.mock.calls[res.json.mock.calls.length - 1]?.[0];

		return res;
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
	 * Wait for a specified amount of time
	 */
	static async wait(ms = 100) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Validate API response structure
	 */
	static validateAPIResponse(response, expectedStatus, shouldHaveSuccess = true) {
		expect(response.status).toBe(expectedStatus);

		if (shouldHaveSuccess && response.body) {
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

		// Return cleanup function
		return () => {
			process.env = originalEnv;
		};
	}

	/**
	 * Common test assertions for validation functions
	 */
	static expectValidationError(result, errorMessage) {
		expect(result.isValid || result.valid).toBe(false);
		if (errorMessage) {
			expect(result.errors).toContain(errorMessage);
		}
		expect(result.errors.length).toBeGreaterThan(0);
	}

	static expectValidationSuccess(result) {
		expect(result.isValid || result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	}

	/**
	 * Create test app with minimal setup
	 */
	static createTestApp(routes = []) {
		const express = require('express');
		const app = express();

		// Basic middleware
		app.use(express.json({ limit: '10mb' }));
		app.use(express.raw({ type: 'application/octet-stream', limit: '64mb' }));

		// Add routes
		routes.forEach(({ path, router }) => {
			app.use(path, router);
		});

		// Mock WebSocket manager
		app.locals.wsManager = this.createMockWSManager();

		return app;
	}

	/**
	 * Clean database collections (for manual cleanup if needed)
	 */
	static async cleanDatabase() {
		const mongoose = require('mongoose');
		const collections = mongoose.connection.collections;

		const promises = Object.keys(collections).map(async collectionName => {
			const collection = collections[collectionName];
			await collection.deleteMany({});
		});

		await Promise.all(promises);
	}
}

module.exports = TestUtils;
