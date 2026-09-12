// Service worker that displays push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'Mouth open', body: 'You opened your mouth' };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data = { title: 'Mouth open', body: event.data.text() }; }
  }
  const opts = {
    body: data.body,
    tag: 'mouth-open',
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(data.title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // focus or open the client
  event.waitUntil(clients.matchAll({ type: 'window' }).then(clientList => {
    for (const client of clientList) {
      if (client.url && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow('/');
  }));
});
