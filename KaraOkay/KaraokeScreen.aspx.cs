using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.UI;
using System.Web.UI.WebControls;

namespace KaraOkay
{
    public partial class KaraokeScreen : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            if (!IsPostBack)
            {
                ScriptManager1.CompositeScript.Scripts.Add(new ScriptReference("~/assets/js/qrcode.min.js"));
                ScriptManager1.CompositeScript.Scripts.Add(new ScriptReference("~/assets/js/karaoke-common.js"));
                ScriptManager1.CompositeScript.Scripts.Add(new ScriptReference("~/assets/js/screen.js"));
                ScriptManager1.CompositeScript.Scripts.Add(new ScriptReference("~/assets/js/browser-security.js"));
            }
        }
    }
}