/* ==========================================================================
   Kara-Okay — shared config + WebSocket helper
   Uses BNet.WebSocket.Server. IMPORTANT: this server only auto-relays
   messages sent as BINARY frames to everyone else in the same room
   (see library docs, "Binary Frames" section). Plain text frames just
   fire OnReceived on the server and are NOT relayed without custom
   server-side code — and this project intentionally has no backend.
   So every message here is sent as a binary frame containing UTF-8 JSON.
   ========================================================================== */

var Karaoke = Karaoke || {};

Karaoke.Config = {
    // Fixed dev WebSocket endpoint per project setup.
    WS_URL: "ws://192.168.1.2:7892",

    // Get a key at https://console.cloud.google.com/apis/library/youtube.googleapis.com
    // then restrict it to the "YouTube Data API v3" + your site's HTTP referrer.
    YOUTUBE_API_KEY: "AIzaSyDNGM9EjT5-O2jkWrtofPiTWXI4VyjAX2c",

    ROOM_CODE_LENGTH: 5,
    // Excludes 0/O and 1/I so codes are easy to read & type on a phone.
    ROOM_CODE_CHARS: "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
};

Karaoke.generateRoomCode = function (length) {
    length = length || Karaoke.Config.ROOM_CODE_LENGTH;
    var chars = Karaoke.Config.ROOM_CODE_CHARS;
    var out = "";
    for (var i = 0; i < length; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
};

Karaoke.generateId = function () {
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
};

/* ---- binary <-> JSON helpers -------------------------------------------- */

Karaoke.encodeMessage = function (obj) {
    var json = JSON.stringify(obj);
    return new TextEncoder().encode(json); // Uint8Array, sent as a binary frame
};

Karaoke.decodeMessage = function (arrayBuffer) {
    var text = new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer));
    return JSON.parse(text);
};

/* ---- socket wrapper ------------------------------------------------------ */

Karaoke.Socket = function (room) {
    this.room = room;
    this.ws = null;
    this.onOpen = function () { };
    this.onClose = function () { };
    this.onError = function () { };
    this.onMessage = function (/* msg */) { };
};

Karaoke.Socket.prototype.connect = function () {
    var self = this;
    var url = Karaoke.Config.WS_URL + "?room=" + encodeURIComponent(this.room);
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = function (e) { self.onOpen(e); };
    this.ws.onclose = function (e) { self.onClose(e); };
    this.ws.onerror = function (e) { self.onError(e); };

    this.ws.onmessage = function (e) {
        // Only binary frames carry our app messages; ignore stray text frames.
        if (!(e.data instanceof ArrayBuffer)) return;
        try {
            var msg = Karaoke.decodeMessage(e.data);
            self.onMessage(msg);
        } catch (err) {
            // Ignore malformed payloads rather than crashing the party.
        }
    };
};

Karaoke.Socket.prototype.send = function (obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(Karaoke.encodeMessage(obj).buffer);
};

Karaoke.Socket.prototype.close = function () {
    if (this.ws) this.ws.close();
};