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
const SetupRedirect = () => {
  const navigate = useNavigate();
  useEffect(() => {
    fetch("/api/setup/status")
      .then(r => r.ok ? r.json() : { required: false })
      .then(({ required }) => navigate(required ? "/shenmay/setup" : "/shenmay/login", { replace: true }))
      .catch(() => navigate("/shenmay/login", { replace: true }));
  }, [navigate]);
  return null;
};

// Backward-compat shim for Phase 4 of the Shenmay rebrand. Redirects anything
// under /nomii/* to /shenmay/* preserving the deep path + query string, so old
// bookmarks, email magic links, and issued signup links keep working. Tracked
// for removal in docs/SHENMAY_MIGRATION_PLAN.md Phase 8 (~2027-04).
const NomiiToShenmayRedirect = () => {
  const { pathname, search, hash } = useLocation();
  const newPath = pathname.replace(/^\/nomii\b/, "/shenmay");
  return <Navigate to={`${newPath}${search}${hash}`} replace />;
};

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
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
          <Route path="/login" element={<Navigate to="/shenmay/login" replace />} />
          <Route path="/signup" element={<Navigate to="/shenmay/signup" replace />} />

          {/* First-run setup wizard (self-hosted only) */}
          <Route path="/shenmay/setup" element={<ShenmaySetup />} />

          {/* Public auth routes */}
          <Route path="/shenmay/login" element={<ShenmayLogin />} />
          <Route path="/shenmay/signup" element={<ShenmaySignup />} />
          <Route path="/shenmay/terms" element={<ShenmayTerms />} />
          <Route path="/shenmay/verify-email" element={<ShenmayVerifyEmail />} />
          <Route path="/shenmay/verify/:token" element={<ShenmayVerifyEmail />} />
          <Route path="/shenmay/reset-password" element={<ShenmayResetPassword />} />
          <Route path="/shenmay/accept-invite" element={<ShenmayAcceptInvite />} />

          {/* Post-purchase success page (self-hosted license checkout) */}
          <Route path="/shenmay/license/success" element={<ShenmayLicenseSuccess />} />

          {/* Protected onboarding */}
          <Route path="/shenmay/onboarding" element={
            <ShenmayProtectedRoute>
              <ShenmayAuthProvider>
                <ShenmayOnboarding />
              </ShenmayAuthProvider>
            </ShenmayProtectedRoute>
          } />

          {/* Protected dashboard */}
          <Route path="/shenmay/dashboard" element={
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
            <Route path="settings" element={<ShenmaySettings />} />
            <Route path="profile" element={<ShenmayProfile />} />
            <Route path="*" element={<Navigate to="/shenmay/dashboard" replace />} />
          </Route>

          {/* Backward-compat: /nomii/* → /shenmay/* preserves deep path + query */}
          <Route path="/nomii/*" element={<NomiiToShenmayRedirect />} />

          {/* Catch-all → login */}
          <Route path="*" element={<Navigate to="/shenmay/login" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
