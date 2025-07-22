// tests/unit/models.test.js

const _mongoose = require('mongoose');
const { User, StorageNode } = require('../../src/models/User');

describe('Database Models', () => {
	describe('User Model', () => {
		test('should create a user with valid data', async () => {
			const userData = {
				name: 'Test User',
				email: 'test@example.com',
				password: 'hashedpassword123',
				salt: 'randomsalt123'
			};

			const user = new User(userData);
			const savedUser = await user.save();

			expect(savedUser._id).toBeDefined();
			expect(savedUser.name).toBe(userData.name);
			expect(savedUser.email).toBe(userData.email);
			expect(savedUser.storage_nodes).toEqual([]);
		});

		test('should enforce unique email constraint', async () => {
			const userData = {
				name: 'Test User',
				email: 'unique@example.com',
				password: 'hashedpassword123',
				salt: 'randomsalt123'
			};

			// Create first user
			const user1 = new User(userData);
			await user1.save();

			// Try to create second user with same email
			const user2 = new User(userData);

			await expect(user2.save()).rejects.toThrow();
		});

		test('should validate required fields', async () => {
			const invalidUser = new User({
				name: 'Test User'
				// Missing required fields
			});

			await expect(invalidUser.save()).rejects.toThrow();
		});
	});

	describe('StorageNode Model', () => {
		test('should create a storage node with valid data', async () => {
			// Create a valid user first to get a real ObjectId
			const user = new User({
				name: 'Test User',
				email: 'nodeowner@example.com',
				password: 'hashedpassword123',
				salt: 'randomsalt123'
			});
			const savedUser = await user.save();

			const nodeData = {
				node_name: 'Test Node',
				node_id: 'test-node-123',
				auth_token: 'hashedtoken123',
				status: 'offline',
				total_available_space: 1000000,
				used_space: 0,
				num_chunks: 0,
				owner_user_id: savedUser._id
			};

			const node = new StorageNode(nodeData);
			const savedNode = await node.save();

			expect(savedNode._id).toBeDefined();
			expect(savedNode.node_name).toBe(nodeData.node_name);
			expect(savedNode.node_id).toBe(nodeData.node_id);
			expect(savedNode.status).toBe('offline');
		});

		test('should enforce unique node_id constraint', async () => {
			// Create a valid user first
			const user = new User({
				name: 'Test User',
				email: 'nodeowner2@example.com',
				password: 'hashedpassword123',
				salt: 'randomsalt123'
			});
			const savedUser = await user.save();

			const nodeData = {
				node_name: 'Test Node',
				node_id: 'unique-node-123',
				auth_token: 'hashedtoken123',
				status: 'offline',
				total_available_space: 1000000,
				used_space: 0,
				num_chunks: 0,
				owner_user_id: savedUser._id
			};

			// Create first node
			const node1 = new StorageNode(nodeData);
			await node1.save();

			// Try to create second node with same node_id
			const node2 = new StorageNode(nodeData);

			await expect(node2.save()).rejects.toThrow();
		});

		test('should validate required fields', async () => {
			const invalidNode = new StorageNode({
				node_name: 'Test Node'
				// Missing required node_id
			});

			await expect(invalidNode.save()).rejects.toThrow();
		});
	});
});
