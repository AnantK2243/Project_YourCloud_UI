// File: src/routes/auth.js - Auth routes: register/login/logout, email verify, JWT middleware & token blacklist mgmt

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User');
const {
	validateRegistrationInput,
	validateLoginInput,
	sanitizeString
} = require('../utils/validation');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/emailService');
const { apiSuccess, apiError } = require('./apiResponse');

const router = express.Router();

// -----------------------------------------------------------------------------
// Token Blacklist Maintenance
// -----------------------------------------------------------------------------

// Token blacklist for logout functionality
const tokenBlacklist = new Map();

/**
 * Remove expired JWT entries from in-memory blacklist.
 */
function cleanupExpiredTokens() {
	const now = Date.now();
	let cleanedCount = 0;
	for (const [token, expiresAt] of tokenBlacklist.entries()) {
		if (expiresAt < now) {
			tokenBlacklist.delete(token);
			cleanedCount++;
		}
	}
	if (cleanedCount > 0) {
		console.log(`Cleaned ${cleanedCount} expired token(s) from the blacklist.`);
	}
}

// Periodically clean up the blacklist (only in non-test environment)
const cleanupInterval = 24 * 60 * 60 * 1000;
let cleanupIntervalId = null;

if (process.env.NODE_ENV !== 'test') {
	cleanupIntervalId = setInterval(cleanupExpiredTokens, cleanupInterval);
	const hours = cleanupInterval / (60 * 60 * 1000);
	console.log(`Token blacklist cleanup job scheduled to run every ${hours} hours.`);
}

// -----------------------------------------------------------------------------
// JWT Authentication Middleware
// -----------------------------------------------------------------------------

/**
 * Express middleware that validates Bearer JWT, attaches decoded user payload.
 * Rejects invalid, expired, blacklisted or unverified tokens.
 */
const authenticateToken = async (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];

	if (!token) {
		return apiError(res, 401, 'Access token required');
	}

	// Check if token is blacklisted
	if (tokenBlacklist.has(token)) {
		return apiError(res, 401, 'Token has been invalidated');
	}

	jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
		if (err) {
			return apiError(res, 403, 'Invalid or expired token');
		}

		try {
			const user = await User.findById(decoded.userId);
			if (!user) {
				return apiError(res, 401, 'User not found');
			}

			if (!user.isVerified) {
				return apiError(res, 403, 'Access denied. Please verify your email.');
			}

			req.user = decoded;
			req.token = token;
			next();
		} catch (error) {
			if (process.env.NODE_ENV !== 'test') {
				console.error('Authentication error:', error);
			}
			return apiError(res, 500, 'Authentication failed');
		}
	});
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Blacklist a JWT until its natural expiration. No-op on decode failure.
 * @param {string} token Raw JWT string
 */
function blacklistToken(token) {
	try {
		const decoded = jwt.decode(token);
		if (decoded && decoded.exp) {
			tokenBlacklist.set(token, decoded.exp * 1000);
		}
	} catch (error) {
		if (process.env.NODE_ENV !== 'test') {
			console.error('Error blacklisting token:', error);
		}
	}
}

// -----------------------------------------------------------------------------
// Routes: Registration
// -----------------------------------------------------------------------------
/**
 * POST /register
 * Registers a new user, hashes password, issues verification email.
 * Body: { name, email, password, salt }
 * Success: 201 { userId }
 */
router.post('/register', async (req, res) => {
	try {
		const { name, email, password, salt } = req.body;

		const validation = validateRegistrationInput({ name, email, password, salt });
		if (!validation.isValid) {
			return apiError(res, 400, 'Invalid input data', validation.errors);
		}

		const existingUser = await User.findOne({ email: email.toLowerCase() });
		if (existingUser) {
			return apiError(res, 400, 'User with this email already exists');
		}

		const saltRounds = 12;
		const hashedPassword = await bcrypt.hash(password, saltRounds);

		const newUser = new User({
			name: sanitizeString(name.trim()),
			email: email.toLowerCase().trim(),
			password: hashedPassword,
			salt: salt,
			isVerified: false,
			emailVerificationToken: crypto.randomBytes(32).toString('hex'),
			emailVerificationExpires: Date.now() + 3600000
		});

		await newUser.save();

		try {
			await sendVerificationEmail(newUser.email, newUser.emailVerificationToken);
			return apiSuccess(
				res,
				201,
				'Registration successful. Please check your email to verify your account.',
				{ userId: newUser._id }
			);
		} catch (error) {
			console.error('Failed to send verification email:', error);
			return apiError(res, 500, 'User registered, but failed to send verification email.');
		}
	} catch (error) {
		if (process.env.NODE_ENV !== 'test') {
			console.error('Registration error:', error);
		}
		return apiError(res, 500, 'Registration failed');
	}
});

// -----------------------------------------------------------------------------
// Routes: Login
// -----------------------------------------------------------------------------
/**
 * POST /login
 * Authenticates user credentials and returns JWT + user profile subset.
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body;

		const validation = validateLoginInput({ email, password });
		if (!validation.isValid) {
			return apiError(res, 400, 'Invalid email or password', validation.errors);
		}

		const user = await User.findOne({ email: email.toLowerCase() });
		if (!user) {
			return apiError(res, 400, 'Invalid email or password');
		}

		const isPasswordValid = await bcrypt.compare(password, user.password);
		if (!isPasswordValid) {
			return apiError(res, 400, 'Invalid email or password');
		}

		if (!user.isVerified) {
			return apiError(res, 403, 'Please verify your email before logging in.');
		}

		const token = jwt.sign(
			{
				userId: user._id,
				email: user.email,
				name: user.name,
				iat: Math.floor(Date.now() / 1000)
			},
			process.env.JWT_SECRET,
			{ expiresIn: '24h', issuer: 'yourcloud-api', audience: 'yourcloud-users' }
		);

		return apiSuccess(res, 200, 'Login successful', {
			token,
			user: { id: user._id, name: user.name, email: user.email, salt: user.salt }
		});
	} catch (error) {
		if (process.env.NODE_ENV !== 'test') {
			console.error('Login error:', error);
		}
		return apiError(res, 500, 'Login failed');
	}
});

// -----------------------------------------------------------------------------
// Routes: Email Verification
// -----------------------------------------------------------------------------
/**
 * GET /verify-email
 * Validates email verification token (query param: token) and activates user.
 */
router.get('/verify-email', async (req, res) => {
	console.log('Email verification endpoint hit');
	try {
		const { token } = req.query;
		if (!token) {
			return res.status(400).send('Verification token is missing.');
		}

		console.log('Received verification token:', token);

		const user = await User.findOne({
			emailVerificationToken: token,
			emailVerificationExpires: { $gt: Date.now() }
		});

		if (!user) {
			return res
				.status(400)
				.send('Verification token is invalid or has expired. Please register again.');
		}

		user.isVerified = true;
		user.emailVerificationToken = undefined;
		user.emailVerificationExpires = undefined;
		await user.save();

		res.send('Email successfully verified! You can now log in.');
	} catch (error) {
		res.status(500).send('An error occurred during email verification: ' + error.message);
	}
});

// -----------------------------------------------------------------------------
// Routes: Logout
// -----------------------------------------------------------------------------
/**
 * POST /logout
 * Blacklists active JWT to invalidate further use.
 */
router.post('/logout', authenticateToken, (req, res) => {
	try {
		const token = req.token;
		blacklistToken(token);

		return apiSuccess(res, 200, 'Logged out successfully');
	} catch (error) {
		if (process.env.NODE_ENV !== 'test') {
			console.error('Logout error:', error);
		}
		return apiError(res, 500, 'Logout failed');
	}
});

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------
module.exports = {
	router,
	authenticateToken,
	blacklistToken,
	cleanupExpiredTokens,
	cleanupIntervalId
};
