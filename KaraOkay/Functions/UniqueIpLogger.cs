using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web;

namespace KaraOkay
{
    public class UniqueIpLogger
    {
        private static readonly object _lock = new object();
        private static readonly string folder = @"C:\KaraOkay\UniqueIPs\";

        public static void Save(string ip)
        {
            if (string.IsNullOrWhiteSpace(ip))
                return;

            try
            {
                Directory.CreateDirectory(folder);

                string today = DateTime.Now.ToString("yyyy-MM-dd");
                string path = Path.Combine(folder, $"{today}.txt");

                lock (_lock)
                {
                    HashSet<string> existingIps = File.Exists(path)
                        ? new HashSet<string>(
                            File.ReadAllLines(path)
                                .Select(line => line.Split('\t').FirstOrDefault())
                                .Where(x => !string.IsNullOrWhiteSpace(x)))
                        : new HashSet<string>();

                    if (!existingIps.Contains(ip))
                    {
                        string logLine = $"{ip}\t[{DateTime.Now:yyyy-MM-dd HH:mm:ss}]{Environment.NewLine}";
                        File.AppendAllText(path, logLine);
                    }
                }
            }
            catch (Exception ex)
            {
                ErrorLogs.Save("UniqueIpLogger failed: " + ex.Message);
            }
        }

        // Optional: get count of unique IPs for a given day (defaults to today)
        public static int GetCount(DateTime? date = null)
        {
            string day = (date ?? DateTime.Now).ToString("yyyy-MM-dd");
            string path = Path.Combine(folder, $"{day}.txt");
            return File.Exists(path) ? File.ReadAllLines(path).Count(l => !string.IsNullOrWhiteSpace(l)) : 0;
        }
    }
}