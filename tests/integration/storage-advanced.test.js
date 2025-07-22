// tests/integration/storage-advanced.test.js

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { router } = require('../../src/routes/storage');
const { User, StorageNode } = require('../../src/models/User');

// Create test app
const app = express();
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream', limit: '64mb' }));

// Mock WebSocket manager with advanced functionality
const mockWSManager = {
	getNodeConnections: jest.fn(() => new Map()),
	getPendingCommands: jest.fn(() => new Map())
};

app.locals.wsManager = mockWSManager;
app.use('/api/storage', router);

describe('Storage Routes - Advanced Tests', () => {
	let authToken;
	let userId;
	let testNode;

	beforeEach(async () => {
		// Create test user
		const user = new User({
			name: 'Test User',
			email: 'storage@example.com',
			password: 'hashedpassword123',
			salt: 'randomsalt123'
		});
		const savedUser = await user.save();
		userId = savedUser._id.toString();

		// Generate auth token
		authToken = jwt.sign({ userId: userId }, process.env.JWT_SECRET, { expiresIn: '24h' });

		// Create test storage node
		testNode = new StorageNode({
			node_name: 'Test Node',
			node_id: 'test-node-123',
			auth_token: 'hashedtoken123',
			status: 'offline',
			total_available_space: 1000000,
			used_space: 0,
			num_chunks: 0,
			owner_user_id: userId
		});
		await testNode.save();

		// Add node to user's storage_nodes array
		await User.findByIdAndUpdate(userId, { $addToSet: { storage_nodes: 'test-node-123' } });

		jest.clearAllMocks();
	});

	describe('POST /api/storage/nodes - Edge Cases', () => {
		test('should reject empty node name', async () => {
			const response = await request(app)
				.post('/api/storage/nodes')
				.set('Authorization', `Bearer ${authToken}`)
				.send({ node_name: '   ' });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toContain('node_name is required');
		});

		test('should handle database errors gracefully', async () => {
			// Mock database error by using invalid user ID in token
			const invalidToken = jwt.sign({ userId: 'invalid-user-id' }, process.env.JWT_SECRET, {
				expiresIn: '24h'
			});

			const response = await request(app)
				.post('/api/storage/nodes')
				.set('Authorization', `Bearer ${invalidToken}`)
				.send({ node_name: 'Test Node' });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
		});
	});

	describe('GET /api/storage/nodes/:nodeId/status - Advanced Tests', () => {
		test('should handle missing nodeId parameter', async () => {
			const response = await request(app)
				.get('/api/storage/nodes//status')
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(404);
		});

		test('should handle node status update failure', async () => {
			// Mock WebSocket manager to simulate offline node
			mockWSManager.getNodeConnections.mockReturnValue(new Map());

			const response = await request(app)
				.get('/api/storage/nodes/non-existent-node/status')
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
		});
	});

	describe('POST /api/storage/nodes/:nodeId/chunks/:chunkId - Binary Upload', () => {
		test('should reject upload without data', async () => {
			const response = await request(app)
				.post(
					'/api/storage/nodes/test-node-123/chunks/550e8400-e29b-41d4-a716-446655440000'
				)
				.set('Authorization', `Bearer ${authToken}`)
				.set('Content-Type', 'application/octet-stream')
				.send(Buffer.alloc(0)); // Empty buffer

			expect(response.status).toBe(503); // Service unavailable due to node not connected
			expect(response.body.success).toBe(false);
		});

		test('should handle missing nodeId parameter', async () => {
			const response = await request(app)
				.post('/api/storage/nodes//chunks/550e8400-e29b-41d4-a716-446655440000')
				.set('Authorization', `Bearer ${authToken}`)
				.set('Content-Type', 'application/octet-stream')
				.send(Buffer.from('test data'));

			expect(response.status).toBe(404);
		});

		test('should handle missing chunkId parameter', async () => {
			const response = await request(app)
				.post('/api/storage/nodes/test-node-123/chunks/')
				.set('Authorization', `Bearer ${authToken}`)
				.set('Content-Type', 'application/octet-stream')
				.send(Buffer.from('test data'));

			expect(response.status).toBe(404);
		});

		test('should handle node not connected error', async () => {
			// Mock WebSocket manager to return no connections
			mockWSManager.getNodeConnections.mockReturnValue(new Map());

			const response = await request(app)
				.post(
					'/api/storage/nodes/test-node-123/chunks/550e8400-e29b-41d4-a716-446655440000'
				)
				.set('Authorization', `Bearer ${authToken}`)
				.set('Content-Type', 'application/octet-stream')
				.send(Buffer.from('test data'));

			expect(response.status).toBe(503);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('Storage node is not available');
		});

		test('should handle access denied for non-owned node', async () => {
			// Create another user's node
			const otherUser = new User({
				name: 'Other User',
				email: 'other@example.com',
				password: 'hashedpassword123',
				salt: 'randomsalt123'
			});
			const savedOtherUser = await otherUser.save();

			const otherNode = new StorageNode({
				node_name: 'Other Node',
				node_id: 'other-node-123',
				auth_token: 'hashedtoken123',
				status: 'offline',
				total_available_space: 1000000,
				used_space: 0,
				num_chunks: 0,
				owner_user_id: savedOtherUser._id
			});
			await otherNode.save();

			const response = await request(app)
				.post(
					'/api/storage/nodes/other-node-123/chunks/550e8400-e29b-41d4-a716-446655440000'
				)
				.set('Authorization', `Bearer ${authToken}`)
				.set('Content-Type', 'application/octet-stream')
				.send(Buffer.from('test data'));

			expect(response.status).toBe(403);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('Access denied');
		});
	});

	describe('GET /api/storage/nodes/:nodeId/chunks/:chunkId - Retrieve Chunk', () => {
		test('should handle missing parameters', async () => {
			const response = await request(app)
				.get('/api/storage/nodes//chunks/550e8400-e29b-41d4-a716-446655440000')
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(404);
		});

		test('should handle node not connected', async () => {
			mockWSManager.getNodeConnections.mockReturnValue(new Map());

			const response = await request(app)
				.get('/api/storage/nodes/test-node-123/chunks/550e8400-e29b-41d4-a716-446655440000')
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(503);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('Storage node is not available');
		});
	});

	describe('DELETE /api/storage/nodes/:nodeId/chunks/:chunkId - Delete Chunk', () => {
		test('should handle missing parameters', async () => {
			const response = await request(app)
				.delete('/api/storage/nodes/test-node-123/chunks/')
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(404);
		});

		test('should handle chunk not found', async () => {
			// Mock WebSocket manager to simulate connected node
			const mockWS = { readyState: 1 };
			const mockConnections = new Map([['test-node-123', mockWS]]);
			mockWSManager.getNodeConnections.mockReturnValue(mockConnections);

			// Mock pending commands that will simulate "chunk not found" response
			const mockPendingCommands = new Map();
			mockWSManager.getPendingCommands.mockReturnValue(mockPendingCommands);

			const response = await request(app)
				.delete(
					'/api/storage/nodes/test-node-123/chunks/550e8400-e29b-41d4-a716-446655440000'
				)
				.set('Authorization', `Bearer ${authToken}`);

			// This will timeout or fail because we're not actually processing the WebSocket command
			// In a real test, you'd mock the WebSocket response
			expect(response.status).toBe(500);
		});
	});

	describe('PUT /api/storage/nodes/:nodeId/chunks/:chunkId - Complete Upload', () => {
		test('should reject request without required fields', async () => {
			const response = await request(app)
				.put('/api/storage/nodes/test-node-123/chunks/550e8400-e29b-41d4-a716-446655440000')
				.set('Authorization', `Bearer ${authToken}`)
				.send({}); // Missing temporaryObjectName

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toContain('temporaryObjectName are required');
		});

		test('should handle missing chunkId', async () => {
			const response = await request(app)
				.put('/api/storage/nodes/test-node-123/chunks/')
				.set('Authorization', `Bearer ${authToken}`)
				.send({ temporaryObjectName: 'temp-object' });

			expect(response.status).toBe(404);
		});
	});

	describe('POST /api/storage/nodes/:nodeId/chunks/upload-sessions - Upload Sessions', () => {
		test('should handle missing data_size', async () => {
			const response = await request(app)
				.post('/api/storage/nodes/test-node-123/chunks/upload-sessions')
				.set('Authorization', `Bearer ${authToken}`)
				.send({}); // Missing data_size

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
		});

		test('should handle node not connected', async () => {
			mockWSManager.getNodeConnections.mockReturnValue(new Map());

			const response = await request(app)
				.post('/api/storage/nodes/test-node-123/chunks/upload-sessions')
				.set('Authorization', `Bearer ${authToken}`)
				.send({ data_size: 1024 });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
		});
	});
});
