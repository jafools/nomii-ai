// Default to same-origin (empty string) for self-hosted deployments where
// nginx proxies /api/ to the backend. SaaS builds set VITE_API_BASE_URL
// at build time to point at the separate API subdomain.
const BASE_URL = ((import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL || "").replace(/\/$/, "");

// ── Types ────────────────────────────────────────────────────────────────────
//
// These describe the shape of JSON bodies the backend accepts and responses
// the React UI consumes. The backend remains the authoritative validator —
// these types make the wrapper signatures readable and give IDE autocomplete
// at call sites without changing any runtime behaviour.

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Error thrown by `apiRequest` for non-2xx responses. Carries the server's
 * stable machine-readable `code` (e.g. "email_unverified") and HTTP status
 * for callers that branch on either.
 */
export type ApiError = Error & {
  code?: string | null;
  status?: number;
};

export interface ProductRecord {
  name?: string;
  description?: string;
  category?: string;
  price_info?: string;
  notes?: string;
}

export interface ConversationFilters {
  status?: string;
  mode?: string;
  unread?: boolean;
  search?: string;
}

/**
 * Soft-error payload returned by /api/onboard/login when the email isn't
 * verified — surfaced to the UI without throwing so the resend-verification
 * flow can render in place.
 */
export interface LoginError {
  error: string;
  code: string;
  email?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  agent_name: string;
  widget_key: string;
  primary_color: string;
  secondary_color: string;
  onboarding_steps: Record<string, boolean> | string[] | null;
  widget_verified: boolean;
}

export interface Admin {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "owner" | "admin" | "member" | "agent";
}

/** Response body of /api/onboard/verify/:token and /api/onboard/login. */
export interface AuthResponse {
  token: string;
  tenant: Tenant;
  admin: Admin;
}

/** Curate-API target shape used by brand-learning items/delete + items/promote. */
export interface BrandLearningTarget {
  source: "soul" | "memory" | "audience_profile" | "audience_candidate";
  bucket: string;
  canonical_key: string;
}

// ── Token helpers ────────────────────────────────────────────────────────────

const TOKEN_KEY = "shenmay_portal_token";

/** Current portal JWT from localStorage (or `null` when logged out). */
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);
/** true when a JWT is present in localStorage. */
export const isLoggedIn = (): boolean => !!getToken();

// ── Core fetch helper ────────────────────────────────────────────────────────

/**
 * Unified fetch helper for all JSON API requests.
 *
 * - Attaches the portal JWT from localStorage (when present).
 * - Serialises the body as JSON.
 * - Aborts after 30 seconds and throws a user-friendly timeout error.
 * - On 401, clears the token and redirects to /login (SPA UX).
 * - On non-2xx, throws an `ApiError` whose `.code` is the server's stable
 *   code string (or null) and `.message` is the server's error string.
 *
 * @typeParam T  Expected shape of the parsed JSON response. Defaults to
 *               `unknown`; pass an explicit type at the call site (or use
 *               one of the typed wrappers below) to opt into strong typing.
 */
export async function apiRequest<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw err;
  }
  clearTimeout(timeout);

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  const data = await res.json();
  if (!res.ok) {
    // Endpoints may return `{ error: 'machine_code', message: 'human readable' }`
    // (e.g. /api/portal/api-key returns `api_key_invalid` + the actual reason).
    // Surface the human one to the user; keep `data.code` on err.code for
    // existing branching (e.g. `email_unverified`, `company_name_taken`).
    const err = new Error(data.message || data.error || "Request failed") as ApiError;
    err.code = data.code || null;
    throw err;
  }
  return data as T;
}

// ── Setup endpoints (self-hosted first-run wizard) ───────────────────────────

/**
 * Check whether the self-hosted install still needs the first-run wizard.
 * Errors and non-2xx responses are swallowed — the wizard never blocks the
 * login page from rendering on SaaS.
 */
export const getSetupStatus = (): Promise<{ required: boolean }> =>
  fetch(`${BASE_URL}/api/setup/status`)
    .then(r => r.ok ? r.json() : { required: false })
    .catch(() => ({ required: false }));

/**
 * Complete the first-run wizard. Server expects:
 *   { companyName, email, password, anthropicApiKey }
 * Returns { token, tenant:{ id, name } } — caller is responsible for setToken().
 */
export const completeSetup = (data: { companyName: string; email: string; password: string; anthropicApiKey: string }) =>
  apiRequest<{ token: string; tenant: { id: string; name: string } }>("POST", "/api/setup/complete", data);

// ── Auth endpoints ───────────────────────────────────────────────────────────

/** Register a new SaaS tenant + admin. See server/src/routes/onboard.js:register. */
export const register = (
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  companyName: string,
  vertical: string,
  tosAccepted: boolean,
  newsletterOptIn = false,
) =>
  apiRequest("POST", "/api/onboard/register", {
    email, password, first_name: firstName, last_name: lastName,
    company_name: companyName, vertical, tos_accepted: tosAccepted,
    newsletter_opt_in: newsletterOptIn,
  });

/** Redeem an email-verification token. Auto-stores the issued JWT on success. */
export const verifyEmail = async (token: string): Promise<AuthResponse> => {
  const data = await apiRequest<AuthResponse>("GET", `/api/onboard/verify/${token}`);
  if (data.token) setToken(data.token);
  return data;
};

export const resendVerification = (email: string) =>
  apiRequest("POST", "/api/onboard/resend-verification", { email });

export const forgotPassword = (email: string) =>
  apiRequest("POST", "/api/onboard/forgot-password", { email });

export const resetPassword = (token: string, new_password: string) =>
  apiRequest("POST", "/api/onboard/reset-password", { token, new_password });

/**
 * Authenticate against the portal. Diverges from apiRequest so the
 * `email_unverified` soft-error can be surfaced to the UI without throwing.
 *
 * On unverified email the server replies 4xx with `code:"email_unverified"`;
 * we return that payload so the login page can show the resend-verification UI.
 * Any other non-2xx throws.
 */
export const login = async (email: string, password: string): Promise<AuthResponse | LoginError> => {
  const headers = { "Content-Type": "application/json" };
  const res = await fetch(`${BASE_URL}/api/onboard/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.code === "email_unverified") return { error: data.error, code: data.code, email: data.email };
    throw new Error(data.error || "Login failed");
  }
  return data;
};

// ── Portal endpoints ─────────────────────────────────────────────────────────

export const getMe = () => apiRequest("GET", "/api/portal/me");
export const updateProfile = (data: unknown) => apiRequest("PUT", "/api/portal/admin/profile", data);
export const updatePassword = (data: unknown) => apiRequest("PUT", "/api/portal/admin/password", data);
export const updateCompany = (data: unknown) => apiRequest("PUT", "/api/portal/company", data);

/**
 * Toggle the per-tenant PII tokenization safety control.
 * Owner-only on the server (HTTP 403 for member/agent roles).
 */
export const updatePrivacySettings = (enabled: boolean) =>
  apiRequest<{ ok: true; pii_tokenization_enabled: boolean }>(
    "PUT", "/api/portal/settings/privacy", { pii_tokenization_enabled: enabled },
  );

/**
 * Toggle the per-tenant anonymous-only widget mode. When ON, the widget
 * ignores any host-page identity and runs every visitor as anonymous —
 * no persistent customer record, no cross-session memory. Owner-only.
 */
export const updateAnonymousOnlyMode = (enabled: boolean) =>
  apiRequest<{ ok: true; anonymous_only_mode: boolean }>(
    "PUT", "/api/portal/settings/anonymous-only-mode", { anonymous_only_mode: enabled },
  );

export const getProducts = () => apiRequest("GET", "/api/portal/products");
export const addProduct = (data: ProductRecord) => apiRequest("POST", "/api/portal/products", data);
export const updateProduct = (id: string, data: ProductRecord) => apiRequest("PUT", `/api/portal/products/${id}`, data);
export const deleteProduct = (id: string) => apiRequest("DELETE", `/api/portal/products/${id}`);
export const uploadProductsCsv = (csvString: string) => apiRequest("POST", "/api/portal/products/upload", { csv: csvString });
export const getCustomers = (page: number, limit: number, query = "") => apiRequest("GET", `/api/portal/customers?page=${page}&limit=${limit}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
export const search = (query: string) => apiRequest("GET", `/api/portal/search?q=${encodeURIComponent(query)}`);
export const getCustomer = (id: string) => apiRequest("GET", `/api/portal/customers/${id}`);
export const deleteCustomer = (id: string) => apiRequest("DELETE", `/api/portal/customers/${id}`);
export const uploadCustomersCsv = (csvString: string) => apiRequest("POST", "/api/portal/customers/upload", { csv: csvString });
export const getDashboard = () => apiRequest("GET", "/api/portal/dashboard");

export const getConversations = (page: number, { status, mode, unread, search }: ConversationFilters = {}, limit = 50) => {
  const p = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) p.set("status", status);
  if (mode)   p.set("mode",   mode);
  if (unread) p.set("unread", "true");
  if (search) p.set("search", search);
  return apiRequest("GET", `/api/portal/conversations?${p.toString()}`);
};
export const getConversation = (id: string) => apiRequest("GET", `/api/portal/conversations/${id}`);

// ── Authenticated binary download helper ─────────────────────────────────────

/** Sanitise a string for use in a download filename (strip whitespace + special chars). */
const safeFilename = (s: string | null | undefined): string =>
  String(s || "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");

/**
 * Fetch an authenticated binary blob and trigger a browser download.
 * `fallbackErrorMessage` is used if the server returns a non-OK response
 * with no JSON error body.
 */
async function downloadAuthenticatedFile(path: string, filename: string, fallbackErrorMessage: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || fallbackErrorMessage);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const downloadTranscript = (conversationId: string, customerName?: string | null) =>
  downloadAuthenticatedFile(
    `/api/portal/conversations/${conversationId}/transcript`,
    `transcript_${safeFilename(customerName || conversationId)}.txt`,
    "Transcript download failed",
  );
export const getConcerns = () => apiRequest("GET", "/api/portal/concerns");
export const getVisitors = () => apiRequest("GET", "/api/portal/visitors");
export const getAnalytics = (period = "30d") => apiRequest("GET", `/api/portal/analytics?period=${period}`);

export const aiSuggestProducts = (urlOrDescription: string) => {
  // Detect URLs conservatively. Anything with whitespace is a description; a
  // bare period in prose ("$19/month plan.") used to flip the heuristic into
  // URL mode and the backend would `new URL("https://We sell two things…")`
  // and throw. Now require either an explicit scheme or a no-whitespace token
  // that matches a domain shape.
  const trimmed = (urlOrDescription || "").trim();
  const looksLikeUrl =
    /^https?:\/\//i.test(trimmed) ||
    (!/\s/.test(trimmed) && /^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(trimmed));
  const body = looksLikeUrl ? { url: trimmed } : { description: trimmed };
  return apiRequest("POST", "/api/portal/products/ai-suggest", body);
};

export const bulkSaveProducts = (products: ProductRecord[]) =>
  apiRequest("POST", "/api/portal/products/bulk-save", { products });

export const aiMapCustomerCsv = (headers: string[], sampleRows: Record<string, unknown>[]) =>
  apiRequest("POST", "/api/portal/customers/ai-map", { headers, sample_rows: sampleRows });

export const uploadCustomersCsvMapped = (csvString: string, mapping: Record<string, string>) =>
  apiRequest("POST", "/api/portal/customers/upload", { csv: csvString, mapping });

// ── Subscription & Billing ───────────────────────────────────────────────────
export const getSubscription = () => apiRequest("GET", "/api/portal/subscription");
export const getPlans = () => apiRequest("GET", "/api/portal/plans");
export const createCheckout = (plan: string) => apiRequest("POST", "/api/portal/billing/checkout", { plan });
export const createBillingPortal = () => apiRequest("POST", "/api/portal/billing/portal");

// ── Self-Hosted License Management (returns 404 on SaaS deployments) ─────────
export const getLicense = () => apiRequest("GET", "/api/portal/license");
export const activateLicense = (license_key: string) => apiRequest("POST", "/api/portal/license/activate", { license_key });
export const deactivateLicense = () => apiRequest("DELETE", "/api/portal/license");

// ── API Key Management ───────────────────────────────────────────────────────
export const saveApiKey = (api_key: string, provider: "anthropic" | "openai" = "anthropic") =>
  apiRequest("POST", "/api/portal/api-key", { api_key, provider });
export const deleteApiKey = () => apiRequest("DELETE", "/api/portal/api-key");
export const testApiKey = () => apiRequest("POST", "/api/portal/api-key/test");

// ── Human Support Takeover ───────────────────────────────────────────────────
export const takeoverConversation = (id: string) =>
  apiRequest("POST", `/api/portal/conversations/${id}/takeover`);
export const handbackConversation = (id: string, note?: string) =>
  apiRequest("POST", `/api/portal/conversations/${id}/handback`, note ? { note } : {});
export const replyToConversation = (id: string, content: string) =>
  apiRequest("POST", `/api/portal/conversations/${id}/reply`, { content });
export const scoreConversation = (id: string, score: number) =>
  apiRequest("POST", `/api/portal/conversations/${id}/score`, { score });

// ── Badge counts (unread indicators) ─────────────────────────────────────────
export const getBadgeCounts = () => apiRequest("GET", "/api/portal/badge-counts");

// ── Concerns (getConcerns declared above) ────────────────────────────────────
export const resolveConcern = (id: string) => apiRequest("PATCH", `/api/portal/concerns/${id}/resolve`);

// ── Team / Agent Management ──────────────────────────────────────────────────
export const getTeam = () => apiRequest("GET", "/api/portal/team");
export const inviteAgent = (data: unknown) => apiRequest("POST", "/api/portal/team/invite", data);
export const removeAgent = (id: string) => apiRequest("DELETE", `/api/portal/team/${id}`);

// ── Custom Tool Builder ──────────────────────────────────────────────────────
export const getToolTypes   = () => apiRequest("GET",    "/api/portal/tools/types");
export const getTools       = () => apiRequest("GET",    "/api/portal/tools");
export const createTool     = (data: unknown) => apiRequest("POST",  "/api/portal/tools", data);
export const updateTool     = (id: string, data: unknown) => apiRequest("PATCH",  `/api/portal/tools/${id}`, data);
export const deleteTool     = (id: string) => apiRequest("DELETE", `/api/portal/tools/${id}`);
export const testTool       = (id: string, message: string, customerId?: string) =>
  apiRequest("POST", `/api/portal/tools/${id}/test`, { message, ...(customerId ? { customer_id: customerId } : {}) });

// ── Data API Key Management ──────────────────────────────────────────────────
export const getDataApiKey      = ()  => apiRequest("GET",    "/api/portal/settings/data-api-key");
export const generateDataApiKey = ()  => apiRequest("POST",   "/api/portal/settings/data-api-key");
export const revokeDataApiKey   = ()  => apiRequest("DELETE", "/api/portal/settings/data-api-key");

// ── Agent Soul Template ──────────────────────────────────────────────────────
export const getAgentSoul    = ()  => apiRequest("GET",  "/api/portal/settings/agent-soul");
export const generateSoul    = ()  => apiRequest("POST", "/api/portal/settings/generate-soul");

// Memory sync trigger — asks backend to re-run summary + soul update for a conversation
export const triggerMemorySummary = (conversationId: string) =>
  apiRequest("POST", `/api/portal/conversations/${conversationId}/summarize`);

// ── GDPR — Right to Access / Data Portability (Art. 20) ──────────────────────
// Fetches the full data export and triggers a browser file download.
export const exportCustomerData = (customerId: string, customerName?: string | null): Promise<void> => {
  const datestamp = new Date().toISOString().split("T")[0];
  return downloadAuthenticatedFile(
    `/api/portal/customers/${customerId}/export`,
    `data_export_${safeFilename(customerName || customerId)}_${datestamp}.json`,
    "Export failed",
  );
};

// ── Customer Data Records (portal) ───────────────────────────────────────────
export const getCustomerData        = (id: string, category?: string)          => apiRequest("GET",    `/api/portal/customers/${id}/data${category ? `?category=${encodeURIComponent(category)}` : ""}`);
export const addCustomerDataRecord  = (id: string, record: unknown)            => apiRequest("POST",   `/api/portal/customers/${id}/data`, record);
export const deleteCustomerCategory = (id: string, category: string)           => apiRequest("DELETE", `/api/portal/customers/${id}/data/${encodeURIComponent(category)}`);
export const deleteCustomerRecord   = (id: string, category: string, label: string) => apiRequest("DELETE", `/api/portal/customers/${id}/data/${encodeURIComponent(category)}/${encodeURIComponent(label)}`);

// ── Webhooks ─────────────────────────────────────────────────────────────────
export const getWebhooks   = ()                       => apiRequest("GET",    "/api/portal/webhooks");
export const createWebhook = (data: unknown)          => apiRequest("POST",   "/api/portal/webhooks", data);
export const updateWebhook = (id: string, data: unknown) => apiRequest("PATCH",  `/api/portal/webhooks/${id}`, data);
export const deleteWebhook = (id: string)             => apiRequest("DELETE", `/api/portal/webhooks/${id}`);
export const testWebhook   = (id: string)             => apiRequest("POST",   `/api/portal/webhooks/${id}/test`);

// ── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = () => apiRequest("GET", "/api/portal/notifications");
export const markNotificationsRead = (ids?: string[]) =>
  apiRequest("PATCH", "/api/portal/notifications/mark-read", ids ? { ids } : {});

// ── Labels ───────────────────────────────────────────────────────────────────
export const getLabels    = ()                         => apiRequest("GET",    "/api/portal/labels");
export const createLabel  = (data: unknown)            => apiRequest("POST",   "/api/portal/labels", data);
export const updateLabel  = (id: string, data: unknown) => apiRequest("PUT",    `/api/portal/labels/${id}`, data);
export const deleteLabel  = (id: string)               => apiRequest("DELETE", `/api/portal/labels/${id}`);
export const addConversationLabel    = (convId: string, labelId: string) => apiRequest("POST",   `/api/portal/conversations/${convId}/labels/${labelId}`);
export const removeConversationLabel = (convId: string, labelId: string) => apiRequest("DELETE", `/api/portal/conversations/${convId}/labels/${labelId}`);

// ── Bulk operations ──────────────────────────────────────────────────────────
export const bulkConversations = (ids: string[], action: string, extra: Record<string, unknown> = {}) =>
  apiRequest("POST", "/api/portal/conversations/bulk", { ids, action, ...extra });

// ── Connectors (Slack & Teams) ───────────────────────────────────────────────
export const getConnectors    = ()             => apiRequest("GET",  "/api/portal/connectors");
export const updateConnectors = (data: unknown) => apiRequest("PUT",  "/api/portal/connectors", data);
export const testSlack        = ()             => apiRequest("POST", "/api/portal/connectors/slack/test");
export const testTeams        = ()             => apiRequest("POST", "/api/portal/connectors/teams/test");

// ── Email templates ──────────────────────────────────────────────────────────
export const getEmailTemplates    = ()             => apiRequest("GET", "/api/portal/email-templates");
export const updateEmailTemplates = (data: unknown) => apiRequest("PUT", "/api/portal/email-templates", data);

// ── Invite acceptance (unauthenticated) ──────────────────────────────────────
export const getInviteInfo = async (token: string) => {
  const res = await fetch(`${BASE_URL}/api/onboard/invite/${token}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Invalid invite link") as ApiError;
    err.status = res.status;
    throw err;
  }
  return data;
};
export const acceptInvite = async (token: string, password: string, first_name: string, last_name: string) => {
  const res = await fetch(`${BASE_URL}/api/onboard/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password, first_name, last_name }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Failed to accept invite") as ApiError;
    err.status = res.status;
    throw err;
  }
  return data;
};

// ── Brand Learning — anonymous-visitor learning loop (v3.5+) ─────────────────
// Read state, toggle, force-run, kill switch. See docs/BRAND_LEARNING_SCOPE.md.

/**
 * Read brand-learning state for the authenticated tenant.
 * Returns { enabled, summary, brand_soul, brand_memory, audience_profile,
 *           recent_incidents, ... }.
 */
export const getBrandLearning = () =>
  apiRequest("GET", "/api/portal/brand-learning");

/** Owner-only. Enable or disable the nightly learning loop. */
export const toggleBrandLearning = (enabled: boolean) =>
  apiRequest("POST", "/api/portal/brand-learning/toggle", { enabled });

/** Owner-only. Force-run a distillation cycle now (5-min cooldown). */
export const runBrandLearningNow = () =>
  apiRequest("POST", "/api/portal/brand-learning/run-now");

/** Owner-only. Wipe all 3 artifacts and disable learning. */
export const killBrandLearning = () =>
  apiRequest("POST", "/api/portal/brand-learning/kill-switch");

/**
 * Owner-only. Delete one learned fact (or pending candidate) by canonical_key.
 * `source` is one of "soul" | "memory" | "audience_profile" | "audience_candidate";
 * `bucket` is the bucket inside that source — see SOURCES in curate.js for the
 * allow-list (e.g. "faqs", "candidate_faqs", "common_pain_points").
 */
export const deleteBrandLearningItem = ({ source, bucket, canonical_key }: BrandLearningTarget) =>
  apiRequest("POST", "/api/portal/brand-learning/items/delete", { source, bucket, canonical_key });

/**
 * Owner-only. Manually promote a pending candidate into the promoted bag.
 * `source` must be "memory" or "audience_candidate".
 */
export const promoteBrandLearningItem = ({ source, bucket, canonical_key }: BrandLearningTarget) =>
  apiRequest("POST", "/api/portal/brand-learning/items/promote", { source, bucket, canonical_key });
