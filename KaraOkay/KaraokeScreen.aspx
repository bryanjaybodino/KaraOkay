<%@ Page Language="C#" AutoEventWireup="true" ViewStateMode="Disabled" EnableViewState="false" CodeBehind="KaraokeScreen.aspx.cs" Inherits="KaraOkay.KaraokeScreen" %>

<!DOCTYPE html>
<html lang="en" oncontextmenu="return false;">
<head runat="server">
    <meta charset="utf-8" />
    <title>Kara-Okay &mdash; Stage Screen</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Monoton&family=Manrope:wght@500;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
    <% Response.Write(KaraOkay.FileCssHelper.StyleSheetVersion("assets/css/style.css")); %>
</head>
<body oncontextmenu="return false;">
    <form id="form1" runat="server">
        <asp:ScriptManager ID="ScriptManager1" EnableCdn="false" EnablePageMethods="true" EnablePartialRendering="true" AsyncPostBackTimeout="99999999" ScriptMode="Release" ValidateRequestMode="Enabled" EnableScriptLocalization="true" EnableScriptGlobalization="true" LoadScriptsBeforeUI="false" CompositeScript-ScriptMode="Release" CompositeScript-ResourceUICultures="Release" runat="server"></asp:ScriptManager>
        <div class="stage" id="stageContainer">

            <header class="stage__header" style="display: none">
                <div class="stage__header-left">
                    <div class="stage__brand">
                        <span class="logo">KARA<span class="logo__accent">-OKAY</span></span>
                    </div>
                    <div class="stage__code-panel">
                        <div class="code-info">
                            <div class="code-label">Scan or enter</div>
                            <div class="code-value" id="roomCode">-----</div>
                        </div>
                        <div class="conn-status" id="connStatus" hidden></div>
                    </div>
                </div>
            </header>

            <div class="stage__main">
                <div class="player-frame" id="playerFrame">
                    <!-- Singer Score Overlay -->
                    <div class="score-overlay" id="scoreOverlay" hidden>
                        <div class="score-card">
                            <div class="eyebrow">PERFORMANCE SCORE</div>
                            <div class="score-card__singer" id="scoreSinger">Bryan Jay</div>
                            <div class="score-card__title" id="scoreTitle">Song Title</div>
                            <div class="score-card__number" id="scoreNumber">98</div>
                            <div class="score-card__rating" id="scoreRating">LEGENDARY!</div>
                        </div>
                    </div>
                    <div class="marquee-border"></div>
                    <div id="ytPlayer" class="iframe-blocker"></div>

                    <!-- Upcoming Song Pop-up Notification -->
                    <div class="upcoming-popup" id="upcomingPopup" hidden>
                        <div class="upcoming-popup__badge">UP NEXT</div>
                        <div class="upcoming-popup__singer" id="upcomingSinger">Next Singer</div>
                        <div class="upcoming-popup__title" id="upcomingTitle">Song Title</div>
                    </div>

                    <!-- On-Screen Message Banner -->
                    <div class="banner-message" id="bannerMessage" hidden>
                        <div class="banner-message__sender" id="bannerSender">Bryan Jay</div>
                        <div class="banner-message__text" id="bannerText">Happy Birthday! 🎉</div>
                    </div>
                    <!-- Floating Reactions Overlay Container -->
                    <div class="reaction-container" id="reactionContainer"></div>
                    <div class="idle-screen" id="idleScreen">
                        <div class="idle-screen__eq">
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <p>Waiting for the first song&hellip;</p>
                    </div>
                    <div class="start-overlay" id="startOverlay">
                        <button type="button" class="start-overlay__button" id="startOverlayBtn">&#127908; Tap to Start the Party</button>
                        <div class="start-overlay__hint" id="startOverlayHint">Browsers block autoplay with sound until the screen itself is tapped once &mdash; this only takes one tap for the whole party.</div>
                        <div class="start-overlay__paused-by" id="pausedByText" style="color: var(--gold); font-weight: bold; margin-top: 1vh;" hidden></div>
                    </div>
                    <!-- QR Code moved here as floating overlay -->
                    <div class="qr-overlay">
                        <div class="qr-overlay__label">SCAN HERE</div>
                        <div class="qr-overlay__container">
                            <div id="qrCode" class="code-qr"></div>
                        </div>
                    </div>
                </div>

                <aside class="queue-panel" id="queuePanel">
                    <!-- Upcoming Song Card with Large Thumbnail Preview -->
                    <div class="upcoming-song">
                        <button type="button"  style="position:absolute;top:1.2rem;right:1.2rem;" class="fullscreen-btn" id="fullscreenBtn" title="Toggle fullscreen" aria-label="Toggle fullscreen">
                            <svg class="fullscreen-btn__icon fullscreen-btn__icon--expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
                                <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
                                <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
                                <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
                            </svg>
                            <svg class="fullscreen-btn__icon fullscreen-btn__icon--collapse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" hidden>
                                <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
                                <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
                                <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
                                <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
                            </svg>
                        </button>
                        <div class="upcoming-song__badge">
                            <span class="pulse-dot"></span>UPCOMING SONG
                        </div>

                        <div class="upcoming-song__thumbnail-container">
                            <img
                                src="https://via.placeholder.com/600x340"
                                alt="Song Thumbnail"
                                class="upcoming-song__thumbnail"
                                id="upcomingThumbnail" />
                        </div>

                        <div class="upcoming-song__details">
                            <div class="upcoming-song__title" id="upcomingSongTitle">Nothing scheduled</div>
                            <div class="upcoming-song__singer" id="upcomingSingerName">&mdash;</div>
                        </div>
                    </div>

                    <!-- Rest of the Queue -->
                    <div class="up-next">
                        <div class="eyebrow">Queue List</div>
                        <ol class="queue-list" id="queueList">
                            <!-- Queue items will be rendered here dynamically -->
                        </ol>
                    </div>
                </aside>
            </div>

        </div>
    </form>
</body>
</html>
