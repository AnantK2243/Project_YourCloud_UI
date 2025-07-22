// tests/integration/storage.test.js

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { router } = require('../../src/routes/storage');
const { User, StorageNode } = require('../../src/models/User');

// Create test app
const app = express();
app.use(express.json());

// Mock WebSocket manager
const mockWSManager = {
	getNodeConnections: () => new Map(),
	getPendingCommands: () => new Map()
};

app.locals.wsManager = mockWSManager;
app.use('/api/storage', router);

describe('Storage Routes', () => {
	let authToken;
	let userId;

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
	});

	describe('POST /api/storage/nodes', () => {
		test('should register a new storage node', async () => {
			const nodeData = {
				node_name: 'Test Storage Node'
			};

			const response = await request(app)
				.post('/api/storage/nodes')
				.set('Authorization', `Bearer ${authToken}`)
				.send(nodeData);

			expect(response.status).toBe(201);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toHaveProperty('nodeId');
			expect(response.body.data).toHaveProperty('authToken');
			expect(response.body.data.nodeName).toBe(nodeData.node_name);
		});

		test('should reject node registration without authentication', async () => {
			const nodeData = {
				node_name: 'Test Storage Node'
			};

			const response = await request(app).post('/api/storage/nodes').send(nodeData);

			expect(response.status).toBe(401);
		});

		test('should reject node registration without node_name', async () => {
			const response = await request(app)
				.post('/api/storage/nodes')
				.set('Authorization', `Bearer ${authToken}`)
				.send({});

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toContain('node_name is required');
		});
	});

	describe('GET /api/storage/nodes', () => {
		test('should return user storage nodes', async () => {
			// Create a test storage node
			const node = new StorageNode({
				node_name: 'Test Node',
				node_id: 'test-node-123',
				auth_token: 'hashedtoken123',
				status: 'offline',
				total_available_space: 1000000,
				used_space: 0,
				num_chunks: 0,
				owner_user_id: userId
			});
			await node.save();

			// Add node to user's storage_nodes array
			await User.findByIdAndUpdate(userId, { $addToSet: { storage_nodes: 'test-node-123' } });

			const response = await request(app)
				.get('/api/storage/nodes')
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toHaveLength(1);
			expect(response.body.data[0].node_id).toBe('test-node-123');
		});

		test('should require authentication', async () => {
			const response = await request(app).get('/api/storage/nodes');

			expect(response.status).toBe(401);
		});
	});

	describe('DELETE /api/storage/nodes/:nodeId', () => {
		test('should delete a storage node', async () => {
			// Create a test storage node
			const node = new StorageNode({
				node_name: 'Test Node',
				node_id: 'delete-test-123',
				auth_token: 'hashedtoken123',
				status: 'offline',
				total_available_space: 1000000,
				used_space: 0,
				num_chunks: 0,
				owner_user_id: userId
			});
			await node.save();

			const response = await request(app)
				.delete('/api/storage/nodes/delete-test-123')
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data.nodeId).toBe('delete-test-123');
			expect(response.body.data.status).toBe('deleted');

			// Verify node was deleted from database
			const deletedNode = await StorageNode.findOne({ node_id: 'delete-test-123' });
			expect(deletedNode).toBeNull();
		});

		test('should return 404 for non-existent node', async () => {
			const response = await request(app)
				.delete('/api/storage/nodes/non-existent')
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
		});
	});
});
