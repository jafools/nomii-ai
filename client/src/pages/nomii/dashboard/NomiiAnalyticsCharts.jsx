import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getAnalytics } from "@/lib/nomiiApi";
import { MessageSquare, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

const cardStyle = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  backdropFilter: "blur(12px)",
};

const PERIOD_OPTIONS = [
  { key: "7d",  label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

// Fill gaps in daily data so chart has a point for every day in range
function fillDays(data, days, dayKey, valueKeys) {
  const now = Date.now();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now - (days - 1 - i) * 86400000);
    const dayStr = d.toISOString().slice(0, 10);
    const found = data.find(r => r[dayKey]?.slice(0, 10) === dayStr);
    const entry = { day: dayStr };
    for (const key of valueKeys) {
      entry[key] = found ? (parseInt(found[key]) || 0) : 0;
    }
    return entry;
  });
}

function fmtDay(dayStr, days) {
  const d = new Date(dayStr + "T00:00:00Z");
  if (days === 7) return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = new Date(label + "T00:00:00Z");
  const dateStr = d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
  return (
    <div style={{
      background: "#0F1A2E",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10,
      padding: "8px 12px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      minWidth: 120,
    }}>
      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginBottom: 5 }}>{dateStr}</p>
      {payload.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <div style={{ width: 7, height: 7, borderRadius: 2, background: item.color || item.stroke, flexShrink: 0 }} />
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{item.name}:</span>
          <span style={{ color: "#fff", fontSize: 11, fontWeight: 600, marginLeft: "auto", paddingLeft: 8 }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const SkeletonAnalytics = () => (
  <div className="mt-8 space-y-4">
    <div className="flex items-center justify-between">
      <div className="h-4 w-32 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
      <div className="h-7 w-28 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl h-16 animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
      ))}
    </div>
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-2xl h-56 animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
      <div className="rounded-2xl h-56 animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
    </div>
    <div className="rounded-2xl h-40 animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
  </div>
);

const NomiiAnalyticsCharts = () => {
  const [period, setPeriod] = useState("30d");
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAnalytics(period);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <SkeletonAnalytics />;

  const days    = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const msgData = fillDays(data?.daily_messages || [], days, "day", ["count"]);
  const cvData  = fillDays(data?.daily_conversations || [], days, "day", ["total", "escalated"]);

  const sum              = data?.summary || {};
  const total            = sum.total_conversations || 0;
  const escalated        = sum.escalated || 0;
  const resolved         = sum.resolved || 0;
  const totalMessages    = sum.total_messages || 0;
  const escalationRate   = total > 0 ? Math.round((escalated / total) * 100) : null;
  const resolutionRate   = total > 0 ? Math.round((resolved / total) * 100) : null;

  // Tick interval: show fewer labels on denser charts
  const tickInterval = days === 7 ? 0 : days === 30 ? 4 : 12;

  const noMessages = msgData.every(d => d.count === 0);
  const noConvs    = cvData.every(d => d.total === 0);

  const kpis = [
    {
      label: "Conversations",
      value: total.toLocaleString(),
      icon: MessageSquare,
      color: "#60A5FA",
    },
    {
      label: "Messages",
      value: totalMessages.toLocaleString(),
      icon: TrendingUp,
      color: "#A78BFA",
    },
    {
      label: "Escalation Rate",
      value: escalationRate === null ? "—" : `${escalationRate}%`,
      icon: AlertTriangle,
      color: escalationRate === null ? "rgba(255,255,255,0.2)"
           : escalationRate > 15    ? "#F87171"
           : escalationRate > 5     ? "#F59E0B"
           : "#4ADE80",
    },
    {
      label: "Resolution Rate",
      value: resolutionRate === null ? "—" : `${resolutionRate}%`,
      icon: CheckCircle,
      color: resolutionRate === null ? "rgba(255,255,255,0.2)"
           : resolutionRate >= 70   ? "#4ADE80"
           : resolutionRate >= 40   ? "#F59E0B"
           : "#F87171",
    },
  ];

  const topCustomers = data?.top_customers || [];

  return (
    <div className="mt-8">
      {/* Section header + period tabs */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
          Performance
        </h2>
        <div
          className="flex gap-0.5 rounded-lg p-0.5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {PERIOD_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className="px-3 py-1 rounded-md text-xs font-semibold transition-all duration-200"
              style={
                period === key
                  ? {
                      background: "rgba(201,168,76,0.18)",
                      color: "#C9A84C",
                      border: "1px solid rgba(201,168,76,0.25)",
                    }
                  : { color: "rgba(255,255,255,0.3)", border: "1px solid transparent" }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Period KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-xl p-3.5 flex items-center gap-3" style={cardStyle}>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${kpi.color}18` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: kpi.color }} />
              </div>
              <div className="min-w-0">
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5 truncate"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  {kpi.label}
                </p>
                <p className="text-lg font-bold tabular-nums leading-none" style={{ color: "rgba(255,255,255,0.88)" }}>
                  {kpi.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        {/* Message volume — area chart */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <p className="text-xs font-semibold mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
            Message Volume
          </p>
          {noMessages ? (
            <div className="h-36 flex items-center justify-center">
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>No messages in this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={msgData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#60A5FA" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#60A5FA" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => fmtDay(v, days)}
                  interval={tickInterval}
                  tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  content={<DarkTooltip />}
                  cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Messages"
                  stroke="#60A5FA"
                  strokeWidth={2}
                  fill="url(#msgGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#60A5FA", stroke: "#0B1222", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Conversations + escalations — line chart */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
              Conversations
            </p>
            <div className="flex items-center gap-4">
              {[
                { color: "#4ADE80", label: "Total" },
                { color: "#F87171", label: "Escalated" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          {noConvs ? (
            <div className="h-36 flex items-center justify-center">
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>No conversations in this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={cvData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => fmtDay(v, days)}
                  interval={tickInterval}
                  tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  content={<DarkTooltip />}
                  cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="#4ADE80"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#4ADE80", stroke: "#0B1222", strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="escalated"
                  name="Escalated"
                  stroke="#F87171"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#F87171", stroke: "#0B1222", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top customers */}
      {topCustomers.length > 0 && (
        <div className="rounded-2xl p-5" style={cardStyle}>
          <p className="text-xs font-semibold mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
            Top Customers by Activity
          </p>
          <div className="space-y-3.5">
            {topCustomers.map((c, i) => {
              const maxCount = topCustomers[0]?.message_count || 1;
              const pct = Math.round((c.message_count / maxCount) * 100);
              return (
                <div key={c.id || i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                        style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C" }}
                      >
                        {i + 1}
                      </div>
                      <span
                        className="text-[12px] font-medium truncate"
                        style={{ color: "rgba(255,255,255,0.62)" }}
                      >
                        {c.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-[11px] tabular-nums" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {c.conversation_count} {c.conversation_count === 1 ? "conv" : "convs"}
                      </span>
                      <span
                        className="text-[12px] font-semibold tabular-nums"
                        style={{ color: "rgba(255,255,255,0.65)" }}
                      >
                        {c.message_count} msgs
                      </span>
                    </div>
                  </div>
                  <div
                    className="h-1 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg, rgba(201,168,76,0.65), rgba(201,168,76,0.3))",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NomiiAnalyticsCharts;
