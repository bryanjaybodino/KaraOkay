<%@ Page Language="C#" AutoEventWireup="true" ViewStateMode="Disabled" EnableViewState="false" CodeBehind="KaraokeScreen.aspx.cs" Inherits="KaraOkay.KaraokeScreen" %>


<!DOCTYPE html>
<html lang="en">
<head runat="server">
    <meta charset="utf-8" />
    <meta name="viewport" content="width=1280, initial-scale=1" />
    <title>Kara-Okay &mdash; Stage Screen</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Monoton&family=Manrope:wght@500;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
    <% Response.Write(KaraOkay.FileCssHelper.StyleSheetVersion("assets/css/style.css")); %>
</head>
<body>
    <form id="form1" runat="server">
        <asp:ScriptManager ID="ScriptManager1" EnableCdn="false" EnablePageMethods="true" EnablePartialRendering="true" AsyncPostBackTimeout="99999999" ScriptMode="Release" ValidateRequestMode="Enabled" EnableScriptLocalization="true" EnableScriptGlobalization="true" LoadScriptsBeforeUI="false" CompositeScript-ScriptMode="Release" CompositeScript-ResourceUICultures="Release" runat="server"></asp:ScriptManager>
        <div class="stage">

            <header class="stage__header">
                <div class="stage__brand">
                    <span class="logo">KARA<span class="logo__accent">-OKAY</span></span>
                </div>
                <div class="stage__code-panel">
                    <div class="code-info">
                        <div class="code-label">Scan or enter:</div>
                        <div class="code-value" id="roomCode">-----</div>
                    </div>
                    <div class="conn-status" id="connStatus" hidden></div>
                </div>
            </header>

            <div class="stage__main">
                <div class="player-frame" id="playerFrame">
                    <div class="marquee-border"></div>
                    <div id="ytPlayer"></div>
                    <div class="idle-screen" id="idleScreen">
                        <div class="idle-screen__eq">
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <p>Waiting for the first song&hellip;</p>
                    </div>
                    <div class="start-overlay" id="startOverlay">
                        <button type="button" class="start-overlay__button" id="startOverlayBtn">&#127908; Tap to Start the Party</button>
                        <div class="start-overlay__hint">Browsers block autoplay with sound until the screen itself is tapped once &mdash; this only takes one tap for the whole party.</div>
                    </div>
                    <!-- QR Code moved here as floating overlay -->
                    <div class="qr-overlay">
                        <div class="qr-overlay__label">SCAN HERE</div>
                        <div class="qr-overlay__container">
                            <div id="qrCode" class="code-qr"></div>
                        </div>
                    </div>
                </div>

                <aside class="queue-panel">
                    <div class="now-singing">
                        <div class="eyebrow">Now Singing</div>
                        <div class="now-singing__name" id="nowSingerName">&mdash;</div>
                        <div class="now-singing__title" id="nowSongTitle">Nothing yet</div>
                    </div>

                    <div class="up-next">
                        <div class="eyebrow">Up Next</div>
                        <ol class="queue-list" id="queueList"></ol>
                    </div>
                </aside>
            </div>

        </div>
    </form>
</body>
</html>
