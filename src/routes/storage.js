// Storage and Node management routes
const express = require('express');
const {
	S3Client,
	GetObjectCommand,
	PutObjectCommand,
	DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const bcrypt = require('bcryptjs');
const { authenticateToken } = require('./auth');
const { StorageNode, User } = require('../models/User');

const router = express.Router();

const s3Client = new S3Client({
	region: 'auto',
	endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: process.env.R2_ACCESS_KEY_ID,
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
	}
});

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Cache for node status reports
const nodeStatusCache = new Map(); // nodeId -> { status, timestamp }
const nodeStatusCacheOnlineTTL = 60 * 1000; // 1 minute
const nodeStatusCacheOfflineTTL = 30 * 60 * 1000; // 30 minutes

// Cache for user ownership validation
const userOwnershipCache = new Map(); // userId -> { nodeIds: Set, timestamp }
const userOwnershipCacheTTL = 60 * 60 * 1000; // 1 hour

// Clean up expired cache entries
function cleanupNodeStatusCache() {
	const now = Date.now();
	for (const [nodeId, entry] of nodeStatusCache) {
		const isOnline = entry.status && entry.status.status === 'online';
		const ttl = isOnline ? nodeStatusCacheOnlineTTL : nodeStatusCacheOfflineTTL;

		if (now - entry.timestamp > ttl) {
			nodeStatusCache.delete(nodeId);
		}
	}
}

// Clean up expired user ownership cache entries
function cleanupUserOwnershipCache() {
	const now = Date.now();
	for (const [userId, entry] of userOwnershipCache) {
		if (now - entry.timestamp > userOwnershipCacheTTL) {
			userOwnershipCache.delete(userId);
		}
	}
}


// Clean up caches every 30 minutes
let cacheCleanupInterval;
if (process.env.NODE_ENV !== 'test') {
	cacheCleanupInterval = setInterval(() => {
		cleanupNodeStatusCache();
		cleanupUserOwnershipCache();
	}, 30 * 60 * 1000);
}

// Helper functions to get WebSocket manager instances
function getWSManager(req) {
	return req.app.locals.wsManager;
}

function getNodeConnections(req) {
	return getWSManager(req).getNodeConnections();
}

function getPendingCommands(req) {
	return getWSManager(req).getPendingCommands();
}

// Generate unique command IDs
function generateCommandId(req) {
	const pendingCommands = getPendingCommands(req);
	let attempts = 0;
	const maxAttempts = 100; // Prevent infinite recursion

	while (attempts < maxAttempts) {
		const id = 'cmd-' + require('crypto').randomBytes(8).toString('hex');

		if (!pendingCommands.has(id)) {
			return id;
		}

		attempts++;
	}

	// If we can't generate a unique ID after maxAttempts, throw an error
	throw new Error('Unable to generate unique command ID');
}

// Validates user owns the storage node
async function validateUserOwnsNode(req, userId, nodeId, requireConnection = true) {
	try {
		// Check ownership cache first
		const now = Date.now();
		if (userOwnershipCache.has(userId)) {
			const cachedEntry = userOwnershipCache.get(userId);

			// Check if cache is still valid
			if (now - cachedEntry.timestamp < userOwnershipCacheTTL) {
				if (!cachedEntry.nodeIds.has(nodeId)) {
					throw new Error('User does not own this storage node');
				}
			} else {
				// Cache expired, remove it
				userOwnershipCache.delete(userId);
			}
		}

		// If not in cache or cache expired, fetch from database
		if (!userOwnershipCache.has(userId)) {
			const user = await User.findById(userId);
			if (!user || !user.storage_nodes) {
				throw new Error('User does not own this storage node');
			}

			// Update cache with user's node ownership
			userOwnershipCache.set(userId, {
				nodeIds: new Set(user.storage_nodes),
				timestamp: now
			});

			// Check ownership after fetching from DB
			if (!user.storage_nodes.includes(nodeId)) {
				throw new Error('User does not own this storage node');
			}
		}

		if (requireConnection) {
			const nodeConnections = getNodeConnections(req);
			const ws = nodeConnections.get(nodeId);
			if (!ws || ws.readyState !== 1) {
				throw new Error(`Storage node ${nodeId} is not connected`);
			}
		}

		return true;
	} catch (error) {
		if (error.message.includes('User does not own') || error.message.includes('not connected')) {
			throw error;
		}
		throw new Error(`Failed to validate node ownership: ${error.message}`);
	}
}

// Updates storage node status
async function updateNodeStatus(req, nodeId, forceUpdate = false) {
	try {
		const nodeConnections = getNodeConnections(req);
		const ws = nodeConnections.get(nodeId);
		const isConnected = ws && ws.readyState === 1;

		// Check cache first if not forcing update
		if (!forceUpdate && nodeStatusCache.has(nodeId)) {
			const cachedStatus = nodeStatusCache.get(nodeId);
			const cacheAge = Date.now() - cachedStatus.timestamp;

			// Use appropriate TTL based on connection status
			const ttl = isConnected ? nodeStatusCacheOnlineTTL : nodeStatusCacheOfflineTTL;

			if (cacheAge < ttl) {
				return {
					node_id: nodeId,
					status: isConnected ? 'online' : 'offline',
					total_available_space: cachedStatus.status.total_available_space || 0,
					used_space: cachedStatus.status.used_space || 0,
					num_chunks: cachedStatus.status.num_chunks || 0,
					last_seen: isConnected ? null : cachedStatus.status.last_seen || null
				};
			}

			// Cache expired, remove it
			nodeStatusCache.delete(nodeId);
		}

		if (isConnected) {
			try {
				const result = await sendStorageNodeCommand(req, nodeId, {
					command_type: 'STATUS_REQUEST'
				});

				if (result && result.type === 'STATUS_REPORT' && result.status) {
					// Update the cache with the new status
					const status = {
						node_id: nodeId,
						status: 'online',
						total_available_space: result.status.max_space_bytes || 0,
						used_space: result.status.used_space_bytes || 0,
						num_chunks: result.status.current_chunk_count || 0,
						last_seen: null
					};

					nodeStatusCache.set(nodeId, {
						status,
						timestamp: Date.now()
					});

					return status;
				}
			} catch (wsError) {
				// WebSocket command failed, fall through to database lookup
				if (process.env.NODE_ENV !== 'test') {
					console.warn(`WebSocket command failed for node ${nodeId}:`, wsError.message);
				}
			}
		}

		// If not connected or WebSocket command failed, fetch from DB
		const nodeInDb = await StorageNode.findOne({ node_id: nodeId });
		if (nodeInDb) {
			const nodeStatus = {
				node_id: nodeId,
				status: 'offline',
				total_available_space: nodeInDb.total_available_space || 0,
				used_space: nodeInDb.used_space || 0,
				num_chunks: nodeInDb.num_chunks || 0,
				last_seen: nodeInDb.last_seen || null
			};

			// Update the cache with the offline status
			nodeStatusCache.set(nodeId, {
				status: nodeStatus,
				timestamp: Date.now()
			});

			return nodeStatus;
		}

		// Node not found in database
		return null;
	} catch (error) {
		if (process.env.NODE_ENV !== 'test') {
			console.error(`Error updating node ${nodeId} status:`, error);
		}
		return null;
	}
}

// Send command to storage node and wait for response
async function sendStorageNodeCommand(req, nodeId, command, timeout = true, command_id = null) {
	return new Promise((resolve, reject) => {
		const nodeConnections = getNodeConnections(req);
		const pendingCommands = getPendingCommands(req);
		const ws = nodeConnections.get(nodeId);

		if (!ws || ws.readyState !== 1) {
			reject(new Error(`Storage node ${nodeId} is not connected`));
			return;
		}

		try {
			const commandId = command_id || generateCommandId(req);
			const fullCommand = {
				...command,
				command_id: commandId
			};

			let timeoutId = null;

			// Set up response handler
			pendingCommands.set(commandId, result => {
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				pendingCommands.delete(commandId);

				if (result.storage_delta !== undefined && result.storage_delta !== null) {
					// Force reupdate on future hits
					if (nodeStatusCache.has(nodeId)) {
						nodeStatusCache.delete(nodeId);
					}
				}
				resolve(result);
			});

			// Set timeout (30 seconds)
			if (timeout) {
				timeoutId = setTimeout(() => {
					if (pendingCommands.has(commandId)) {
						pendingCommands.delete(commandId);
						reject(new Error('Command timeout'));
					}
				}, 30000);
			}

			ws.send(JSON.stringify(fullCommand), err => {
				if (err) {
					if (timeoutId) {
						clearTimeout(timeoutId);
					}
					pendingCommands.delete(commandId);
					reject(err);
				}
			});
		} catch (error) {
			reject(error);
		}
	});
}

// Send store command with data
async function sendStoreCommand(req, nodeId, command, binaryData) {
	return new Promise((resolve, reject) => {
		(async () => {
			const nodeConnections = getNodeConnections(req);
			const pendingCommands = getPendingCommands(req);
			let commandId;
			let timeoutId = null;

			try {
				const ws = nodeConnections.get(nodeId);

				if (!ws || ws.readyState !== 1) {
					reject(new Error(`Storage node ${nodeId} is not connected`));
					return;
				}

				commandId = generateCommandId(req);
				const fullCommand = {
					...command,
					command_id: commandId
				};

				// Set up response handler
				pendingCommands.set(commandId, result => {
					if (timeoutId) {
						clearTimeout(timeoutId);
					}
					pendingCommands.delete(commandId);

					if (result.storage_delta !== undefined && result.storage_delta !== null) {
						// Force reupdate on future hits
						if (nodeStatusCache.has(nodeId)) {
							nodeStatusCache.delete(nodeId);
						}
					}
					resolve(result);
				});

				// Set timeout (30 seconds)
				timeoutId = setTimeout(() => {
					if (pendingCommands.has(commandId)) {
						pendingCommands.delete(commandId);
						reject(new Error('Command timeout'));
					}
				}, 30000);

				// Create combined binary message: [4 bytes: json_length][json][binary_data]
				const jsonString = JSON.stringify(fullCommand);
				const jsonBytes = Buffer.from(jsonString, 'utf8');

				// Create combined message buffer
				const combinedMessage = Buffer.alloc(4 + jsonBytes.length + binaryData.length);

				// Write JSON length as 4-byte little-endian integer
				combinedMessage.writeUInt32LE(jsonBytes.length, 0);

				// Write JSON command
				jsonBytes.copy(combinedMessage, 4);

				// Write binary data
				binaryData.copy(combinedMessage, 4 + jsonBytes.length);

				// Send as single binary WebSocket message
				ws.send(combinedMessage);
			} catch (error) {
				// Clean up pending command and timeout on error
				if (pendingCommands.has(commandId)) {
					pendingCommands.delete(commandId);
				}
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				reject(error);
			}
		})();
	});
}

// POST /api/nodes - Register a new storage node
router.post('/nodes', authenticateToken, async (req, res) => {
	try {
		const { node_name } = req.body;

		if (!node_name || !node_name.trim()) {
			return res.status(400).json({
				success: false,
				error: 'node_name is required'
			});
		}

		// Generate a random unused node_id
		let node_id;
		let isUnique = false;

		while (!isUnique) {
			node_id = require('crypto').randomBytes(8).toString('hex');
			const existingNode = await StorageNode.findOne({ node_id });
			if (!existingNode) {
				isUnique = true;
			}
		}

		const auth_token = require('crypto').randomBytes(64).toString('hex');

		// Hash the auth token before storing in database
		const hashedAuthToken = await bcrypt.hash(auth_token, 10);

		// Create new node with generated node_id and user-provided name
		const node = new StorageNode({
			node_name: node_name,
			node_id,
			auth_token: hashedAuthToken,
			status: 'offline',
			total_available_space: -1,
			used_space: 0,
			num_chunks: 0,
			last_seen: null,
			owner_user_id: req.user.userId // Associate node with the user
		});

		await node.save();

		// Set timeout to delete node if it doesn't connect
		setTimeout(
			async () => {
				try {
					// Check if node still exists and is offline
					const nodeCheck = await StorageNode.findOne({ node_id });
					if (
						nodeCheck &&
						nodeCheck.status === 'offline' &&
						nodeCheck.last_seen === null
					) {
						// Node never connected, remove it from database
						await StorageNode.deleteOne({ node_id });

						// Remove node_id from user's storage_nodes array
						await User.findByIdAndUpdate(req.user.userId, {
							$pull: { storage_nodes: node_id }
						});

						// Invalidate user ownership cache since we removed a node
						if (userOwnershipCache.has(req.user.userId)) {
							userOwnershipCache.delete(req.user.userId);
						}
					}
				} catch (error) {
					console.error('Error cleaning up unconnected node:', error);
				}
			},
			5 * 60 * 1000
		); // 5 minutes

		// Add the node_id to the user's storage_nodes array
		await User.findByIdAndUpdate(
			req.user.userId,
			{ $addToSet: { storage_nodes: node_id } },
			{ new: true }
		);

		// Invalidate user ownership cache since we added a new node
		if (userOwnershipCache.has(req.user.userId)) {
			userOwnershipCache.delete(req.user.userId);
		}

		res.status(201).json({
			success: true,
			data: {
				nodeId: node_id,
				authToken: auth_token,
				nodeName: node_name.trim()
			}
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: 'Failed to register node: ' + error.message
		});
	}
});

// GET /api/nodes - Get user's storage nodes
router.get('/nodes', authenticateToken, async (req, res) => {
	try {
		const user = await User.findById(req.user.userId);

		if (!user) {
			return res.status(404).json({
				success: false,
				message: 'User not found'
			});
		}

		// Get detailed information about each storage node
		const storageNodes = await StorageNode.find({
			node_id: { $in: user.storage_nodes }
		})
			.select('-auth_token')
			.select('-owner_user_id'); // Exclude auth_token and owner_user_id for security

		res.json({
			success: true,
			data: storageNodes
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Failed to fetch storage nodes: ' + error.message
		});
	}
});

// GET /api/nodes/:nodeId/status - Check storage node status
router.get('/nodes/:nodeId/status', authenticateToken, async (req, res) => {
	try {
		const { nodeId } = req.params;
		if (!nodeId) {
			throw new Error('nodeId is required');
		}

		const nodeStatus = await updateNodeStatus(req, nodeId);
		if (!nodeStatus) {
			throw new Error(`Failed to update status for node ${nodeId}`);
		}
		res.json({
			success: true,
			data: nodeStatus
		});
	} catch (error) {
		if (error.message.includes('required')) {
			res.status(400).json({
				success: false,
				error: error.message
			});
		} else if (error.message.includes('Failed to update status')) {
			res.status(500).json({
				success: false,
				error: error.message
			});
		} else {
			res.status(500).json({
				success: false,
				error: 'Failed to check node status: ' + error.message
			});
		}
	}
});

// DELETE /api/nodes/:nodeId - Delete storage node
router.delete('/nodes/:nodeId', authenticateToken, async (req, res) => {
	try {
		const { nodeId } = req.params;
		if (!nodeId) {
			throw new Error('nodeId is required');
		}

		// Find the node in the database first
		const node = await StorageNode.findOne({ node_id: nodeId });
		if (!node) {
			return res.status(404).json({
				success: false,
				error: 'Node not found'
			});
		}

		// Validate user owns the node (don't require connection for deletion)
		await validateUserOwnsNode(req, req.user.userId, nodeId, false);

		// Delete the node from database
		await StorageNode.deleteOne({ node_id: nodeId });

		// Remove node_id from user's storage_nodes array
		await User.findByIdAndUpdate(req.user.userId, { $pull: { storage_nodes: nodeId } });

		// Invalidate user ownership cache since we removed a node
		if (userOwnershipCache.has(req.user.userId)) {
			userOwnershipCache.delete(req.user.userId);
		}

		// Remove from cache if present
		if (nodeStatusCache.has(nodeId)) {
			nodeStatusCache.delete(nodeId);
		}

		res.json({
			success: true,
			data: {
				nodeId,
				status: 'deleted'
			}
		});
	} catch (error) {
		if (error.message.includes('required')) {
			res.status(400).json({
				success: false,
				error: error.message
			});
		} else if (error.message.includes('does not own')) {
			res.status(403).json({
				success: false,
				error: 'Access denied'
			});
		} else {
			res.status(500).json({
				success: false,
				error: 'Failed to delete node: ' + error.message
			});
		}
	}
});

// POST /api/nodes/:nodeId/chunks/upload-sessions - Create upload session
router.post('/nodes/:nodeId/chunks/upload-sessions', authenticateToken, async (req, res) => {
	const { nodeId } = req.params;
	const { data_size } = req.body;

	try {
		await validateUserOwnsNode(req, req.user.userId, nodeId);
		const commandId = generateCommandId(req);

		const chunkIdResponse = await sendStorageNodeCommand(
			req,
			nodeId,
			{
				command_type: 'PREP_UPLOAD',
				data_size
			},
			true,
			commandId
		);

		if (!chunkIdResponse || !chunkIdResponse.success || !chunkIdResponse.chunk_id) {
			throw new Error('Failed to get a valid chunkId from the storage node.');
		}
		const { chunk_id: chunkId } = chunkIdResponse;

		const temporaryObjectName = `temp-${commandId}-${chunkId}`;

		const putCommand = new PutObjectCommand({
			Bucket: R2_BUCKET_NAME,
			Key: temporaryObjectName
		});
		const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 300 });

		res.status(201).json({
			success: true,
			data: {
				sessionId: commandId,
				chunkId,
				uploadUrl,
				temporaryObjectName,
				expiresIn: 300
			}
		});
	} catch (error) {
		if (process.env.NODE_ENV !== 'test') {
			console.error('[ERROR] Upload session creation failed:', error);
			console.error('[ERROR] Error stack:', error.stack);
		}
		res.status(500).json({ success: false, error: error.message });
	}
});

// POST /api/nodes/:nodeId/chunks/:chunkId - Store chunk (direct binary upload)
router.post(
	'/nodes/:nodeId/chunks/:chunkId',
	authenticateToken,
	express.raw({ type: 'application/octet-stream', limit: '64mb' }),
	async (req, res) => {
		try {
			const { nodeId, chunkId } = req.params;
			if (!nodeId || !chunkId) {
				throw new Error('Node ID and Chunk ID are required');
			}

			await validateUserOwnsNode(req, req.user.userId, nodeId);

			const chunkData = req.body;
			if (!chunkData || chunkData.length === 0) {
				throw new Error('No data provided');
			}

			// Send STORE_CHUNK command with binary data
			const result = await sendStoreCommand(
				req,
				nodeId,
				{
					command_type: 'STORE_CHUNK',
					chunk_id: chunkId,
					data_size: chunkData.length
				},
				chunkData
			);

			if (result.success && result.chunk_id) {
				res.status(201).json({
					success: true,
					data: {
						chunkId: result.chunk_id,
						status: 'stored'
					}
				});
			} else {
				throw new Error(result.error || 'Failed to store chunk');
			}
		} catch (error) {
			if (error.message.includes('required')) {
				res.status(400).json({
					success: false,
					error: error.message
				});
			} else if (error.message.includes('not connected')) {
				res.status(503).json({
					success: false,
					error: 'Storage node is not available'
				});
			} else if (error.message.includes('does not own')) {
				res.status(403).json({
					success: false,
					error: 'Access denied'
				});
			} else if (error.message.includes('Chunk ID already exists')) {
				res.status(409).json({
					success: false,
					error: 'Chunk ID already exists'
				});
			} else if (error.message.includes('Insufficient disk space.')) {
				res.status(507).json({
					success: false,
					error: error.message
				});
			} else {
				res.status(500).json({
					success: false,
					error: error.message || 'Internal Server Error'
				});
			}
		}
	}
);

// GET /api/nodes/:nodeId/chunks/:chunkId - Get chunk data
router.get('/nodes/:nodeId/chunks/:chunkId', authenticateToken, async (req, res) => {
	try {
		const { nodeId, chunkId } = req.params;
		if (!nodeId || !chunkId) {
			throw new Error('Node ID and Chunk ID are required');
		}

		await validateUserOwnsNode(req, req.user.userId, nodeId);

		// Send GET_CHUNK command
		const result = await sendStorageNodeCommand(req, nodeId, {
			command_type: 'GET_CHUNK',
			chunk_id: chunkId
		});

		if (result.success && result.data) {
			res.set('Content-Type', 'application/octet-stream');
			res.set('Content-Length', result.data.length.toString());
			res.send(result.data);
		} else {
			throw new Error(result.error || 'Chunk not found');
		}
	} catch (error) {
		if (error.message.includes('required')) {
			res.status(400).json({
				success: false,
				error: error.message
			});
		} else if (error.message.includes('not connected')) {
			res.status(503).json({
				success: false,
				error: 'Storage node is not available'
			});
		} else if (error.message.includes('does not own')) {
			res.status(403).json({
				success: false,
				error: 'Access denied'
			});
		} else if (error.message.includes('not found')) {
			res.status(404).json({
				success: false,
				error: error.message
			});
		} else {
			res.status(500).json({
				success: false,
				error: error.message || 'Internal Server Error'
			});
		}
	}
});

// DELETE /api/nodes/:nodeId/chunks/:chunkId - Delete chunk
router.delete('/nodes/:nodeId/chunks/:chunkId', authenticateToken, async (req, res) => {
	try {
		const { nodeId, chunkId } = req.params;
		if (!nodeId || !chunkId) {
			throw new Error('Node ID and Chunk ID are required');
		}

		await validateUserOwnsNode(req, req.user.userId, nodeId);

		// Send DELETE_CHUNK command to specific storage node
		const result = await sendStorageNodeCommand(req, nodeId, {
			command_type: 'DELETE_CHUNK',
			chunk_id: chunkId
		});

		if (result.success) {
			res.json({
				success: true,
				data: {
					chunkId,
					status: 'deleted'
				}
			});
		} else {
			throw new Error(result.error || 'Failed to delete chunk');
		}
	} catch (error) {
		if (error.message.includes('required')) {
			res.status(400).json({
				success: false,
				error: error.message
			});
		} else if (error.message.includes('not connected')) {
			res.status(503).json({
				success: false,
				error: 'Storage node is not available'
			});
		} else if (error.message.includes('does not own')) {
			res.status(403).json({
				success: false,
				error: 'Access denied'
			});
		} else if (error.message.includes('not found')) {
			res.status(404).json({
				success: false,
				error: error.message
			});
		} else {
			res.status(500).json({
				success: false,
				error: error.message || 'Internal Server Error'
			});
		}
	}
});

// PUT /api/nodes/:nodeId/chunks/:chunkId - Complete upload and store chunk
router.put('/nodes/:nodeId/chunks/:chunkId', authenticateToken, async (req, res) => {
	const { nodeId, chunkId } = req.params;
	const { temporaryObjectName } = req.body;

	if (!chunkId || !temporaryObjectName) {
		return res.status(400).json({
			success: false,
			error: 'chunkId and temporaryObjectName are required.'
		});
	}

	try {
		await validateUserOwnsNode(req, req.user.userId, nodeId);

		const getCommand = new GetObjectCommand({
			Bucket: R2_BUCKET_NAME,
			Key: temporaryObjectName
		});
		const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 300 });

		const storeResult = await sendStorageNodeCommand(
			req,
			nodeId,
			{
				command_type: 'DOWNLOAD_AND_STORE_CHUNK',
				chunk_id: chunkId,
				download_url: downloadUrl
			},
			false
		); // Don't timeout this command

		if (!storeResult || !storeResult.success) {
			throw new Error(storeResult.error || 'Storage node failed to store the chunk.');
		}

		const deleteCommand = new DeleteObjectCommand({
			Bucket: R2_BUCKET_NAME,
			Key: temporaryObjectName
		});
		await s3Client.send(deleteCommand);

		res.json({
			success: true,
			data: {
				chunkId,
				status: 'stored'
			}
		});
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

// POST /api/nodes/:nodeId/chunks/:chunkId/download-sessions - Create download session
router.post(
	'/nodes/:nodeId/chunks/:chunkId/download-sessions',
	authenticateToken,
	async (req, res) => {
		const { nodeId, chunkId } = req.params;

		try {
			await validateUserOwnsNode(req, req.user.userId, nodeId);

			const commandId = generateCommandId(req);
			const temporaryObjectName = `temp-${commandId}-${chunkId}`;

			const putCommand = new PutObjectCommand({
				Bucket: R2_BUCKET_NAME,
				Key: temporaryObjectName
			});
			const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 300 });

			// Tell the storage node to fetch the chunk from its disk and upload it to R2
			const uploadConfirmation = await sendStorageNodeCommand(
				req,
				nodeId,
				{
					command_type: 'RETRIEVE_AND_UPLOAD_CHUNK',
					chunk_id: chunkId,
					upload_url: uploadUrl
				},
				false,
				commandId
			); // No timeout for this command

			if (!uploadConfirmation || !uploadConfirmation.success) {
				throw new Error(
					uploadConfirmation.error || 'Storage node failed to upload the chunk.'
				);
			}

			// Once the storage node confirms the upload, create a pre-signed GET URL for the frontend
			const getCommand = new GetObjectCommand({
				Bucket: R2_BUCKET_NAME,
				Key: temporaryObjectName
			});
			const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 300 });

			// Respond to the frontend with the download link
			res.status(201).json({
				success: true,
				data: {
					sessionId: commandId,
					downloadUrl,
					temporaryObjectName,
					expiresIn: 300
				}
			});

			// Schedule cleanup after 10 minutes
			setTimeout(
				async () => {
					try {
						const deleteCommand = new DeleteObjectCommand({
							Bucket: R2_BUCKET_NAME,
							Key: temporaryObjectName
						});
						await s3Client.send(deleteCommand);
						console.log(`Cleaned up temporary download object: ${temporaryObjectName}`);
					} catch (error) {
						console.error(
							`Failed to cleanup temporary download object ${temporaryObjectName}:`,
							error
						);
					}
				},
				10 * 60 * 1000
			); // 10 minute cleanup
		} catch (error) {
			res.status(500).json({ success: false, error: error.message });
		}
	}
);

// DELETE /api/nodes/:nodeId/chunks/:chunkId/download-sessions - Complete download and cleanup
router.delete(
	'/nodes/:nodeId/chunks/:chunkId/download-sessions',
	authenticateToken,
	async (req, res) => {
		const { nodeId, chunkId } = req.params;
		const { temporaryObjectName } = req.body;

		if (!temporaryObjectName) {
			return res.status(400).json({
				success: false,
				error: 'temporaryObjectName is required.'
			});
		}

		try {
			await validateUserOwnsNode(req, req.user.userId, nodeId);

			// Delete the temporary object from R2
			const deleteCommand = new DeleteObjectCommand({
				Bucket: R2_BUCKET_NAME,
				Key: temporaryObjectName
			});

			await s3Client.send(deleteCommand);

			res.json({
				success: true,
				data: {
					chunkId,
					status: 'download_session_completed'
				}
			});
		} catch (error) {
			// Cleanup is non-critical as it will automatically be cleaned up later
			res.status(500).json({
				success: false,
				error: `Failed to cleanup temporary object: ${error.message}`
			});
		}
	}
);

// Function to clear the interval
function clearCacheCleanupInterval() {
	if (cacheCleanupInterval) {
		clearInterval(cacheCleanupInterval);
		cacheCleanupInterval = null;
	}
}

module.exports = {
	router,
	validateUserOwnsNode,
	updateNodeStatus,
	sendStorageNodeCommand,
	clearCacheCleanupInterval
};
