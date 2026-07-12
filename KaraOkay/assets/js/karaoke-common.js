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

// Reconnect backoff: starts at 1s, doubles each failed attempt, caps at 10s.
Karaoke.RECONNECT_BASE_DELAY_MS = 1000;
Karaoke.RECONNECT_MAX_DELAY_MS = 10000;

// How often to ping while idle. Routers/firewalls often silently drop a
// WebSocket after a period of no traffic — no close frame is ever sent, so
// onclose never fires and nothing knows to reconnect. A page that sits
// mostly idle (like the screen, versus the remote which is used constantly)
// is the classic victim of this. Periodic traffic keeps the connection
// alive and, if it really is dead, surfaces the failure via onerror/onclose
// much sooner than "hope something eventually times out."
Karaoke.HEARTBEAT_INTERVAL_MS = 20000;

Karaoke.Socket = function (room) {
    this.room = room;
    this.ws = null;
    this.onOpen = function () { };
    this.onClose = function () { };
    this.onError = function () { };
    this.onMessage = function (/* msg */) { };
    // Optional hooks a page can use to show connection-status UI.
    this.onReconnecting = function (/* attempt, delayMs */) { };
    this.onReconnected = function () { };

    this._manualClose = false;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._hasConnectedBefore = false;
    this._heartbeatTimer = null;

    // Belt-and-suspenders: if the tab was backgrounded/throttled and missed
    // its reconnect timer, or the OS was asleep and the network just came
    // back, check as soon as we get a chance and reconnect immediately
    // instead of waiting for the next backoff tick.
    var self = this;
    this._onVisibilityChange = function () {
        if (document.visibilityState === "visible") self._nudgeIfDead();
    };
    this._onOnline = function () {
        self._nudgeIfDead();
    };
    document.addEventListener("visibilitychange", this._onVisibilityChange);
    window.addEventListener("online", this._onOnline);
};

Karaoke.Socket.prototype._nudgeIfDead = function () {
    if (this._manualClose) return;
    var isOpen = this.ws && this.ws.readyState === WebSocket.OPEN;
    if (isOpen) return;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    this.connect();
};

Karaoke.Socket.prototype.connect = function () {
    var self = this;

    // A fresh call to connect() (not an internal retry) means the caller
    // wants to be live again — cancel any pending retry and clear the flag.
    this._manualClose = false;
    if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
    }

    var url = Karaoke.Config.WS_URL + "?room=" + encodeURIComponent(this.room);
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = function (e) {
        var wasReconnect = self._reconnectAttempts > 0;
        self._reconnectAttempts = 0;
        self._hasConnectedBefore = true;
        self._startHeartbeat();
        if (wasReconnect) self.onReconnected();
        self.onOpen(e);
    };

    this.ws.onclose = function (e) {
        self._stopHeartbeat();
        self.onClose(e);
        if (self._manualClose) return; // Intentional close (e.g. "Leave") — don't retry.
        self._scheduleReconnect();
    };

    this.ws.onerror = function (e) {
        self.onError(e);
        // Don't schedule here too — onclose always follows onerror for a
        // WebSocket and would otherwise double up the retry timer.
    };

    this.ws.onmessage = function (e) {
        // Only binary frames carry our app messages; ignore stray text frames.
        if (!(e.data instanceof ArrayBuffer)) return;
        try {
            var msg = Karaoke.decodeMessage(e.data);
            // Heartbeats are just keep-alive noise — never surface them.
            if (msg && msg.action === "__ping") return;
            self.onMessage(msg);
        } catch (err) {
            // Ignore malformed payloads rather than crashing the party.
        }
    };
};

Karaoke.Socket.prototype._startHeartbeat = function () {
    this._stopHeartbeat();
    var self = this;
    this._heartbeatTimer = setInterval(function () {
        self.send({ action: "__ping" });
    }, Karaoke.HEARTBEAT_INTERVAL_MS);
};

Karaoke.Socket.prototype._stopHeartbeat = function () {
    if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
    }
};

Karaoke.Socket.prototype._scheduleReconnect = function () {
    var self = this;
    var delay = Math.min(
        Karaoke.RECONNECT_BASE_DELAY_MS * Math.pow(2, this._reconnectAttempts),
        Karaoke.RECONNECT_MAX_DELAY_MS
    );
    this._reconnectAttempts++;
    this.onReconnecting(this._reconnectAttempts, delay);

    this._reconnectTimer = setTimeout(function () {
        self.connect();
    }, delay);
};

Karaoke.Socket.prototype.send = function (obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(Karaoke.encodeMessage(obj).buffer);
};

Karaoke.Socket.prototype.close = function () {
    // A deliberate close (e.g. user hits "Leave") should NOT auto-reconnect.
    this._manualClose = true;
    this._stopHeartbeat();
    if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
    }
    if (this.ws) this.ws.close();
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    window.removeEventListener("online", this._onOnline);
};