self.addEventListener("install", function(event) {
  console.log("Notification service worker installed.");
  self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  console.log("Notification service worker activated.");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", function(event) {

  if (event.data === "MOUTH_OPEN_ALERT") {

    self.registration.showNotification("Posture Alert!", {
      body: "Your mouth has been open for too long.",
      requireInteraction: false,
      tag: "mouth-open-alert"
    });

  }

});
