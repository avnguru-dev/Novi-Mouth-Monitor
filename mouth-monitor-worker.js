// Background Web Worker for mouth monitoring
// Runs independently of the main thread - truly unstoppable!

let mouthOpenStartTime = null;
let notificationSent = false;
const ALERT_TIMEOUT = 1000; // 1 second

// Listen for messages from the main thread with mouth state
self.addEventListener('message', function(event) {
  const { prediction, confidence } = event.data;

  // Detect mouth open state
  if (prediction === "MOUTH OPEN" && confidence > 0.7) {
    
    if (mouthOpenStartTime === null) {
      mouthOpenStartTime = Date.now();
    }

    const openDuration = Date.now() - mouthOpenStartTime;

    // If mouth has been open for 1+ second and we haven't sent notification yet
    if (openDuration >= ALERT_TIMEOUT && !notificationSent) {
      
      // Send message back to main thread to trigger notification
      self.postMessage({
        type: 'SEND_NOTIFICATION',
        message: 'Mouth has been open for too long!'
      });

      notificationSent = true;
    }

  } else {
    // Mouth closed - reset timer
    mouthOpenStartTime = null;
    notificationSent = false;
  }
});
