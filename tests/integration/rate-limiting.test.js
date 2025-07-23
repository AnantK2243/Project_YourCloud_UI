// tests/integration/rate-limiting.test.js

const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

// Create test app with rate limiting
function createRateLimitedApp() {
	const app = express();
	app.use(express.json());

	const limiter = rateLimit({
		windowMs: 60000, // 1 minute for tests
		max: 3, // 3 requests per minute for tests
		message: {
			success: false,
			message: 'Too many requests, please try again later.'
		}
	});

	app.use('/api/test', limiter);
	app.get('/api/test/endpoint', (req, res) => {
		res.json({ success: true, message: 'Request successful' });
	});

	return app;
}

describe('Rate Limiting Security', () => {
	let app;

	beforeEach(() => {
		app = createRateLimitedApp();
	});

	test('should allow requests under the limit', async () => {
		for (let i = 0; i < 3; i++) {
			const response = await request(app).get('/api/test/endpoint');
			expect(response.status).toBe(200);
		}
	});

	test('should block requests over the limit', async () => {
		// Make 3 requests (at the limit)
		for (let i = 0; i < 3; i++) {
			await request(app).get('/api/test/endpoint');
		}

		// 4th request should be blocked
		const response = await request(app).get('/api/test/endpoint');
		expect(response.status).toBe(429);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toContain('Too many requests');
	});

	test('should include rate limit headers', async () => {
		const response = await request(app).get('/api/test/endpoint');
		expect(response.headers).toHaveProperty('x-ratelimit-limit');
		expect(response.headers).toHaveProperty('x-ratelimit-remaining');
	});
});
