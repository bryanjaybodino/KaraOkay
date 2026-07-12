<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="KaraokeRemote.aspx.cs" Inherits="KaraOkay.KaraokeRemote" %>

<!DOCTYPE html>
<html lang="en">
<head runat="server">
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kara-Okay &mdash; Remote</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Monoton&family=Manrope:wght@500;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
    <link href="assets/css/style.css" rel="stylesheet" />
    <style>
        /* Fallback styling for the connection-status banner — move into
           style.css and re-theme as you like. */
        .conn-status {
            margin-top: 8px;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 600;
            text-align: center;
        }
        .conn-status--reconnecting {
            background: #fff3cd;
            color: #7a5b00;
        }
        .conn-status--connected {
            background: #d4edda;
            color: #155724;
        }
    </style>
</head>
<body>
    <form id="form1" runat="server">

        <div class="remote" id="joinView">
            <h1 class="logo">KARA<span class="logo__accent">-OKAY</span></h1>
            <p class="tagline">Your pocket mic control</p>

            <div class="field">
                <label for="roomCodeInput">Room code</label>
                <input type="text" id="roomCodeInput" maxlength="6" placeholder="e.g. 7QXPL" autocapitalize="characters" />
            </div>

            <div class="field">
                <label for="singerNameInput">Your name</label>
                <input type="text" id="singerNameInput" maxlength="40" placeholder="e.g. Reggie" />
            </div>

            <button type="button" id="joinBtn">Connect</button>
            <div class="error" id="joinError"></div>
        </div>

        <div class="remote" id="controlView" hidden>

            <div class="remote__header">
                <div class="room-pill">Room <strong id="roomPillCode"></strong></div>
                <button type="button" id="leaveBtn" class="link-btn">Leave</button>
            </div>

            <div class="conn-status" id="connStatus" hidden></div>

            <section class="now-panel">
                <div class="eyebrow">Now Singing</div>
                <div id="remoteNowPlaying">&mdash;</div>
                <div class="transport">
                    <button type="button" id="playBtn">&#9654; Play</button>
                    <button type="button" id="pauseBtn">&#9208; Pause</button>
                    <button type="button" id="skipBtn">&#9197; Skip</button>
                </div>
            </section>

            <section class="search-panel">
                <div class="eyebrow">Add a Song</div>
                <div class="search-row">
                    <input type="text" id="searchInput" placeholder="Search YouTube&hellip;" />
                    <button type="button" id="searchBtn">Search</button>
                </div>
                <ul class="result-list" id="searchResults"></ul>
            </section>

            <section class="queue-panel-remote">
                <div class="eyebrow">Reservations</div>
                <ol class="queue-list" id="remoteQueueList"></ol>
            </section>

        </div>

    </form>

    <script src="assets/js/karaoke-common.js"></script>
    <script src="assets/js/remote.js"></script>
</body>
</html>
