import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import ShenmayLogin from "./pages/shenmay/ShenmayLogin";
import ShenmaySignup from "./pages/shenmay/ShenmaySignup";
import ShenmayVerifyEmail from "./pages/shenmay/ShenmayVerifyEmail";
import ShenmayTerms from "./pages/shenmay/ShenmayTerms";
import ShenmayResetPassword from "./pages/shenmay/ShenmayResetPassword";
import ShenmayOnboarding from "./pages/shenmay/ShenmayOnboarding";
import ShenmayDashboardLayout from "./layouts/ShenmayDashboardLayout";
import ShenmayOverview from "./pages/shenmay/dashboard/ShenmayOverview";
import ShenmayConversations from "./pages/shenmay/dashboard/ShenmayConversations";
import ShenmayConversationDetail from "./pages/shenmay/dashboard/ShenmayConversationDetail";
import ShenmayCustomers from "./pages/shenmay/dashboard/ShenmayCustomers";
import ShenmayCustomerDetail from "./pages/shenmay/dashboard/ShenmayCustomerDetail";
import ShenmayConcerns from "./pages/shenmay/dashboard/ShenmayConcerns";
import ShenmaySettings from "./pages/shenmay/dashboard/ShenmaySettings";
import ShenmayProfile from "./pages/shenmay/dashboard/ShenmayProfile";
import ShenmayPlans from "./pages/shenmay/dashboard/ShenmayPlans";
import ShenmayTeam from "./pages/shenmay/dashboard/ShenmayTeam";
import ShenmayTools from "./pages/shenmay/dashboard/ShenmayTools";
import ShenmayAcceptInvite from "./pages/shenmay/ShenmayAcceptInvite";
import ShenmayProtectedRoute from "./components/shenmay/ShenmayProtectedRoute";
import { ShenmayAuthProvider } from "./contexts/ShenmayAuthContext";
import ShenmaySetup from "./pages/shenmay/ShenmaySetup";
import ShenmayLicenseSuccess from "./pages/shenmay/ShenmayLicenseSuccess";

const queryClient = new QueryClient();

// On first visit, check whether first-run setup is needed (self-hosted only).
// If the backend returns { required: true }, redirect to the setup wizard.
// Non-selfhosted deployments return 404 for this endpoint, which we ignore.
// On SaaS (shenmay.ai), unauthenticated visitors hitting the root should
// see the marketing page at pontensolutions.com/products/shenmay-ai — NOT
// a bare /login form. The login wall is a conversion killer for anyone
// who typed "shenmay.ai" into a browser or clicked a Google result.
//
// Existing sessions (valid portal token in localStorage) continue through
// the normal setup-status check below so they land on their dashboard.
// Self-hosted hostnames and staging hosts are unaffected.
const MARKETING_URL = 'https://pontensolutions.com/products/shenmay-ai';

const SetupRedirect = () => {
  const navigate = useNavigate();
  useEffect(() => {
    if (
      window.location.hostname === 'shenmay.ai' &&
      !localStorage.getItem('shenmay_portal_token')
    ) {
      window.location.replace(MARKETING_URL);
      return;
    }
    fetch("/api/setup/status")
      .then(r => r.ok ? r.json() : { required: false })
      .then(({ required }) => navigate(required ? "/setup" : "/login", { replace: true }))
      .catch(() => navigate("/login", { replace: true }));
  }, [navigate]);
  return null;
};

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

// Legacy redirect: any /shenmay/* path from before v3.0.4 (when the canonical
// routes lived under /shenmay/* because the SaaS was originally mounted at
// pontensolutions.com/nomii/*) maps to the same path with the prefix stripped.
// Preserves search params and hash so verify-email tokens, Stripe success URLs,
// and old browser bookmarks all continue to work.
const ShenmayLegacyRedirect = () => {
  const location = useLocation();
  const stripped = location.pathname.replace(/^\/shenmay/, '') || '/';
  return <Navigate to={stripped + location.search + location.hash} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          {/* Root → check setup status first, then redirect appropriately */}
          <Route path="/" element={<SetupRedirect />} />

          {/* First-run setup wizard (self-hosted only) */}
          <Route path="/setup" element={<ShenmaySetup />} />

          {/* Public auth routes */}
          <Route path="/login" element={<ShenmayLogin />} />
          <Route path="/signup" element={<ShenmaySignup />} />
          <Route path="/terms" element={<ShenmayTerms />} />
          <Route path="/verify-email" element={<ShenmayVerifyEmail />} />
          <Route path="/verify/:token" element={<ShenmayVerifyEmail />} />
          <Route path="/reset-password" element={<ShenmayResetPassword />} />
          <Route path="/accept-invite" element={<ShenmayAcceptInvite />} />

          {/* Post-purchase success page (self-hosted license checkout) */}
          <Route path="/license/success" element={<ShenmayLicenseSuccess />} />

          {/* Protected onboarding */}
          <Route path="/onboarding" element={
            <ShenmayProtectedRoute>
              <ShenmayAuthProvider>
                <ShenmayOnboarding />
              </ShenmayAuthProvider>
            </ShenmayProtectedRoute>
          } />

          {/* Protected dashboard */}
          <Route path="/dashboard" element={
            <ShenmayProtectedRoute>
              <ShenmayAuthProvider>
                <ShenmayDashboardLayout />
              </ShenmayAuthProvider>
            </ShenmayProtectedRoute>
          }>
            <Route index element={<ShenmayOverview />} />
            <Route path="conversations" element={<ShenmayConversations />} />
            <Route path="conversations/:id" element={<ShenmayConversationDetail />} />
            <Route path="customers" element={<ShenmayCustomers />} />
            <Route path="customers/:id" element={<ShenmayCustomerDetail />} />
            <Route path="concerns" element={<ShenmayConcerns />} />
            <Route path="tools" element={<ShenmayTools />} />
            <Route path="team" element={<ShenmayTeam />} />
            <Route path="plans" element={<ShenmayPlans />} />
            {/* Common-sense URL — sidebar labels the entry "Plans & billing"
                so guessing /dashboard/billing was sending users to the catch-all
                redirect to /dashboard with no signal. Land them on /plans. */}
            <Route path="billing" element={<Navigate to="/dashboard/plans" replace />} />
            <Route path="settings" element={<ShenmaySettings />} />
            <Route path="profile" element={<ShenmayProfile />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>

          {/* Legacy /shenmay/* prefix → strip prefix + 301-style redirect */}
          <Route path="/shenmay/*" element={<ShenmayLegacyRedirect />} />
          <Route path="/shenmay" element={<Navigate to="/" replace />} />

          {/* Catch-all → login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
