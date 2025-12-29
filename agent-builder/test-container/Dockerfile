# Agent Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build if needed
RUN npm run build || true

# Expose port 80 (required by agent-host)
EXPOSE 80

# Start the agent
CMD ["npm", "start"]
