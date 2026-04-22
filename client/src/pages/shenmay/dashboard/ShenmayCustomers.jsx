import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomers } from "@/lib/shenmayApi";
import { RefreshCw, AlertTriangle, Users, Search, X } from "lucide-react";

const PER_PAGE = 25;

const statusPill = {
  complete: { bg: "rgba(34,197,94,0.12)", color: "#4ADE80", label: "Complete" },
  in_progress: { bg: "rgba(245,158,11,0.12)", color: "#FBBF24", label: "In Progress" },
  pending: { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", label: "Pending" },
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

  // Debounce search input — wait 350ms after typing stops before fetching
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1); // reset to page 1 on new search
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchData = useCallback(async (bg = false) => {
    if (!bg) setLoading(true);
    setError(null);
    try {
      const res = await getCustomers(page, PER_PAGE, debouncedSearch);
      setData(res);
    } catch (e) {
      if (!bg) setError(e.message);
    } finally {
      if (!bg) setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchData();
    // Only auto-refresh when not searching (avoids flicker mid-search)
    if (!debouncedSearch) {
      intervalRef.current = setInterval(() => fetchData(true), 30000);
    }
    return () => clearInterval(intervalRef.current);
  }, [fetchData, debouncedSearch]);

  const customers = data?.customers || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const filtered = customers; // server-side search now handles filtering

  if (error && customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
          <AlertTriangle size={24} style={{ color: "#F87171" }} />
        </div>
        <p className="text-sm text-white/30">{error}</p>
        <button onClick={() => fetchData()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white/90 mb-0.5">Customers</h2>
          <p className="text-sm text-white/30">
            {total} total customer{total !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "rgba(255,255,255,0.2)" }} />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-[13px] placeholder:text-white/20 focus:outline-none focus:ring-1"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.8)",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
            >
              <X size={13} style={{ color: "rgba(255,255,255,0.3)" }} />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl p-6 animate-pulse" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="h-3.5 w-28 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="h-2.5 w-36 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Users className="h-10 w-10 mb-3" style={{ color: "rgba(255,255,255,0.07)" }} />
          <p className="text-sm text-white/20">{debouncedSearch ? `No customers matching "${debouncedSearch}"` : "No customers yet"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const name = c.display_name || c.email || "Unknown";
            const initial = name[0]?.toUpperCase() || "?";
            const email = c.email || "";
            const st = statusPill[c.onboarding_status] || statusPill.pending;
            const idle = idleText(c.idle_minutes);

            return (
              <button
                key={c.id}
                onClick={() => navigate(`/shenmay/dashboard/customers/${c.id}`)}
                className="rounded-2xl p-6 text-left transition-all duration-200 hover:scale-[1.01] group"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(201,168,76,0.06)";
                  e.currentTarget.style.borderColor = "rgba(201,168,76,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                }}
              >
                <div className="flex flex-col items-center text-center">
                  {/* Avatar */}
                  <div
                    className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold mb-3"
                    style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C" }}
                  >
                    {initial}
                  </div>

                  {/* Name */}
                  <p className="text-[14px] font-semibold text-white/80 truncate max-w-full">{name}</p>

                  {/* Email */}
                  {email && email !== name && (
                    <p className="text-[12px] text-white/25 truncate max-w-full mt-0.5">{email}</p>
                  )}

                  {/* Status pill */}
                  <span
                    className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold mt-3"
                    style={{ background: st.bg, color: st.color }}
                  >
                    {st.label}
                  </span>

                  {/* Idle time */}
                  {idle && (
                    <p className="text-[11px] mt-2" style={{ color: "rgba(255,255,255,0.2)" }}>
                      {idle}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > PER_PAGE && (
        <div className="flex items-center justify-between mt-6">
          <span className="text-[11px] text-white/20">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-4 py-2 rounded-lg text-[12px] font-medium disabled:opacity-30 transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 rounded-lg text-[12px] font-medium disabled:opacity-30 transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShenmayCustomers;
