/* ==========================================================================
   Kara-Okay — Screen (Page 1)
   This page is the authoritative owner of the queue: it applies every
   action it receives, then re-broadcasts the resulting state so every
   remote (and itself) stays in sync. It also drives the YouTube player
   and auto-advances the queue when a video ends.
   ========================================================================== */

(function () {
    /* ---- Constants & State Storage --------------------------------------- */

    var STORAGE_ROOM_KEY = "karaokeScreenRoomCode";
    var STORAGE_STATE_KEY = "karaokeScreenState";

    var state = {
        nowPlaying: null,   // { id, singer, videoId, title, thumb }
        queue: []           // array of the same shape, in play order
    };

    var socket = null;
    var player = null;
    var playerReady = false;
    var audioUnlocked = false;
    var currentPausedBy = "";
    var heartbeatInterval = null;

    /* ---- Storage Initialization & Room Setup ----------------------------- */

    // Reuse this browser's existing room code if available to persist across reloads
    var roomCode = localStorage.getItem(STORAGE_ROOM_KEY);
    if (!roomCode) {
        roomCode = Karaoke.generateRoomCode();
        localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
    }

    /* ---- QR Code Generation ---------------------------------------------- */

    function generateQRCode() {
        let path = window.location.pathname;

        if (/KaraokeScreen/i.test(path)) {
            path = path.replace(/KaraokeScreen/i, "KaraokeRemote");
        } else if (path.endsWith("/")) {
            path += "KaraokeRemote";
        } else {
            path += "/KaraokeRemote";
        }

        const remoteUrl = window.location.origin +
            path +
            "?room=" + encodeURIComponent(roomCode);

        var qrContainer = document.getElementById("qrCode");
        if (!qrContainer) return;

        try {
            new QRCode(qrContainer, {
                text: remoteUrl,
                width: 90,
                height: 90,
                correctLevel: QRCode.CorrectLevel.L,
                useSVG: false,
                colorDark: "#000000",
                colorLight: "#FFFFFF"
            });
        } catch (err) {
            console.warn("QR Code generation failed:", err);
            qrContainer.innerHTML = '<div class="code-qr-error">QR unavailable</div>';
        }
    }

    function restoreState() {
        var saved = localStorage.getItem(STORAGE_STATE_KEY);
        if (!saved) return;
        try {
            var parsed = JSON.parse(saved);
            state.nowPlaying = parsed.nowPlaying || null;
            state.queue = parsed.queue || [];
        } catch (err) {
            // Ignore corrupt saved state and start fresh.
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify({
                nowPlaying: state.nowPlaying,
                queue: state.queue
            }));
        } catch (err) {
            // Storage full or restricted; skip persisting.
        }
    }

    /* ---- Overlay & UI Controls ------------------------------------------- */

    function showPauseOverlay(isPaused, pausedBy) {
        var overlay = document.getElementById("startOverlay");
        var btn = document.getElementById("startOverlayBtn");
        var hint = document.getElementById("startOverlayHint");
        var pausedByEl = document.getElementById("pausedByText");

        if (!overlay || !btn) return;

        if (isPaused) {
            btn.innerHTML = "&#9654; PAUSED - Tap to Resume";
            if (hint) hint.textContent = "Playback is currently paused.";

            if (pausedByEl) {
                var name = pausedBy || currentPausedBy || "Someone";
                pausedByEl.textContent = "Paused by " + name;
                pausedByEl.hidden = false;
            }
            overlay.hidden = false;
        } else {
            overlay.hidden = true;
            if (pausedByEl) pausedByEl.hidden = true;
            currentPausedBy = "";
        }
    }

    function wireStartOverlay() {
        var overlay = document.getElementById("startOverlay");
        var btn = document.getElementById("startOverlayBtn");
        if (!btn || !overlay) return;

        btn.addEventListener("click", function () {
            audioUnlocked = true;
            overlay.hidden = true;
            if (playerReady && player && state.nowPlaying) {
                player.playVideo();
            }
        });
    }

    function showIdle(isIdle) {
        var idleScreen = document.getElementById("idleScreen");
        if (idleScreen) idleScreen.hidden = !isIdle;
    }

    /* ---- YouTube IFrame API Integration ---------------------------------- */

    window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player("ytPlayer", {
            host: "https://www.youtube.com",
            playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1 },
            events: {
                onReady: function () {
                    playerReady = true;
                    if (state.nowPlaying) {
                        player.loadVideoById(state.nowPlaying.videoId);
                        if (audioUnlocked) player.playVideo();
                    }
                },
                onStateChange: function (e) {
                    if (e.data === YT.PlayerState.ENDED) {
                        showPauseOverlay(false);
                        playNext();
                    } else if (e.data === YT.PlayerState.PAUSED) {
                        showPauseOverlay(true, currentPausedBy);
                    } else if (e.data === YT.PlayerState.PLAYING) {
                        showPauseOverlay(false);
                    }
                },
                onError: function (e) {
                    handlePlaybackError(e.data);
                }
            }
        });
    };

    (function loadYouTubeApi() {
        var tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
    })();

    function handlePlaybackError(code) {
        var idleText = document.querySelector("#idleScreen p");
        var original = idleText ? idleText.textContent : null;

        showIdle(true);
        if (idleText) idleText.textContent = "That video isn't available \u2014 skipping to the next song\u2026";

        setTimeout(function () {
            if (idleText && original !== null) idleText.textContent = original;
            playNext();
        }, 2200);
    }

    /* ---- Queue Mechanics & Actions -------------------------------------- */

    function playNext() {
        showPauseOverlay(false);
        if (state.queue.length === 0) {
            state.nowPlaying = null;
            if (playerReady && player && typeof player.stopVideo === "function") {
                player.stopVideo();
            }
            showIdle(true);
        } else {
            state.nowPlaying = state.queue.shift();
            showIdle(false);
            if (playerReady && player) {
                player.loadVideoById(state.nowPlaying.videoId);
                if (audioUnlocked) player.playVideo();
            }
        }
        render();
        broadcastState();
    }

    function applyAction(msg) {
        switch (msg.action) {
            case "add":
                state.queue.push({
                    id: Karaoke.generateId(),
                    singer: msg.singer,
                    videoId: msg.videoId,
                    title: msg.title,
                    thumb: msg.thumb
                });
                if (!state.nowPlaying) playNext();
                else { render(); broadcastState(); }
                break;

            case "prioritize": {
                var idx = state.queue.findIndex(function (q) { return q.id === msg.id; });
                if (idx > 0) {
                    var item = state.queue.splice(idx, 1)[0];
                    state.queue.unshift(item);
                }
                render();
                broadcastState();
                break;
            }

            case "remove":
                state.queue = state.queue.filter(function (q) { return q.id !== msg.id; });
                render();
                broadcastState();
                break;

            case "reaction":
                if (msg.type) {
                    spawnReaction(msg.type);
                }
                break;

            case "control":
                if (!playerReady || !player) break;
                if (msg.cmd === "play") {
                    player.playVideo();
                }
                else if (msg.cmd === "pause") {
                    currentPausedBy = msg.singer || "Someone";
                    player.pauseVideo();
                    showPauseOverlay(true, currentPausedBy);
                }
                else if (msg.cmd === "skip") {
                    showPauseOverlay(false);
                    playNext();
                }
                else if (msg.cmd === "volume") {
                    if (typeof msg.level === "number") {
                        player.setVolume(msg.level);
                        if (msg.level === 0) {
                            if (typeof player.mute === "function") player.mute();
                        } else if (typeof player.isMuted === "function" && player.isMuted()) {
                            if (typeof player.unMute === "function") player.unMute();
                        }
                    }
                }
                break;

            case "requestState":
                broadcastState();
                break;
        }
    }

    /* ---- State Synchronization & Network --------------------------------- */

    function broadcastState() {
        saveState();
        if (socket) {
            socket.send({
                type: "state",
                nowPlaying: state.nowPlaying,
                queue: state.queue
            });
        }
    }

    function initSocket() {
        var connStatus = document.getElementById("connStatus");
        socket = new Karaoke.Socket(roomCode);

        socket.onMessage = function (msg) {
            if (msg && msg.action) applyAction(msg);
        };

        socket.onClose = function () {
            stopHeartbeat();
            if (connStatus) {
                connStatus.hidden = false;
                connStatus.className = "conn-status conn-status--reconnecting";
                connStatus.textContent = "Connection lost \u2014 reconnecting\u2026";
            }
        };

        socket.onReconnecting = function (attempt) {
            if (connStatus) {
                connStatus.hidden = false;
                connStatus.className = "conn-status conn-status--reconnecting";
                connStatus.textContent = "Reconnecting\u2026 (attempt " + attempt + ")";
            }
        };

        socket.onReconnected = function () {
            if (connStatus) {
                connStatus.hidden = false;
                connStatus.className = "conn-status conn-status--connected";
                connStatus.textContent = "Back online!";
                setTimeout(function () { connStatus.hidden = true; }, 2500);
            }
            broadcastState();
            startHeartbeat();
        };

        socket.connect();
    }

    /* ---- Heartbeat Mechanism -------------------------------------------- */

    function startHeartbeat() {
        stopHeartbeat();
        heartbeatInterval = setInterval(function () {
            if (socket) {
                socket.send({ action: "ping", timestamp: Date.now() });
                broadcastState();
            }
        }, 60000);
    }

    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }

    /* ---- Render UI ------------------------------------------------------- */

    function render() {
        var nameEl = document.getElementById("nowSingerName");
        var titleEl = document.getElementById("nowSongTitle");
        if (state.nowPlaying) {
            if (nameEl) nameEl.textContent = state.nowPlaying.singer || "Anonymous";
            if (titleEl) titleEl.textContent = state.nowPlaying.title;
        } else {
            if (nameEl) nameEl.textContent = "\u2014";
            if (titleEl) titleEl.textContent = "Nothing yet";
        }

        var list = document.getElementById("queueList");
        if (!list) return;

        list.innerHTML = "";
        if (state.queue.length === 0) {
            var li = document.createElement("li");
            li.className = "qempty";
            li.textContent = "No reservations yet \u2014 join on your phone to add a song.";
            list.appendChild(li);
            return;
        }

        state.queue.forEach(function (item, i) {
            var li = document.createElement("li");
            li.innerHTML =
                '<span class="qpos">' + (i + 1) + '</span>' +
                '<img class="qthumb" src="' + item.thumb + '" alt="">' +
                '<span class="qmeta">' +
                '<span class="qtitle">' + escapeHtml(item.title) + '</span>' +
                '<span class="qsinger">' + escapeHtml(item.singer || "Anonymous") + '</span>' +
                '</span>';
            list.appendChild(li);
        });
    }

    function escapeHtml(s) {
        var d = document.createElement("div");
        d.textContent = s == null ? "" : s;
        return d.innerHTML;
    }

    /* ---- Fullscreen Controls -------------------------------------------- */

    function initFullscreenControls() {
        var btn = document.getElementById('fullscreenBtn');
        var stage = document.querySelector('.stage');
        if (!btn) return;

        var expandIcon = btn.querySelector('.fullscreen-btn__icon--expand');
        var collapseIcon = btn.querySelector('.fullscreen-btn__icon--collapse');

        function isFullscreen() {
            return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
        }

        function updateIcon() {
            var fs = isFullscreen();
            if (expandIcon) expandIcon.hidden = fs;
            if (collapseIcon) collapseIcon.hidden = !fs;
            btn.title = fs ? 'Exit fullscreen' : 'Toggle fullscreen';
        }

        function requestFs(el) {
            if (el.requestFullscreen) return el.requestFullscreen();
            if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
            if (el.msRequestFullscreen) return el.msRequestFullscreen();
        }

        function exitFs() {
            if (document.exitFullscreen) return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            if (document.msExitFullscreen) return document.msExitFullscreen();
        }

        btn.addEventListener('click', function () {
            if (isFullscreen()) {
                exitFs();
            } else {
                requestFs(stage || document.documentElement);
            }
        });

        document.addEventListener('fullscreenchange', updateIcon);
        document.addEventListener('webkitfullscreenchange', updateIcon);
        document.addEventListener('msfullscreenchange', updateIcon);
    }

    /* ---- Live Reaction Floating Renderer -------------------------------- */
    function spawnReaction(emoji) {
        var container = document.getElementById("reactionContainer");
        if (!container) return;

        var reactionEl = document.createElement("div");
        reactionEl.className = "floating-reaction";
        reactionEl.textContent = emoji;

        // Randomize slight horizontal position jitter for natural floating effect
        var randomX = Math.floor(Math.random() * 60) - 30; // -30px to +30px
        reactionEl.style.right = (20 + randomX) + "px";

        container.appendChild(reactionEl);

        // Clean up DOM element after animation ends
        setTimeout(function () {
            if (reactionEl && reactionEl.parentNode) {
                reactionEl.parentNode.removeChild(reactionEl);
            }
        }, 2500);
    }
    /* ---- App Initialization --------------------------------------------- */

    function init() {
        var roomCodeEl = document.getElementById("roomCode");
        if (roomCodeEl) roomCodeEl.textContent = roomCode;

        generateQRCode();
        restoreState();
        wireStartOverlay();
        initFullscreenControls();
        initSocket();
        render();
        showIdle(!state.nowPlaying);
        startHeartbeat();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();