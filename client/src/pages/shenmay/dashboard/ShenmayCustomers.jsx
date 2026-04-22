import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomers } from "@/lib/shenmayApi";
import { RefreshCw, AlertTriangle, Users, Search, X } from "lucide-react";

const PER_PAGE = 25;

const statusPill = {
  complete: { bg: "rgba(45,106,79,0.12)", color: "#2D6A4F", label: "Complete" },
  in_progress: { bg: "rgba(245,158,11,0.12)", color: "#A6660E", label: "In Progress" },
  pending: { bg: "#EDE7D7", color: "#6B6B64", label: "Pending" },
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
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(122,31,26,0.1)" }}>
          <AlertTriangle size={24} style={{ color: "#7A1F1A" }} />
        </div>
        <p className="text-sm text-[#6B6B64]">{error}</p>
        <button onClick={() => fetchData()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
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
          <h2 className="text-xl font-bold text-[#1A1D1A] mb-0.5">Customers</h2>
          <p className="text-sm text-[#6B6B64]">
            {total} total customer{total !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#6B6B64" }} />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-[13px] placeholder:text-[#6B6B64] focus:outline-none focus:ring-1"
            style={{
              background: "#EDE7D7",
              border: "1px solid #EDE7D7",
              color: "#1A1D1A",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
            >
              <X size={13} style={{ color: "#6B6B64" }} />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl p-6 animate-pulse" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-full" style={{ background: "#EDE7D7" }} />
                <div className="h-3.5 w-28 rounded" style={{ background: "#EDE7D7" }} />
                <div className="h-2.5 w-36 rounded" style={{ background: "#EDE7D7" }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Users className="h-10 w-10 mb-3" style={{ color: "#EDE7D7" }} />
          <p className="text-sm text-[#6B6B64]">{debouncedSearch ? `No customers matching "${debouncedSearch}"` : "No customers yet"}</p>
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
                  background: "#EDE7D7",
                  border: "1px solid #EDE7D7",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(15,95,92,0.06)";
                  e.currentTarget.style.borderColor = "rgba(15,95,92,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#EDE7D7";
                  e.currentTarget.style.borderColor = "#EDE7D7";
                }}
              >
                <div className="flex flex-col items-center text-center">
                  {/* Avatar */}
                  <div
                    className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold mb-3"
                    style={{ background: "rgba(15,95,92,0.15)", color: "#0F5F5C" }}
                  >
                    {initial}
                  </div>

                  {/* Name */}
                  <p className="text-[14px] font-semibold text-[#1A1D1A] truncate max-w-full">{name}</p>

                  {/* Email */}
                  {email && email !== name && (
                    <p className="text-[12px] text-[#6B6B64] truncate max-w-full mt-0.5">{email}</p>
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
                    <p className="text-[11px] mt-2" style={{ color: "#6B6B64" }}>
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
          <span className="text-[11px] text-[#6B6B64]">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-4 py-2 rounded-lg text-[12px] font-medium disabled:opacity-30 transition-colors"
              style={{ border: "1px solid #EDE7D7", color: "#6B6B64" }}
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 rounded-lg text-[12px] font-medium disabled:opacity-30 transition-colors"
              style={{ border: "1px solid #EDE7D7", color: "#6B6B64" }}
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
