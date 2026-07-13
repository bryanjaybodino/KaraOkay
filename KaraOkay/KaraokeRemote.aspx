<%@ Page Language="C#" AutoEventWireup="true" ViewStateMode="Disabled" EnableViewState="false" CodeBehind="KaraokeRemote.aspx.cs" Inherits="KaraOkay.KaraokeRemote" %>

<!DOCTYPE html>
<html lang="en">
<head runat="server">
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kara-Okay &mdash; Remote</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Monoton&family=Manrope:wght@500;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
    <% Response.Write(KaraOkay.FileCssHelper.StyleSheetVersion("assets/css/style.css")); %>
</head>
<body>
    <form id="form1" runat="server">
        <asp:ScriptManager ID="ScriptManager1" EnableCdn="false" EnablePageMethods="true" EnablePartialRendering="true" AsyncPostBackTimeout="99999999" ScriptMode="Release" ValidateRequestMode="Enabled" EnableScriptLocalization="true" EnableScriptGlobalization="true" LoadScriptsBeforeUI="false" CompositeScript-ScriptMode="Release" CompositeScript-ResourceUICultures="Release" runat="server"></asp:ScriptManager>
        <div class="remote" id="joinView">
            <h1 class="logo">KARA<span class="logo__accent">-OKAY</span></h1>
            <p class="tagline">Your pocket mic control</p>

            <div class="field">
                <label for="roomCodeInput">Room code</label>
                <input type="text" id="roomCodeInput" maxlength="6" placeholder="e.g. 7QXPL" autocapitalize="characters" />
            </div>

            <div class="field">
                <label for="singerNameInput">Your name</label>
                <input type="text" id="singerNameInput" maxlength="40" placeholder="e.g. Bryan Jay" />
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

            <nav class="remote-tabs" id="remoteTabs">
                <button type="button" class="remote-tabs__btn is-active" data-tab="queue">Now Playing</button>
                <button type="button" class="remote-tabs__btn" data-tab="search">Search Song</button>
                <button type="button" class="remote-tabs__btn" data-tab="mine">My Songs</button>
            </nav>

            <div class="tab-panel" id="tabPanel-queue">
                <section class="now-panel">
                    <div class="eyebrow">Now Singing</div>
                    <div id="remoteNowPlaying">&mdash;</div>
                    <div class="transport">
                        <button type="button" id="playBtn">&#9654; Play</button>
                        <button type="button" id="pauseBtn">&#9208; Pause</button>
                        <button type="button" id="skipBtn">&#9197; Skip</button>
                    </div>
                </section>

                <section class="queue-panel-remote">
                    <div class="eyebrow">Reservations</div>
                    <ol class="queue-list" id="remoteQueueList"></ol>
                </section>
            </div>

            <div class="tab-panel" id="tabPanel-search" hidden>
                <section class="search-panel">
                    <div class="eyebrow">Add a Song</div>
                    <div class="search-row">
                        <input type="text" id="searchInput" placeholder="Search YouTube&hellip;" />
                        <button type="button" id="searchBtn">Search</button>
                    </div>
                    <ul class="result-list" id="searchResults"></ul>
                </section>
            </div>

            <div class="tab-panel" id="tabPanel-mine" hidden>
                <section class="queue-panel-remote">
                    <div class="eyebrow">My Songs</div>
                    <ol class="queue-list" id="myQueueList"></ol>
                </section>
            </div>
        </div>
    </form>

</body>
</html>
