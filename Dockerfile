# A3 Worker (inspect / thumb / preview)
FROM node:21.7.1-slim

# ffmpeg/ffprobe for media processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy source
COPY . .

ENV NODE_ENV=production
# No ports exposed; worker pulls jobs from SQS
CMD ["node", "worker.js"]
