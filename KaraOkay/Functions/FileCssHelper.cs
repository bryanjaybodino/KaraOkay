using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace KaraOkay
{
    public class FileCssHelper
    {
        public static string StyleSheetVersion(string file)
        {
            var page = HttpContext.Current;
            string href = file + "?v=" + System.IO.File.GetLastWriteTime(page.Server.MapPath("~/" + file)).Ticks.ToString();
            return $"<link href='{href}' rel='stylesheet' />";
        }
    }
}