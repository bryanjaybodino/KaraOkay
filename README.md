# Kara-Okay

## Setup

1. Clone the repo.
2. Find your PC's network IP (`ipconfig` → IPv4 Address).
3. In `js/karaoke-common.js`, set:
   ```js
   WS_URL: "ws://YOUR_IP:7892"
   ```
4. Turn off your firewall so other devices can connect.
5. Run it one of these ways:
   - **Visual Studio Community 2026** — open the solution, hit F5.
   - **UltiDev Web Server** — point it at the project folder, start the site.
   - **IIS** — add a site pointed at the published project.
6. Open `KaraokeScreen.aspx` on your PC, `KaraokeRemote.aspx` on your phone.
