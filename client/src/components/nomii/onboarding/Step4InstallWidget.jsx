import { useState, useEffect, useRef } from "react";
import { getMe } from "@/lib/nomiiApi";
import { toast } from "@/hooks/use-toast";
import { Check, Copy, Download, ArrowRight } from "lucide-react";

const PLATFORMS = [
  { key: "wordpress", label: "WordPress" },
  { key: "webflow", label: "Webflow" },
  { key: "squarespace", label: "Squarespace" },
  { key: "wix", label: "Wix" },
  { key: "shopify", label: "Shopify" },
  { key: "react", label: "React / Next.js" },
  { key: "other", label: "Other" },
];

// Derive the API base URL from the current page for self-hosted compatibility.
// SaaS uses VITE_API_BASE_URL; self-hosted uses same-origin (nginx proxy).
const API_ORIGIN = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")
  : window.location.origin;

// When the user is not logged in → omit data-user-email → widget runs in Generic Brand AI mode.
// When the user is logged in     → pass their email → widget runs in Personal AI mode (memory + name).
const getSnippet = (widgetKey) =>
  `<!-- Nomii AI Widget -->\n<script\n  src="${API_ORIGIN}/embed.js"\n  data-widget-key="${widgetKey}"\n  async>\n</script>\n\n<!-- When a user is logged in on your site, add these attributes: -->\n<!-- data-user-email="user@example.com" -->\n<!-- data-user-name="Jane Doe" -->`;

const getReactSnippet = (widgetKey) =>
  `// Nomii AI Widget — Personal AI mode when logged in, Generic Brand AI when not\nuseEffect(() => {\n  const script = document.createElement('script');\n  script.src = '${API_ORIGIN}/embed.js';\n  script.setAttribute('data-widget-key', '${widgetKey}');\n  // Only pass email/name if the user is authenticated on your site:\n  if (user?.email) script.setAttribute('data-user-email', user.email);\n  if (user?.name)  script.setAttribute('data-user-name', user.name);\n  script.async = true;\n  document.body.appendChild(script);\n  return () => { document.body.removeChild(script); };\n}, [user?.email]); // re-run when auth state changes`;

const platformInstructions = {
  wordpress: (key) => ({
    description: "Install our WordPress plugin — no coding needed.",
    showDownload: true,
    steps: [
      "Download the plugin.",
      "Go to WordPress Admin → Plugins → Add New → Upload Plugin.",
      "Select the downloaded zip and click Install Now.",
      "Activate the plugin.",
      "Go to Settings → Nomii AI, paste your Widget Key, and save.",
    ],
  }),
  webflow: (key) => ({ description: "Go to Site Settings → Custom Code → Footer Code. Paste this before </body>:", snippet: getSnippet(key) }),
  squarespace: (key) => ({ description: "Go to Settings → Advanced → Code Injection → Footer. Paste this:", snippet: getSnippet(key) }),
  wix: (key) => ({ description: "Go to Settings → Custom Code → Add Code (bottom of page). Paste this:", snippet: getSnippet(key) }),
  shopify: (key) => ({ description: "Go to Online Store → Themes → Edit Code → theme.liquid. Find </body> and paste this just above it:", snippet: getSnippet(key) }),
  react: (key) => ({ description: "In your authenticated layout component, add this inside a useEffect:", snippet: getReactSnippet(key) }),
  other: (key) => ({ description: "Paste this snippet before </body> on every page where you want the widget:", snippet: getSnippet(key) }),
};

const Step4InstallWidget = ({ nomiiTenant, setNomiiTenant, markComplete, advance, stepIndex, onWidgetVerified }) => {
  const widgetKey = nomiiTenant?.widget_key || "YOUR_WIDGET_KEY";
  const [platform, setPlatform] = useState("wordpress");
  const [verified, setVerified] = useState(!!nomiiTenant?.widget_verified);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (verified) return;
    intervalRef.current = setInterval(async () => {
      try {
        const data = await getMe();
        if (data.tenant?.widget_verified) {
          setVerified(true);
          setNomiiTenant(data.tenant);
          toast({ title: "Widget connected!" });
          clearInterval(intervalRef.current);
          if (onWidgetVerified) onWidgetVerified();
        }
      } catch {}
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [verified]);

  const copyKey = () => {
    navigator.clipboard.writeText(widgetKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copySnippet = (text) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  };

  const info = platformInstructions[platform](widgetKey);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Add Nomii AI to your website</h2>
      <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.40)" }}>Follow the instructions below to install the Nomii AI widget. It only takes a minute.</p>

      {/* Two-mode explainer */}
      <div className="rounded-xl p-5 mb-8" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.15)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#C9A84C" }}>Two experiences, one widget</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Unauthenticated */}
          <div className="rounded-lg p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-sm" style={{ background: "rgba(255,255,255,0.08)" }}>👤</div>
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.80)" }}>Guest visitor</p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.40)" }}>
              Any visitor who isn't logged in gets a <strong style={{ color: "rgba(255,255,255,0.60)" }}>branded AI chatbot</strong> — knowledgeable about your business and products, always on, no signup required.
            </p>
            <p className="text-[11px] mt-2 font-mono px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.30)" }}>data-user-email omitted</p>
          </div>
          {/* Authenticated */}
          <div className="rounded-lg p-4" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.15)" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-sm" style={{ background: "rgba(201,168,76,0.15)" }}>⭐</div>
              <p className="text-sm font-semibold" style={{ color: "#C9A84C" }}>Logged-in user</p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.40)" }}>
              When a user is signed in on your site, the widget becomes their <strong style={{ color: "rgba(255,255,255,0.60)" }}>personal AI</strong> — it remembers their name, history, preferences, and picks up every conversation where they left off.
            </p>
            <p className="text-[11px] mt-2 font-mono px-2 py-1 rounded" style={{ background: "rgba(201,168,76,0.08)", color: "rgba(201,168,76,0.60)" }}>data-user-email="their@email.com"</p>
          </div>
        </div>
        <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.25)" }}>
          The same script tag handles both automatically — pass the user's email when they're logged in, omit it when they're not.
        </p>
      </div>

      {/* Widget Key */}
      <div className="rounded-xl p-4 mb-8 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <p className="text-[11px] font-semibold mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Your Widget Key</p>
          <code className="text-sm font-mono font-semibold" style={{ color: "#C9A84C" }}>{widgetKey}</code>
        </div>
        <button
          onClick={copyKey}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 hover:bg-white/[0.05]"
          style={{ borderColor: "rgba(201,168,76,0.30)", color: "#C9A84C" }}
        >
          {copied ? <Check className="h-3 w-3" style={{ color: "#4ADE80" }} /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied!" : "Copy key"}
        </button>
      </div>

      {/* Platform tabs */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>Select your platform</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPlatform(p.key)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all duration-200"
              style={
                platform === p.key
                  ? { background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", borderColor: "#C9A84C", color: "#0B1222" }
                  : { borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.50)", backgroundColor: "rgba(255,255,255,0.03)" }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="rounded-xl p-6 mb-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.70)" }}>{info.description}</p>

        {info.showDownload && (
          <>
            <a
              href={`${API_ORIGIN}/downloads/nomii-wordpress-plugin.zip`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold mb-4 transition-all duration-200 hover:shadow-lg hover:shadow-[#C9A84C]/20"
              style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
              download
            >
              <Download className="h-4 w-4" /> Download Plugin
            </a>
            <ol className="list-decimal list-inside text-sm space-y-2 mb-4" style={{ color: "rgba(255,255,255,0.50)" }}>
              {info.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </>
        )}

        {info.snippet && (
          <div className="relative rounded-lg overflow-hidden">
            <pre className="text-xs p-4 overflow-x-auto whitespace-pre-wrap" style={{ backgroundColor: "#0B1729", color: "#86EFAC" }}>{info.snippet}</pre>
            <button
              onClick={() => copySnippet(info.snippet)}
              className="absolute top-2 right-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.70)" }}
            >
              Copy
            </button>
          </div>
        )}

        {platform !== "wordpress" && platform !== "react" && (
          <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.30)" }}>
            When a user is signed in on your site, add <code className="font-mono px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.60)" }}>data-user-email</code> and <code className="font-mono px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.60)" }}>data-user-name</code> attributes with that user's details to activate Personal AI mode.
          </p>
        )}
      </div>

      {/* Verification */}
      <div className="rounded-xl p-5 flex items-center gap-4 transition-all duration-300" style={
        verified
          ? { background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.20)" }
          : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }
      }>
        {verified ? (
          <>
            <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.20)", border: "1px solid rgba(34,197,94,0.30)" }}>
              <Check className="h-5 w-5" style={{ color: "#4ADE80" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#4ADE80" }}>Widget connected!</p>
              <p className="text-xs" style={{ color: "rgba(74,222,128,0.65)" }}>Your agent is live on your website.</p>
            </div>
          </>
        ) : (
          <>
            <div className="h-10 w-10 rounded-full animate-pulse shrink-0" style={{ background: "rgba(255,255,255,0.10)" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.70)" }}>Waiting to detect your widget…</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>Load any page on your website after installing. We'll auto-detect it.</p>
            </div>
          </>
        )}
      </div>

    </div>
  );
};

export default Step4InstallWidget;
