FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY server.js agent.json ./

# Expose port 80
EXPOSE 80

# Start server
CMD ["node", "server.js"]
