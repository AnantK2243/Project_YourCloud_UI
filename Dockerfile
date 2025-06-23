FROM node:18-alpine AS angular-builder

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
COPY ./src ./src
COPY server.js .
COPY .env .

# Create SSL directory (certificates will be mounted via volume)
RUN mkdir -p /app/ssl

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S yourcloud -u 1001
RUN chown -R yourcloud:nodejs /app
RUN chmod 755 /app/ssl
USER yourcloud

# Expose the frontend and websocket ports (backend port is internal only)
EXPOSE 4200 8080

# Set environment variables for production
ENV NODE_ENV=production

# Start the backend server for container/production
CMD ["npm", "run", "docker:prod"]
