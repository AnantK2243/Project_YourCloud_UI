# syntax=docker/dockerfile:1.6

# -------- Build Stage --------
FROM node:22-alpine AS builder
ENV CI=true
WORKDIR /app

# Upgrade npm to the latest version available
RUN npm i -g npm@latest && npm --version

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit --fund=false && npm cache clean --force

# Copy source code and build
COPY . .
RUN npm run build:prod

# -------- Deploy Stage --------
FROM node:22-alpine AS runtime

WORKDIR /app

RUN npm i -g npm@latest && npm --version

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline --no-audit --fund=false && npm cache clean --force

# Copy built application and server files
COPY --from=builder /app/dist ./dist
COPY --chown=node:node src ./src
COPY --chown=node:node server.js .

USER node
EXPOSE 4200
CMD ["node", "server.js"]
