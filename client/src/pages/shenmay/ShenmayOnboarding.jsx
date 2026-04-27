import { useState, useEffect, useRef, Component } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { getMe, clearToken, getToken } from "@/lib/shenmayApi";
import { Building2, Package, Users, Code, Key, Check, ArrowRight, ChevronDown, LogOut, LayoutDashboard, CheckCircle2, AlertTriangle } from "lucide-react";
import Step1CompanyProfile from "@/components/shenmay/onboarding/Step1CompanyProfile";
import Step2Products from "@/components/shenmay/onboarding/Step2Products";
import Step3Customers from "@/components/shenmay/onboarding/Step3Customers";
import Step4InstallWidget from "@/components/shenmay/onboarding/Step4InstallWidget";
import StepApiKey from "@/components/shenmay/onboarding/StepApiKey";
import StepTools from "@/components/shenmay/onboarding/StepTools";
import ShenmayWordmark from "@/components/shenmay/ShenmayWordmark";
import { TOKENS as T, Kicker, Display, Lede, Button, PageShell } from "@/components/shenmay/ui/ShenmayUI";

const STEPS = [
  { key: "company_profile", label: "Company profile",    desc: "Tell us about your business", icon: Building2 },
  { key: "products",        label: "Products & services", desc: "What you offer",              icon: Package   },
  { key: "customers",       label: "Customer data",       desc: "Import your contacts",        icon: Users     },
  { key: "api_key",         label: "Connect AI",          desc: "Add your API key",            icon: Key       },
  { key: "tools",           label: "AI tools",            desc: "Give your agent abilities",   icon: Code      },
  { key: "install_widget",  label: "Add the widget",      desc: "Drop it on your site",        icon: Code      },
];

/* ── User pill (desktop) ── */
const UserPill = ({ admin }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const initials = ((admin?.first_name?.[0] || "") + (admin?.last_name?.[0] || "")).toUpperCase() || "?";
  const fullName = `${admin?.first_name || ""} ${admin?.last_name || ""}`.trim();
  const label = fullName || admin?.email || "";

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => { clearToken(); navigate("/login"); };

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={admin?.email || ""}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "transparent", border: `1px solid ${T.paperEdge}`, cursor: "pointer", color: T.ink }}
      >
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.ink, color: T.paper, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, fontFamily: T.sans }}>
          {initials}
        </div>
        <span style={{ fontSize: 12, color: T.inkSoft, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <ChevronDown size={12} color={T.mute} />
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 6, width: 200, background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 8, boxShadow: "0 8px 24px -12px rgba(26,29,26,0.2)", zIndex: 50, overflow: "hidden" }}>
          <Link
            to="/dashboard"
            onClick={() => setOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", fontSize: 13, color: T.ink, textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.paperDeep)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <LayoutDashboard size={14} color={T.mute} /> Dashboard
          </Link>
          <button
            onClick={handleLogout}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "10px 14px", fontSize: 13, color: T.danger, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F3E8E4")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      )}
    </div>
  );
};

const UserPillMobile = ({ admin }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const initials = ((admin?.first_name?.[0] || "") + (admin?.last_name?.[0] || "")).toUpperCase() || "?";

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ width: 32, height: 32, borderRadius: "50%", background: T.ink, color: T.paper, fontSize: 11, fontWeight: 500, border: "none", cursor: "pointer" }}>
        {initials}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 6, width: 180, background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 8, zIndex: 50, overflow: "hidden" }}>
          <Link to="/dashboard" onClick={() => setOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", fontSize: 13, color: T.ink, textDecoration: "none" }}>
            <LayoutDashboard size={14} color={T.mute} /> Dashboard
          </Link>
          <button onClick={() => { clearToken(); navigate("/login"); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", fontSize: 13, color: T.danger, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      )}
    </div>
  );
};

const ShenmayOnboarding = () => {
  const { shenmayTenant, setShenmayTenant, shenmayUser, setShenmayUser } = useShenmayAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [meData, setMeData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [wizardComplete, setWizardComplete] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = getToken();
    if (!token) { navigate("/login"); return; }

    setInitialLoading(true);
    getMe()
      .then((data) => {
        setMeData(data);
        if (data?.admin) setShenmayUser(data.admin);
        if (data?.tenant) setShenmayTenant(data.tenant);

        const steps = data?.tenant?.onboarding_steps != null && typeof data.tenant.onboarding_steps === "object" ? data.tenant.onboarding_steps : {};
        const done = new Set();
        const keyMap = { company: 0, company_profile: 0, products: 1, customers: 2, api_key: 3, tools: 4, widget: 5, install_widget: 5 };
        Object.entries(keyMap).forEach(([apiKey, idx]) => { if (steps[apiKey] === true) done.add(idx); });
        setCompletedSteps(done);

        if (steps.widget === true || steps.install_widget === true) { navigate("/dashboard", { replace: true }); return; }
        const resumeStep = STEPS.findIndex((_, i) => !done.has(i));
        setActiveStep(resumeStep >= 0 ? resumeStep : 0);
      })
      .catch(() => setActiveStep(0))
      .finally(() => setInitialLoading(false));
  }, []);

  const markComplete = (stepIndex) => setCompletedSteps((prev) => new Set([...prev, stepIndex]));
  const advance = (stepIndex) => { markComplete(stepIndex); if (stepIndex < STEPS.length - 1) setActiveStep(stepIndex + 1); };
  const onWidgetVerified = () => { markComplete(5); setWizardComplete(true); };

  const anyComplete = completedSteps.size > 0;
  const progress = Math.round((completedSteps.size / STEPS.length) * 100);

  if (initialLoading) {
    return (
      <PageShell style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ width: 28, height: 28, border: `2px solid ${T.teal}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <Kicker color={T.mute}>Loading your setup…</Kicker>
        </div>
      </PageShell>
    );
  }

  const admin = shenmayUser || meData?.admin;
  const stepProps = { shenmayTenant, setShenmayTenant, shenmayUser, markComplete, advance };

  const stepComponents = [
    <Step1CompanyProfile {...stepProps} stepIndex={0} />,
    <Step2Products {...stepProps} stepIndex={1} />,
    <Step3Customers {...stepProps} stepIndex={2} />,
    <StepApiKey onComplete={() => { markComplete(3); advance(3); }} tenant={shenmayTenant} />,
    <StepTools {...stepProps} stepIndex={4} onSkip={() => advance(4)} />,
    <Step4InstallWidget {...stepProps} stepIndex={5} onWidgetVerified={onWidgetVerified} />,
  ];

  return (
    <PageShell style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Sidebar (≥md) ────────────────────────────────── */}
      <aside className="shenmay-onboarding-sidebar"
        style={{
          display: "none",
          width: 304,
          minHeight: "100vh",
          background: T.paperDeep,
          borderRight: `1px solid ${T.paperEdge}`,
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <style>{`@media (min-width: 768px) { .shenmay-onboarding-sidebar { display: flex !important; } }`}</style>

        {/* Brand + user pill */}
        <div style={{ padding: "28px 28px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Link to="/dashboard" style={{ textDecoration: "none" }}>
              <ShenmayWordmark size={24} />
            </Link>
            {admin && <UserPill admin={admin} />}
          </div>
          <Kicker color={T.mute} style={{ display: "block", fontSize: 10, letterSpacing: "0.22em" }}>Setup wizard</Kicker>
        </div>

        {/* Progress bar */}
        <div style={{ padding: "12px 28px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <Kicker color={T.mute} style={{ fontSize: 10, letterSpacing: "0.16em" }}>Progress</Kicker>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500, color: T.teal, letterSpacing: "0.08em" }}>{progress}%</span>
          </div>
          <div style={{ height: 2, borderRadius: 2, background: T.paperEdge, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: T.teal, transition: "width 500ms ease" }} />
          </div>
        </div>

        {/* Steps nav */}
        <nav style={{ flex: 1, padding: "8px 16px" }}>
          {STEPS.map((step, i) => {
            const isActive = activeStep === i;
            const isDone = completedSteps.has(i);
            const Icon = step.icon;
            return (
              <button
                key={step.key}
                onClick={() => setActiveStep(i)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: isActive ? "#FFFFFF" : "transparent",
                  border: isActive ? `1px solid ${T.paperEdge}` : "1px solid transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  marginBottom: 4,
                  transition: "background 180ms, border-color 180ms",
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                  background: isDone ? T.teal : isActive ? T.ink : T.paperEdge,
                  color: isDone || isActive ? T.paper : T.mute,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  transition: "background 180ms, color 180ms",
                }}>
                  {isDone ? <Check size={14} /> : <Icon size={14} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? T.ink : T.inkSoft, letterSpacing: "-0.005em" }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: 11, color: T.mute, marginTop: 2, letterSpacing: "-0.005em" }}>
                    {step.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Skip to dashboard */}
        {anyComplete && (
          <div style={{ padding: 20, borderTop: `1px solid ${T.paperEdge}` }}>
            <Link to="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.teal, textDecoration: "none", fontWeight: 500, borderBottom: `1px solid ${T.teal}40` }}>
              Skip to dashboard <ArrowRight size={13} />
            </Link>
          </div>
        )}
      </aside>

      {/* ── Main ─────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: "auto" }}>
        {/* Mobile header */}
        <div className="shenmay-onboarding-mobile-header"
          style={{ display: "block", padding: "16px 20px", background: T.paperDeep, borderBottom: `1px solid ${T.paperEdge}` }}>
          <style>{`@media (min-width: 768px) { .shenmay-onboarding-mobile-header { display: none !important; } }`}</style>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Link to="/dashboard" style={{ textDecoration: "none" }}>
                <ShenmayWordmark size={20} />
              </Link>
              <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: T.teal, padding: "3px 8px", background: "rgba(15,95,92,0.1)", borderRadius: 4 }}>
                Step {activeStep + 1} of {STEPS.length}
              </span>
            </div>
            {admin && <UserPillMobile admin={admin} />}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => setActiveStep(i)}
                style={{
                  height: 2, flex: 1, borderRadius: 2, border: "none", padding: 0, cursor: "pointer",
                  background: completedSteps.has(i) ? T.teal : i === activeStep ? T.ink : T.paperEdge,
                  transition: "background 300ms",
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 56px" }}>
          {wizardComplete ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "48px 0" }}>
              <div style={{ width: 82, height: 82, borderRadius: "50%", background: "#EBF1E9", border: `1px solid #CDDCCA`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                <CheckCircle2 size={36} color={T.success} />
              </div>
              <Kicker color={T.success}>You're all set</Kicker>
              <Display size={36} italic style={{ marginTop: 12 }}>Your agent is live.</Display>
              <Lede style={{ marginTop: 12, maxWidth: 420 }}>
                Head to your dashboard to see conversations and manage your customers.
              </Lede>
              <div style={{ marginTop: 32 }}>
                <Link to="/dashboard" style={{ textDecoration: "none" }}>
                  <Button variant="primary" size="lg">Go to dashboard <ArrowRight size={15} /></Button>
                </Link>
              </div>
            </div>
          ) : (
            stepComponents[activeStep]
          )}
        </div>
      </main>
    </PageShell>
  );
};

/* ── Error boundary ── */
class OnboardingErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <PageShell style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", maxWidth: 440 }}>
            <div style={{ width: 58, height: 58, borderRadius: "50%", background: "#F3E8E4", border: `1px solid ${T.danger}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AlertTriangle size={26} color={T.danger} />
            </div>
            <Kicker color={T.danger}>Something went wrong</Kicker>
            <Display size={28} italic>The wizard hit a snag.</Display>
            <Lede style={{ marginTop: 0 }}>
              We hit an unexpected error loading the setup wizard. Try reloading, or head to the dashboard.
            </Lede>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <Button variant="ghost" onClick={() => window.location.reload()}>Reload page</Button>
              <a href="/dashboard" style={{ textDecoration: "none" }}>
                <Button variant="primary">Go to dashboard</Button>
              </a>
            </div>
          </div>
        </PageShell>
      );
    }
    return this.props.children;
  }
}

const ShenmayOnboardingWithBoundary = () => (
  <OnboardingErrorBoundary>
    <ShenmayOnboarding />
  </OnboardingErrorBoundary>
);

export default ShenmayOnboardingWithBoundary;
