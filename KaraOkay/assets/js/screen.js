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

    /* ---- YouTube IFrame API -------------------------------------------- */

    window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player("ytPlayer", {
            host: "https://www.youtube.com",
            playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1 },
            events: {
                onReady: function () {
                    playerReady = true;
                    // If we restored a "now playing" song after a refresh, resume it.
                    if (state.nowPlaying) player.loadVideoById(state.nowPlaying.videoId);
                },
                onStateChange: function (e) {
                    if (e.data === YT.PlayerState.ENDED) playNext();
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
            if (playerReady && player) player.loadVideoById(state.nowPlaying.videoId);
        }
        render();
        broadcastState();
    }

    function showIdle(isIdle) {
        document.getElementById("idleScreen").hidden = !isIdle;
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
                if (msg.cmd === "play") player.playVideo();
                else if (msg.cmd === "pause") player.pauseVideo();
                else if (msg.cmd === "skip") playNext();
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

    socket.onMessage = function (msg) {
        // Only react to action messages from remotes; ignore our own "state" echoes.
        if (msg && msg.action) applyAction(msg);
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