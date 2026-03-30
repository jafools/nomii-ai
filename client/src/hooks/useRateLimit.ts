const RATE_LIMIT_PREFIX = "ponten_rate_";
const MAX_USES_PER_DAY = 3;

type RateLimitResult = {
  canUse: boolean;
  remaining: number;
  resetLabel: string;
};

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function checkRateLimit(toolId: string): RateLimitResult {
  const key = `${RATE_LIMIT_PREFIX}${toolId}`;
  const raw = localStorage.getItem(key);
  let data: { date: string; count: number } = { date: getTodayKey(), count: 0 };

  if (raw) {
    try {
      data = JSON.parse(raw);
      if (data.date !== getTodayKey()) {
        data = { date: getTodayKey(), count: 0 };
      }
    } catch {
      data = { date: getTodayKey(), count: 0 };
    }
  }

  const remaining = Math.max(0, MAX_USES_PER_DAY - data.count);
  return {
    canUse: remaining > 0,
    remaining,
    resetLabel: "tomorrow",
  };
}

export function recordUsage(toolId: string): void {
  const key = `${RATE_LIMIT_PREFIX}${toolId}`;
  const today = getTodayKey();
  const raw = localStorage.getItem(key);
  let data = { date: today, count: 0 };

  if (raw) {
    try {
      data = JSON.parse(raw);
      if (data.date !== today) data = { date: today, count: 0 };
    } catch {
      data = { date: today, count: 0 };
    }
  }

  data.count += 1;
  localStorage.setItem(key, JSON.stringify(data));
}
