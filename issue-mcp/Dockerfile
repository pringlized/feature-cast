# Multi-stage Dockerfile for issue-mcp server with audio cast support

# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:20-alpine

# Install ffmpeg for audio processing
RUN apk add --no-cache ffmpeg

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy bin directory if it exists
COPY --chown=nodejs:nodejs bin ./bin

# Create data directory for database
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

# Environment variables with defaults
ENV NODE_ENV=production \
    ISSUE_DB_PATH=/app/data/issues.db \
    MCP_MODE=true \
    TTS_SERVER_URL=http://wyoming-piper:10200/api/tts \
    MAX_TRANSCRIPT_LENGTH=10000 \
    TTS_TIMEOUT_MS=30000 \
    FFMPEG_TIMEOUT_MS=60000 \
    AUDIO_DELAY_MS=500

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Expose port if needed (MCP uses stdio by default)
# EXPOSE 3000

# Start the MCP server
CMD ["node", "dist/index.js"]