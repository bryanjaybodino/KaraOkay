/* ==========================================================================
   Kara-Okay — Screen (Page 1)
   This page is the authoritative owner of the queue: it applies every
   action it receives, then re-broadcasts the resulting state so every
   remote (and itself) stays in sync. It also drives the YouTube player
   and auto-advances the queue when a video ends.
   ========================================================================== */

(function () {
    var STORAGE_ROOM_KEY = "karaokeScreenRoomCode";
    var STORAGE_STATE_KEY = "karaokeScreenState";

    var state = {
        nowPlaying: null,   // { id, singer, videoId, title, thumb }
        queue: []            // array of the same shape, in play order
    };

    // Reuse this browser's existing room code if we have one, so refreshing
    // the screen doesn't hand everyone a new code mid-party. A different
    // browser/device (or cleared storage) will still get a fresh code.
    var roomCode = localStorage.getItem(STORAGE_ROOM_KEY);
    if (!roomCode) {
        roomCode = Karaoke.generateRoomCode();
        localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
    }
    document.getElementById("roomCode").textContent = roomCode;

    // Generate QR code pointing to the remote page with room code as query param
    (function generateQRCode() {
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
        try {
            new QRCode(qrContainer, {
                text: remoteUrl,
                width: 100,
                height: 100,
                correctLevel: QRCode.CorrectLevel.L,  // Lower error correction = simpler, faster to scan
                useSVG: false,                        // Canvas renders faster & scans better than SVG
                colorDark: "#000000",                 // Pure black for maximum contrast
                colorLight: "#FFFFFF"                 // Pure white background
            });
        } catch (err) {
            console.warn("QR Code generation failed:", err);
            qrContainer.innerHTML = '<div class="code-qr-error">QR unavailable</div>';
        }
    })();

    // Restore whatever queue/now-playing we last saved, so a refresh doesn't
    // wipe out songs that were already reserved.
    (function restoreState() {
        var saved = localStorage.getItem(STORAGE_STATE_KEY);
        if (!saved) return;
        try {
            var parsed = JSON.parse(saved);
            state.nowPlaying = parsed.nowPlaying || null;
            state.queue = parsed.queue || [];
        } catch (err) {
            // Ignore corrupt saved state and start fresh.
        }
    })();

    var socket = new Karaoke.Socket(roomCode);
    var player = null;
    var playerReady = false;
    var audioUnlocked = false;

    /* ---- one-time autoplay unlock -------------------------------------- */

    (function wireStartOverlay() {
        var overlay = document.getElementById("startOverlay");
        var btn = document.getElementById("startOverlayBtn");
        btn.addEventListener("click", function () {
            audioUnlocked = true;
            overlay.hidden = true;
            // If a song already loaded (or tried to) before this tap, it was
            // very likely blocked — this click is a real user gesture, so
            // kicking playVideo() now will actually start it.
            if (playerReady && player && state.nowPlaying) player.playVideo();
        });
    })();

    /* ---- YouTube IFrame API -------------------------------------------- */

    window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player("ytPlayer", {
            host: "https://www.youtube.com",
            playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1 },
            events: {
                onReady: function () {
                    playerReady = true;
                    // If we restored a "now playing" song after a refresh, resume it.
                    if (state.nowPlaying) {
                        player.loadVideoById(state.nowPlaying.videoId);
                        if (audioUnlocked) player.playVideo();
                    }
                },
                onStateChange: function (e) {
                    if (e.data === YT.PlayerState.ENDED) playNext();
                },
                onError: function (e) {
                    // 2 = bad video id, 5 = HTML5 player error, 100 = removed/private,
                    // 101 & 150 = embedding disabled by the video owner.
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

    /* ---- queue mechanics -------------------------------------------------- */

    function playNext() {
        if (state.queue.length === 0) {
            state.nowPlaying = null;
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

    function showIdle(isIdle) {
        document.getElementById("idleScreen").hidden = !isIdle;
    }

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

            case "control":
                if (!playerReady) break;
                if (msg.cmd === "play") {
                    player.playVideo();
                }
                else if (msg.cmd === "pause") {
                    player.pauseVideo();
                }
                else if (msg.cmd === "skip") {
                    player.pauseVideo();
                    playNext();
                }
                break;

            case "requestState":
                broadcastState();
                break;
        }
    }

    function broadcastState() {
        saveState();
        socket.send({
            type: "state",
            nowPlaying: state.nowPlaying,
            queue: state.queue
        });
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify({
                nowPlaying: state.nowPlaying,
                queue: state.queue
            }));
        } catch (err) {
            // Storage might be full/unavailable — not fatal, just skip persisting.
        }
    }

    /* ---- render ------------------------------------------------------------ */

    function render() {
        var nameEl = document.getElementById("nowSingerName");
        var titleEl = document.getElementById("nowSongTitle");
        if (state.nowPlaying) {
            nameEl.textContent = state.nowPlaying.singer || "Anonymous";
            titleEl.textContent = state.nowPlaying.title;
        } else {
            nameEl.textContent = "\u2014";
            titleEl.textContent = "Nothing yet";
        }

        var list = document.getElementById("queueList");
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

    /* ---- wire up socket ----------------------------------------------------- */

    var connStatus = document.getElementById("connStatus");

    socket.onMessage = function (msg) {
        // Only react to action messages from remotes; ignore our own "state" echoes.
        if (msg && msg.action) applyAction(msg);
    };

    socket.onClose = function () {
        connStatus.hidden = false;
        connStatus.className = "conn-status conn-status--reconnecting";
        connStatus.textContent = "Connection lost \u2014 reconnecting\u2026";
    };

    socket.onReconnecting = function (attempt) {
        connStatus.hidden = false;
        connStatus.className = "conn-status conn-status--reconnecting";
        connStatus.textContent = "Reconnecting\u2026 (attempt " + attempt + ")";
    };

    socket.onReconnected = function () {
        connStatus.hidden = false;
        connStatus.className = "conn-status conn-status--connected";
        connStatus.textContent = "Back online!";
        // Remotes may have missed updates while we were disconnected —
        // push the current state out again now that we're back.
        broadcastState();
        setTimeout(function () { connStatus.hidden = true; }, 2500);
    };

    function init() {
        socket.connect();
        render();
        showIdle(!state.nowPlaying);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();


(function () {
    var btn = document.getElementById('fullscreenBtn');
    var stage = document.querySelector('.stage');
    var expandIcon = btn.querySelector('.fullscreen-btn__icon--expand');
    var collapseIcon = btn.querySelector('.fullscreen-btn__icon--collapse');

    function isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    }

    function updateIcon() {
        var fs = isFullscreen();
        expandIcon.hidden = fs;
        collapseIcon.hidden = !fs;
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
})();