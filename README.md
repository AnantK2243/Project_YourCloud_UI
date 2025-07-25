# YourCloud

A secure, distributed cloud storage application with Angular frontend and modular Express backend architecture.

## Features

- **Security**: User registration and login with bcrypt password hashing
- **Authentication**: JWT-based tokens with automatic blacklisting and 24h expiration
- **File Storage**: Encrypted chunked file upload/download with multi-frame support
- **Real-time Communication**: WebSocket connections with storage node coordination
- **Enhanced Security**: HTTPS/SSL, rate limiting, input validation, and security headers
- **Performance**: Connection pooling, optimized database indexing, and caching
- **Monitoring**: Storage node health checks and real-time status updates
- **Modular Architecture**: Clean separation of concerns with organized codebase

## Architecture

### **Frontend**

- **Framework**: Angular 19 with TypeScript
- **Styling**: CSS with Angular Material design principles
- **Build**: Angular CLI with SSR (Server-Side Rendering)
- **Development**: Hot reload with automatic rebuild on file changes

### **Backend (Modular Architecture)**

```
server.js                    # Main entry point & configuration
├── src/
│   ├── routes/
│   │   ├── auth.js         # Authentication endpoints
│   │   └── storage.js      # Storage & node management
│   ├── models/
│   │   └── User.js         # MongoDB schemas (User & StorageNode)
│   ├── websocket/
│   │   └── SecureWebSocketManager.js  # WebSocket handling
│   ├── middleware/
│   │   └── auth.js         # JWT middleware
│   └── utils/
│       └── validation.js   # Input validation utilities
└── ssl/                    # SSL certificates
```

### **Database & Infrastructure**

- **Database**: MongoDB Atlas with optimized indexing
- **Authentication**: JWT with secure token blacklisting
- **Security**: Helmet, CORS, rate limiting, input sanitization
- **WebSocket**: Binary message support with frame reconstruction
- **Validation**: Comprehensive server-side validation

### **Development Scripts**

- **`npm start`** - Concurrent Angular watch + server restart
- **`npm run dev`** - Traditional build-then-watch approach
- **`npm run build`** - Production build
- **`npm run serve:prod`** - Production server

## API Endpoints

### **Authentication**

- `POST /api/register` - User registration with validation
- `POST /api/login` - User login with rate limiting
- `POST /api/logout` - Secure logout with token blacklisting

### **Storage Node Management**

- `GET /api/nodes` - Get user's registered storage nodes
- `POST /api/nodes` - Register new storage node with auto-generated credentials
- `GET /api/nodes/:nodeId/status` - Check storage node status and connectivity
- `DELETE /api/nodes/:nodeId` - Delete storage node

### **Chunk Operations**

- `POST /api/nodes/:nodeId/chunks/:chunkId` - Store file chunks (direct binary upload)
- `GET /api/nodes/:nodeId/chunks/:chunkId` - Retrieve file chunks
- `DELETE /api/nodes/:nodeId/chunks/:chunkId` - Delete file chunks

### **Upload/Download Sessions**

- `POST /api/nodes/:nodeId/chunks/upload-sessions` - Create upload session
- `PUT /api/nodes/:nodeId/chunks/:chunkId` - Complete upload and store chunk
- `POST /api/nodes/:nodeId/chunks/:chunkId/download-sessions` - Create download session
- `DELETE /api/nodes/:nodeId/chunks/:chunkId/download-sessions` - Complete download and cleanup

### **System Health**

- `GET /api/health-check` - Comprehensive API health status
- `GET /health` - Simple health check endpoint

## Project Structure

```
user_interface/
├── src/                          # Angular frontend
│   ├── app/                      # Angular components
│   ├── routes/                   # Express API routes
│   ├── models/                   # MongoDB schemas
│   ├── websocket/                # WebSocket management
│   ├── middleware/               # Express middleware
│   └── utils/                    # Utility functions
├── dist/                         # Built Angular app
├── ssl/                          # SSL certificates
├── server.js                     # Main server entry point
├── nodemon.json                  # Development auto-restart config
└── package.json                  # Dependencies and scripts
```

**Built using Angular, Express.js, and MongoDB**
