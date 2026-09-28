/* ==========================================================================
   Kara-Okay — Remote (Page 2)
   Joins a room by code, searches YouTube for songs, and sends action
   messages. Renders whatever "state" the screen last broadcast — this
   page never keeps its own source of truth for the queue.
   
   Enhanced: Auto-joins via QR code URL parameter & Favorites Management
   ========================================================================== */

(function () {
    var socket = null;
    var singerName = localStorage.getItem("karaokeSingerName") || "";
    var lastState = { nowPlaying: null, queue: [] };

    /* ---- Favorites Storage & State Management ---------------------------- */

    var FAVS_STORAGE_KEY = "karaokeFavorites";

    function getFavorites() {
        try {
            return JSON.parse(localStorage.getItem(FAVS_STORAGE_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    function saveFavorites(favs) {
        try {
            localStorage.setItem(FAVS_STORAGE_KEY, JSON.stringify(favs));
        } catch (e) { /* ignore storage errors */ }
    }

    function isFavorite(videoId) {
        var favs = getFavorites();
        return favs.some(function (item) { return item.videoId === videoId; });
    }

    function toggleFavorite(songItem) {
        var favs = getFavorites();
        var index = favs.findIndex(function (item) { return item.videoId === songItem.videoId; });
        if (index > -1) {
            favs.splice(index, 1);
        } else {
            favs.push(songItem);
        }
        saveFavorites(favs);
        renderFavorites();
        updateSearchResultStar(songItem.videoId);
    }

    /* ---- DOM Elements --------------------------------------------------- */

    var joinView = document.getElementById("joinView");
    var controlView = document.getElementById("controlView");
    var roomInput = document.getElementById("roomCodeInput");
    var nameInput = document.getElementById("singerNameInput");
    var joinBtn = document.getElementById("joinBtn");
    var joinError = document.getElementById("joinError");

    /* ---- YouTube IFrame API (used only to probe playability) ------------ */

    var ytApiReady = false;
    window.onYouTubeIframeAPIReady = function () { ytApiReady = true; };
    (function loadYouTubeApi() {
        var tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
    })();

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
                    try {
                        e.target.mute();
                        e.target.playVideo();
                    } catch (err) {
                        finish(true);
                    }
                },
                onStateChange: function (e) {
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

    /* ---- QR Code URL Parameter Auto-Join -------------------------------- */

    (function checkQRCodeParam() {
        var params = new URLSearchParams(window.location.search);
        var roomParam = params.get("room");

        if (roomParam) {
            roomInput.value = roomParam.toUpperCase();
        }
    })();

    var joinSpinner = document.getElementById("joinSpinner");
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

        joinBtn.disabled = true;
        var joinBtnText = document.getElementById("joinBtnText");
        if (joinBtnText) joinBtnText.textContent = "Connecting\u2026";
        if (joinSpinner) joinSpinner.hidden = false;

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
            joinBtn.disabled = false;
            if (joinSpinner) joinSpinner.hidden = true;

            joinView.hidden = true;
            controlView.hidden = false;
            connStatus.hidden = true;
            socket.send({ action: "requestState" });
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
            setTimeout(function () { connStatus.hidden = true; }, 2500);
        };
        socket.onError = function () {
            joinBtn.disabled = false;
            if (joinSpinner) joinSpinner.hidden = true;
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

    /* ---- Volume Control ------------------------------------------------- */

    var volumeSlider = document.getElementById("volumeSlider");
    var volumeValue = document.getElementById("volumeValue");

    if (volumeSlider) {
        volumeSlider.addEventListener("input", function () {
            var level = parseInt(volumeSlider.value, 10);
            if (volumeValue) volumeValue.textContent = level + "%";

            if (socket) {
                socket.send({
                    action: "control",
                    cmd: "volume",
                    level: level
                });
            }
        });
    }

    document.getElementById("leaveBtn").addEventListener("click", function () {
        if (socket) socket.close();
        document.getElementById("connStatus").hidden = true;
        controlView.hidden = true;
        joinView.hidden = false;
    });

    /* ---- Tabs Navigation ------------------------------------------------ */

    var tabButtons = document.querySelectorAll(".remote-tabs__btn");
    var tabPanels = {
        queue: document.getElementById("tabPanel-queue"),
        search: document.getElementById("tabPanel-search"),
        mine: document.getElementById("tabPanel-mine"),
        favs: document.getElementById("tabPanel-favs")
    };

    Array.prototype.forEach.call(tabButtons, function (btn) {
        btn.addEventListener("click", function () {
            var target = btn.getAttribute("data-tab");

            Array.prototype.forEach.call(tabButtons, function (b) {
                b.classList.toggle("is-active", b === btn);
            });

            Object.keys(tabPanels).forEach(function (key) {
                tabPanels[key].hidden = key !== target;
            });
        });
    });

    /* ---- Transport Controls -------------------------------------------- */

    document.getElementById("playBtn").addEventListener("click", function () {
        socket.send({ action: "control", cmd: "play" });
    });
    document.getElementById("pauseBtn").addEventListener("click", function () {
        socket.send({ action: "control", cmd: "pause", singer: singerName });
    });
    document.getElementById("skipBtn").addEventListener("click", function () {
        socket.send({ action: "control", cmd: "skip" });
    });

    /* ---- YouTube Search -------------------------------------------------- */

    var searchInput = document.getElementById("searchInput");
    var searchBtn = document.getElementById("searchBtn");
    var searchResults = document.getElementById("searchResults");

    searchBtn.addEventListener("click", runSearch);
    searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") runSearch();
    });

    function runSearch() {
        var query = searchInput.value.trim();
        if (!query) {
            searchResults.innerHTML = '<li class="qempty">Enter a song title or artist name.</li>';
            return;
        }

        searchResults.innerHTML = '<li class="qempty">Searching&hellip;</li>';

        var url = "https://www.googleapis.com/youtube/v3/search"
            + "?part=snippet"
            + "&q=" + encodeURIComponent(query + " karaoke minus one")
            + "&type=video"
            + "&videoEmbeddable=true"
            + "&maxResults=20"
            + "&key=" + Karaoke.Config.YOUTUBE_API_KEY;

        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var items = data.items || [];
                if (items.length === 0) {
                    searchResults.innerHTML = '<li class="qempty">No results found.</li>';
                    return;
                }
                return filterPlayable(items);
            })
            .then(renderResults)
            .catch(function (err) {
                console.error("Search failed:", err);
                searchResults.innerHTML = '<li class="qempty">Search failed. Try again?</li>';
            });
    }

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
                return searchItems;
            });
    }

    /* ---- Render Helpers & UI Views -------------------------------------- */

    function renderResults(items) {
        searchResults.innerHTML = "";
        items.forEach(function (item) {
            var videoId = item.id.videoId;
            var title = decodeHtmlEntities(item.snippet.title);
            var channel = decodeHtmlEntities(item.snippet.channelTitle);
            var thumb = item.snippet.thumbnails.default.url;
            var songData = { videoId: videoId, title: title, channel: channel, thumb: thumb };

            var li = document.createElement("li");
            li.setAttribute("data-video-id", videoId);

            var favClass = isFavorite(videoId) ? "is-fav" : "";
            var favIcon = isFavorite(videoId) ? "&#9733;" : "&#9734;";

            li.innerHTML =
                '<img src="' + thumb + '" alt="">' +
                '<span class="rmeta">' +
                '<span class="rtitle">' + escapeHtml(title) + '</span>' +
                '<span class="rchannel">' + escapeHtml(channel) + '</span>' +
                '</span>' +
                '<button type="button" class="fav-btn ' + favClass + '" title="Favorite" style="padding: 8px; margin-right: 4px;">' + favIcon + '</button>' +
                '<button type="button" class="reserve-btn">Reserve</button>';

            var favBtn = li.querySelector(".fav-btn");
            favBtn.addEventListener("click", function () {
                toggleFavorite(songData);
            });

            var reserveBtn = li.querySelector(".reserve-btn");
            reserveBtn.addEventListener("click", function () {
                handleReservation(this, li, songData);
            });

            searchResults.appendChild(li);
        });
    }

    function updateSearchResultStar(videoId) {
        if (!searchResults) return;
        var itemLi = searchResults.querySelector('li[data-video-id="' + videoId + '"]');
        if (itemLi) {
            var favBtn = itemLi.querySelector(".fav-btn");
            if (favBtn) {
                var fav = isFavorite(videoId);
                favBtn.innerHTML = fav ? "&#9733;" : "&#9734;";
                favBtn.classList.toggle("is-fav", fav);
            }
        }
    }

    function renderFavorites() {
        var favsList = document.getElementById("favsList");
        if (!favsList) return;

        favsList.innerHTML = "";
        var favs = getFavorites();

        if (favs.length === 0) {
            favsList.innerHTML = '<li class="qempty">No favorites saved yet. Star songs in search to save them!</li>';
            return;
        }

        favs.forEach(function (item) {
            var li = document.createElement("li");
            li.innerHTML =
                '<img src="' + item.thumb + '" alt="">' +
                '<span class="rmeta">' +
                '<span class="rtitle">' + escapeHtml(item.title) + '</span>' +
                '<span class="rchannel">' + escapeHtml(item.channel || "") + '</span>' +
                '</span>' +
                '<button type="button" class="fav-btn is-fav" title="Remove Favorite" style="padding: 8px; margin-right: 4px;">&#9733;</button>' +
                '<button type="button" class="reserve-btn">Reserve</button>';

            var favBtn = li.querySelector(".fav-btn");
            favBtn.addEventListener("click", function () {
                toggleFavorite(item);
            });

            var reserveBtn = li.querySelector(".reserve-btn");
            reserveBtn.addEventListener("click", function () {
                handleReservation(this, li, item);
            });

            favsList.appendChild(li);
        });
    }

    function handleReservation(btnElement, liElement, songData) {
        if (!socket) {
            alert("Please connect to a room first!");
            return;
        }

        btnElement.disabled = true;
        btnElement.textContent = "Checking\u2026";

        testPlayability(songData.videoId, function (ok) {
            if (!ok) {
                btnElement.textContent = "Unavailable";
                liElement.style.opacity = "0.5";
                liElement.title = "This video can't be played here \u2014 try another.";
                return;
            }
            socket.send({
                action: "add",
                singer: singerName,
                videoId: songData.videoId,
                title: songData.title,
                thumb: songData.thumb
            });

            btnElement.innerHTML = "&#10003; Reserved";
            liElement.classList.add("is-reserved");
            btnElement.classList.add("is-reserved");
        });
    }

    function renderState() {
        var nowEl = document.getElementById("remoteNowPlaying");
        if (lastState.nowPlaying) {
            nowEl.innerHTML =
                '<span class="rn-singer">' + escapeHtml(lastState.nowPlaying.singer || "Anonymous") + '</span>' +
                '<span class="rn-title">' + escapeHtml(lastState.nowPlaying.title) + '</span>';
        } else {
            nowEl.innerHTML = '\u2014<span class="rn-title">Waiting for the first song</span>';
        }

        var queue = lastState.queue || [];

        renderQueueList(
            document.getElementById("remoteQueueList"),
            queue,
            null,
            "No reservations yet. Search above to add the first song!"
        );

        renderQueueList(
            document.getElementById("myQueueList"),
            queue,
            function (item) { return item.singer === singerName; },
            "You haven't reserved any songs yet \u2014 search above to add one!"
        );
    }

    function renderQueueList(listEl, queue, filterFn, emptyText) {
        listEl.innerHTML = "";

        var entries = queue
            .map(function (item, i) { return { item: item, position: i + 1 }; })
            .filter(function (entry) { return !filterFn || filterFn(entry.item); });

        if (entries.length === 0) {
            var empty = document.createElement("li");
            empty.className = "qempty";
            empty.textContent = emptyText;
            listEl.appendChild(empty);
            return;
        }

        entries.forEach(function (entry) {
            listEl.appendChild(buildQueueItemEl(entry.item, entry.position));
        });
    }

    function buildQueueItemEl(item, position) {
        var mine = item.singer === singerName;
        var li = document.createElement("li");
        if (mine) li.classList.add("qmine");

        li.style.display = "flex";
        li.style.flexWrap = "wrap";
        li.style.alignItems = "center";

        var topRow = document.createElement("div");
        topRow.style.display = "flex";
        topRow.style.alignItems = "center";
        topRow.style.width = "100%";
        topRow.innerHTML =
            '<span class="qpos">' + position + '</span>' +
            '<img class="qthumb" src="' + item.thumb + '" alt="">' +
            '<span class="qmeta">' +
            '<span class="qtitle">' + escapeHtml(item.title) + '</span>' +
            '<span class="qsinger">' + escapeHtml(item.singer || "Anonymous") + '</span>' +
            '</span>';
        li.appendChild(topRow);

        if (mine) {
            var actions = document.createElement("span");
            actions.className = "qactions";
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

        return li;
    }

    /* ---- Helpers & Utilities ------------------------------------------- */

    function escapeHtml(s) {
        var d = document.createElement("div");
        d.textContent = s == null ? "" : s;
        return d.innerHTML;
    }

    function decodeHtmlEntities(s) {
        var d = document.createElement("div");
        d.innerHTML = s == null ? "" : s;
        return d.textContent;
    }

    /* ---- Initialize ---------------------------------------------------- */

    renderFavorites();

})();