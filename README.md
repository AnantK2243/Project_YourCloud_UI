# YourCloud - User Interface

A full-stack cloud storage application with Angular frontend, Express backend, and real-time WebSocket communication.

## Architecture Overview

This project combines multiple technologies into a unified system:

- **Frontend**: Angular 19 with TypeScript and SSL
- **Backend**: Express.js with REST API endpoints
- **Database**: MongoDB Atlas (cloud)
- **Real-time**: WebSocket server for storage node communication
- **Authentication**: JWT-based auth system
- **Deployment**: Docker containerization
- **SSL/TLS**: HTTPS and WSS encryption

## Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **Docker** (for containerization)
- **SSL Certificates** (in `ssl/` directory)
- **MongoDB Atlas** connection string

## Environment Configuration

Create a `.env` file in the root directory:

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
BACKEND_PORT=3000      # Express API server (internal)
FRONTEND_PORT=4200     # Angular app with HTTPS
WS_PORT=8080          # WebSocket server
JWT_SECRET=your-secret-key
CLOUDFLARE_TUNNEL_TOKEN=optional-tunnel-token
```

## 🚀 Development Workflow

### Option 1: Separate Servers (Recommended for Development)

```bash
# Terminal 1: Start Angular dev server with hot reload
npm start
# Runs on: https://localhost:4200 with SSL

# Terminal 2: Start Express backend
npm run start:backend
# Runs on: http://localhost:3000 (API) + wss://localhost:8080 (WebSocket)
```

### Option 2: Run Both Simultaneously

```bash
# Install concurrently first
npm install --save-dev concurrently

# Run both servers together
npm run dev
```

## 🐳 Production Deployment (Docker)

### Build and Run Container

```bash
# Build the Docker image
docker build -t yourcloud-ui .

# Run with Docker Compose (recommended)
docker-compose up --build

# Or run manually
docker run -p 4200:4200 -p 8080:8080 yourcloud-ui
```

### Container Workflow

1. **Build Stage**: Compiles Angular app with `ng build`
2. **Runtime Stage**: 
   - Installs production dependencies only
   - Copies built Angular files
   - Starts Express server with `SERVE_FRONTEND=true`
   - Serves both static Angular files AND API endpoints on HTTPS port 4200

## API Endpoints

### Authentication
- `POST /api/register` - User registration
- `POST /api/login` - User login
- `POST /api/logout` - User logout (blacklists JWT)

### Storage Management
- `GET /api/health-check` - Server health status
- `POST /api/register-node` - Register storage node
- `GET /api/user/storage-nodes` - Get user's storage nodes
- `POST /api/check-status` - Check storage node status

### WebSocket Events
- `AUTH` - Storage node authentication
- `COMMAND_RESULT` - Command execution results
- `STATUS_REPORT` - Node status updates

## Available Scripts

### Development
- `npm start` - Angular dev server with SSL
- `npm run start:backend` - Express backend only
- `npm run dev` - Both servers concurrently

### Building
- `npm run build` - Build Angular for development
- `npm run build:prod` - Build Angular for production
- `npm run watch` - Build with file watching

### Production
- `npm run serve:prod` - Production server (static build)
- `npm run docker:dev` - Container production server

### Testing
- `npm test` - Run unit tests
- `npm run serve:ssr:user_interface` - Server-side rendering

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly in both development and production modes
5. Submit a pull request

## License

This project is licensed under the MIT License.
