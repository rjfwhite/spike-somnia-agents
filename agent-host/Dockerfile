# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install Docker CLI to connect to remote Docker daemon
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create image-cache directory
RUN mkdir -p image-cache

# Environment variables (set these at runtime)
ENV NODE_ENV=production
# Required:
#   PRIVATE_KEY - Your wallet private key
#   DOCKER_HOST - Remote Docker daemon (e.g., tcp://10.128.0.2:2375)

# Cloud Run v2 health check port
ENV PORT=8080
EXPOSE 8080

# Run the agent host (includes health server on PORT)
CMD ["node", "dist/index.js"]

