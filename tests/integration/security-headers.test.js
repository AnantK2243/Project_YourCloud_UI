// tests/integration/security-headers.test.js

const request = require('supertest');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

function createSecureApp() {
	const app = express();

	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: {
					defaultSrc: [`'self'`],
					styleSrc: [`'self'`, `'unsafe-inline'`],
					scriptSrc: [`'self'`]
				}
			}
		})
	);

	app.use(
		cors({
			origin: ['https://localhost:3000', 'https://127.0.0.1:3000'],
			credentials: true
		})
	);

	app.get('/api/test', (req, res) => {
		res.json({ success: true });
	});

	return app;
}

describe('Security Headers & CORS', () => {
	let app;

	beforeEach(() => {
		app = createSecureApp();
	});

	test('should include security headers', async () => {
		const response = await request(app).get('/api/test');

		expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
		// Helmet uses SAMEORIGIN by default, not DENY
		expect(response.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN');
		expect(response.headers).toHaveProperty('x-xss-protection', '0');
		expect(response.headers).toHaveProperty('content-security-policy');
	});

	test('should handle CORS preflight requests', async () => {
		const response = await request(app)
			.options('/api/test')
			.set('Origin', 'https://localhost:3000')
			.set('Access-Control-Request-Method', 'GET');

		expect(response.status).toBe(204);
		expect(response.headers).toHaveProperty('access-control-allow-origin');
	});

	test('should reject requests from unauthorized origins', async () => {
		const response = await request(app)
			.get('/api/test')
			.set('Origin', 'https://malicious-site.com');

		// The request itself succeeds but CORS headers won't allow browser access
		expect(response.status).toBe(200);
		expect(response.headers['access-control-allow-origin']).not.toBe(
			'https://malicious-site.com'
		);
	});

	test('should include Content-Security-Policy header', async () => {
		const response = await request(app).get('/api/test');

		const csp = response.headers['content-security-policy'];
		expect(csp).toContain(`default-src 'self'`);
		expect(csp).toContain(`script-src 'self'`);
	});
});
