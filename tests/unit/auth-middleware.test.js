// tests/unit/auth-middleware.test.js

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { router } = require('../../src/routes/auth');
const { User } = require('../../src/models/User');

describe('Auth Middleware Integration', () => {
	let app;
	let authToken;
	let userId;

	beforeEach(async () => {
		// Create test app
		app = express();
		app.use(express.json());
		app.use('/api/auth', router);

		// Create test user
		const user = new User({
			name: 'Test User',
			email: 'middleware@example.com',
			password: 'hashedpassword123',
			salt: 'randomsalt123'
		});
		const savedUser = await user.save();
		userId = savedUser._id.toString();

		// Generate auth token
		authToken = jwt.sign({ userId: userId }, process.env.JWT_SECRET, { expiresIn: '24h' });
	});

	describe('Token Validation through Logout Endpoint', () => {
		test('should accept valid token', async () => {
			const response = await request(app)
				.post('/api/auth/logout')
				.set('Authorization', `Bearer ${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		test('should reject request without authorization header', async () => {
			const response = await request(app).post('/api/auth/logout');

			expect(response.status).toBe(401);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Access token required');
		});

		test('should reject request with invalid token format', async () => {
			const response = await request(app)
				.post('/api/auth/logout')
				.set('Authorization', 'InvalidTokenFormat');

			expect(response.status).toBe(401);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Access token required');
		});

		test('should reject expired token', async () => {
			const expiredToken = jwt.sign({ userId: userId }, process.env.JWT_SECRET, {
				expiresIn: '-1h'
			});

			const response = await request(app)
				.post('/api/auth/logout')
				.set('Authorization', `Bearer ${expiredToken}`);

			expect(response.status).toBe(403);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('expired');
		});

		test('should reject invalid token', async () => {
			const response = await request(app)
				.post('/api/auth/logout')
				.set('Authorization', 'Bearer invalid.token.here');

			expect(response.status).toBe(403);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('Invalid');
		});

		test('should reject token with invalid secret', async () => {
			const invalidToken = jwt.sign({ userId: userId }, 'wrong-secret', { expiresIn: '24h' });

			const response = await request(app)
				.post('/api/auth/logout')
				.set('Authorization', `Bearer ${invalidToken}`);

			expect(response.status).toBe(403);
			expect(response.body.success).toBe(false);
		});
	});
});
