self.addEventListener("install", function(event) {
  console.log("Service Worker installed.");
  self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  console.log("Service Worker activated.");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", function(event) {

  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(function(clientList) {

      for (let client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
      }

    })
  );

});
