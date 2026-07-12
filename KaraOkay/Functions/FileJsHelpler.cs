using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace KaraOkay
{
    public class FileJsHelpler
    {
        public static string ScriptVersion(string file)
        {
            var page = HttpContext.Current;
            string src = file + "?v=" + System.IO.File.GetLastWriteTime(page.Server.MapPath("~/" + file)).Ticks.ToString();
            return $"<script src='{src}' defer='defer'></script>";
        }
    }
}