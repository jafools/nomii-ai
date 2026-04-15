import { useState, useEffect, useRef, Component } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useNomiiAuth } from "@/contexts/NomiiAuthContext";
import { getMe, clearToken } from "@/lib/nomiiApi";
import { Building2, Package, Users, Code, Key, Check, ArrowRight, ChevronDown, LogOut, LayoutDashboard, CheckCircle2, AlertTriangle } from "lucide-react";
import nomiiLogo from "@/assets/nomiiai-full-dark.svg";
import Step1CompanyProfile from "@/components/nomii/onboarding/Step1CompanyProfile";
import Step2Products from "@/components/nomii/onboarding/Step2Products";
import Step3Customers from "@/components/nomii/onboarding/Step3Customers";
import Step4InstallWidget from "@/components/nomii/onboarding/Step4InstallWidget";
import StepApiKey from "@/components/nomii/onboarding/StepApiKey";
import StepTools from "@/components/nomii/onboarding/StepTools";

const STEPS = [
  { key: "company_profile", label: "Company Profile",    desc: "Tell us about your business", icon: Building2 },
  { key: "products",        label: "Products & Services", desc: "What you offer",              icon: Package   },
  { key: "customers",       label: "Customer Data",       desc: "Import your contacts",        icon: Users     },
  { key: "api_key",         label: "Connect AI",          desc: "Add your API key",            icon: Key       },
  { key: "tools",           label: "AI Tools",            desc: "Give your AI abilities",      icon: Code      },
  { key: "install_widget",  label: "Add the Widget",      desc: "Add to your website",         icon: Code      },
];

/* ── User Identity Pill ── */
const UserPill = ({ admin }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const initials = ((admin?.first_name?.[0] || "") + (admin?.last_name?.[0] || "")).toUpperCase() || "?";
  const email = admin?.email || "";

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    clearToken();
    navigate("/nomii/login");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/10"
      >
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
          style={{ backgroundColor: "#C9A84C", color: "#fff" }}
        >
          {initials}
        </div>
        <span className="text-xs truncate max-w-[140px] hidden sm:block" style={{ color: "rgba(255,255,255,0.7)" }}>
          {email}
        </span>
        <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.4)" }} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-48 rounded-lg py-1 z-50 shadow-lg"
          style={{ backgroundColor: "#0F1A2E", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Link
            to="/nomii/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.04]"
            style={{ color: "rgba(255,255,255,0.70)" }}
          >
            <LayoutDashboard size={14} style={{ color: "rgba(255,255,255,0.40)" }} /> Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left hover:bg-white/[0.04]"
            style={{ color: "#F87171" }}
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      )}
    </div>
  );
};

const NomiiOnboarding = () => {
  const { nomiiTenant, setNomiiTenant, nomiiUser, setNomiiUser } = useNomiiAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [meData, setMeData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [wizardComplete, setWizardComplete] = useState(false);
  const navigate = useNavigate();

  // Fetch fresh data on mount — determine correct step before rendering
  useEffect(() => {
    const token = localStorage.getItem("nomii_portal_token");
    if (!token) {
      navigate("/nomii/login");
      return;
    }

    setInitialLoading(true);
    getMe()
      .then((data) => {
        setMeData(data);
        if (data?.admin) setNomiiUser(data.admin);
        if (data?.tenant) setNomiiTenant(data.tenant);

        // Safely default onboarding_steps — never access props on null
        const steps =
          data?.tenant?.onboarding_steps != null &&
          typeof data.tenant.onboarding_steps === "object"
            ? data.tenant.onboarding_steps
            : {};

        const done = new Set();
        // Map both legacy short keys and current STEPS keys to step indices
        const keyMap = {
          company: 0, company_profile: 0,
          products: 1,
          customers: 2,
          api_key: 3,
          tools: 4,
          widget: 5, install_widget: 5,
        };
        Object.entries(keyMap).forEach(([apiKey, idx]) => {
          if (steps[apiKey] === true) done.add(idx);
        });
        setCompletedSteps(done);

        // Only redirect to dashboard if widget step is explicitly true
        if (steps.widget === true || steps.install_widget === true) {
          navigate("/nomii/dashboard", { replace: true });
          return;
        }

        // Resume at first incomplete step
        const resumeStep = STEPS.findIndex((_, i) => !done.has(i));
        setActiveStep(resumeStep >= 0 ? resumeStep : 0);
      })
      .catch(() => {
        // If getMe() fails for any reason, fall back to Step 1 — never crash
        setActiveStep(0);
      })
      .finally(() => setInitialLoading(false));
  }, []);

  const markComplete = (stepIndex) => {
    setCompletedSteps((prev) => new Set([...prev, stepIndex]));
  };

  const advance = (stepIndex) => {
    markComplete(stepIndex);
    if (stepIndex < STEPS.length - 1) setActiveStep(stepIndex + 1);
  };

  const onWidgetVerified = () => {
    markComplete(5);
    setWizardComplete(true);
  };

  const allComplete = STEPS.every((_, i) => completedSteps.has(i));
  const anyComplete = completedSteps.size > 0;
  const progress = Math.round((completedSteps.size / STEPS.length) * 100);

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0B1222" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#C9A84C", borderTopColor: "transparent" }} />
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>Loading your setup…</p>
        </div>
      </div>
    );
  }

  const admin = nomiiUser || meData?.admin;

  const stepProps = { nomiiTenant, setNomiiTenant, nomiiUser, markComplete, advance };

  const stepComponents = [
    <Step1CompanyProfile {...stepProps} stepIndex={0} />,
    <Step2Products {...stepProps} stepIndex={1} />,
    <Step3Customers {...stepProps} stepIndex={2} />,
    <StepApiKey onComplete={() => { markComplete(3); advance(3); }} tenant={nomiiTenant} />,
    <StepTools
      {...stepProps}
      stepIndex={4}
      onSkip={() => advance(4)}
    />,
    <Step4InstallWidget {...stepProps} stepIndex={5} onWidgetVerified={onWidgetVerified} />,
  ];

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#0B1222" }}>
      {/* Sidebar */}
      <aside className="hidden md:flex w-[280px] min-h-screen flex-col shrink-0 relative overflow-hidden" style={{ background: "linear-gradient(180deg, #1E3A5F 0%, #15294a 60%, #0f1e38 100%)" }}>
        {/* Decorative orbs */}
        <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] rounded-full opacity-[0.08]" style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)" }} />
        <div className="absolute top-1/3 -right-16 w-[200px] h-[200px] rounded-full opacity-[0.05]" style={{ background: "radial-gradient(circle, #5B9BD5, transparent 70%)" }} />

        {/* Logo + User pill */}
        <div className="p-6 pb-2 relative z-10">
          <div className="flex items-center justify-between mb-1">
            <Link to="/nomii/dashboard">
              <img src={nomiiLogo} alt="Nomii AI" className="h-14 brightness-0 invert" />
            </Link>
            {admin && <UserPill admin={admin} />}
          </div>
          <p className="text-[10px] font-medium tracking-widest uppercase mt-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>Setup Wizard</p>
        </div>

        {/* Progress */}
        <div className="px-6 py-4 relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Progress</span>
            <span className="text-[11px] font-bold" style={{ color: "#C9A84C" }}>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #C9A84C, #e0c06e)" }} />
          </div>
        </div>

        {/* Steps nav */}
        <nav className="flex-1 px-4 py-2 relative z-10">
          {STEPS.map((step, i) => {
            const isActive = activeStep === i;
            const isDone = completedSteps.has(i);
            const Icon = step.icon;
            return (
              <button
                key={step.key}
                onClick={() => setActiveStep(i)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left mb-1 transition-all duration-200"
                style={{
                  backgroundColor: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                }}
              >
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200"
                  style={
                    isDone
                      ? { backgroundColor: "#22C55E", color: "#fff" }
                      : isActive
                      ? { backgroundColor: "#C9A84C", color: "#fff" }
                      : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
                  }
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div>
                  <span className="block text-sm font-medium" style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.6)" }}>
                    {step.label}
                  </span>
                  <span className="block text-[11px]" style={{ color: isActive ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)" }}>
                    {step.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Bottom link */}
        {anyComplete && (
          <div className="p-5 relative z-10">
            <div className="border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              <Link
                to="/nomii/dashboard"
                className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
                style={{ color: "#C9A84C" }}
              >
                Skip to dashboard <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile header */}
        <div className="md:hidden p-4 border-b" style={{ backgroundColor: "#0F1A2E", borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Link to="/nomii/dashboard">
                <img src={nomiiLogo} alt="Nomii AI" className="h-12 brightness-0 invert" />
              </Link>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>
                Step {activeStep + 1} of {STEPS.length}
              </span>
            </div>
            {admin && (
              <div className="relative">
                <UserPillMobile admin={admin} />
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className="h-1.5 flex-1 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: completedSteps.has(i) ? "#22C55E" : i === activeStep ? "#C9A84C" : "rgba(255,255,255,0.10)",
                }}
              />
            ))}
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-6 py-10 md:px-8 md:py-12">
          {wizardComplete ? (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center mb-6"
                style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}
              >
                <CheckCircle2 className="h-10 w-10" style={{ color: "#4ADE80" }} />
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: "rgba(255,255,255,0.90)" }}>You're all set!</h2>
              <p className="text-sm max-w-md mb-8" style={{ color: "rgba(255,255,255,0.40)" }}>
                Your AI agent is live. Head to your dashboard to see conversations and manage your customers.
              </p>
              <Link
                to="/nomii/dashboard"
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-[#C9A84C]/20 group"
                style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
              >
                Go to Dashboard
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          ) : (
            stepComponents[activeStep]
          )}
        </div>
      </main>
    </div>
  );
};

/* Mobile user pill — simpler, no email shown */
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
    <div ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold"
        style={{ backgroundColor: "#1E3A5F", color: "#fff" }}
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg py-1 z-50 shadow-lg"
          style={{ backgroundColor: "#0F1A2E", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Link to="/nomii/dashboard" onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.04]" style={{ color: "rgba(255,255,255,0.70)" }}>
            <LayoutDashboard size={14} style={{ color: "rgba(255,255,255,0.40)" }} /> Dashboard
          </Link>
          <button onClick={() => { clearToken(); navigate("/nomii/login"); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left hover:bg-white/[0.04]" style={{ color: "#F87171" }}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      )}
    </div>
  );
};

/* ── Error Boundary ── */
class OnboardingErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0B1222" }}>
          <div className="flex flex-col items-center gap-4 text-center px-6">
            <div className="h-14 w-14 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <AlertTriangle className="h-7 w-7" style={{ color: "#F87171" }} />
            </div>
            <h2 className="text-xl font-bold" style={{ color: "rgba(255,255,255,0.90)" }}>Something went wrong</h2>
            <p className="text-sm max-w-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              We hit an unexpected error loading the setup wizard. You can try again or head to the dashboard.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:bg-white/[0.04]"
                style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.65)" }}
              >
                Reload page
              </button>
              <a
                href="/nomii/dashboard"
                className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:shadow-lg hover:shadow-[#C9A84C]/20"
                style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const NomiiOnboardingWithBoundary = () => (
  <OnboardingErrorBoundary>
    <NomiiOnboarding />
  </OnboardingErrorBoundary>
);

export default NomiiOnboardingWithBoundary;
