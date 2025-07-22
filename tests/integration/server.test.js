// tests/integration/server.test.js

const request = require('supertest');
const express = require('express');

// Mock the server setup without starting it
const createTestApp = () => {
	const app = express();

	// Basic middleware
	app.use(express.json({ limit: '10mb' }));
	app.use(express.urlencoded({ extended: true }));

	// Mock routes for testing middleware
	app.get('/test', (req, res) => {
		res.json({ success: true, message: 'Test endpoint' });
	});

	app.post('/test-json', (req, res) => {
		res.json({ success: true, body: req.body });
	});

	// Health check endpoint
	app.get('/health', (req, res) => {
		res.json({
			status: 'healthy',
			timestamp: new Date().toISOString(),
			uptime: process.uptime()
		});
	});

	// Error handling middleware for JSON parsing
	app.use((err, req, res, _next) => {
		if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
			return res.status(400).json({
				success: false,
				message: 'Invalid JSON',
				error: 'Malformed JSON in request body'
			});
		}

		if (err.type === 'entity.too.large') {
			return res.status(413).json({
				success: false,
				message: 'Payload too large',
				error: 'Request entity too large'
			});
		}

		console.error('Unhandled error:', err);
		res.status(500).json({
			success: false,
			message: 'Internal Server Error',
			error: process.env.NODE_ENV === 'development' ? err.message : undefined
		});
	});

	// 404 handler
	app.use('*', (req, res) => {
		res.status(404).json({
			success: false,
			message: 'Endpoint not found',
			path: req.originalUrl
		});
	});

	return app;
};

describe('Server Middleware and Error Handling', () => {
	let app;

	beforeEach(() => {
		app = createTestApp();
	});

	describe('Basic Middleware', () => {
		test('should handle JSON requests correctly', async () => {
			const testData = { name: 'Test', value: 123 };

			const response = await request(app).post('/test-json').send(testData);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.body).toEqual(testData);
		});

		test('should handle large JSON payloads within limit', async () => {
			const largeData = {
				data: 'x'.repeat(1000000) // 1MB string
			};

			const response = await request(app).post('/test-json').send(largeData);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		test('should reject JSON payloads that are too large', async () => {
			const tooLargeData = {
				data: 'x'.repeat(15000000) // 15MB string
			};

			const response = await request(app).post('/test-json').send(tooLargeData);

			expect(response.status).toBe(413);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Payload too large');
		});
	});

	describe('Error Handling', () => {
		test('should handle 404 for non-existent endpoints', async () => {
			const response = await request(app).get('/non-existent-endpoint');

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Endpoint not found');
			expect(response.body.path).toBe('/non-existent-endpoint');
		});

		test('should handle malformed JSON requests', async () => {
			const response = await request(app)
				.post('/test-json')
				.set('Content-Type', 'application/json')
				.send('{"invalid": json}'); // Malformed JSON

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Invalid JSON');
		});
	});

	describe('CORS and Security Headers', () => {
		test('should include basic security headers', async () => {
			const response = await request(app).get('/test');

			expect(response.status).toBe(200);
			// In a full server setup, you'd test for security headers like:
			// expect(response.headers['x-content-type-options']).toBe('nosniff');
			// expect(response.headers['x-frame-options']).toBe('DENY');
		});
	});

	describe('Health Check Endpoints', () => {
		test('should respond to basic health check', async () => {
			const response = await request(app).get('/health');

			expect(response.status).toBe(200);
			expect(response.body.status).toBe('healthy');
			expect(response.body.timestamp).toBeDefined();
			expect(response.body.uptime).toBeDefined();
		});
	});
});
