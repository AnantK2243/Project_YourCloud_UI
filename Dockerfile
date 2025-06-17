FROM node:18-alpine as angular-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the Angular application for production
RUN npm run build

# Stage 2: Production runtime with both frontend and backend
FROM node:18-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy built Angular files from previous stage (SSR build)
COPY --from=angular-builder /app/dist ./dist

# Copy backend server and environment files
COPY server.js .
COPY .env .

# Copy SSL certificates
COPY ssl/ ./ssl/

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S yourcloud -u 1001
RUN chown -R yourcloud:nodejs /app
USER yourcloud

# Expose the frontend and websocket ports using env variables (backend port is internal only)
EXPOSE ${FRONTEND_PORT:-4200} ${WS_PORT:-8080}

# Health check using backend port from env
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD node -e "require('dotenv').config(); const port = process.env.BACKEND_PORT || 3000; require('http').get(\`http://localhost:\${port}/api/health-check\`, (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the backend server for container/production
CMD ["npm", "run", "docker:dev"]
