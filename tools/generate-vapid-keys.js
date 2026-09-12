/* generate-vapid-keys.js
   Paste this into Chrome DevTools → Sources → Snippets → New snippet,
   or open the raw file and copy the whole contents into the Console.

   Usage (DevTools Snippet):
   1. Open any HTTPS page in Chrome.
   2. F12 → Sources → Snippets → New snippet → name: generate-vapid-keys.js
   3. Paste the contents of this file into the snippet and Run.
   4. In Console you'll see a JSON object with publicKey and privateKey.

   IMPORTANT: Keep the privateKey secret. Do NOT share it publicly.
*/
(function(){
  function b64urlToUint8Array(b64u){
    var pad = '='.repeat((4 - (b64u.length % 4)) % 4);
    var b64 = (b64u + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  function uint8ArrayToBase64Url(arr){
    var s = '';
    for (var i = 0; i < arr.length; ++i) s += String.fromCharCode(arr[i]);
    var b64 = btoa(s);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  (function generate(){
    // Generate P-256 keypair and export to web-push friendly base64url strings
    crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify'])
    .then(function(kp){
      return Promise.all([
        crypto.subtle.exportKey('jwk', kp.publicKey),
        crypto.subtle.exportKey('jwk', kp.privateKey)
      ]);
    })
    .then(function(results){
      var pubJwk = results[0], privJwk = results[1];
      var x = b64urlToUint8Array(pubJwk.x);
      var y = b64urlToUint8Array(pubJwk.y);
      var pubRaw = new Uint8Array(1 + x.length + y.length);
      pubRaw[0] = 0x04;
      pubRaw.set(x, 1);
      pubRaw.set(y, 1 + x.length);
      var publicKey = uint8ArrayToBase64Url(pubRaw);
      var privateKey = privJwk.d;
      var obj = { publicKey: publicKey, privateKey: privateKey };
      // Print JSON so you can select and copy cleanly
      console.log('--- VAPID KEYS (copy everything between the lines) ---');
      console.log(JSON.stringify(obj, null, 2));
      console.log('--- END VAPID KEYS ---');
    })
    .catch(function(err){
      console.error('VAPID key generation failed:', err);
    });
  })();
})();
