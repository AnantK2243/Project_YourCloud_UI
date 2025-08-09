// File: src/utils/emailService.js - Nodemailer verification email sender utility

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS
	}
});

/**
 * Send account verification email unless running in test environment.
 * @param {string} userEmail Target recipient address.
 * @param {string} token One-time verification token (included in link).
 * @returns {Promise<void>} Resolves when email dispatched (or skipped in test).
 */
async function sendVerificationEmail(userEmail, token) {
	// Skip email sending in test environment
	if (process.env.NODE_ENV === 'test') {
		console.log(`Test mode: Would send verification email to ${userEmail} with token ${token}`);
		return;
	}

	const verificationLink = `https://project-yourcloud.me/api/verify-email?token=${token}`;

	const mailOptions = {
		from: process.env.EMAIL_USER,
		to: userEmail,
		subject: 'Verify Your Email for Project-YourCloud',
		html: `<p>Thank you for signing up! Please click the link below to verify your email:</p>
                <a href="${verificationLink}">Verify Now</a>
                <p>This link will expire in 1 hour.</p>`
	};

	await transporter.sendMail(mailOptions);
}

module.exports = { sendVerificationEmail };
