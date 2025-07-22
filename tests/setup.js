const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Set test environment variables
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-do-not-use-in-production';
process.env.NODE_ENV = 'test';

// Increase timeout for database operations in tests
jest.setTimeout(30000);

// Global setup
beforeAll(async () => {
	try {
		// Start in-memory MongoDB instance
		mongoServer = await MongoMemoryServer.create({
			binary: {
				version: '6.0.4'
			}
		});

		const mongoUri = mongoServer.getUri();

		// Connect to MongoDB with optimized settings for testing
		await mongoose.connect(mongoUri, {
			maxPoolSize: 10,
			serverSelectionTimeoutMS: 5000,
			socketTimeoutMS: 45000
		});

		console.log('Test database connected successfully');
	} catch (error) {
		console.error('Error setting up test database:', error);
		throw error;
	}
});

// Global teardown
afterAll(async () => {
	try {
		// Clear any intervals from auth routes
		try {
			const { cleanupIntervalId } = require('../src/routes/auth');
			if (cleanupIntervalId) {
				clearInterval(cleanupIntervalId);
			}
		} catch (_error) {
			// Ignore if auth module not loaded
		}

		// Close all connections
		await mongoose.disconnect();

		// Stop MongoDB server
		if (mongoServer) {
			await mongoServer.stop();
		}

		console.log('Test database cleaned up successfully');
	} catch (error) {
		console.error('Error during test cleanup:', error);
	}
});

// Clean up after each test
afterEach(async () => {
	try {
		// Clear all collections
		const collections = mongoose.connection.collections;
		const promises = Object.keys(collections).map(async collectionName => {
			const collection = collections[collectionName];
			await collection.deleteMany({});
		});

		await Promise.all(promises);

		// Clear any Jest timers
		jest.clearAllTimers();
		jest.clearAllMocks();
	} catch (error) {
		console.error('Error cleaning up after test:', error);
	}
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	// Don't exit in test environment, just log
});

// Handle uncaught exceptions in tests
process.on('uncaughtException', error => {
	console.error('Uncaught Exception:', error);
	// Don't exit in test environment, just log
});

// Mock console methods for cleaner test output (optional)
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
	// Optionally suppress console output during tests
	// Uncomment these lines if you want quieter test runs
	// console.error = jest.fn();
	// console.warn = jest.fn();
});

afterEach(() => {
	// Restore original console methods
	console.error = originalConsoleError;
	console.warn = originalConsoleWarn;
});
