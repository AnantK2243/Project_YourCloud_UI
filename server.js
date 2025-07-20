const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
require('dotenv').config();

// Import route modules
const { router: authRoutes } = require('./src/routes/auth');
const { router: storageRoutes } = require('./src/routes/storage');
const SecureWebSocketManager = require('./src/websocket/SecureWebSocketManager');

const app = express();
const APP_PORT = process.env.APP_PORT || 4200;
app.set('trust proxy', 1);

// Rate limiting configuration
const authLimiter = rateLimit({
	windowMs: 900000, // 15 minutes
	max: 100,
	message: {
		success: false,
		message: 'Too many authentication attempts, please try again later.'
	},
	standardHeaders: true,
	legacyHeaders: false,
});

const speedLimiter = slowDown({
	windowMs: 900000, // 15 minutes
	delayAfter: 10,
	delayMs: () => 500
});

const apiLimiter = rateLimit({
	windowMs: 900000, // 15 minutes
	max: 1000,
	message: {
		success: false,
		message: 'Too many API requests, please try again later.'
	}
});

// Security middleware
app.use(helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			scriptSrc: ["'self'"],
			imgSrc: ["'self'", "data:", "https:"],
			connectSrc: ["'self'", "wss:", "https:"],
			fontSrc: ["'self'"],
			objectSrc: ["'none'"],
			mediaSrc: ["'self'"],
			frameSrc: ["'none'"],
		},
	},
	crossOriginEmbedderPolicy: false
}));

// CORS configuration
const allowedOrigins = [`https://localhost:${APP_PORT}`];
app.use(cors({
	origin: allowedOrigins,
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
	allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Connection']
}));

app.use(express.json());

// Apply rate limiting to API routes
// app.use('/api', apiLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'dist/user_interface/browser')));

// Request logging
app.use((req, res, next) => {
	if (process.env.NODE_ENV !== 'production') {
		console.log(`${new Date().toISOString()} - Incoming request: ${req.method} ${req.url}`);
	}
	next();
});

// Database connection
async function connectToDatabase() {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		console.log('Connected to MongoDB Atlas');
	} catch (error) {
		console.error('MongoDB Atlas connection error:', error);
		process.exit(1);
	}
}

// Health check endpoints
app.get('/api/health-check', (req, res) => {
	const status = {
		status: 'OK',
		timestamp: new Date().toISOString(),
		mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
		uptime: process.uptime(),
		version: '1.0.0'
	};
	res.json(status);
});

app.get('/health', (req, res) => {
	res.status(200).send('OK');
});

// Mount route modules
// app.use('/api', authLimiter, speedLimiter, authRoutes);
app.use('/api', storageRoutes);

// Catch-all handler for Angular routes
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'dist/user_interface/browser/index.csr.html'));
});

// Global error handler
app.use((error, req, res, next) => {
	console.error('Unhandled error:', error);
	res.status(500).json({
		success: false,
		message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
	});
});

// SSL configuration
function getSSLOptions() {
	const sslOptions = {};

	try {
		const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, 'ssl', 'origin-key.key');
		const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, 'ssl', 'origin-cert.pem');
		const caPath = process.env.SSL_CA_PATH || path.join(__dirname, 'ssl', 'origin-ca.pem');

		sslOptions.key = fs.readFileSync(keyPath);
		sslOptions.cert = fs.readFileSync(certPath);
		sslOptions.ca = fs.readFileSync(caPath);

		console.log('SSL certificates loaded successfully');
	} catch (error) {
		console.error('Could not load SSL certificate files:', error.message);
		process.exit(1);
	}
	return sslOptions;
}

// Start server
async function startServer() {
	try {
		// Connect to database first
		await connectToDatabase();

		// Create HTTPS server
		const sslOptions = getSSLOptions();
		const server = https.createServer(sslOptions, app);

		// Initialize WebSocket manager
		const wsManager = new SecureWebSocketManager();

		// Make WebSocket manager available to routes
		app.locals.wsManager = wsManager;

		// Create WebSocket server
		const wss = new (require('ws')).Server({
			server,
			maxPayload: 268435456,
			perMessageDeflate: {
				zlibDeflateOptions: {
					chunkSize: 1024,
					windowBits: 13,
					concurrencyLimit: 10,
				},
				threshold: 1024,
				concurrencyLimit: 10,
				clientMaxWindowBits: 13,
				serverMaxWindowBits: 13,
				serverMaxNoContextTakeover: false,
				clientMaxNoContextTakeover: false,
			}
		});

		// Handle WebSocket connections
		wss.on('connection', (ws, req) => {
			wsManager.handleConnection(ws, req);
		});

		// Cleanup old connection attempts every 5 minutes
		setInterval(() => {
			wsManager.cleanup();
		}, 5 * 60 * 1000);

		// Start listening
		server.listen(APP_PORT, '127.0.0.1', () => {
			console.log(`YourCloud server is running on https://127.0.0.1:${APP_PORT}`);
		});

		// Graceful shutdown
		process.on('SIGTERM', () => {
			console.log('SIGTERM received, shutting down gracefully');
			server.close(() => {
				mongoose.connection.close();
				process.exit(0);
			});
		});

	} catch (error) {
		console.error('Failed to start server:', error);
		process.exit(1);
	}
}

// Start the application
startServer();
