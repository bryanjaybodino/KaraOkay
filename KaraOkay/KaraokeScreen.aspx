<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="KaraokeScreen.aspx.cs" Inherits="KaraOkay.KaraokeScreen" %>

<!DOCTYPE html>
<html lang="en">
<head runat="server">
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kara-Okay &mdash; Stage Screen</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Monoton&family=Manrope:wght@500;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
    <link href="assets/css/style.css" rel="stylesheet" />
</head>
<body>
    <form id="form1" runat="server">
        <div class="stage">

            <header class="stage__brand">
                <span class="logo">KARA<span class="logo__accent">-OKAY</span></span>
            </header>

            <div class="stage__code-panel">
                <div class="code-label">Join on your phone</div>
                <div class="code-value" id="roomCode">-----</div>
                <div class="code-hint">Open the remote page and enter this code</div>
            </div>

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

    <script src="assets/js/karaoke-common.js"></script>
    <script src="assets/js/screen.js"></script>
</body>
</html>
