using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.Caching;
using System.Web;

namespace KaraOkay
{
    public class IPAddressChecker
    {
        // ================================
        // 🔹 Session Keys
        // ================================
        private const string SESSION_INITIAL_IP = "InitialClientIP";
        private const string SESSION_IP_CHANGED = "IPChanged";
        private const string SESSION_IP_CHANGE_COUNT = "IPChangeCount";
        MyCookies myCookies = new MyCookies();
        public bool IsHttps()
        {
            var context = HttpContext.Current;
            var request = context.Request;

            // ✅ 1. Check if direct connection is HTTPS
            if (request.IsSecureConnection)
                return true;

            // ✅ 2. Cloudflare Tunnel / reverse proxy sets this header
            string proto = request.Headers["X-Forwarded-Proto"];
            if (!string.IsNullOrEmpty(proto))
                return proto.Equals("https", StringComparison.OrdinalIgnoreCase);

            // ✅ 3. Some proxies use this instead
            string forwardedProto = request.Headers["CF-Visitor"];
            if (!string.IsNullOrEmpty(forwardedProto))
                return forwardedProto.Contains("\"scheme\":\"https\"");

            // ✅ 4. Azure / AWS load balancers sometimes use this
            string frontEndHttps = request.Headers["Front-End-Https"];
            if (!string.IsNullOrEmpty(frontEndHttps))
                return frontEndHttps.Equals("on", StringComparison.OrdinalIgnoreCase);

            return false;
        }

        private static readonly MemoryCache Cache = MemoryCache.Default;

        // ================================
        // 🔹 Helper Methods
        // ================================
        private void EnsureSessionInitialized(HttpContext context)
        {
            if (context?.Session == null)
                return;

            try
            {
                // Force session creation
                var dummy = context.Session["_init"];
            }
            catch { }
        }

        private string GetSessionId()
        {
            try
            {
                return HttpContext.Current?.Session?.SessionID ?? "unknown";
            }
            catch
            {
                return "unknown";
            }
        }

        private string ExtractFirstFromForwardedFor(string forwardedFor)
        {
            if (string.IsNullOrEmpty(forwardedFor))
                return null;

            var ips = forwardedFor.Split(',');
            if (ips.Length > 0)
                return ips[0].Trim();

            return null;
        }

        // ================================
        // 🔹 Main IP Detection
        // ================================
        public string GetClientIP()
        {
            string userId = "";

            var context = HttpContext.Current;
            if (context == null)
                return null;

            var headers = context.Request.Headers;

            EnsureSessionInitialized(context);

            // ✅ 1. Try CF-Connecting-IP first (works if tunnel config is correct)
            string currentIP = headers["CF-Connecting-IP"];

            // ✅ 2. Cloudflare Tunnel often uses this instead
            if (string.IsNullOrEmpty(currentIP))
                currentIP = headers["X-Real-IP"];

            // ✅ 3. X-Forwarded-For — take the FIRST IP (real visitor)
            if (string.IsNullOrEmpty(currentIP))
            {
                currentIP = ExtractFirstFromForwardedFor(headers["X-Forwarded-For"]);
            }

            // ✅ 4. Last resort — direct connection IP
            if (string.IsNullOrEmpty(currentIP))
                currentIP = context.Request.UserHostAddress;

            // ✅ 5. Validate current IP
            if (!IPAddress.TryParse(currentIP, out var clientIpObj))
                return null;

            // ✅ 5.5 Track IP change in session EARLY
            TrackIPChange(currentIP, context);

            // ✅ 5.6 If IP has changed during session, use the INITIAL IP instead
            string ipToUse = currentIP;
            if (HasIPChanged())
            {
                string initialIP = GetInitialIP();
                if (!string.IsNullOrEmpty(initialIP))
                {
                    ipToUse = initialIP;
                    if (!IPAddress.TryParse(ipToUse, out clientIpObj))
                        return null;
                }
            }

            // ✅ 6. Check cache using SESSION ID (not the changing IP)
            string cacheKey = "ClientIP_" + GetSessionId();
            if (Cache.Get(cacheKey) is string cachedResult)
                return userId + cachedResult;

            // ✅ 7. Resolve subnet
            string result = IPAddress.IsLoopback(clientIpObj) ? LocalIp : ResolveSubnet(clientIpObj);

            Cache.Set(cacheKey, result, DateTimeOffset.UtcNow.AddMinutes(10));

            return userId + result;
        }

        private void TrackIPChange(string currentIP, HttpContext context)
        {
            if (context?.Session == null)
            {
                LogDebug("⚠️ Session is NULL in TrackIPChange!");
                return;
            }

            // ✅ 1. Store the initial IP on first visit
            if (context.Session[SESSION_INITIAL_IP] == null)
            {
                context.Session[SESSION_INITIAL_IP] = currentIP;
                context.Session[SESSION_IP_CHANGED] = false;
                context.Session[SESSION_IP_CHANGE_COUNT] = 0;
                LogDebug($"🟢 First visit. Storing initial IP: {currentIP}");
                return;
            }

            // ✅ 2. Get initial IP and compare with current IP
            string initialIP = context.Session[SESSION_INITIAL_IP]?.ToString();

            LogDebug($"📊 Session ID: {GetSessionId()}, Initial: {initialIP}, Current: {currentIP}");

            if (!string.IsNullOrEmpty(initialIP) && !initialIP.Equals(currentIP, StringComparison.OrdinalIgnoreCase))
            {
                // ✅ 3. IP has changed! Update session flags
                context.Session[SESSION_IP_CHANGED] = true;

                int changeCount = (int)(context.Session[SESSION_IP_CHANGE_COUNT] ?? 0);
                context.Session[SESSION_IP_CHANGE_COUNT] = changeCount + 1;

                LogDebug($"🔴 IP CHANGED! Initial: {initialIP}, Current: {currentIP}. Change count: {changeCount + 1}");
            }
        }

        // ================================
        // 🔹 Debug Logging
        // ================================
        private void LogDebug(string message)
        {
            try
            {
                // ErrorLogs.Save($"[IPAddressChecker] {message}");
            }
            catch { }
        }

        // ================================
        // 🔹 Check if IP Changed
        // ================================
        public bool HasIPChanged()
        {
            var session = HttpContext.Current?.Session;
            return session?[SESSION_IP_CHANGED] as bool? ?? false;
        }

        public string GetInitialIP()
        {
            var session = HttpContext.Current?.Session;
            return session?[SESSION_INITIAL_IP]?.ToString();
        }

        public int GetIPChangeCount()
        {
            var session = HttpContext.Current?.Session;
            return (int)(session?[SESSION_IP_CHANGE_COUNT] ?? 0);
        }

        public void ResetIPSession()
        {
            var session = HttpContext.Current?.Session;
            if (session != null)
            {
                session.Remove(SESSION_INITIAL_IP);
                session.Remove(SESSION_IP_CHANGED);
                session.Remove(SESSION_IP_CHANGE_COUNT);
                LogDebug("✅ IP Session reset");
            }
        }

        // ================================
        // 🔹 Local Network Detection
        // ================================
        private static readonly string LocalIp = GetLocalIpOnce();
        private static readonly NetworkInterface[] ActiveNics = GetActiveNicsOnce();

        private static string GetLocalIpOnce()
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;

                foreach (var unicast in nic.GetIPProperties().UnicastAddresses)
                {
                    if (unicast.Address.AddressFamily == AddressFamily.InterNetwork)
                        return unicast.Address.ToString();
                }
            }
            return null;
        }

        private static NetworkInterface[] GetActiveNicsOnce()
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up)
                .ToArray();
        }

        private string ResolveSubnet(IPAddress clientIp)
        {
            foreach (var nic in ActiveNics)
            {
                foreach (var unicast in nic.GetIPProperties().UnicastAddresses)
                {
                    if (unicast.Address.AddressFamily != AddressFamily.InterNetwork)
                        continue;

                    if (IsOnSameSubnet(clientIp, unicast.Address, unicast.IPv4Mask))
                        return clientIp.ToString();
                }
            }

            return clientIp.ToString();
        }

        private bool IsOnSameSubnet(IPAddress clientIp, IPAddress serverIp, IPAddress subnetMask)
        {
            var clientBytes = clientIp.GetAddressBytes();
            var serverBytes = serverIp.GetAddressBytes();
            var maskBytes = subnetMask.GetAddressBytes();

            for (int i = 0; i < 4; i++)
            {
                if ((clientBytes[i] & maskBytes[i]) != (serverBytes[i] & maskBytes[i]))
                    return false;
            }
            return true;
        }

        // ================================
        // 🔹 Ban System
        // ================================
        public class BanUser
        {
            public bool IsBanned(string ip)
            {
                return HttpContext.Current.Cache["ban_" + ip] != null;
            }

            public void BanIP(string ip, int minutes)
            {
                DateTime expiry = DateTime.UtcNow.AddMinutes(minutes);

                HttpContext.Current.Cache.Insert(
                    "ban_" + ip,
                    expiry,
                    null,
                    expiry,
                    System.Web.Caching.Cache.NoSlidingExpiration
                );
            }

            public int GetRemainingBanMinutes(string ip)
            {
                var expiry = HttpContext.Current.Cache["ban_" + ip] as DateTime?;

                if (expiry == null)
                    return 0;

                var remaining = expiry.Value - DateTime.UtcNow;

                return remaining.TotalMinutes > 0
                    ? (int)Math.Ceiling(remaining.TotalSeconds)
                    : 0;
            }
        }

        // ================================
        // 🔹 Lock System
        // ================================
        public class LockUser
        {
            public bool IsLocked(string key)
            {
                return HttpContext.Current.Cache["lock_" + key] != null;
            }

            public int GetRemainingLockedMinutes(string key)
            {
                var expiry = HttpContext.Current.Cache["lock_" + key] as DateTime?;

                if (expiry == null)
                    return 0;

                var remaining = expiry.Value - DateTime.UtcNow;

                return remaining.TotalMinutes > 0
                    ? (int)Math.Ceiling(remaining.TotalSeconds)
                    : 0;
            }

            public void Lock(string key, int minutes)
            {
                DateTime expiry = DateTime.UtcNow.AddMinutes(minutes);

                HttpContext.Current.Cache.Insert(
                    "lock_" + key,
                    expiry,
                    null,
                    expiry,
                    System.Web.Caching.Cache.NoSlidingExpiration
                );
            }

            public int IncrementAttempt(string key, int seconds = 60)
            {
                string cacheKey = "attempt_" + key;

                var entry = HttpContext.Current.Cache[cacheKey] as Tuple<int, DateTime>;

                if (entry == null || entry.Item2 < DateTime.UtcNow)
                {
                    entry = new Tuple<int, DateTime>(1, DateTime.UtcNow.AddSeconds(seconds));
                }
                else
                {
                    entry = new Tuple<int, DateTime>(entry.Item1 + 1, entry.Item2);
                }

                HttpContext.Current.Cache.Insert(cacheKey, entry, null, entry.Item2, System.Web.Caching.Cache.NoSlidingExpiration);

                return entry.Item1;
            }
        }
    }
}