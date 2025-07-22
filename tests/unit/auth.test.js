// tests/unit/auth.test.js

const request = require('supertest');
const express = require('express');
const { router } = require('../../src/routes/auth');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/auth', router);

describe('Auth Routes', () => {
	describe('POST /api/auth/register', () => {
		test('should register a new user with valid data', async () => {
			const userData = {
				name: 'Test User',
				email: 'test@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			const response = await request(app).post('/api/auth/register').send(userData);

			expect(response.status).toBe(201);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe('User registered successfully');
		});

		test('should reject registration with invalid email', async () => {
			const userData = {
				name: 'Test User',
				email: 'invalid-email',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			const response = await request(app).post('/api/auth/register').send(userData);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		test('should reject registration with weak password', async () => {
			const userData = {
				name: 'Test User',
				email: 'test2@example.com',
				password: 'weak',
				salt: 'randomsalt123'
			};

			const response = await request(app).post('/api/auth/register').send(userData);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		test('should reject duplicate email registration', async () => {
			const userData = {
				name: 'Test User',
				email: 'duplicate@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			// First registration
			await request(app).post('/api/auth/register').send(userData);

			// Second registration with same email
			const response = await request(app).post('/api/auth/register').send(userData);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('already exists');
		});
	});

	describe('POST /api/auth/login', () => {
		test('should login with valid credentials', async () => {
			// First register a user
			const userData = {
				name: 'Test User',
				email: 'login@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			await request(app).post('/api/auth/register').send(userData);

			// Then login
			const loginData = {
				email: 'login@example.com',
				password: 'StrongPass123'
			};

			const response = await request(app).post('/api/auth/login').send(loginData);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body).toHaveProperty('token');
			expect(response.body.user).toHaveProperty('id');
		});

		test('should reject login with invalid email', async () => {
			const loginData = {
				email: 'nonexistent@example.com',
				password: 'StrongPass123'
			};

			const response = await request(app).post('/api/auth/login').send(loginData);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Invalid email or password');
		});

		test('should reject login with missing password', async () => {
			const loginData = {
				email: 'test@example.com'
				// Missing password
			};

			const response = await request(app).post('/api/auth/login').send(loginData);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		test('should reject login with wrong password', async () => {
			// Register a user
			const userData = {
				name: 'Test User',
				email: 'wrongpass@example.com',
				password: 'StrongPass123',
				salt: 'randomsalt123'
			};

			await request(app).post('/api/auth/register').send(userData);

			// Try login with wrong password
			const loginData = {
				email: 'wrongpass@example.com',
				password: 'WrongPassword'
			};

			const response = await request(app).post('/api/auth/login').send(loginData);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Invalid email or password');
		});
	});
});
