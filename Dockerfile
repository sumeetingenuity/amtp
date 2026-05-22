# ============================================================
# AMTP Server — Multi-Stage Production Dockerfile
# Stage 1: build dependencies
# Stage 2: production runtime image
# ============================================================

# ---------- Stage 1 — Builder ----------
FROM node:20-alpine AS builder

# Install git (needed by some npm packages) and build tools if needed
RUN apk add --no-cache git python3 make g++

# Set working directory
WORKDIR /app

# Copy package manifests first for layer caching
COPY package*.json tsconfig*.json jest.config*.json ./

# Install dependencies (include dev for ts-jest during build step)
RUN npm ci --include=dev --ignore-scripts

# Copy the rest of the application source
COPY . .

# Build the project (omit type-check — already validated in CI)
RUN npm run build

# ---------- Stage 2 — Runtime ----------
FROM node:20-alpine AS runtime

# ---- Security: run as non-root user ----
# Create a dedicated, non-privileged user and group before switching
RUN addgroup -S amtp && adduser -S amtp -G amtp
WORKDIR /app

# Copy only production node modules from builder
COPY --from=builder /app/node_modules ./node_modules
# Copy compiled output and required source files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
# Copy package manifests for completeness
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/jest.config*.json ./

# Create directory for logs with amtp user as owner
RUN mkdir -p /app/logs && chown -R amtp:amtp /app

# Switch to non-root user
USER amtp

# Expose AMTP port
EXPOSE 3000

# Health check — probe the root endpoint every 30 seconds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/',(r)=>{process.exit(r.statusCode===200?0:1)})" \
  || exit 1

# Environment
ENV NODE_ENV=production

# Start the server (entrypoint taken from package.json scripts)
CMD ["node", "dist/server/basic-server.js"]
