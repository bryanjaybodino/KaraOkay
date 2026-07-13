using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Web;
using System.Web.Services.Protocols;
using System.Web.UI.WebControls;
using System.Xml.Linq;

namespace KaraOkay
{
    public class MyCookies
    {
        void SetCookie(string name, string value, bool encrypt = true)
        {
            DateTime expires = DateTime.Now.AddDays(30);
            HttpContext.Current.Response.Cookies.Remove(cookiePrefix + name);
            var cookie = new HttpCookie(cookiePrefix + name);
            cookie.Value = encrypt ? SecuredData.Encrypted(value ?? "") : value ?? "";
            cookie.Expires = expires;
            cookie.HttpOnly = true;
            cookie.Secure = HttpContext.Current.Request.IsSecureConnection;
            // FIX: Lax (not Strict) is required for PWA.
            // SameSite=Strict blocks cookies on the first request when the OS
            // launches the PWA (treated as a top-level cross-site navigation),
            // making count==0 and forcing a redirect to Login on every reopen.
            cookie.SameSite = SameSiteMode.Lax;
            HttpContext.Current.Response.Cookies.Set(cookie);
        }

        public string cookiePrefix
        {
            get
            {
                return "KaraOkay_";
            }
        }



        public void SetBanCookies(string ip, DateTime? banExpiry)
        {
            if (!banExpiry.HasValue) return;

            var expiry = banExpiry.Value;

            var c1 = new HttpCookie(cookiePrefix + "ban_expiry", expiry.ToString("o"));
            c1.Expires = expiry;
            c1.HttpOnly = false;
            c1.SameSite = SameSiteMode.Lax;
            HttpContext.Current.Response.Cookies.Set(c1);

            var c2 = new HttpCookie(cookiePrefix + "ban_ip", ip);
            c2.Expires = expiry;
            c2.HttpOnly = false;
            c2.SameSite = SameSiteMode.Lax;
            HttpContext.Current.Response.Cookies.Set(c2);
        }
        public void RemoveBanCookies()
        {
            var expired = DateTime.UtcNow.AddDays(-1);

            var c1 = new HttpCookie(cookiePrefix + "ban_expiry", "")
            {
                Expires = expired,
                HttpOnly = false,
                SameSite = SameSiteMode.Lax
            };
            HttpContext.Current.Response.Cookies.Set(c1);

            var c2 = new HttpCookie(cookiePrefix + "ban_ip", "")
            {
                Expires = expired,
                HttpOnly = false,
                SameSite = SameSiteMode.Lax
            };
            HttpContext.Current.Response.Cookies.Set(c2);
        }
        public DateTime? ban_expiry
        {
            get
            {
                try
                {

                    var cookie = HttpContext.Current.Request.Cookies[cookiePrefix + "ban_expiry"];
                    return Convert.ToDateTime(cookie?.Value);
                }
                catch { return null; }
            }
        }

        public string ban_ip
        {
            get
            {
                var cookie = HttpContext.Current.Request.Cookies[cookiePrefix + "ban_ip"];
                return cookie?.Value ?? "";
            }
        }


    }
}