/* ==========================================================================
   Kara-Okay — Screen (Page 1)
   ========================================================================== */

(function () {
    var STORAGE_ROOM_KEY = "karaokeScreenRoomCode";
    var STORAGE_STATE_KEY = "karaokeScreenState";

    var state = {
        nowPlaying: null,
        queue: []
    };

    var socket = null;
    var player = null;
    var playerReady = false;
    var audioUnlocked = false;
    var currentPausedBy = "";
    var heartbeatInterval = null;
    var messageTimer = null;
    var timeCheckInterval = null;
    var popupTimer = null;

    // Track which threshold notifications have already triggered for the active song
    var notified60s = false;
    var notified30s = false;
    var notified10s = false;

    var roomCode = localStorage.getItem(STORAGE_ROOM_KEY);
    if (!roomCode) {
        roomCode = Karaoke.generateRoomCode();
        localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
    }

    function generateQRCode() {
        let path = window.location.pathname;

        if (/KaraokeScreen/i.test(path)) {
            path = path.replace(/KaraokeScreen/i, "KaraokeRemote");
        } else if (path.endsWith("/")) {
            path += "KaraokeRemote";
        } else {
            path += "/KaraokeRemote";
        }

        const remoteUrl = window.location.origin + path + "?room=" + encodeURIComponent(roomCode);
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
        } catch (err) { }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify({
                nowPlaying: state.nowPlaying,
                queue: state.queue
            }));
        } catch (err) { }
    }

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
            playerVars: {
                autoplay: 1,
                controls: 0,
                rel: 0,
                playsinline: 1,
                modestbranding: 1,
                iv_load_policy: 3
            },
            events: {
                onReady: function () {
                    playerReady = true;
                    if (state.nowPlaying) {
                        player.loadVideoById(state.nowPlaying.videoId);
                        if (audioUnlocked) player.playVideo();
                    }
                },
                onStateChange: function (e) {
                    if (e.data === YT.PlayerState.PLAYING) {
                        showPauseOverlay(false);
                        startTimeCheck();
                    } else if (e.data === YT.PlayerState.ENDED) {
                        stopTimeCheck();
                        hideUpcomingPopup();
                        showPauseOverlay(false);
                        var singer = state.nowPlaying ? state.nowPlaying.singer : "";
                        var title = state.nowPlaying ? state.nowPlaying.title : "";
                        showScoreAndAdvance(singer, title);
                    } else if (e.data === YT.PlayerState.PAUSED) {
                        stopTimeCheck();
                        showPauseOverlay(true, currentPausedBy);
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

    /* ---- 3x Upcoming Pop-up Notifications (60s, 30s, 10s) ---------------- */

    function resetNotificationFlags() {
        notified60s = false;
        notified30s = false;
        notified10s = false;
    }

    function startTimeCheck() {
        stopTimeCheck();
        timeCheckInterval = setInterval(function () {
            if (!player || typeof player.getDuration !== "function" || typeof player.getCurrentTime !== "function") return;

            var duration = player.getDuration();
            var currentTime = player.getCurrentTime();
            var timeLeft = duration - currentTime;

            if (state.queue.length === 0 || duration <= 0) return;

            // Notification 1: ~60 seconds left
            if (timeLeft <= 60 && timeLeft > 50 && !notified60s) {
                notified60s = true;
                triggerPopupFlash();
            }
            // Notification 2: ~30 seconds left
            else if (timeLeft <= 30 && timeLeft > 20 && !notified30s) {
                notified30s = true;
                triggerPopupFlash();
            }
            // Notification 3: ~10 seconds left
            else if (timeLeft <= 10 && timeLeft > 0 && !notified10s) {
                notified10s = true;
                triggerPopupFlash();
            }
        }, 1000);
    }

    function stopTimeCheck() {
        if (timeCheckInterval) {
            clearInterval(timeCheckInterval);
            timeCheckInterval = null;
        }
    }

    function triggerPopupFlash() {
        var popup = document.getElementById("upcomingPopup");
        var singerEl = document.getElementById("upcomingSinger");
        var titleEl = document.getElementById("upcomingTitle");

        if (!popup || state.queue.length === 0) return;

        var nextSong = state.queue[0];
        if (singerEl) singerEl.textContent = nextSong.singer || "Anonymous";
        if (titleEl) titleEl.textContent = nextSong.title;

        popup.hidden = false;
        popup.classList.remove("is-visible");
        void popup.offsetWidth;
        popup.classList.add("is-visible");

        if (popupTimer) clearTimeout(popupTimer);
        // Show pop-up for 5 seconds then hide automatically
        popupTimer = setTimeout(function () {
            hideUpcomingPopup();
        }, 5000);
    }

    function hideUpcomingPopup() {
        var popup = document.getElementById("upcomingPopup");
        if (!popup) return;

        popup.classList.remove("is-visible");
        setTimeout(function () {
            popup.hidden = true;
        }, 400);
    }

    /* ---- Queue Mechanics & Actions -------------------------------------- */

    function playNext() {
        resetNotificationFlags();
        hideUpcomingPopup();
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

    /* ---- Fullscreen Controls -------------------------------------------- */
    function initFullscreenControls() {
        var btn = document.getElementById('fullscreenBtn');
        var stage = document.getElementById('stageContainer');
        if (!btn || !stage) return;

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

            if (fs) {
                stage.classList.add('is-stage-fullscreen');
            } else {
                stage.classList.remove('is-stage-fullscreen');
            }
        }

        btn.addEventListener('click', toggleStageFullscreen);

        document.addEventListener('fullscreenchange', updateIcon);
        document.addEventListener('webkitfullscreenchange', updateIcon);
        document.addEventListener('msfullscreenchange', updateIcon);
    }
    function displayBannerMessage(text, sender) {
        var banner = document.getElementById("bannerMessage");
        var senderEl = document.getElementById("bannerSender");
        var textEl = document.getElementById("bannerText");

        if (!banner || !senderEl || !textEl) return;

        senderEl.textContent = sender ? sender + " says:" : "Announcement:";
        textEl.textContent = text;

        banner.hidden = false;
        banner.classList.remove("is-visible");
        void banner.offsetWidth;
        banner.classList.add("is-visible");

        if (messageTimer) clearTimeout(messageTimer);
        messageTimer = setTimeout(function () {
            banner.classList.remove("is-visible");
            setTimeout(function () {
                banner.hidden = true;
            }, 400);
        }, 6000);
    }

    function toggleStageFullscreen() {
        var stage = document.getElementById('stageContainer');
        if (!stage) return;

        function isFullscreen() {
            return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
        }

        if (isFullscreen()) {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
        } else {
            if (stage.requestFullscreen) stage.requestFullscreen();
            else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
            else if (stage.msRequestFullscreen) stage.msRequestFullscreen();
        }
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

            case "message":
                if (msg.text) {
                    displayBannerMessage(msg.text, msg.sender);
                }
                break;

            case "toggleFullscreen":
                toggleStageFullscreen();
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

    function startHeartbeat() {
        stopHeartbeat();
        heartbeatInterval = setInterval(function () {
            if (socket) {
                socket.send({ action: "ping", timestamp: Date.now() });
                broadcastState();
            }
        }, 30000);
    }

    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }

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
    function spawnReaction(emoji) {
        var container = document.getElementById("reactionContainer");
        if (!container) return;

        var reactionEl = document.createElement("div");
        reactionEl.className = "floating-reaction";
        reactionEl.textContent = emoji;

        var randomX = Math.floor(Math.random() * 60) - 30;
        reactionEl.style.right = (20 + randomX) + "px";

        container.appendChild(reactionEl);

        setTimeout(function () {
            if (reactionEl && reactionEl.parentNode) {
                reactionEl.parentNode.removeChild(reactionEl);
            }
        }, 2500);
    }

    var scoreTimer = null;

    function getRatingText(score) {
        if (score >= 98) return "👑 LEGENDARY SINGER!";
        if (score >= 93) return "🔥 SUPERSTAR!";
        if (score >= 85) return "🎤 GREAT JOB!";
        if (score >= 75) return "👍 NICE TRY!";
        return "😅 KEEP PRACTICING!";
    }

    function showScoreAndAdvance(lastSinger, lastTitle) {
        var overlay = document.getElementById("scoreOverlay");
        var singerEl = document.getElementById("scoreSinger");
        var titleEl = document.getElementById("scoreTitle");
        var numberEl = document.getElementById("scoreNumber");
        var ratingEl = document.getElementById("scoreRating");

        if (!overlay || !lastSinger) {
            playNext();
            return;
        }

        var randomScore = Math.floor(Math.random() * 31) + 70;

        singerEl.textContent = lastSinger || "Anonymous";
        titleEl.textContent = lastTitle || "";
        numberEl.textContent = randomScore;
        ratingEl.textContent = getRatingText(randomScore);

        overlay.hidden = false;
        void overlay.offsetWidth;
        overlay.classList.add("is-visible");

        if (scoreTimer) clearTimeout(scoreTimer);
        scoreTimer = setTimeout(function () {
            overlay.classList.remove("is-visible");
            setTimeout(function () {
                overlay.hidden = true;
                playNext();
            }, 400);
        }, 5000);
    }

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