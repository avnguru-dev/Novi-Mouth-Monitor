# Novi Mouth Monitor — Stream-to-backend demo

This branch adds a minimal Node.js backend and frontend demo that streams microphone audio from the page to a server, performs a simple RMS-based mouth-open detection on the server (via ffmpeg-decoded PCM), and sends Web Push notifications to the client (service worker) when a mouth-open event is detected.

Files added
- server.js — Express + ws WebSocket server, ffmpeg decode, RMS detection, web-push notification sending
- package.json — dependencies + start script
- public/index.html — simple UI
- public/main.js — client logic: register SW, subscribe push, stream MediaRecorder blobs to server via WebSocket
- public/sw.js — service worker to show notifications

Important setup notes
1. Install ffmpeg on the server machine and ensure `ffmpeg` is available on PATH.
2. Generate VAPID keys for Web Push (example using node):

   node -e "const webpush=require('web-push');console.log(webpush.generateVAPIDKeys())"

   Save the public/private key pair.

3. Set environment variables before running the server:

   export VAPID_PUBLIC=<your_public_key>
   export VAPID_PRIVATE=<your_private_key>
   export VAPID_SUBJECT=mailto:you@example.com

4. Install and run:

   npm install
   npm start

5. Open http://localhost:3000 in Chrome. Click "Register Service Worker & Subscribe Push" and grant notifications. Then click "Start Streaming". Switch to another tab and test mouth-open detection.

Notes & next steps
- This demo stores subscriptions in memory (Map). For production persist them to a database.
- The RMS threshold (in server.js) and debounce interval should be tuned for your environment.
- For lower latency and better streaming, consider using WebRTC + a media server (mediasoup, Janus) instead of MediaRecorder + ffmpeg.
- The VAPID private key is never committed; the public key is exposed via the /vapidPublic endpoint so the client can retrieve it at runtime.
