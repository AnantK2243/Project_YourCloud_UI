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
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/emailService');

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

// Periodically clean up the blacklist (only in non-test environment)
const cleanupInterval = 24 * 60 * 60 * 1000;
let cleanupIntervalId = null;

if (process.env.NODE_ENV !== 'test') {
	cleanupIntervalId = setInterval(cleanupExpiredTokens, cleanupInterval);
	const hours = cleanupInterval / (60 * 60 * 1000);
	console.log(`Token blacklist cleanup job scheduled to run every ${hours} hours.`);
}

// JWT Authentication middleware
const authenticateToken = async (req, res, next) => {
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

	jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
		if (err) {
			return res.status(403).json({
				success: false,
				message: 'Invalid or expired token'
			});
		}

		try {
			// Fetch the user from database to check verification status
			const user = await User.findById(decoded.userId);
			if (!user) {
				return res.status(401).json({
					success: false,
					message: 'User not found'
				});
			}

			// Check if user's email is verified
			if (!user.isVerified) {
				return res.status(403).json({
					success: false,
					message: 'Access denied. Please verify your email.'
				});
			}

			req.user = decoded;
			req.token = token;
			next();
		} catch (error) {
			if (process.env.NODE_ENV !== 'test') {
				console.error('Authentication error:', error);
			}
			return res.status(500).json({
				success: false,
				message: 'Authentication failed'
			});
		}
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
		if (process.env.NODE_ENV !== 'test') {
			console.error('Error blacklisting token:', error);
		}
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
			salt: salt,
			isVerified: false,
			emailVerificationToken: crypto.randomBytes(32).toString('hex'),
			emailVerificationExpires: Date.now() + 3600000 // Token expires in 1 hour
		});

		await newUser.save();

		// Send the verification email
		try {
			await sendVerificationEmail(newUser.email, newUser.emailVerificationToken);
			res.status(201).json({
				success: true,
				message: 'Registration successful. Please check your email to verify your account.'
			});
		} catch (error) {
			console.error('Failed to send verification email:', error);
			// TODO: Fix email sending error handling
			return res.status(500).json({
				success: false,
				message: 'User registered, but failed to send verification email.'
			});
		}
	} catch (error) {
		if (process.env.NODE_ENV !== 'test') {
			console.error('Registration error:', error);
		}
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

		if (!user.isVerified) {
			return res.status(403).json({
				success: false,
				message: 'Please verify your email before logging in.'
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
		if (process.env.NODE_ENV !== 'test') {
			console.error('Login error:', error);
		}
		res.status(500).json({
			success: false,
			message: 'Login failed'
		});
	}
});

router.get('/verify-email', async (req, res) => {
	console.log('Email verification endpoint hit');
	// TODO: Add redirects to proper pages
	try {
		const { token } = req.query;
		if (!token) {
			return res.status(400).send('Verification token is missing.');
		}

		console.log('Received verification token:', token);

		// Find the user with this token and check if it's still valid
		const user = await User.findOne({
			emailVerificationToken: token,
			emailVerificationExpires: { $gt: Date.now() } // Check if the token has not expired
		});

		if (!user) {
			// TODO: Add retry with new token or delete the user option
			return res
				.status(400)
				.send('Verification token is invalid or has expired. Please register again.');
		}

		// If the user is found, verify them
		user.isVerified = true;
		user.emailVerificationToken = undefined; // Clear the token fields
		user.emailVerificationExpires = undefined;
		await user.save();

		// TODO: Edit or remove
		res.send('Email successfully verified! You can now log in.');
	} catch (error) {
		res.status(500).send('An error occurred during email verification: ' + error.message);
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
		if (process.env.NODE_ENV !== 'test') {
			console.error('Logout error:', error);
		}
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
	cleanupExpiredTokens,
	cleanupIntervalId
};
