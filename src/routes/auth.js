// src/app/routes/auth.js

// Authentication routes and middleware
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User');
const {
	validateRegistrationInput,
	validateLoginInput,
	sanitizeString
} = require('../utils/validation');

const router = express.Router();

// Token blacklist for logout functionality
const tokenBlacklist = new Map();

// Function to clean up expired tokens from the blacklist
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

// Periodically clean up the blacklist
const cleanupInterval = 24 * 60 * 60 * 1000;
setInterval(cleanupExpiredTokens, cleanupInterval);
console.log(`Token blacklist cleanup job scheduled to run every ${cleanupInterval / (60 * 60 * 1000)} hours.`);

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];

	if (!token) {
		return res.status(401).json({
			success: false,
			message: 'Access token required'
		});
	}

	// Check if token is blacklisted
	if (tokenBlacklist.has(token)) {
		return res.status(401).json({
			success: false,
			message: 'Token has been invalidated'
		});
	}

	jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
		if (err) {
			return res.status(403).json({
				success: false,
				message: 'Invalid or expired token'
			});
		}
		req.user = user;
		req.token = token;
		next();
	});
};

// Add token to blacklist (for logout)
function blacklistToken(token) {
	try {
		const decoded = jwt.decode(token);
		if (decoded && decoded.exp) {
			// Store the token until its expiration time
			tokenBlacklist.set(token, decoded.exp * 1000);
		}
	} catch (error) {
		console.error('Error blacklisting token:', error);
	}
}

// User Registration
router.post('/register', async (req, res) => {
	try {
		const { name, email, password, salt } = req.body;

		// Validate input
		const validation = validateRegistrationInput({ name, email, password, salt });
		if (!validation.isValid) {
			return res.status(400).json({
				success: false,
				message: 'Invalid input data',
				errors: validation.errors
			});
		}

		// Check if user already exists
		const existingUser = await User.findOne({ email: email.toLowerCase() });
		if (existingUser) {
			return res.status(400).json({
				success: false,
				message: 'User with this email already exists'
			});
		}

		// Hash password with hardcoded salt rounds for better security
		const saltRounds = 12;
		const hashedPassword = await bcrypt.hash(password, saltRounds);

		// Create new user with sanitized data
		const newUser = new User({
			name: sanitizeString(name.trim()),
			email: email.toLowerCase().trim(),
			password: hashedPassword,
			salt: salt
		});

		await newUser.save();

		res.status(201).json({
			success: true,
			message: 'User registered successfully'
		});

	} catch (error) {
		console.error('Registration error:', error);
		res.status(500).json({
			success: false,
			message: 'Registration failed'
		});
	}
});

// User Login
router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body;

		// Validate input
		const validation = validateLoginInput({ email, password });
		if (!validation.isValid) {
			return res.status(400).json({
				success: false,
				message: 'Invalid email or password',
				errors: validation.errors
			});
		}

		// Find user by email (case insensitive)
		const user = await User.findOne({ email: email.toLowerCase() });
		if (!user) {
			return res.status(400).json({
				success: false,
				message: 'Invalid email or password'
			});
		}

		// Check password
		const isPasswordValid = await bcrypt.compare(password, user.password);
		if (!isPasswordValid) {
			return res.status(400).json({
				success: false,
				message: 'Invalid email or password'
			});
		}

		// Generate JWT token with enhanced security
		const token = jwt.sign(
			{
				userId: user._id,
				email: user.email,
				name: user.name,
				iat: Math.floor(Date.now() / 1000) // Issued at time
			},
			process.env.JWT_SECRET,
			{
				expiresIn: '24h',
				issuer: 'yourcloud-api',
				audience: 'yourcloud-users'
			}
		);

		res.json({
			success: true,
			message: 'Login successful',
			token,
			user: {
				id: user._id,
				name: user.name,
				email: user.email,
				salt: user.salt
			}
		});

	} catch (error) {
		console.error('Login error:', error);
		res.status(500).json({
			success: false,
			message: 'Login failed'
		});
	}
});

// User Logout
router.post('/logout', authenticateToken, (req, res) => {
	try {
		const token = req.token;
		blacklistToken(token);

		res.json({
			success: true,
			message: 'Logged out successfully'
		});
	} catch (error) {
		console.error('Logout error:', error);
		res.status(500).json({
			success: false,
			message: 'Logout failed'
		});
	}
});

module.exports = {
	router,
	authenticateToken,
	blacklistToken,
	cleanupExpiredTokens
};
