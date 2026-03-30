import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";

import NomiiLogin from "./pages/nomii/NomiiLogin";
import NomiiSignup from "./pages/nomii/NomiiSignup";
import NomiiVerifyEmail from "./pages/nomii/NomiiVerifyEmail";
import NomiiTerms from "./pages/nomii/NomiiTerms";
import NomiiResetPassword from "./pages/nomii/NomiiResetPassword";
import NomiiOnboarding from "./pages/nomii/NomiiOnboarding";
import NomiiDashboardLayout from "./layouts/NomiiDashboardLayout";
import NomiiOverview from "./pages/nomii/dashboard/NomiiOverview";
import NomiiConversations from "./pages/nomii/dashboard/NomiiConversations";
import NomiiConversationDetail from "./pages/nomii/dashboard/NomiiConversationDetail";
import NomiiCustomers from "./pages/nomii/dashboard/NomiiCustomers";
import NomiiCustomerDetail from "./pages/nomii/dashboard/NomiiCustomerDetail";
import NomiiConcerns from "./pages/nomii/dashboard/NomiiConcerns";
import NomiiSettings from "./pages/nomii/dashboard/NomiiSettings";
import NomiiProfile from "./pages/nomii/dashboard/NomiiProfile";
import NomiiPlans from "./pages/nomii/dashboard/NomiiPlans";
import NomiiTeam from "./pages/nomii/dashboard/NomiiTeam";
import NomiiTools from "./pages/nomii/dashboard/NomiiTools";
import NomiiAcceptInvite from "./pages/nomii/NomiiAcceptInvite";
import NomiiProtectedRoute from "./components/nomii/NomiiProtectedRoute";
import { NomiiAuthProvider } from "./contexts/NomiiAuthContext";

const queryClient = new QueryClient();

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
          {/* Root + shortcut URLs → login/signup */}
          <Route path="/" element={<Navigate to="/nomii/login" replace />} />
          <Route path="/login" element={<Navigate to="/nomii/login" replace />} />
          <Route path="/signup" element={<Navigate to="/nomii/signup" replace />} />

          {/* Public auth routes */}
          <Route path="/nomii/login" element={<NomiiLogin />} />
          <Route path="/nomii/signup" element={<NomiiSignup />} />
          <Route path="/nomii/terms" element={<NomiiTerms />} />
          <Route path="/nomii/verify-email" element={<NomiiVerifyEmail />} />
          <Route path="/nomii/verify/:token" element={<NomiiVerifyEmail />} />
          <Route path="/nomii/reset-password" element={<NomiiResetPassword />} />
          <Route path="/nomii/accept-invite" element={<NomiiAcceptInvite />} />

          {/* Protected onboarding */}
          <Route path="/nomii/onboarding" element={
            <NomiiProtectedRoute>
              <NomiiAuthProvider>
                <NomiiOnboarding />
              </NomiiAuthProvider>
            </NomiiProtectedRoute>
          } />

          {/* Protected dashboard */}
          <Route path="/nomii/dashboard" element={
            <NomiiProtectedRoute>
              <NomiiAuthProvider>
                <NomiiDashboardLayout />
              </NomiiAuthProvider>
            </NomiiProtectedRoute>
          }>
            <Route index element={<NomiiOverview />} />
            <Route path="conversations" element={<NomiiConversations />} />
            <Route path="conversations/:id" element={<NomiiConversationDetail />} />
            <Route path="customers" element={<NomiiCustomers />} />
            <Route path="customers/:id" element={<NomiiCustomerDetail />} />
            <Route path="concerns" element={<NomiiConcerns />} />
            <Route path="tools" element={<NomiiTools />} />
            <Route path="team" element={<NomiiTeam />} />
            <Route path="plans" element={<NomiiPlans />} />
            <Route path="settings" element={<NomiiSettings />} />
            <Route path="profile" element={<NomiiProfile />} />
          </Route>

          {/* Catch-all → login */}
          <Route path="*" element={<Navigate to="/nomii/login" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
