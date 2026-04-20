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
      .then(({ required }) => navigate(required ? "/nomii/setup" : "/nomii/login", { replace: true }))
      .catch(() => navigate("/nomii/login", { replace: true }));
  }, [navigate]);
  return null;
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
          <Route path="/login" element={<Navigate to="/nomii/login" replace />} />
          <Route path="/signup" element={<Navigate to="/nomii/signup" replace />} />

          {/* First-run setup wizard (self-hosted only) */}
          <Route path="/nomii/setup" element={<ShenmaySetup />} />

          {/* Public auth routes */}
          <Route path="/nomii/login" element={<ShenmayLogin />} />
          <Route path="/nomii/signup" element={<ShenmaySignup />} />
          <Route path="/nomii/terms" element={<ShenmayTerms />} />
          <Route path="/nomii/verify-email" element={<ShenmayVerifyEmail />} />
          <Route path="/nomii/verify/:token" element={<ShenmayVerifyEmail />} />
          <Route path="/nomii/reset-password" element={<ShenmayResetPassword />} />
          <Route path="/nomii/accept-invite" element={<ShenmayAcceptInvite />} />

          {/* Post-purchase success page (self-hosted license checkout) */}
          <Route path="/nomii/license/success" element={<ShenmayLicenseSuccess />} />

          {/* Protected onboarding */}
          <Route path="/nomii/onboarding" element={
            <ShenmayProtectedRoute>
              <ShenmayAuthProvider>
                <ShenmayOnboarding />
              </ShenmayAuthProvider>
            </ShenmayProtectedRoute>
          } />

          {/* Protected dashboard */}
          <Route path="/nomii/dashboard" element={
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
            <Route path="*" element={<Navigate to="/nomii/dashboard" replace />} />
          </Route>

          {/* Catch-all → login */}
          <Route path="*" element={<Navigate to="/nomii/login" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
