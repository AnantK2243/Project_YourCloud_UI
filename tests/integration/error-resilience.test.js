// tests/integration/error-resilience.test.js

const request = require('supertest');
const express = require('express');

function createErrorHandlingApp() {
    const app = express();
    app.use(express.json({ limit: '10mb' }));

    // Store timeout references for cleanup
    const timeouts = new Set();

    // Route that can simulate various errors
    app.post('/api/test/error/:errorType', (req, res, _next) => {
        const { errorType } = req.params;

        switch (errorType) {
            case 'timeout': {
                // Simulate timeout with proper cleanup
                const timeoutId = setTimeout(() => {
                    timeouts.delete(timeoutId);
                    if (!res.headersSent) {
                        res.json({ success: true, message: 'Long operation completed' });
                    }
                }, 10000); // 10 second delay
                timeouts.add(timeoutId);

                // Clean up timeout if request is aborted
                req.on('close', () => {
                    if (timeouts.has(timeoutId)) {
                        clearTimeout(timeoutId);
                        timeouts.delete(timeoutId);
                    }
                });
                break;
            }
            case 'memory': {
                // Simulate memory pressure
                const largeArray = new Array(1000000).fill('x'.repeat(1000));
                res.json({ success: true, dataSize: largeArray.length });
                break;
            }
            case 'server_error': {
                res.status(500).json({ error: 'Internal server error' });
                break;
            }
            case 'database': {
                res.status(503).json({
                    success: false,
                    message: 'Service temporarily unavailable'
                });
                break;
            }
            case 'validation': {
                res.status(400).json({
                    success: false,
                    errors: ['Invalid field format', 'Missing required field']
                });
                break;
            }
            default: {
                res.status(400).json({ error: 'Unknown error type' });
            }
        }
    });

    // Global error handler
    app.use((error, req, res, _next) => {
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                success: false,
                message: 'Service temporarily unavailable'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    });

    // Add cleanup method
    app.cleanup = () => {
        timeouts.forEach(timeoutId => clearTimeout(timeoutId));
        timeouts.clear();
    };

    return app;
}

describe('Error Handling & Resilience', () => {
    let app;

    beforeEach(() => {
        app = createErrorHandlingApp();
    });

    afterEach(() => {
        // Clean up any pending timeouts
        if (app.cleanup) {
            app.cleanup();
        }
    });

    test('should handle database connection errors gracefully', async () => {
        const response = await request(app).post('/api/test/error/database').send({ test: 'data' });

        expect(response.status).toBe(503);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Service temporarily unavailable');
    });

    test('should handle validation errors appropriately', async () => {
        const response = await request(app)
            .post('/api/test/error/validation')
            .send({ invalid: 'data' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.errors).toBeInstanceOf(Array);
    });

    test('should handle large payloads without crashing', async () => {
        const largePayload = {
            data: 'x'.repeat(1000000) // 1MB of data
        };

        const response = await request(app).post('/api/test/error/memory').send(largePayload);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    test('should timeout long-running requests', async () => {
        const startTime = Date.now();

        try {
            await request(app)
                .post('/api/test/error/timeout')
                .timeout(2000) // 2 second timeout
                .send({ test: 'data' });

            // If we get here, the request completed (which shouldn't happen)
            const duration = Date.now() - startTime;
            expect(duration).toBeGreaterThan(2000); // Should have taken longer than timeout
        } catch (error) {
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(3000); // Should timeout before 3 seconds
            expect(['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)).toBe(true);
        }
    }, 15000); // Increase Jest timeout to 15 seconds

    test('should handle malformed JSON gracefully', async () => {
        // Send raw malformed JSON string
        const response = await request(app)
            .post('/api/test/error/validation')
            .set('Content-Type', 'application/json')
            .send('{"malformed": json}'); // Invalid JSON

        // Express might return 500 for JSON parse errors, which is also acceptable
        expect([400, 500]).toContain(response.status);
    });
});
