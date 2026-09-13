FROM node:18-bullseye-slim

# Copy ffmpeg binary + libs from the ffmpeg image reference
COPY --from=jrottenberg/ffmpeg:5.1-ubuntu /usr/bin/ffmpeg /usr/bin/ffmpeg
COPY --from=jrottenberg/ffmpeg:5.1-ubuntu /usr/lib/x86_64-linux-gnu/ /usr/lib/x86_64-linux-gnu/

WORKDIR /app

# Install Node deps
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy app
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
