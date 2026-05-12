import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getMe, getBrandLearning, toggleBrandLearning } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { Brain, ToggleLeft, ToggleRight, Check, ArrowRight, ShieldCheck, Sparkles, Activity } from "lucide-react";
import { card } from "./_shared";

// Same single-source clock formatting the dashboard page uses, kept inline
// because this section deliberately doesn't depend on the larger page.
function timeAgo(dateStr) {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const BrandLearningSection = () => {
  const [loading, setLoading]   = useState(true);
  const [role, setRole]         = useState(null);
  const [bl, setBl]             = useState(null);   // { enabled, sessions_processed, last_run_at, summary }
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMe(), getBrandLearning()])
      .then(([me, status]) => {
        if (cancelled) return;
        setRole(me.admin?.role || null);
        setBl(status);
      })
      .catch(() => {
        // Silently bail — section will hide via role gate or render nothing.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading || role !== 'owner' || !bl) return null;

  const onToggle = async (next) => {
    setSaving(true);
    setSaved(false);
    try {
      await toggleBrandLearning(next);
      setBl(prev => ({ ...prev, enabled: next }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast({
        title: 'Could not update brand learning',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const learnedFacts =
    (bl.summary?.soul?.faqs       || 0) +
    (bl.summary?.soul?.processes  || 0) +
    (bl.summary?.soul?.voice_cues || 0);
  const pendingCandidates =
    (bl.summary?.memory?.candidate_faqs        || 0) +
    (bl.summary?.memory?.candidate_processes   || 0) +
    (bl.summary?.memory?.candidate_voice_cues  || 0);

  return (
    <section className="rounded-2xl p-5 sm:p-6" style={card}>
      <div className="flex items-center gap-2 mb-1">
        <Brain size={16} style={{ color: 'rgba(15,95,92,0.85)' }} />
        <h3 className="text-base font-semibold text-[#1A1D1A]/85">Brand learning</h3>
      </div>
      <p className="text-xs text-[#6B6B64] mb-4">
        Owner-only. Lets your AI distill aggregate, PII-scrubbed patterns from anonymous-visitor conversations
        over time. PII is regex-scrubbed and frequency-gated before any pattern enters the brand's memory.
      </p>

      <div className="flex items-start justify-between gap-4 p-4 rounded-xl"
           style={{ background: '#EDE7D7', border: '1px solid #EDE7D7' }}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#1A1D1A] mb-1">
            Let your AI learn from anonymous visitors
          </div>
          <p className="text-xs text-[#6B6B64] leading-relaxed">
            When ON, a nightly worker reads anonymous widget conversations, scrubs PII, and distills
            recurring questions, processes, and audience signals. Only patterns seen across multiple
            distinct sessions promote into the brand's persistent memory. Default OFF.
          </p>

          {/* Inline stats — shown only when enabled, otherwise it's noisy zeros */}
          {bl.enabled && (
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <Stat icon={Sparkles}    label="Sessions distilled" value={(bl.sessions_processed || 0).toLocaleString()} />
              <Stat icon={ShieldCheck} label="Learned facts"      value={learnedFacts} />
              <Stat icon={Activity}    label="Pending candidates" value={pendingCandidates} />
            </div>
          )}

          {bl.enabled && (
            <div className="mt-3 text-xs text-[#6B6B64]">
              Last cycle: <strong className="text-[#1A1D1A]">{timeAgo(bl.last_run_at)}</strong>
              <span className="mx-2">·</span>
              <Link
                to="/dashboard/brand-learning"
                className="inline-flex items-center gap-1 hover:underline"
                style={{ color: 'rgba(15,95,92,0.85)' }}
              >
                Manage learned facts <ArrowRight size={11} />
              </Link>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => onToggle(!bl.enabled)}
          className="flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label={bl.enabled ? 'Disable brand learning' : 'Enable brand learning'}
          style={{ color: bl.enabled ? '#0F5F5C' : '#6B6B64' }}
        >
          {bl.enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
        </button>
      </div>

      {saved && (
        <div className="mt-3 flex items-center gap-1.5 text-sm font-medium" style={{ color: '#2D6A4F' }}>
          <Check size={14} /> Saved
        </div>
      )}
    </section>
  );
};

const Stat = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.6)' }}>
    <Icon size={13} style={{ color: 'rgba(15,95,92,0.85)' }} />
    <div>
      <div style={{ fontSize: 14, color: '#1A1D1A', fontWeight: 500 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#6B6B64', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  </div>
);

export default BrandLearningSection;
