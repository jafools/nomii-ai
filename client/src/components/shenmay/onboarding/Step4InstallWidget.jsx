import { useState, useEffect, useRef } from "react";
import { getMe } from "@/lib/shenmayApi";
import { copyToClipboard } from "@/lib/clipboard";
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
  `<!-- Shenmay AI Widget -->\n<script\n  src="${API_ORIGIN}/embed.js"\n  data-widget-key="${widgetKey}"\n  async>\n</script>\n\n<!-- When a user is logged in on your site, add these attributes: -->\n<!-- data-user-email="user@example.com" -->\n<!-- data-user-name="Jane Doe" -->`;

const getReactSnippet = (widgetKey) =>
  `// Shenmay AI Widget — Personal AI mode when logged in, Generic Brand AI when not\nuseEffect(() => {\n  const script = document.createElement('script');\n  script.src = '${API_ORIGIN}/embed.js';\n  script.setAttribute('data-widget-key', '${widgetKey}');\n  // Only pass email/name if the user is authenticated on your site:\n  if (user?.email) script.setAttribute('data-user-email', user.email);\n  if (user?.name)  script.setAttribute('data-user-name', user.name);\n  script.async = true;\n  document.body.appendChild(script);\n  return () => { document.body.removeChild(script); };\n}, [user?.email]); // re-run when auth state changes`;

const platformInstructions = {
  wordpress: (key) => ({
    description: "Install our WordPress plugin — no coding needed.",
    showDownload: true,
    steps: [
      "Download the plugin.",
      "Go to WordPress Admin → Plugins → Add New → Upload Plugin.",
      "Select the downloaded zip and click Install Now.",
      "Activate the plugin.",
      "Go to Settings → Shenmay AI, paste your Widget Key, and save.",
    ],
  }),
  webflow: (key) => ({ description: "Go to Site Settings → Custom Code → Footer Code. Paste this before </body>:", snippet: getSnippet(key) }),
  squarespace: (key) => ({ description: "Go to Settings → Advanced → Code Injection → Footer. Paste this:", snippet: getSnippet(key) }),
  wix: (key) => ({ description: "Go to Settings → Custom Code → Add Code (bottom of page). Paste this:", snippet: getSnippet(key) }),
  shopify: (key) => ({ description: "Go to Online Store → Themes → Edit Code → theme.liquid. Find </body> and paste this just above it:", snippet: getSnippet(key) }),
  react: (key) => ({ description: "In your authenticated layout component, add this inside a useEffect:", snippet: getReactSnippet(key) }),
  other: (key) => ({ description: "Paste this snippet before </body> on every page where you want the widget:", snippet: getSnippet(key) }),
};

const Step4InstallWidget = ({ shenmayTenant, setShenmayTenant, markComplete, advance, stepIndex, onWidgetVerified }) => {
  const widgetKey = shenmayTenant?.widget_key || "YOUR_WIDGET_KEY";
  const [platform, setPlatform] = useState("wordpress");
  const [verified, setVerified] = useState(!!shenmayTenant?.widget_verified);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (verified) return;
    intervalRef.current = setInterval(async () => {
      try {
        const data = await getMe();
        if (data.tenant?.widget_verified) {
          setVerified(true);
          setShenmayTenant(data.tenant);
          toast({ title: "Widget connected!" });
          clearInterval(intervalRef.current);
          if (onWidgetVerified) onWidgetVerified();
        }
      } catch {}
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [verified]);

  const copyKey = () => {
    copyToClipboard(widgetKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copySnippet = (text) => {
    copyToClipboard(text);
    toast({ title: "Copied to clipboard!" });
  };

  const info = platformInstructions[platform](widgetKey);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fontWeight: 400, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0F5F5C" }}>Figure 06 · Go live</div>
        <h2 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 300, fontStyle: "italic", fontSize: 32, letterSpacing: "-0.04em", color: "#1A1D1A", lineHeight: 1.05, margin: "12px 0 0" }}>Drop the widget on your site.</h2>
        <p style={{ fontSize: 15, color: "#6B6B64", marginTop: 12, lineHeight: 1.55 }}>One snippet. About a minute. Follow the instructions below.</p>
      </div>

      {/* Two-mode explainer */}
      <div className="rounded-xl p-5 mb-8" style={{ background: "rgba(15,95,92,0.06)", border: "1px solid rgba(15,95,92,0.15)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#0F5F5C" }}>Two experiences, one widget</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Unauthenticated */}
          <div className="rounded-lg p-4" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-sm" style={{ background: "#EDE7D7" }}>👤</div>
              <p className="text-sm font-semibold" style={{ color: "#1A1D1A" }}>Guest visitor</p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "#6B6B64" }}>
              Any visitor who isn't logged in gets a <strong style={{ color: "#3A3D39" }}>branded AI chatbot</strong> — knowledgeable about your business and products, always on, no signup required.
            </p>
            <p className="text-[11px] mt-2 font-mono px-2 py-1 rounded" style={{ background: "#EDE7D7", color: "#6B6B64" }}>data-user-email omitted</p>
          </div>
          {/* Authenticated */}
          <div className="rounded-lg p-4" style={{ background: "rgba(15,95,92,0.06)", border: "1px solid rgba(15,95,92,0.15)" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-sm" style={{ background: "rgba(15,95,92,0.15)" }}>⭐</div>
              <p className="text-sm font-semibold" style={{ color: "#0F5F5C" }}>Logged-in user</p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "#6B6B64" }}>
              When a user is signed in on your site, the widget becomes their <strong style={{ color: "#3A3D39" }}>personal AI</strong> — it remembers their name, history, preferences, and picks up every conversation where they left off.
            </p>
            <p className="text-[11px] mt-2 font-mono px-2 py-1 rounded" style={{ background: "rgba(15,95,92,0.08)", color: "rgba(15,95,92,0.60)" }}>data-user-email="their@email.com"</p>
          </div>
        </div>
        <p className="text-xs mt-3" style={{ color: "#6B6B64" }}>
          The same script tag handles both automatically — pass the user's email when they're logged in, omit it when they're not.
        </p>
      </div>

      {/* Widget Key */}
      <div className="rounded-xl p-4 mb-8 flex items-center justify-between" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
        <div>
          <p className="text-[11px] font-semibold mb-1" style={{ color: "#6B6B64" }}>Your Widget Key</p>
          <code className="text-sm font-mono font-semibold" style={{ color: "#0F5F5C" }}>{widgetKey}</code>
        </div>
        <button
          onClick={copyKey}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 hover:bg-[#EDE7D7]"
          style={{ borderColor: "rgba(15,95,92,0.30)", color: "#0F5F5C" }}
        >
          {copied ? <Check className="h-3 w-3" style={{ color: "#2D6A4F" }} /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied!" : "Copy key"}
        </button>
      </div>

      {/* Platform tabs */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "#6B6B64" }}>Select your platform</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPlatform(p.key)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all duration-200"
              style={
                platform === p.key
                  ? { background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", borderColor: "#0F5F5C", color: "#F5F1E8" }
                  : { borderColor: "#D8D0BD", color: "#6B6B64", backgroundColor: "#EDE7D7" }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="rounded-xl p-6 mb-6" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
        <p className="text-sm mb-4" style={{ color: "#3A3D39" }}>{info.description}</p>

        {info.showDownload && (
          <>
            <a
              href={`${API_ORIGIN}/downloads/shenmay-wordpress-plugin.zip`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold mb-4 transition-all duration-200 hover:shadow-lg hover:shadow-[#0F5F5C]/20"
              style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}
              download
            >
              <Download className="h-4 w-4" /> Download Plugin
            </a>
            <ol className="list-decimal list-inside text-sm space-y-2 mb-4" style={{ color: "#6B6B64" }}>
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
              style={{ backgroundColor: "#D8D0BD", color: "#3A3D39" }}
            >
              Copy
            </button>
          </div>
        )}

        {platform !== "wordpress" && platform !== "react" && (
          <p className="text-xs mt-3" style={{ color: "#6B6B64" }}>
            When a user is signed in on your site, add <code className="font-mono px-1 py-0.5 rounded" style={{ background: "#EDE7D7", color: "#3A3D39" }}>data-user-email</code> and <code className="font-mono px-1 py-0.5 rounded" style={{ background: "#EDE7D7", color: "#3A3D39" }}>data-user-name</code> attributes with that user's details to activate Personal AI mode.
          </p>
        )}
      </div>

      {/* Verification */}
      <div className="rounded-xl p-5 flex items-center gap-4 transition-all duration-300" style={
        verified
          ? { background: "rgba(45,106,79,0.10)", border: "1px solid rgba(45,106,79,0.20)" }
          : { background: "#EDE7D7", border: "1px solid #EDE7D7" }
      }>
        {verified ? (
          <>
            <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(45,106,79,0.20)", border: "1px solid rgba(45,106,79,0.30)" }}>
              <Check className="h-5 w-5" style={{ color: "#2D6A4F" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#2D6A4F" }}>Widget connected!</p>
              <p className="text-xs" style={{ color: "rgba(45,106,79,0.65)" }}>Your agent is live on your website.</p>
            </div>
          </>
        ) : (
          <>
            <div className="h-10 w-10 rounded-full animate-pulse shrink-0" style={{ background: "#D8D0BD" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#3A3D39" }}>Waiting to detect your widget…</p>
              <p className="text-xs" style={{ color: "#6B6B64" }}>Load any page on your website after installing. We'll auto-detect it.</p>
            </div>
          </>
        )}
      </div>

    </div>
  );
};

export default Step4InstallWidget;
