// File: src/routes/apiResponse.js - Standard API success/error JSON builders

/**
 * Unified API response helpers.
 * Provides standardized success/error JSON payload builders for all routes.
 */

/**
 * Send a standardized success response.
 * @param {import('express').Response} res - Express response object.
 * @param {number} [status=200] - HTTP status code.
 * @param {string} [message] - Optional human-readable message.
 * @param {any} [data] - Optional data payload.
 * @returns {import('express').Response}
 */
function apiSuccess(res, status = 200, message, data) {
	const body = { success: true };
	if (message) {
		body.message = message;
	}
	if (data !== undefined) {
		body.data = data;
	}
	return res.status(status).json(body);
}

/**
 * Send a standardized error response.
 * @param {import('express').Response} res - Express response object.
 * @param {number} [status=500] - HTTP status code.
 * @param {string} [message='Request failed'] - Error message.
 * @param {object} [errors] - Optional validation/detail errors map.
 * @returns {import('express').Response}
 */
function apiError(res, status = 500, message = 'Request failed', errors) {
	const body = { success: false, message };
	if (errors) {
		body.errors = errors;
	}
	return res.status(status).json(body);
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------
module.exports = { apiSuccess, apiError };
