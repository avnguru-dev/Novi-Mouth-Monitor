FROM node:18-bullseye

# Install ffmpeg for decoding audio
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production deps
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy app
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
