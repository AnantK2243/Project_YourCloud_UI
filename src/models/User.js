// src/app/models/User.js

// Database models
const mongoose = require('mongoose');

// Storage Node Schema
const StorageNodeSchema = new mongoose.Schema({
	node_name: String,
	node_id: { type: String, unique: true, required: true },
	auth_token: String,
	status: { type: String, default: 'offline' },
	total_available_space: { type: Number, default: 0 },
	used_space: { type: Number, default: 0 },
	num_chunks: { type: Number, default: 0 },
	last_seen: { type: Date, default: Date.now },
	owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// User Schema for authentication
const UserSchema = new mongoose.Schema({
	name: { type: String, required: true, maxlength: 50 },
	email: {
		type: String,
		unique: true,
		required: true,
		lowercase: true,
		maxlength: 100
	},
	password: { type: String, required: true },
	salt: { type: String, required: true },
	storage_nodes: [{ type: String }],
	created_at: { type: Date, default: Date.now },
	last_login: { type: Date },
	failed_login_attempts: { type: Number, default: 0 },
	account_locked_until: { type: Date }
});

// Add indexes for better performance
UserSchema.index({ created_at: 1 });
StorageNodeSchema.index({ owner_user_id: 1 });

const StorageNode = mongoose.model('StorageNode', StorageNodeSchema);
const User = mongoose.model('User', UserSchema);

module.exports = {
	StorageNode,
	User
};
