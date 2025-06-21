FROM node:18-alpine AS angular-builder

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./
RUN npm ci --silent

# Copy source code
COPY . .

# Build the Angular application for production
RUN npm run build:prod

# Stage 2: Production runtime with both frontend and backend
FROM node:18-alpine

WORKDIR /app

# Create user and directories first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S yourcloud -u 1001 -G nodejs && \
    mkdir -p /app/ssl && \
    chown -R yourcloud:nodejs /app && \
    chmod 755 /app/ssl

# Copy package files and install production dependencies
COPY --chown=yourcloud:nodejs package*.json ./
RUN npm ci --only=production --silent && npm cache clean --force

# Copy built Angular files from previous stage
COPY --from=angular-builder --chown=yourcloud:nodejs /app/dist ./dist

# Copy backend server and environment files
COPY --chown=yourcloud:nodejs server.js .env ./

USER yourcloud

# Expose the frontend and websocket ports (backend port is internal only)
EXPOSE 4200 8080

# Set environment variables for production
ENV NODE_ENV=production

# Start the backend server for container/production
CMD ["npm", "run", "docker:prod"]
