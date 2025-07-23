# Stage 1: Build Angular application
FROM node:20-alpine AS angular-builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the Angular application for production
RUN npm run build:prod

# Stage 2: Production runtime with both frontend and backend
FROM node:20-alpine AS production

# Install security updates and create user
RUN apk update && apk upgrade && \
    addgroup -g 1001 -S nodejs && \
    adduser -S yourcloud -u 1001 -G nodejs && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy all application files
COPY --from=angular-builder /app/dist ./dist
COPY ./src ./src
COPY server.js .env ./

# Create SSL directory and set permissions
RUN mkdir -p /app/ssl && chown -R yourcloud:nodejs /app

# Switch to non-root user
USER yourcloud

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4200/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Expose the port
EXPOSE 4200

# Start the backend server for container/production
CMD ["npm", "run", "prod"]
