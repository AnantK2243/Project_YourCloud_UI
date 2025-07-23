// tests/integration/storage-advanced.test.js

const request = require('supertest');
const express = require('express');
const { router } = require('../../src/routes/storage');
const TestHelper = require('../utils/testHelper');

// Create test app
const app = express();
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream', limit: '64mb' }));

// Mock WebSocket manager
const mockWSManager = TestHelper.createMockWSManager();
app.locals.wsManager = mockWSManager;
app.use('/api/storage', router);

describe('Storage Routes - Advanced Tests', () => {
	let authToken;
	let userId;
	let testUser;

	beforeEach(async () => {
		testUser = await TestHelper.createTestUser();
		userId = testUser._id.toString();
		authToken = TestHelper.generateAuthToken(userId);
	});

	describe('Node Registration Edge Cases', () => {
		test('should reject empty node name', async () => {
			const response = await request(app)
				.post('/api/storage/nodes')
				.set('Authorization', `Bearer ${authToken}`)
				.send({ node_name: '   ' });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toContain('node_name is required');
		});

		test('should handle invalid user authentication', async () => {
			const invalidToken = TestHelper.generateAuthToken('invalid-user-id');

			const response = await request(app)
				.post('/api/storage/nodes')
				.set('Authorization', `Bearer ${invalidToken}`)
				.send({ node_name: 'Test Node' });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
		});
	});

	describe('Node Status Operations', () => {
		let testNode;

		beforeEach(async () => {
			const { node } = await TestHelper.createTestStorageNode({}, userId);
			testNode = node;
		});

		test('should handle offline node status check', async () => {
			const response = await request(app)
				.get(`/api/storage/nodes/${testNode.node_id}/status`)
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Check that status is reported correctly
			expect(response.body.data).toHaveProperty('status');
			expect(response.body.data.status).toBe('offline');
		});
	});

	describe('Chunk Operations', () => {
		let testNode;
		const testChunkId = TestHelper.generateUUIDv4();

		beforeEach(async () => {
			const { node } = await TestHelper.createTestStorageNode({}, userId);
			testNode = node;
		});

		test('should handle chunk upload to offline node', async () => {
			const response = await request(app)
				.post(`/api/storage/nodes/${testNode.node_id}/chunks/${testChunkId}`)
				.set('Authorization', `Bearer ${authToken}`)
				.send(Buffer.from('test data'));

			expect(response.status).toBe(503);
			// Check for either error message format
			expect(
				response.body.error.includes('not connected') ||
				response.body.error.includes('not available')
			).toBe(true);
		});

		test('should reject chunk operations without authentication', async () => {
			const response = await request(app)
				.post(`/api/storage/nodes/${testNode.node_id}/chunks/${testChunkId}`)
				.send(Buffer.from('test data'));

			expect(response.status).toBe(401);
		});

		test('should handle missing chunk ID parameter', async () => {
			const response = await request(app)
				.get(`/api/storage/nodes/${testNode.node_id}/chunks/`)
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(404);
		});
	});
});
