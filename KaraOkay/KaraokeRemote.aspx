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

            <button type="button" id="joinBtn">
                <span class="btn-spinner" id="joinSpinner" hidden></span>
                <span class="btn-text" id="joinBtnText">Connect</span>
            </button>
            <div class="error" id="joinError"></div>
        </div>

        <div class="remote" id="controlView" hidden>

            <div class="remote__header">
                <div class="room-pill">Room <strong id="roomPillCode"></strong></div>
                <button type="button" id="leaveBtn" class="link-btn">Leave</button>
            </div>
            <div class="remote-controls">
                <button type="button" id="remoteFullscreenBtn" class="btn btn--secondary" title="Toggle TV Fullscreen">
                    &#x26F6; TV Fullscreen
   
                </button>
            </div>
            <div class="conn-status" id="connStatus" hidden></div>

            <nav class="remote-tabs" id="remoteTabs">
                <button type="button" class="remote-tabs__btn is-active" data-tab="queue">Now Playing</button>
                <button type="button" class="remote-tabs__btn" data-tab="search">Search Song</button>
                <button type="button" class="remote-tabs__btn" data-tab="mine">My Songs</button>
                <button type="button" class="remote-tabs__btn" data-tab="favs">Favorites</button>
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
                    <!-- Volume Slider Control -->
                    <div class="volume-control" style="margin-top: 15px; display: flex; align-items: center; gap: 10px;">
                        <label for="volumeSlider" style="font-size: 0.9em; font-weight: bold;">🔊 Volume</label>
                        <input type="range" id="volumeSlider" min="0" max="100" value="100" style="flex: 1;" />
                        <span id="volumeValue">100%</span>
                    </div>

                    <!-- On-Screen Banner Message Control -->
                    <div class="msg-panel" style="margin-top: 20px; border-top: 1px dashed var(--line); padding-top: 15px;">
                        <div class="eyebrow" style="margin-bottom: 8px;">Send Screen Message</div>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="screenMsgInput" maxlength="100" placeholder="Happy Birthday! 🎉" style="flex: 1; background: var(--bg-panel-raised); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px; color: var(--text);" />
                            <button type="button" id="sendMsgBtn" style="background: var(--cyan); color: #041a18; padding: 0 16px; font-weight: 700; border-radius: var(--radius-sm);">Send</button>
                        </div>
                        <div id="msgStatus" style="font-size: 11px; margin-top: 6px; min-height: 14px;"></div>
                    </div>

                    <!-- Live Reactions Control Panel -->
                    <div class="reactions-panel" style="margin-top: 20px; text-align: center;">
                        <div class="eyebrow" style="margin-bottom: 8px;">Send Reaction</div>
                        <div class="reactions-bar" style="display: flex; justify-content: center; gap: 12px;">
                            <button type="button" class="reaction-btn" data-reaction="👏" style="font-size: 1.6rem; background: var(--bg-card, #222); border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; width: 48px; height: 48px; cursor: pointer;">👏</button>
                            <button type="button" class="reaction-btn" data-reaction="❤️" style="font-size: 1.6rem; background: var(--bg-card, #222); border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; width: 48px; height: 48px; cursor: pointer;">❤️</button>
                            <button type="button" class="reaction-btn" data-reaction="😂" style="font-size: 1.6rem; background: var(--bg-card, #222); border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; width: 48px; height: 48px; cursor: pointer;">😂</button>
                            <button type="button" class="reaction-btn" data-reaction="😢" style="font-size: 1.6rem; background: var(--bg-card, #222); border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; width: 48px; height: 48px; cursor: pointer;">😢</button>
                        </div>
                    </div>
                </section>

                <section class="queue-panel-remote">
                    <div class="eyebrow">Reservations</div>
                    <ol class="queue-list" id="remoteQueueList"></ol>
                </section>
            </div>
            <div class="tab-panel" id="tabPanel-search" hidden>
                <section class="search-panel">
                    <div class="search-header">
                        <div class="eyebrow">Add a Song</div>
                        <!-- View Toggle Switcher -->
                        <div class="layout-toggle" id="searchLayoutToggle">
                            <button type="button" class="layout-btn" data-layout="list" title="List View">&#9776; List</button>
                            <button type="button" class="layout-btn is-active" data-layout="grid" title="Grid View">&#8862; Grid</button>
                        </div>
                    </div>

                    <div class="search-row-container">
                        <div class="search-row">
                            <input type="text" id="searchInput" placeholder="Search YouTube&hellip;" autocomplete="off" />
                            <button type="button" id="searchBtn">Search</button>
                        </div>
                        <!-- Autocomplete Suggestions Dropdown -->
                        <ul class="autocomplete-list" id="autocompleteResults" hidden></ul>
                    </div>

                    <!-- Defaults to view-grid -->
                    <ul class="result-list view-grid" id="searchResults"></ul>
                </section>
            </div>

            <div class="tab-panel" id="tabPanel-mine" hidden>
                <section class="queue-panel-remote">
                    <div class="eyebrow">My Songs</div>
                    <ol class="queue-list" id="myQueueList"></ol>
                </section>
            </div>
            <div class="tab-panel" id="tabPanel-favs" hidden>
                <section class="search-panel">
                    <div class="search-header">
                        <div class="eyebrow">My Favorites</div>
                        <!-- View Toggle Switcher for Favorites -->
                        <div class="layout-toggle" id="favsLayoutToggle">
                            <button type="button" class="layout-btn" data-layout="list" title="List View">&#9776; List</button>
                            <button type="button" class="layout-btn is-active" data-layout="grid" title="Grid View">&#8862; Grid</button>
                        </div>
                    </div>
                    <!-- Search Input within Favorites -->
                    <div class="search-row-container">
                        <div class="search-row">
                            <input type="text" id="favsSearchInput" placeholder="Search in favorites&hellip;" autocomplete="off" />
                        </div>
                    </div>
                    <ul class="result-list view-grid" id="favsList"></ul>
                </section>
            </div>
        </div>
    </form>

</body>
</html>