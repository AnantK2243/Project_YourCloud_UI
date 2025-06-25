FROM node:18-alpine AS angular-builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the Angular application for production
RUN npm run build:prod

# Stage 2: Production runtime with both frontend and backend
FROM node:18-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source files
COPY --from=angular-builder /app/dist ./dist
COPY ./src ./src
COPY server.js .
COPY .env .

# Create SSL directory
RUN mkdir -p /app/ssl

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S yourcloud -u 1001
RUN chown -R yourcloud:nodejs /app
USER yourcloud

# Start the backend server for container/production
CMD ["npm", "run", "prod"]
