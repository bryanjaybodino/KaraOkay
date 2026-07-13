using KaraOkay.BNetWebsocket;
using System;
using System.Net;
using System.Web;
using System.Web.Caching;

namespace KaraOkay
{
    public class Global : System.Web.HttpApplication
    {    // ================================
        // IP Detection (Proxy Safe)
        // ================================
        IPAddressChecker iPAddressChecker = new IPAddressChecker();
        IPAddressChecker.BanUser BanUser = new IPAddressChecker.BanUser();

        private static string _400ErrorHtml;
        private static string _403ErrorHtml;

        private void Error403(string ip)
        {
            if (_403ErrorHtml == null)
                _403ErrorHtml = System.IO.File.ReadAllText(Server.MapPath("~/HTML/403.html"));

            HttpContext.Current.Response.Clear();
            Response.TrySkipIisCustomErrors = true;
            Response.StatusCode = 403;
            Response.ContentType = "text/html";
            Response.Write(_403ErrorHtml);
            HttpContext.Current.ApplicationInstance.CompleteRequest();
        }

        private void Error400()
        {
            if (_400ErrorHtml == null)
                _400ErrorHtml = System.IO.File.ReadAllText(Server.MapPath("~/HTML/400.html"));

            Server.ClearError();
            Response.Clear();
            Response.TrySkipIisCustomErrors = true;
            Response.StatusCode = 400;
            Response.ContentType = "text/html";
            Response.Write(_400ErrorHtml);
            Response.End();
        }

        private void AspxExtensionCleaner()
        {
            string path = Request.AppRelativeCurrentExecutionFilePath;
            string query = Request.Url.Query;

            // Skip postbacks
            if (Request.HttpMethod == "POST")
                return;

            var q = (path + query).ToLowerInvariant();
            if (q.Contains("/page?") || q.Contains("/page.aspx?"))
            {
                // Https.Utility(this);
            }

            if (path.EndsWith(".aspx", StringComparison.OrdinalIgnoreCase))
            {
                string cleanUrl = path.Replace(".aspx", "");
                Response.Redirect(cleanUrl + query, true);
                return;
            }

            // Rewrite clean URL → .aspx internally
            if (!System.IO.Path.HasExtension(path))
            {
                string aspxPath = path + ".aspx";
                if (System.IO.File.Exists(Server.MapPath(aspxPath)))
                {
                    Context.RewritePath(aspxPath + query);
                }
            }
        }
        private void AntiBurstRequest(string ip)
        {
            string burstKey = "burst_" + ip;
            var burst = Context.Cache[burstKey] as Tuple<int, DateTime>;

            if (burst == null || burst.Item2 < DateTime.UtcNow)
                burst = new Tuple<int, DateTime>(1, DateTime.UtcNow.AddSeconds(5));
            else
                burst = new Tuple<int, DateTime>(burst.Item1 + 1, burst.Item2);

            Context.Cache.Insert(burstKey, burst, null, burst.Item2, Cache.NoSlidingExpiration);

            if (burst.Item1 > 75)
            {
                ErrorLogs.Save("AntiBurstRequest: " + ip);
                BanUser.BanIP(ip, 15);
                Error403(ip);
            }
        }
        private void UrlAbuseRequest(string ip)
        {
            if (Request.HttpMethod != "GET") return;

            string path = Request.Path.ToLowerInvariant();
            // Para hindi madamay ang pag view ng mga files at hindi ma block si Users na nag aaccess ng mga files
            if (path.Contains("aspx") || path.Contains("ashx"))
            {
                string key = $"url_{ip}_{path}";
                int count = Context.Cache[key] as int? ?? 0;
                count++;

                Context.Cache.Insert(key, count, null, DateTime.UtcNow.AddMinutes(1), Cache.NoSlidingExpiration);

                if (count > 50)
                {
                    ErrorLogs.Save("UrlAbuseRequest: " + ip);
                    BanUser.BanIP(ip, 15);
                    Error403(ip);
                }
            }
        }
        private void AntiLargePostBody(string ip)
        {
            if (Request.HttpMethod != "POST") return;

            string path = Request.Path.ToLowerInvariant();
            long contentLength = Request.ContentLength;
            long maxBytes = 0;

            if (path.Contains("karaoke")) maxBytes = 5L * 1024;
            else return;

            if (contentLength < 0 || contentLength > maxBytes)
            {
                ErrorLogs.Save($"AntiLargePostBody - Rejected: {contentLength} bytes : {path} : {ip}");
                Response.Clear();
                Response.TrySkipIisCustomErrors = true;
                Response.StatusCode = 200;
                Response.ContentType = "text/html";
                Response.Write("");
                HttpContext.Current.ApplicationInstance.CompleteRequest();
            }
        }
        protected void Application_Start(object sender, EventArgs e)
        {
            System.Net.ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13;
            System.Net.ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
            BNetWebsocket.Setup setup = new BNetWebsocket.Setup();
            setup.StartWebsocket();
        }
        protected void Application_BeginRequest(object sender, EventArgs e)
        {
            string ip = iPAddressChecker.GetClientIP();
            AntiLargePostBody(ip);

            var context = HttpContext.Current;
            var request = context.Request;
            var response = context.Response;
            string path = request.Path.ToLowerInvariant();


            var cookies = new MyCookies();
            try
            {
                int remaining = BanUser.GetRemainingBanMinutes(ip);
                double cookieRemaining = 0;

                if (cookies.ban_expiry != null)
                    cookieRemaining = (cookies.ban_expiry.Value - DateTime.UtcNow).TotalSeconds;

                if (remaining > 0)
                {
                    var correctExpiry = DateTime.UtcNow.AddSeconds(remaining);

                    if (cookies.ban_expiry == null ||
                        cookies.ban_expiry == DateTime.MinValue ||
                        cookies.ban_ip != ip ||
                        cookies.ban_expiry < DateTime.UtcNow ||
                        Math.Abs(cookieRemaining - remaining) > 5)
                    {
                        cookies.SetBanCookies(ip, correctExpiry);
                    }
                }
                else
                {
                    cookies.RemoveBanCookies();
                }
            }
            catch
            {
                cookies.RemoveBanCookies();
            }

            if (BanUser.IsBanned(ip))
            {
                Error403(ip);
                return;
            }


            AspxExtensionCleaner();

            // Skip heavy checks for static/framework resources
            if (path.EndsWith("/") ||
                path.EndsWith(".aspx") ||
                path.EndsWith(".css") ||
                path.EndsWith(".js") ||
                path.EndsWith(".json") ||
                path.EndsWith(".txt") ||
                path.EndsWith(".xml"))
            {
                return;
            }

            AntiBurstRequest(ip);
            UrlAbuseRequest(ip);
            UniqueIpLogger.Save(ip);
        }
        protected void Application_End(object sender, EventArgs e)
        {
        }

        protected void Application_Error(object sender, EventArgs e)
        {
        }

        protected void Session_Start(object sender, EventArgs e)
        {
        }

        protected void Session_End(object sender, EventArgs e)
        {
        }
    }
}