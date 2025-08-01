// tests/unit/auth.test.js

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const { router } = require('../../src/routes/auth');
const { User } = require('../../src/models/User');
const TestHelper = require('../utils/testHelper');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/auth', router);

describe('Auth Routes', () => {
	describe('POST /api/auth/register', () => {
		test('should register a new user with valid data', async () => {
			const userData = TestHelper.getValidUserData({
				email: `test-${Date.now()}@example.com`
			});

			const response = await request(app).post('/api/auth/register').send(userData);

			expect(response.status).toBe(201);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe(
				'Registration successful. Please check your email to verify your account.'
			);
		});

		test('should reject registration with invalid email', async () => {
			const userData = TestHelper.getValidUserData({
				email: 'invalid-email'
			});

			const response = await request(app).post('/api/auth/register').send(userData);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		test('should reject registration with weak password', async () => {
			const userData = TestHelper.getValidUserData({
				email: `test-${Date.now()}@example.com`,
				password: 'weak'
			});

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
			// Create a verified user directly in the database
			const password = 'StrongPass123';
			const hashedPassword = await bcrypt.hash(password, 12);

			const user = new User({
				name: 'Test User',
				email: 'login@example.com',
				password: hashedPassword,
				salt: 'randomsalt123',
				isVerified: true
			});
			await user.save();

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
			// Create a verified user directly in the database
			const password = 'StrongPass123';
			const hashedPassword = await bcrypt.hash(password, 12);

			const user = new User({
				name: 'Test User',
				email: 'wrongpass@example.com',
				password: hashedPassword,
				salt: 'randomsalt123',
				isVerified: true
			});
			await user.save();

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

		test('should reject login for unverified users', async () => {
			// Create an unverified user
			const password = 'StrongPass123';
			const hashedPassword = await bcrypt.hash(password, 12);

			const user = new User({
				name: 'Test User',
				email: 'unverified@example.com',
				password: hashedPassword,
				salt: 'randomsalt123',
				isVerified: false
			});
			await user.save();

			// Try to login
			const loginData = {
				email: 'unverified@example.com',
				password: 'StrongPass123'
			};

			const response = await request(app).post('/api/auth/login').send(loginData);

			expect(response.status).toBe(403);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Please verify your email before logging in.');
		});
	});

	describe('GET /api/auth/verify-email', () => {
		test('should verify email with valid token', async () => {
			// Create an unverified user with verification token
			const user = new User({
				name: 'Test User',
				email: 'verify@example.com',
				password: 'hashedpassword',
				salt: 'randomsalt123',
				isVerified: false,
				emailVerificationToken: 'valid-token-123',
				emailVerificationExpires: Date.now() + 3600000 // 1 hour from now
			});
			await user.save();

			const response = await request(app).get('/api/auth/verify-email?token=valid-token-123');

			expect(response.status).toBe(200);
			expect(response.text).toContain('Email successfully verified');

			// Check that user is now verified
			const updatedUser = await User.findById(user._id);
			expect(updatedUser.isVerified).toBe(true);
			expect(updatedUser.emailVerificationToken).toBeUndefined();
		});

		test('should reject verification with expired token', async () => {
			// Create user with expired token
			const user = new User({
				name: 'Test User',
				email: 'expired@example.com',
				password: 'hashedpassword',
				salt: 'randomsalt123',
				isVerified: false,
				emailVerificationToken: 'expired-token-123',
				emailVerificationExpires: Date.now() - 3600000 // 1 hour ago
			});
			await user.save();

			const response = await request(app).get(
				'/api/auth/verify-email?token=expired-token-123'
			);

			expect(response.status).toBe(400);
			expect(response.text).toContain('invalid or has expired');
		});

		test('should reject verification with invalid token', async () => {
			const response = await request(app).get('/api/auth/verify-email?token=invalid-token');

			expect(response.status).toBe(400);
			expect(response.text).toContain('invalid or has expired');
		});
	});
});
