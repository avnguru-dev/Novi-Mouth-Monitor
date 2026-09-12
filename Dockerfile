FROM node:18-bullseye-slim

# Install ffmpeg for decoding audio
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production deps
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy app
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
