// Shared date/time formatters for the Nomii dashboard.
//
// These were previously inlined inside pages/nomii/dashboard/*.jsx. Each
// variant is kept exactly as it was to preserve existing UI labels — we
// only deduped the identical implementations.

// Long style: "just now", "5m ago", "3h ago", "Yesterday", "5d ago", "Mar 12"
// Used by: NomiiOverview (recent conversations list), NomiiSettings (webhooks "Last triggered")
export const relativeTime = (dateStr) => {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// Compact style: "now", "5m", "3h", "Yesterday", "Mon", "Mar 12"
// Used by: NomiiConversations (conversation list — tight space)
export const relTime = (d) => {
  if (!d) return "";
  const diffMs = Date.now() - new Date(d);
  const mins   = Math.floor(diffMs / 60000);
  if (mins < 1)  return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7)   return new Date(d).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// Day-granularity relative: "Today", "Yesterday", "3 days ago"
// Used by: NomiiOverview (anonymous sessions table)
export const relativeDay = (dateStr) => {
  if (!dateStr) return "—";
  const now = new Date();
  const dt = new Date(dateStr);
  const diffDays = Math.floor((now - dt) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
};

// Message timestamp: "Mar 12, 2:15 PM"
// Used by: NomiiConversations & NomiiConversationDetail (chat message bubbles)
export const fmtTime = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
