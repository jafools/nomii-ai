import { useState, useEffect, useCallback, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import {
  clearToken,
  getBadgeCounts,
  getSubscription as fetchSubscriptionUsage,
  getNotifications,
  markNotificationsRead,
} from "@/lib/shenmayApi";
import SubscriptionGate from "@/components/shenmay/SubscriptionGate";
import { PLAN_LABELS, NOTIFICATION_TYPES } from "@/lib/constants";
import shenmayLogo from "@/assets/shenmay-full-dark.svg";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  AlertTriangle,
  Settings,
  LogOut,
  Menu,
  X,
  UserCircle,
  Zap,
  Users2,
  Wrench,
  Bell,
  Flag,
  MessageCircle,
  TrendingUp,
} from "lucide-react";

// ── Notification helpers ───────────────────────────────────────────────────
// Keys use the NOTIFICATION_TYPES enum from @/lib/constants.
const NOTIF_ICON = {
  [NOTIFICATION_TYPES.FLAG]:          { Icon: Flag,          color: "#EF4444" },
  [NOTIFICATION_TYPES.HUMAN_REPLY]:   { Icon: MessageCircle, color: "#C9A84C" },
  [NOTIFICATION_TYPES.ESCALATION]:    { Icon: TrendingUp,    color: "#F97316" },
  [NOTIFICATION_TYPES.LIMIT_REACHED]: { Icon: Zap,           color: "#EF4444" },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NotifItem({ n, onNavigate }) {
  const { Icon, color } = NOTIF_ICON[n.type] || { Icon: Bell, color: "#6B7280" };
  const isUnread = !n.read_at;
  return (
    <button
      onClick={() => onNavigate(n)}
      className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-white/[0.04]"
      style={{ borderLeft: isUnread ? `2px solid ${color}` : "2px solid transparent" }}
    >
      <div
        className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}
      >
        <Icon size={13} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium truncate" style={{ color: isUnread ? "#fff" : "rgba(255,255,255,0.55)" }}>
          {n.title}
        </p>
        {n.body && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
            {n.body}
          </p>
        )}
        <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
          {timeAgo(n.created_at)}
        </p>
      </div>
    </button>
  );
}

// Plan display helpers live in @/lib/constants as PLAN_LABELS (imported above).

function UsageBar({ label, used, limit, pct, nearLimit }) {
  if (limit === null || limit === undefined) return null; // unrestricted
  const barColor = pct >= 100 ? "#EF4444" : nearLimit ? "#F59E0B" : "#C9A84C";
  const displayPct = Math.min(100, pct ?? 0);
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
        <span className="text-[10px] font-semibold" style={{ color: nearLimit || pct >= 100 ? barColor : "rgba(255,255,255,0.45)" }}>
          {used?.toLocaleString() ?? 0} / {limit?.toLocaleString()}
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${displayPct}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

const NAV = [
  { label: "Overview",       icon: LayoutDashboard, to: "/nomii/dashboard",               end: true },
  { label: "Conversations",  icon: MessageSquare,   to: "/nomii/dashboard/conversations",  badge: "conversations" },
  { label: "Customers",      icon: Users,           to: "/nomii/dashboard/customers" },
  { label: "Concerns",       icon: AlertTriangle,   to: "/nomii/dashboard/concerns",       badge: "concerns" },
  { label: "AI Tools",       icon: Wrench,          to: "/nomii/dashboard/tools" },
  { label: "Team",           icon: Users2,          to: "/nomii/dashboard/team" },
  { label: "Plans & Billing",icon: Zap,             to: "/nomii/dashboard/plans" },
  { label: "Settings",       icon: Settings,        to: "/nomii/dashboard/settings" },
  { label: "Profile",        icon: UserCircle,      to: "/nomii/dashboard/profile" },
];

const PAGE_TITLES = {
  "/nomii/dashboard": "Overview",
  "/nomii/dashboard/conversations": "Conversations",
  "/nomii/dashboard/customers": "Customers",
  "/nomii/dashboard/concerns": "Concerns",
  "/nomii/dashboard/tools": "AI Tools",
  "/nomii/dashboard/team": "Team",
  "/nomii/dashboard/plans": "Plans & Billing",
  "/nomii/dashboard/settings": "Settings",
  "/nomii/dashboard/profile": "Profile",
};

const SidebarContent = ({ shenmayTenant, shenmayUser, badges, handleSignOut, subscription, usage }) => {
  const planInfo = subscription ? (PLAN_LABELS[subscription.plan] || PLAN_LABELS.free) : null;
  return (
  <div className="flex flex-col h-full">
    {/* Brand */}
    <div className="px-5 pt-7 pb-5">
      <img src={shenmayLogo} alt="Shenmay AI" className="h-8 block mx-auto" />
    </div>

    {/* Tenant pill */}
    {shenmayTenant && (
      <div className="mx-4 mb-4 rounded-xl px-4 py-3" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.12)" }}>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
            {shenmayTenant.name?.[0]?.toUpperCase() || "K"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white/90 truncate">{shenmayTenant.name}</p>
            {shenmayTenant.agent_name && (
              <p className="text-[11px] text-white/30 truncate">{shenmayTenant.agent_name}</p>
            )}
          </div>
          {planInfo && (
            <span
              className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
              style={{ background: `${planInfo.color}22`, color: planInfo.color, border: `1px solid ${planInfo.color}44` }}
            >
              {planInfo.label}
            </span>
          )}
        </div>

        {/* Usage meters */}
        {usage && (
          <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <UsageBar
              label="Customers"
              used={usage.customers_count}
              limit={usage.customers_limit}
              pct={usage.customers_pct}
              nearLimit={usage.near_customer_limit}
            />
            <UsageBar
              label="Messages this month"
              used={usage.messages_used}
              limit={usage.messages_limit}
              pct={usage.messages_pct}
              nearLimit={usage.near_message_limit}
            />
            {(usage.near_customer_limit || usage.near_message_limit) && (
              <NavLink
                to="/nomii/dashboard/plans"
                className="text-[10px] font-semibold hover:opacity-80 transition-opacity mt-1 block"
                style={{ color: "#F59E0B" }}
              >
                ⚠ Approaching limit — upgrade plan →
              </NavLink>
            )}
            {(usage.customer_limit_reached || usage.message_limit_reached) && (
              <NavLink
                to="/nomii/dashboard/plans"
                className="text-[10px] font-semibold hover:opacity-80 transition-opacity mt-1 block"
                style={{ color: "#EF4444" }}
              >
                ⛔ Limit reached — upgrade now →
              </NavLink>
            )}
          </div>
        )}
      </div>
    )}

    {/* Nav */}
    <nav className="flex-1 px-3 space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/20 px-3 mb-2">Menu</p>
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                isActive
                  ? "text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: "linear-gradient(135deg, rgba(201,168,76,0.16) 0%, rgba(201,168,76,0.06) 100%)",
                    color: "#C9A84C",
                    boxShadow: "inset 2px 0 0 #C9A84C, 0 1px 3px rgba(0,0,0,0.15)",
                  }
                : {}
            }
          >
            <Icon className="h-[17px] w-[17px] shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badge === "conversations" && badges.unread_conversations > 0 && (
              <span className="text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5" style={{ background: "rgba(234,179,8,0.9)", color: "#000" }}>
                {badges.unread_conversations > 99 ? "99+" : badges.unread_conversations}
              </span>
            )}
            {item.badge === "concerns" && badges.open_concerns > 0 && (
              <span className="text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5" style={{ background: badges.unread_concerns > 0 ? "rgba(239,68,68,0.9)" : "rgba(239,68,68,0.5)", color: "#fff" }}>
                {badges.open_concerns > 99 ? "99+" : badges.open_concerns}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>

    {/* Bottom */}
    <div className="px-4 pb-5">
      <div className="border-t border-white/[0.06] pt-4" />
      {shenmayUser && (
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
            {(shenmayUser.firstName?.[0] || "").toUpperCase()}{(shenmayUser.lastName?.[0] || "").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-white/70 font-medium truncate">
              {shenmayUser.firstName} {shenmayUser.lastName}
            </p>
            <p className="text-[11px] text-white/25 truncate">{shenmayUser.email}</p>
          </div>
        </div>
      )}
      <button
        onClick={handleSignOut}
        className="flex items-center gap-2 text-[12px] text-white/25 hover:text-white/60 transition-colors w-full px-1"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  </div>
  );
};

const ShenmayDashboardLayout = () => {
  const { shenmayUser, shenmayTenant, setShenmayUser, subscription } = useShenmayAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [badges, setBadges] = useState({ unread_conversations: 0, open_concerns: 0, unread_concerns: 0 });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [usageData, setUsageData] = useState(null);
  const badgeIntervalRef = useRef(null);

  // ── Notification state ──────────────────────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [notifOpen, setNotifOpen]         = useState(false);
  const notifRef                          = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {}
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  const handleBellClick = async () => {
    setNotifOpen(prev => !prev);
    // Mark all read when opening the panel
    if (!notifOpen && unreadCount > 0) {
      try {
        await markNotificationsRead();
        setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
        setUnreadCount(0);
      } catch {}
    }
  };

  const handleNotifNavigate = (n) => {
    setNotifOpen(false);
    if (n.resource_type === "conversation" && n.resource_id) {
      navigate(`/nomii/dashboard/conversations/${n.resource_id}`);
    } else {
      navigate("/nomii/dashboard/concerns");
    }
  };
  // ────────────────────────────────────────────────────────────────────────

  const fetchBadges = useCallback(async () => {
    try {
      const data = await getBadgeCounts();
      setBadges(data);
    } catch {}
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await fetchSubscriptionUsage();
      if (data?.usage) setUsageData(data.usage);
    } catch {}
  }, []);

  useEffect(() => {
    fetchBadges();
    fetchUsage();
    fetchNotifications();
    // Poll badges every 10s, notifications every 15s, usage every 60s
    badgeIntervalRef.current = setInterval(fetchBadges, 10000);
    const notifId = setInterval(fetchNotifications, 15000);
    const usageId = setInterval(fetchUsage, 60000);
    return () => {
      clearInterval(badgeIntervalRef.current);
      clearInterval(notifId);
      clearInterval(usageId);
    };
  }, [fetchBadges, fetchUsage, fetchNotifications]);

  // Refresh badges when navigating away from conversations/concerns (clear stale count)
  useEffect(() => { fetchBadges(); }, [location.pathname, fetchBadges]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleSignOut = () => {
    clearToken();
    setShenmayUser(null);
    navigate("/nomii/login", { replace: true });
  };

  const pageTitle =
    PAGE_TITLES[location.pathname] ||
    Object.entries(PAGE_TITLES).find(([k]) => location.pathname.startsWith(k))?.[1] ||
    "Dashboard";

  const sidebarProps = { shenmayTenant, shenmayUser, badges, handleSignOut, subscription, usage: usageData };

  return (
    <div className="min-h-screen flex" style={{ background: "#0B1222" }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex w-[250px] shrink-0 flex-col"
        style={{
          background: "linear-gradient(180deg, #0F1A2E 0%, #0A1525 60%, #0B1222 100%)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          minHeight: "100vh",
          position: "sticky",
          top: 0,
          boxShadow: "4px 0 24px rgba(0,0,0,0.20)",
        }}
      >
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside
            className="relative w-[270px] h-full flex flex-col z-50 overflow-y-auto"
            style={{ background: "linear-gradient(180deg, #0F1A2E 0%, #0B1222 100%)" }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-5 right-4 text-white/40 hover:text-white z-10"
            >
              <X size={18} />
            </button>
            <SidebarContent {...sidebarProps} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 min-h-screen flex flex-col">
        {/* Top bar */}
        <header
          className="h-14 flex items-center px-5 lg:px-8 sticky top-0 z-20 backdrop-blur-md"
          style={{ background: "rgba(11,18,34,0.85)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden mr-3 p-1.5 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <Menu size={20} />
          </button>
          <h1 className="text-sm font-semibold text-white/80">{pageTitle}</h1>

          {/* ── Notification bell ── */}
          <div className="ml-auto relative" ref={notifRef}>
            <button
              onClick={handleBellClick}
              className="relative p-2 rounded-lg transition-colors"
              style={{ color: notifOpen ? "#C9A84C" : "rgba(255,255,255,0.35)" }}
              aria-label="Notifications"
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 text-[9px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1"
                  style={{ background: "#EF4444", color: "#fff" }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {notifOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-80 rounded-xl overflow-hidden"
                style={{
                  background: "#0F1A2E",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
                  zIndex: 50,
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Notifications
                  </span>
                  {notifications.some(n => !n.read_at) && (
                    <button
                      onClick={async () => {
                        await markNotificationsRead();
                        setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
                        setUnreadCount(0);
                      }}
                      className="text-[10px] font-semibold transition-opacity hover:opacity-80"
                      style={{ color: "#C9A84C" }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="overflow-y-auto" style={{ maxHeight: "360px" }}>
                  {notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center" style={{ color: "rgba(255,255,255,0.2)", fontSize: "12px" }}>
                      <Bell size={20} className="mx-auto mb-2 opacity-30" />
                      No notifications yet
                    </div>
                  ) : (
                    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {notifications.map((n) => (
                        <NotifItem key={n.id} n={n} onNavigate={handleNotifNavigate} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* ── End notification bell ── */}
        </header>

        {/* Trial limit banner — shown on all pages when trial limits are exceeded */}
        {subscription && ["trial", "free"].includes(subscription.plan) && usageData &&
          (usageData.customer_limit_reached || usageData.message_limit_reached) && (
          <div
            className="px-5 lg:px-8 py-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between"
            style={{ background: "linear-gradient(90deg, #7C1F1F 0%, #991F1F 100%)", borderBottom: "1px solid rgba(239,68,68,0.30)" }}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5">⛔</span>
              <div>
                <p className="text-sm font-bold text-white">Trial limit reached — your AI agents are paused</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>
                  {usageData.customer_limit_reached && usageData.message_limit_reached
                    ? "You've used all trial customers and messages."
                    : usageData.customer_limit_reached
                    ? "You've reached the 1-customer trial limit."
                    : "You've used all 20 trial messages this month."}
                  {" "}Upgrade to restore service instantly.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <NavLink
                to="/nomii/dashboard/plans"
                className="text-xs font-bold px-3.5 py-2 rounded-lg transition-all"
                style={{ background: "#fff", color: "#991F1F" }}
              >
                View Plans
              </NavLink>
              <a
                href="https://pontensolutions.com/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold px-3.5 py-2 rounded-lg transition-all"
                style={{ border: "1px solid rgba(255,255,255,0.35)", color: "#fff" }}
              >
                Contact Sales
              </a>
            </div>
          </div>
        )}

        <main className={`flex-1 overflow-x-hidden ${location.pathname.startsWith("/nomii/dashboard/conversations") && !location.pathname.includes("/conversations/") ? "p-0" : "p-5 lg:p-8"}`}>
          {/* Plans + Profile are always accessible; everything else is gated */}
          {location.pathname.includes("/plans") || location.pathname.includes("/profile")
            ? <Outlet />
            : <SubscriptionGate subscription={subscription}><Outlet /></SubscriptionGate>
          }
        </main>
      </div>
    </div>
  );
};

export default ShenmayDashboardLayout;
