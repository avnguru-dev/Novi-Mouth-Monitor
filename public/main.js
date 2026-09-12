// Client: register SW, subscribe Push, send subscription to server, then start streaming via MediaRecorder -> WebSocket
const $ = (id) => document.getElementById(id);
const status = (s) => { console.log(s); const el = document.getElementById('status'); if (el) el.innerText = s; };

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

let subscriptionId = null;
let ws = null;
let mediaRecorder = null;

$('register').addEventListener('click', async () => {
  try {
    // register service worker
    const reg = await navigator.serviceWorker.register('/sw.js');
    status('Service worker registered');

    // request notification permission
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      status('Notification permission denied');
      return;
    }

    // fetch VAPID public key from server
    const r = await fetch('/vapidPublic');
    if (!r.ok) throw new Error('Failed to fetch VAPID public key');
    const { publicKey } = await r.json();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // send subscription to server
    const res = await fetch('/save-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
    const data = await res.json();
    subscriptionId = data.id;
    status('Push subscribed, subscriptionId=' + subscriptionId);
    $('start').disabled = false;
  } catch (err) {
    console.error(err);
    status('Error during registration: ' + err.message);
  }
});

$('start').addEventListener('click', async () => {
  if (!subscriptionId) {
    alert('Register push first');
    return;
  }
  // open ws to server with subId query param (use ws for localhost)
  const proto = (location.protocol === 'https:') ? 'wss' : 'ws';
  const wsUrl = `${proto}://${location.host}/audio?subId=${subscriptionId}`;
  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { status('WebSocket open, starting capture'); startCapture(); $('stop').disabled = false; $('start').disabled = true; };
  ws.onclose = () => { status('WebSocket closed'); stopCapture(); $('stop').disabled = true; $('start').disabled = false; };
  ws.onerror = (e) => { console.error('ws err', e); status('WebSocket error'); };
});

$('stop').addEventListener('click', () => {
  if (ws) ws.close();
  stopCapture();
  $('stop').disabled = true;
  $('start').disabled = false;
});

let localStream = null;
async function startCapture() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Use MediaRecorder to generate small webm/opus blobs
    mediaRecorder = new MediaRecorder(localStream, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        const ab = await e.data.arrayBuffer();
        ws.send(ab);
      }
    };
    mediaRecorder.start(900); // ~900ms chunks
    status('Recording & streaming');
  } catch (err) {
    console.error(err);
    status('getUserMedia error: ' + err.message);
  }
}
function stopCapture() {
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    status('Stopped capture');
  } catch (e) { console.error(e); }
}
