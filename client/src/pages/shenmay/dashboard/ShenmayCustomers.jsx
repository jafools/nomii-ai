import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomers } from "@/lib/shenmayApi";
import { RefreshCw, AlertTriangle, Users, Search, X } from "lucide-react";
import { TOKENS as T, Kicker, Display, Lede, Button } from "@/components/shenmay/ui/ShenmayUI";

const PER_PAGE = 25;

const statusPill = {
  complete:    { color: T.success, label: "Complete" },
  in_progress: { color: T.warning, label: "In progress" },
  pending:     { color: T.mute,    label: "Pending" },
};

const idleText = (mins) => {
  if (mins == null) return null;
  if (mins <= 1) return "Active now";
  if (mins < 60) return `Active ${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `Last seen ${h}h ago`;
  const d = Math.floor(h / 24);
  return `Last seen ${d} day${d > 1 ? "s" : ""} ago`;
};

const ShenmayCustomers = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const intervalRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchData = useCallback(async (bg = false) => {
    if (!bg) setLoading(true);
    setError(null);
    try { const res = await getCustomers(page, PER_PAGE, debouncedSearch); setData(res); }
    catch (e) { if (!bg) setError(e.message); }
    finally { if (!bg) setLoading(false); }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchData();
    if (!debouncedSearch) intervalRef.current = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchData, debouncedSearch]);

  const customers = data?.customers || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  if (error && customers.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "72px 0", textAlign: "center" }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#F3E8E4", border: `1px solid ${T.danger}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AlertTriangle size={24} color={T.danger} />
        </div>
        <Lede style={{ marginTop: 0 }}>{error}</Lede>
        <Button variant="primary" onClick={() => fetchData()}><RefreshCw size={14} /> Retry</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20 }}>
        <div>
          <Kicker>Figure 01 · Who you know</Kicker>
          <Display size={38} italic style={{ marginTop: 12 }}>Customers.</Display>
          <Lede>
            {total} total customer{total !== 1 ? "s" : ""}.
          </Lede>
        </div>

        {/* Search */}
        <div style={{ position: "relative", width: "100%", maxWidth: 320 }}>
          <Search size={14} color={T.mute} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "10px 36px 10px 38px",
              fontFamily: T.sans, fontSize: 14, color: T.ink,
              background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 6,
              outline: "none", transition: "border-color 180ms",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.teal}1F`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = T.paperEdge; e.currentTarget.style.boxShadow = "none"; }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.mute, cursor: "pointer", padding: 4 }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 24, animation: "pulse 1.8s ease-in-out infinite" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ width: 54, height: 54, borderRadius: "50%", background: T.paperDeep }} />
                <div style={{ height: 14, width: 112, borderRadius: 3, background: T.paperEdge }} />
                <div style={{ height: 12, width: 140, borderRadius: 3, background: T.paperEdge }} />
              </div>
            </div>
          ))}
          <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.6 } }`}</style>
        </div>
      ) : customers.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "72px 0", gap: 12 }}>
          <Users size={32} color={T.paperEdge} />
          <Lede style={{ marginTop: 0 }}>{debouncedSearch ? `No customers matching "${debouncedSearch}"` : "No customers yet."}</Lede>
          {!debouncedSearch && (
            <p style={{ fontSize: 13, color: T.mute, margin: 0, textAlign: "center", maxWidth: 420, lineHeight: 1.5 }}>
              Customers appear automatically as visitors chat with your agents. To bulk-import a list,{' '}
              <a href="/onboarding" style={{ color: T.teal, textDecoration: "underline" }}>open setup</a>.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {customers.map((c) => {
            const name = c.display_name || c.email || "Unknown";
            const initial = name[0]?.toUpperCase() || "?";
            const email = c.email || "";
            const st = statusPill[c.onboarding_status] || statusPill.pending;
            const idle = idleText(c.idle_minutes);

            return (
              <button
                key={c.id}
                onClick={() => navigate(`/dashboard/customers/${c.id}`)}
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${T.paperEdge}`,
                  borderRadius: 10,
                  padding: 24,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: T.sans,
                  transition: "border-color 180ms, transform 180ms, background 180ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.background = T.paper; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.paperEdge; e.currentTarget.style.background = "#FFFFFF"; }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <div style={{ width: 54, height: 54, borderRadius: "50%", background: `${T.teal}12`, color: T.teal, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 500, marginBottom: 14 }}>
                    {initial}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: T.ink, letterSpacing: "-0.005em", maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {name}
                  </div>
                  {email && email !== name && (
                    <div style={{ fontSize: 12, color: T.mute, marginTop: 2, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {email}
                    </div>
                  )}
                  <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 3, background: `${st.color}18`, color: st.color, marginTop: 14 }}>
                    {st.label}
                  </span>
                  {idle && <div style={{ fontSize: 11, color: T.mute, marginTop: 10 }}>{idle}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > PER_PAGE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28 }}>
          <span style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: "0.08em", color: T.mute, textTransform: "uppercase" }}>
            Page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShenmayCustomers;
