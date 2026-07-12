/* ==========================================================================
   Kara-Okay — Remote (Page 2)
   Joins a room by code, searches YouTube for songs, and sends action
   messages. Renders whatever "state" the screen last broadcast — this
   page never keeps its own source of truth for the queue.
   ========================================================================== */

(function () {
    var socket = null;
    var singerName = localStorage.getItem("karaokeSingerName") || "";
    var lastState = { nowPlaying: null, queue: [] };

    var joinView = document.getElementById("joinView");
    var controlView = document.getElementById("controlView");
    var roomInput = document.getElementById("roomCodeInput");
    var nameInput = document.getElementById("singerNameInput");
    var joinBtn = document.getElementById("joinBtn");
    var joinError = document.getElementById("joinError");

    /* ---- YouTube IFrame API (used only to probe playability) ------------ */
    // The Data API's status/contentDetails fields don't catch everything —
    // notably regional content blocks on copyrighted "karaoke version"
    // uploads. The only fully reliable check is to actually try loading the
    // video, so we keep a hidden player around for that purpose.
    var ytApiReady = false;
    window.onYouTubeIframeAPIReady = function () { ytApiReady = true; };
    (function loadYouTubeApi() {
        var tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
    })();

    // Actually attempts to load videoId in a throwaway hidden player and
    // reports back whether it came up clean or errored out. Fails open
    // (assumes playable) if the API isn't ready or nothing happens within
    // the timeout, so a slow/broken probe never blocks a reservation.
    function testPlayability(videoId, callback) {
        if (!ytApiReady || !window.YT || !YT.Player) {
            callback(true);
            return;
        }

        var container = document.createElement("div");
        container.style.position = "absolute";
        container.style.left = "-9999px";
        container.style.width = "1px";
        container.style.height = "1px";
        document.body.appendChild(container);

        var settled = false;
        var timeoutId;
        var probePlayer;

        function finish(ok) {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            try { if (probePlayer) probePlayer.destroy(); } catch (err) { /* ignore */ }
            if (container.parentNode) container.parentNode.removeChild(container);
            callback(ok);
        }

        probePlayer = new YT.Player(container, {
            host: "https://www.youtube.com",
            videoId: videoId,
            playerVars: { controls: 0 },
            events: {
                onReady: function (e) {
                    // Being "ready" just means the player initialized — it
                    // doesn't mean the video will actually play. Some
                    // regional/licensing blocks only surface once playback
                    // is actually attempted, so force that (muted, so
                    // nothing's audible on the singer's phone).
                    try {
                        e.target.mute();
                        e.target.playVideo();
                    } catch (err) {
                        finish(true); // don't block a reservation over our own probe bug
                    }
                },
                onStateChange: function (e) {
                    // PLAYING or BUFFERING both mean the stream genuinely
                    // started — that's the real signal we're after.
                    if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING) {
                        finish(true);
                    }
                },
                onError: function () { finish(false); }
            }
        });

        timeoutId = setTimeout(function () { finish(true); }, 8000);
    }

    nameInput.value = singerName;
    roomInput.value = localStorage.getItem("karaokeRoomCode") || "";

    joinBtn.addEventListener("click", function () {
        var room = roomInput.value.trim().toUpperCase();
        var name = nameInput.value.trim();

        if (room.length < 3) {
            joinError.textContent = "Enter the room code shown on the TV screen.";
            return;
        }
        if (!name) {
            joinError.textContent = "Tell us who's singing \u2014 enter a name.";
            return;
        }
        joinError.textContent = "";
        singerName = name;
        localStorage.setItem("karaokeSingerName", name);
        localStorage.setItem("karaokeRoomCode", room);
        joinRoom(room);
    });

    function joinRoom(room) {
        document.getElementById("roomPillCode").textContent = room;
        var connStatus = document.getElementById("connStatus");

        socket = new Karaoke.Socket(room);
        socket.onOpen = function () {
            joinView.hidden = true;
            controlView.hidden = false;
            connStatus.hidden = true;
            socket.send({ action: "requestState" });
        };
        socket.onClose = function () {
            // The socket wrapper will auto-retry unless this was a deliberate
            // "Leave" — either way, let the singer know we're not live.
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
            setTimeout(function () { connStatus.hidden = true; }, 2500);
        };
        socket.onError = function () {
            joinError.textContent = "Couldn't reach the party. Check the WebSocket server is running.";
        };
        socket.onMessage = function (msg) {
            if (msg && msg.type === "state") {
                lastState = msg;
                renderState();
            }
        };
        socket.connect();
    }

    document.getElementById("leaveBtn").addEventListener("click", function () {
        if (socket) socket.close();
        document.getElementById("connStatus").hidden = true;
        controlView.hidden = true;
        joinView.hidden = false;
    });

    /* ---- transport controls -------------------------------------------- */

    document.getElementById("playBtn").addEventListener("click", function () {
        socket.send({ action: "control", cmd: "play" });
    });
    document.getElementById("pauseBtn").addEventListener("click", function () {
        socket.send({ action: "control", cmd: "pause" });
    });
    document.getElementById("skipBtn").addEventListener("click", function () {
        socket.send({ action: "control", cmd: "skip" });
    });

    /* ---- YouTube search --------------------------------------------------- */

    var searchInput = document.getElementById("searchInput");
    var searchBtn = document.getElementById("searchBtn");
    var searchResults = document.getElementById("searchResults");

    searchBtn.addEventListener("click", runSearch);
    searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") runSearch();
    });

    function runSearch() {
        var q = searchInput.value.trim();
        if (!q) return;

        if (!Karaoke.Config.YOUTUBE_API_KEY || Karaoke.Config.YOUTUBE_API_KEY.indexOf("YOUR_") === 0) {
            searchResults.innerHTML = '<li class="qempty">Add a YouTube Data API key in js/karaoke-common.js to enable search.</li>';
            return;
        }

        searchResults.innerHTML = '<li class="qempty">Searching\u2026</li>';

        var url = "https://www.googleapis.com/youtube/v3/search"
            + "?part=snippet&type=video&maxResults=8"
            + "&videoEmbeddable=true"
            + "&q=" + encodeURIComponent(q + " karaoke")
            + "&key=" + Karaoke.Config.YOUTUBE_API_KEY;

        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.items || data.items.length === 0) {
                    searchResults.innerHTML = '<li class="qempty">No results. Try another search.</li>';
                    return;
                }
                searchResults.innerHTML = '<li class="qempty">Checking which ones will actually play\u2026</li>';
                return filterPlayable(data.items);
            })
            .then(function (playableItems) {
                if (!playableItems) return; // Already handled the "no results" case above.
                renderResults(playableItems);
            })
            .catch(function () {
                searchResults.innerHTML = '<li class="qempty">Search failed. Check your API key and connection.</li>';
            });
    }

    // videoEmbeddable=true on the search call filters out most unplayable
    // videos, but it misses things like age-restricted uploads (which often
    // fail on embeds with a "sign in to confirm you're not a bot" error).
    // A follow-up videos.list call gives us that detail so we can drop them
    // before the singer ever sees them.
    function filterPlayable(searchItems) {
        var ids = searchItems.map(function (item) { return item.id.videoId; });

        var url = "https://www.googleapis.com/youtube/v3/videos"
            + "?part=status,contentDetails"
            + "&id=" + ids.join(",")
            + "&key=" + Karaoke.Config.YOUTUBE_API_KEY;

        return fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var okIds = {};
                (data.items || []).forEach(function (v) {
                    var status = v.status || {};
                    var content = v.contentDetails || {};
                    var ageRestricted = content.contentRating
                        && content.contentRating.ytRating === "ytAgeRestricted";

                    if (status.embeddable !== false
                        && status.uploadStatus === "processed"
                        && status.privacyStatus !== "private"
                        && !ageRestricted) {
                        okIds[v.id] = true;
                    }
                });

                var filtered = searchItems.filter(function (item) {
                    return okIds[item.id.videoId];
                });

                if (filtered.length === 0) {
                    searchResults.innerHTML = '<li class="qempty">Found matches, but none of them are playable here. Try another search.</li>';
                    return null;
                }
                return filtered;
            })
            .catch(function () {
                // If the playability check itself fails, don't block the
                // singer entirely — fall back to the (already embeddable-
                // filtered) search results as-is.
                return searchItems;
            });
    }

    function renderResults(items) {
        searchResults.innerHTML = "";
        items.forEach(function (item) {
            var videoId = item.id.videoId;
            var title = item.snippet.title;
            var channel = item.snippet.channelTitle;
            var thumb = item.snippet.thumbnails.default.url;

            var li = document.createElement("li");
            li.innerHTML =
                '<img src="' + thumb + '" alt="">' +
                '<span class="rmeta">' +
                '<span class="rtitle">' + escapeHtml(title) + '</span>' +
                '<span class="rchannel">' + escapeHtml(channel) + '</span>' +
                '</span>' +
                '<button type="button">Reserve</button>';

            var reserveBtn = li.querySelector("button");
            reserveBtn.addEventListener("click", function () {
                reserveBtn.disabled = true;
                reserveBtn.textContent = "Checking\u2026";

                testPlayability(videoId, function (ok) {
                    if (!ok) {
                        reserveBtn.textContent = "Unavailable";
                        li.style.opacity = "0.5";
                        li.title = "This video can't be played here \u2014 try another.";
                        return;
                    }
                    socket.send({
                        action: "add",
                        singer: singerName,
                        videoId: videoId,
                        title: title,
                        thumb: thumb
                    });
                    reserveBtn.textContent = "Reserved!";
                });
            });

            searchResults.appendChild(li);
        });
    }

    /* ---- render state ------------------------------------------------------- */

    function renderState() {
        var nowEl = document.getElementById("remoteNowPlaying");
        if (lastState.nowPlaying) {
            nowEl.innerHTML =
                '<span class="rn-singer">' + escapeHtml(lastState.nowPlaying.singer || "Anonymous") + '</span>' +
                '<span class="rn-title">' + escapeHtml(lastState.nowPlaying.title) + '</span>';
        } else {
            nowEl.innerHTML = '\u2014<span class="rn-title">Waiting for the first song</span>';
        }

        var list = document.getElementById("remoteQueueList");
        list.innerHTML = "";
        var queue = lastState.queue || [];

        if (queue.length === 0) {
            var empty = document.createElement("li");
            empty.className = "qempty";
            empty.textContent = "No reservations yet. Search above to add the first song!";
            list.appendChild(empty);
            return;
        }

        queue.forEach(function (item, i) {
            var mine = item.singer === singerName;
            var li = document.createElement("li");
            if (mine) li.classList.add("qmine");
            // Force a column layout on this item regardless of whatever the
            // stylesheet's default row layout is, so the actions row below
            // always gets its own full-width line instead of being squeezed
            // out of the same row as the thumbnail/title on narrow screens.
            li.style.display = "flex";
            li.style.flexWrap = "wrap";
            li.style.alignItems = "center";

            var topRow = document.createElement("div");
            topRow.style.display = "flex";
            topRow.style.alignItems = "center";
            topRow.style.width = "100%";
            topRow.innerHTML =
                '<span class="qpos">' + (i + 1) + '</span>' +
                '<img class="qthumb" src="' + item.thumb + '" alt="">' +
                '<span class="qmeta">' +
                '<span class="qtitle">' + escapeHtml(item.title) + '</span>' +
                '<span class="qsinger">' + escapeHtml(item.singer || "Anonymous") + '</span>' +
                '</span>';
            li.appendChild(topRow);

            if (mine) {
                var actions = document.createElement("span");
                actions.className = "qactions";
                // Guaranteed-visible layout: its own full-width row with
                // real spacing, independent of the stylesheet.
                actions.style.display = "flex";
                actions.style.width = "100%";
                actions.style.gap = "8px";
                actions.style.marginTop = "8px";
                actions.style.flexWrap = "wrap";

                var bumpBtn = document.createElement("button");
                bumpBtn.type = "button";
                bumpBtn.textContent = "Bump to next";
                bumpBtn.style.flex = "1 1 auto";
                bumpBtn.addEventListener("click", function () {
                    socket.send({ action: "prioritize", id: item.id });
                });

                var cancelBtn = document.createElement("button");
                cancelBtn.type = "button";
                cancelBtn.textContent = "Cancel";
                cancelBtn.style.flex = "1 1 auto";
                cancelBtn.addEventListener("click", function () {
                    socket.send({ action: "remove", id: item.id });
                });

                actions.appendChild(bumpBtn);
                actions.appendChild(cancelBtn);
                li.appendChild(actions);
            }

            list.appendChild(li);
        });
    }

    function escapeHtml(s) {
        var d = document.createElement("div");
        d.textContent = s == null ? "" : s;
        return d.innerHTML;
    }
})();