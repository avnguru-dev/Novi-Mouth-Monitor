// Minimal server: Express static + endpoint to save subscription + WebSocket audio receiver + ffmpeg decode + RMS detection + web-push notifications
const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const webpush = require('web-push');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

const SUBSCRIPTIONS = new Map(); // subId -> subscription JSON

// Set VAPID from env
const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:you@example.com';
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('VAPID_PUBLIC and VAPID_PRIVATE must be set in environment.');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// Expose VAPID public key to client (safe to expose public key)
app.get('/vapidPublic', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

// Save subscription endpoint
app.post('/save-subscription', (req, res) => {
  const subscription = req.body;
  const id = uuidv4();
  SUBSCRIPTIONS.set(id, subscription);
  console.log('Saved subscription', id);
  res.json({ id });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/audio' });

// Per-connection state
wss.on('connection', (ws, req) => {
  // Expect subId as query param: ws://host/audio?subId=...
  const url = new URL(req.url, `http://${req.headers.host}`);
  const subId = url.searchParams.get('subId');

  const subscription = SUBSCRIPTIONS.get(subId);
  if (!subscription) {
    ws.send(JSON.stringify({ error: 'missing subscription; please POST /save-subscription first' }));
    ws.close();
    return;
  }
  console.log('WebSocket audio connected for subId', subId);

  // spawn ffmpeg to decode incoming webm/opus blobs to s16le PCM mono 16k
  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    '-ac', '1',
    '-ar', '16000',
    'pipe:1'
  ]);

  ffmpeg.on('error', (err) => {
    console.error('ffmpeg error', err);
  });
  ffmpeg.stdin.on('error', (err) => { /* ignore if client closes */ });

  // We'll buffer PCM bytes and compute RMS for windows of ~0.4s
  const SAMPLE_RATE = 16000;
  const WINDOW_SECONDS = 0.4;
  const BYTES_PER_SAMPLE = 2; // s16le
  const WINDOW_BYTES = Math.floor(SAMPLE_RATE * WINDOW_SECONDS * BYTES_PER_SAMPLE);

  let pcmBuffer = Buffer.alloc(0);
  let lastNotifyMs = 0;
  const NOTIFY_MIN_INTERVAL_MS = 8000; // 8s between notifications (debounce)

  ffmpeg.stdout.on('data', (chunk) => {
    pcmBuffer = Buffer.concat([pcmBuffer, chunk]);

    while (pcmBuffer.length >= WINDOW_BYTES) {
      const windowBuf = pcmBuffer.slice(0, WINDOW_BYTES);
      pcmBuffer = pcmBuffer.slice(WINDOW_BYTES);

      // compute RMS from s16le
      let sumSq = 0;
      const sampleCount = windowBuf.length / BYTES_PER_SAMPLE;
      for (let i = 0; i < windowBuf.length; i += 2) {
        const sample = windowBuf.readInt16LE(i) / 32768; // normalize [-1,1]
        sumSq += sample * sample;
      }
      const rms = Math.sqrt(sumSq / sampleCount);

      // Detection threshold: tune this for your environment
      const THRESH = 0.12; // example threshold for mouth open (tweak)
      if (rms > THRESH) {
        const now = Date.now();
        if (now - lastNotifyMs > NOTIFY_MIN_INTERVAL_MS) {
          lastNotifyMs = now;
          // send push notification
          const payload = JSON.stringify({
            title: 'Mouth open',
            body: `Detected mouth-open (rms=${rms.toFixed(3)})`
          });
          webpush.sendNotification(subscription, payload).catch(err => {
            console.error('webpush send error', err);
            // If subscription expired or invalid, remove it
            if (err.statusCode === 410 || err.statusCode === 404) {
              console.log('Removing subscription', subId);
              SUBSCRIPTIONS.delete(subId);
            }
          });
          console.log('Notify sent (rms=', rms.toFixed(3), ')');
        }
      }
    }
  });

  ws.on('message', (message) => {
    // Expect binary chunks (webm blob arraybuffers)
    if (typeof message === 'string') return;
    // write raw blob bytes into ffmpeg stdin
    ffmpeg.stdin.write(message);
  });

  ws.on('close', () => {
    try { ffmpeg.kill('SIGKILL'); } catch (e) {}
    console.log('WS closed for', subId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT} (static files)`);
  console.log(`Ensure ffmpeg is installed and VAPID env vars are set`);
});
