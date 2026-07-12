using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using BNet.WebSocket.Server;

namespace KaraOkay.BNetWebsocket
{
    /// <summary>
    /// Hosts the BNet WebSocket server that KaraokeScreen.aspx and
    /// KaraokeRemote.aspx connect to (ws://localhost:7892?room=CODE).
    /// Intentionally does no message handling: the BNet library already
    /// auto-relays every binary frame to the rest of the sender's room,
    /// which is all Kara-Okay needs. See KaraOkay/README.md for the
    /// message protocol the front-end pages use.
    /// </summary>
    public class Setup
    {
        private const int Port = 7892; // must match Karaoke.Config.WS_URL in js/karaoke-common.js

        private static readonly object _lock = new object();
        private static Connection _connection;

        public static bool IsRunning
        {
            get { return _connection != null && _connection.IsRunning; }
        }

        public void StartWebsocket()
        {
            lock (_lock)
            {
                if (_connection != null && _connection.IsRunning) return;

                _connection = new Connection(Port);

                _connection.OnConnectedClient += Connection_OnConnectedClient;
                _connection.OnDisconnectedClient += Connection_OnDisconnectedClient;
                _connection.OnBinaryReceived += Connection_OnBinaryReceived;
                _connection.OnReceived += Connection_OnReceived;
                _connection.OnError += Connection_OnError;

                // No certificate loaded => plain ws:// (fine for local/LAN use).
                // For a real deploy, call _connection.LoadCertificate(path, password)
                // here first and switch the front-end WS_URL to wss://.
                _connection.StartAsync();

                Log("Kara-Okay WebSocket server started on ws://localhost:" + Port);
            }
        }

        public void StopWebsocket()
        {
            lock (_lock)
            {
                if (_connection == null) return;
                _connection.StopAsync();
                _connection = null;
            }
        }

        private void Connection_OnConnectedClient(object sender, EventHandlers.ConnectedClientEventArgs e)
        {
            Log("Client connected. Total: " + e.Count);
        }

        private void Connection_OnDisconnectedClient(object sender, EventHandlers.DisconnectedClientEventArgs e)
        {
            Log("Client disconnected. Remaining: " + e.Count);
        }

        private void Connection_OnBinaryReceived(object sender, EventHandlers.BinaryReceivedEventArgs e)
        {
            // No handling needed here — BNet already relayed this to the room.
            Log("Binary relayed: " + e.Data.Length + " bytes");
        }

        private void Connection_OnReceived(object sender, EventHandlers.ReceivedEventArgs e)
        {
            // Kara-Okay only ever sends binary frames from the browser;
            // a text frame here means something unexpected connected.
            Log("Text received (ignored): " + e.Message);
        }

        private void Connection_OnError(object sender, EventHandlers.ErrorEventArgs e)
        {
            Log("Error: " + e.Message);
        }

        private static void Log(string message)
        {
            System.Diagnostics.Debug.WriteLine("[Kara-Okay WS] " + message);
        }
    }
}