// Default to same-origin (empty string) for self-hosted deployments where
// nginx proxies /api/ to the backend. SaaS builds set VITE_API_BASE_URL
// at build time to point at the separate API subdomain.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

/**
 * JSDoc typedefs for this module.
 *
 * These describe the expected shape of the JSON bodies accepted by the
 * backend and the responses consumed by the React UI. They are advisory
 * only — the backend is the authoritative validator — but make the
 * wrapper signatures much easier to read at a glance.
 *
 * @typedef {Object} ApiError
 * @property {string} message
 * @property {string|null} [code]     Stable machine-readable error code
 *                                    (e.g. "email_unverified").
 *
 * @typedef {Object} ProductRecord
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [category]
 * @property {string} [price_info]
 * @property {string} [notes]
 *
 * @typedef {Object} ConversationFilters
 * @property {string} [status]
 * @property {string} [mode]
 * @property {boolean} [unread]
 * @property {string} [search]
 *
 * @typedef {Object} LoginError
 * @property {string} error
 * @property {string} code
 * @property {string} [email]
 *
 * @typedef {"GET"|"POST"|"PUT"|"PATCH"|"DELETE"} HttpMethod
 */

// Auth helpers
/** @returns {string|null} Current portal JWT from localStorage. */
export const getToken = () => localStorage.getItem("nomii_portal_token");
/** @param {string} token */
export const setToken = (token) => localStorage.setItem("nomii_portal_token", token);
export const clearToken = () => localStorage.removeItem("nomii_portal_token");
/** @returns {boolean} true when a JWT is present in localStorage. */
export const isLoggedIn = () => !!getToken();

/**
 * Unified fetch helper for all JSON API requests.
 *
 * - Attaches the portal JWT from localStorage (when present).
 * - Serializes the body as JSON.
 * - Aborts after 30 seconds and throws a user-friendly timeout error.
 * - On 401, clears the token and redirects to /nomii/login (SPA UX).
 * - On non-2xx, throws an Error whose `.code` is the server's stable
 *   code string (or null) and `.message` is the server's error string.
 *
 * @param {HttpMethod} method      HTTP method.
 * @param {string}     path        Path under BASE_URL (must start with "/").
 * @param {object}     [body]      Optional JSON-serialisable body.
 * @returns {Promise<object>}      Parsed JSON response on success.
 * @throws  {Error & { code?: string|null }} On timeout, network error, 401, or non-2xx.
 */
export async function apiRequest(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw err;
  }
  clearTimeout(timeout);

  if (res.status === 401) {
    clearToken();
    window.location.href = "/nomii/login";
    throw new Error("Unauthorized");
  }

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.code = data.code || null;
    throw err;
  }
  return data;
}

// Setup endpoints (self-hosted first-run wizard)
/**
 * Check whether the self-hosted install still needs the first-run wizard.
 * Errors and non-2xx responses are swallowed — the wizard never blocks the
 * login page from rendering on SaaS.
 * @returns {Promise<{ required: boolean }>}
 */
export const getSetupStatus = () =>
  fetch(`${BASE_URL}/api/setup/status`)
    .then(r => r.ok ? r.json() : { required: false })
    .catch(() => ({ required: false }));

/**
 * Complete the first-run wizard. Server expects:
 *   { companyName, email, password, anthropicApiKey }
 * Returns { token, tenant:{ id, name } } — caller is responsible for setToken().
 * @param {{ companyName: string, email: string, password: string, anthropicApiKey: string }} data
 */
export const completeSetup = (data) =>
  apiRequest("POST", "/api/setup/complete", data);

// Auth endpoints
/**
 * Register a new SaaS tenant + admin. See server/src/routes/onboard.js:register.
 * @param {string} email
 * @param {string} password
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} companyName
 * @param {string} vertical
 * @param {boolean} tosAccepted
 * @param {boolean} [newsletterOptIn=false]
 */
export const register = (email, password, firstName, lastName, companyName, vertical, tosAccepted, newsletterOptIn = false) =>
  apiRequest("POST", "/api/onboard/register", {
    email, password, first_name: firstName, last_name: lastName,
    company_name: companyName, vertical, tos_accepted: tosAccepted,
    newsletter_opt_in: newsletterOptIn,
  });

/**
 * Redeem an email-verification token. Auto-stores the issued JWT on success.
 * @param {string} token
 * @returns {Promise<{ token?: string, tenant?: object, [k: string]: unknown }>}
 */
export const verifyEmail = async (token) => {
  const data = await apiRequest("GET", `/api/onboard/verify/${token}`);
  if (data.token) setToken(data.token);
  return data;
};

/** @param {string} email */
export const resendVerification = (email) =>
  apiRequest("POST", "/api/onboard/resend-verification", { email });

/** @param {string} email */
export const forgotPassword = (email) =>
  apiRequest("POST", "/api/onboard/forgot-password", { email });

/** @param {string} token @param {string} new_password */
export const resetPassword = (token, new_password) =>
  apiRequest("POST", "/api/onboard/reset-password", { token, new_password });

/**
 * Authenticate against the portal. Diverges from apiRequest so the
 * email_unverified soft-error can be surfaced to the UI without throwing.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, tenant: object } | LoginError>}
 *          On an unverified email the server replies 4xx with `code:"email_unverified"`;
 *          we return that payload so the login page can show the resend-verification UI.
 *          Any other non-2xx throws.
 */
export const login = async (email, password) => {
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

// Portal endpoints
export const getMe = () => apiRequest("GET", "/api/portal/me");
export const updateProfile = (data) => apiRequest("PUT", "/api/portal/admin/profile", data);
export const updatePassword = (data) => apiRequest("PUT", "/api/portal/admin/password", data);
export const updateCompany = (data) => apiRequest("PUT", "/api/portal/company", data);

/**
 * Toggle the per-tenant PII tokenization safety control.
 * Owner-only on the server (HTTP 403 for member/agent roles).
 * @param {boolean} enabled
 * @returns {Promise<{ok: true, pii_tokenization_enabled: boolean}>}
 */
export const updatePrivacySettings = (enabled) =>
  apiRequest("PUT", "/api/portal/settings/privacy", { pii_tokenization_enabled: enabled });
export const getProducts = () => apiRequest("GET", "/api/portal/products");
export const addProduct = (data) => apiRequest("POST", "/api/portal/products", data);
export const updateProduct = (id, data) => apiRequest("PUT", `/api/portal/products/${id}`, data);
export const deleteProduct = (id) => apiRequest("DELETE", `/api/portal/products/${id}`);
export const uploadProductsCsv = (csvString) => apiRequest("POST", "/api/portal/products/upload", { csv: csvString });
export const getCustomers = (page, limit, query = "") => apiRequest("GET", `/api/portal/customers?page=${page}&limit=${limit}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
export const search = (query) => apiRequest("GET", `/api/portal/search?q=${encodeURIComponent(query)}`);
export const getCustomer = (id) => apiRequest("GET", `/api/portal/customers/${id}`);
export const deleteCustomer = (id) => apiRequest("DELETE", `/api/portal/customers/${id}`);
export const uploadCustomersCsv = (csvString) => apiRequest("POST", "/api/portal/customers/upload", { csv: csvString });
export const getDashboard = () => apiRequest("GET", "/api/portal/dashboard");
export const getConversations = (page, { status, mode, unread, search } = {}, limit = 50) => {
  const p = new URLSearchParams({ page, limit });
  if (status) p.set("status", status);
  if (mode)   p.set("mode",   mode);
  if (unread) p.set("unread", "true");
  if (search) p.set("search", search);
  return apiRequest("GET", `/api/portal/conversations?${p.toString()}`);
};
export const getConversation = (id) => apiRequest("GET", `/api/portal/conversations/${id}`);

// Sanitize a string for use in a download filename (strip whitespace + special chars).
const safeFilename = (s) => String(s || "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");

// Fetch an authenticated binary blob and trigger a browser download.
// `fallbackErrorMessage` is used if the server returns a non-OK response with no JSON error body.
async function downloadAuthenticatedFile(path, filename, fallbackErrorMessage) {
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

export const downloadTranscript = (conversationId, customerName) =>
  downloadAuthenticatedFile(
    `/api/portal/conversations/${conversationId}/transcript`,
    `transcript_${safeFilename(customerName || conversationId)}.txt`,
    "Transcript download failed",
  );
export const getConcerns = () => apiRequest("GET", "/api/portal/concerns");
export const getVisitors = () => apiRequest("GET", "/api/portal/visitors");
export const getAnalytics = (period = "30d") => apiRequest("GET", `/api/portal/analytics?period=${period}`);

export const aiSuggestProducts = (urlOrDescription) => {
  const isUrl = /^https?:\/\//i.test(urlOrDescription) || urlOrDescription.includes(".");
  const body = isUrl ? { url: urlOrDescription } : { description: urlOrDescription };
  return apiRequest("POST", "/api/portal/products/ai-suggest", body);
};

export const bulkSaveProducts = (products) =>
  apiRequest("POST", "/api/portal/products/bulk-save", { products });

export const aiMapCustomerCsv = (headers, sampleRows) =>
  apiRequest("POST", "/api/portal/customers/ai-map", { headers, sample_rows: sampleRows });

export const uploadCustomersCsvMapped = (csvString, mapping) =>
  apiRequest("POST", "/api/portal/customers/upload", { csv: csvString, mapping });

// Subscription & Billing
export const getSubscription = () => apiRequest("GET", "/api/portal/subscription");
export const getPlans = () => apiRequest("GET", "/api/portal/plans");
export const createCheckout = (plan) => apiRequest("POST", "/api/portal/billing/checkout", { plan });
export const createBillingPortal = () => apiRequest("POST", "/api/portal/billing/portal");

// Self-Hosted License Management (returns 404 on SaaS deployments)
export const getLicense = () => apiRequest("GET", "/api/portal/license");
export const activateLicense = (license_key) => apiRequest("POST", "/api/portal/license/activate", { license_key });
export const deactivateLicense = () => apiRequest("DELETE", "/api/portal/license");

// API Key Management
export const saveApiKey = (api_key, provider = "anthropic") =>
  apiRequest("POST", "/api/portal/api-key", { api_key, provider });
export const deleteApiKey = () => apiRequest("DELETE", "/api/portal/api-key");
export const testApiKey = () => apiRequest("POST", "/api/portal/api-key/test");

// Human Support Takeover
export const takeoverConversation = (id) =>
  apiRequest("POST", `/api/portal/conversations/${id}/takeover`);
export const handbackConversation = (id, note) =>
  apiRequest("POST", `/api/portal/conversations/${id}/handback`, note ? { note } : {});
export const replyToConversation = (id, content) =>
  apiRequest("POST", `/api/portal/conversations/${id}/reply`, { content });
export const scoreConversation = (id, score) =>
  apiRequest("POST", `/api/portal/conversations/${id}/score`, { score });

// Badge counts (unread indicators)
export const getBadgeCounts = () => apiRequest("GET", "/api/portal/badge-counts");

// Concerns (getConcerns declared above near line 112)
export const resolveConcern = (id) => apiRequest("PATCH", `/api/portal/concerns/${id}/resolve`);

// Team / Agent Management
export const getTeam = () => apiRequest("GET", "/api/portal/team");
export const inviteAgent = (data) => apiRequest("POST", "/api/portal/team/invite", data);
export const removeAgent = (id) => apiRequest("DELETE", `/api/portal/team/${id}`);

// Custom Tool Builder
export const getToolTypes   = () => apiRequest("GET",   "/api/portal/tools/types");
export const getTools       = () => apiRequest("GET",   "/api/portal/tools");
export const createTool     = (data) => apiRequest("POST",  "/api/portal/tools", data);
export const updateTool     = (id, data) => apiRequest("PATCH",  `/api/portal/tools/${id}`, data);
export const deleteTool     = (id) => apiRequest("DELETE", `/api/portal/tools/${id}`);
export const testTool       = (id, message, customerId) => apiRequest("POST", `/api/portal/tools/${id}/test`, { message, ...(customerId ? { customer_id: customerId } : {}) });

// Data API Key Management
export const getDataApiKey      = ()  => apiRequest("GET",    "/api/portal/settings/data-api-key");
export const generateDataApiKey = ()  => apiRequest("POST",   "/api/portal/settings/data-api-key");
export const revokeDataApiKey   = ()  => apiRequest("DELETE", "/api/portal/settings/data-api-key");

// Agent Soul Template
export const getAgentSoul    = ()  => apiRequest("GET",  "/api/portal/settings/agent-soul");
export const generateSoul    = ()  => apiRequest("POST", "/api/portal/settings/generate-soul");

// Memory sync trigger — asks backend to re-run summary + soul update for a conversation
export const triggerMemorySummary = (conversationId) =>
  apiRequest("POST", `/api/portal/conversations/${conversationId}/summarize`);

// GDPR — Right to Access / Data Portability (Art. 20)
// Fetches the full data export and triggers a browser file download.
export const exportCustomerData = (customerId, customerName) => {
  const datestamp = new Date().toISOString().split("T")[0];
  return downloadAuthenticatedFile(
    `/api/portal/customers/${customerId}/export`,
    `data_export_${safeFilename(customerName || customerId)}_${datestamp}.json`,
    "Export failed",
  );
};

// Customer Data Records (portal)
export const getCustomerData        = (id, category)         => apiRequest("GET",    `/api/portal/customers/${id}/data${category ? `?category=${encodeURIComponent(category)}` : ""}`);
export const addCustomerDataRecord  = (id, record)           => apiRequest("POST",   `/api/portal/customers/${id}/data`, record);
export const deleteCustomerCategory = (id, category)         => apiRequest("DELETE", `/api/portal/customers/${id}/data/${encodeURIComponent(category)}`);
export const deleteCustomerRecord   = (id, category, label)  => apiRequest("DELETE", `/api/portal/customers/${id}/data/${encodeURIComponent(category)}/${encodeURIComponent(label)}`);

// Webhooks
export const getWebhooks   = ()           => apiRequest("GET",    "/api/portal/webhooks");
export const createWebhook = (data)       => apiRequest("POST",   "/api/portal/webhooks", data);
export const updateWebhook = (id, data)   => apiRequest("PATCH",  `/api/portal/webhooks/${id}`, data);
export const deleteWebhook = (id)         => apiRequest("DELETE", `/api/portal/webhooks/${id}`);
export const testWebhook   = (id)         => apiRequest("POST",   `/api/portal/webhooks/${id}/test`);

// Notifications
export const getNotifications = () => apiRequest("GET", "/api/portal/notifications");
export const markNotificationsRead = (ids) =>
  apiRequest("PATCH", "/api/portal/notifications/mark-read", ids ? { ids } : {});

// Labels
export const getLabels    = ()                     => apiRequest("GET",    "/api/portal/labels");
export const createLabel  = (data)                 => apiRequest("POST",   "/api/portal/labels", data);
export const updateLabel  = (id, data)             => apiRequest("PUT",    `/api/portal/labels/${id}`, data);
export const deleteLabel  = (id)                   => apiRequest("DELETE", `/api/portal/labels/${id}`);
export const addConversationLabel    = (convId, labelId) => apiRequest("POST",   `/api/portal/conversations/${convId}/labels/${labelId}`);
export const removeConversationLabel = (convId, labelId) => apiRequest("DELETE", `/api/portal/conversations/${convId}/labels/${labelId}`);

// Bulk operations
export const bulkConversations = (ids, action, extra = {}) =>
  apiRequest("POST", "/api/portal/conversations/bulk", { ids, action, ...extra });

// Connectors (Slack & Teams)
export const getConnectors    = ()     => apiRequest("GET",  "/api/portal/connectors");
export const updateConnectors = (data) => apiRequest("PUT",  "/api/portal/connectors", data);
export const testSlack        = ()     => apiRequest("POST", "/api/portal/connectors/slack/test");
export const testTeams        = ()     => apiRequest("POST", "/api/portal/connectors/teams/test");

// Email templates
export const getEmailTemplates    = ()     => apiRequest("GET", "/api/portal/email-templates");
export const updateEmailTemplates = (data) => apiRequest("PUT", "/api/portal/email-templates", data);

// Invite acceptance (unauthenticated)
export const getInviteInfo = async (token) => {
  const res = await fetch(`${BASE_URL}/api/onboard/invite/${token}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Invalid invite link");
    err.status = res.status;
    throw err;
  }
  return data;
};
export const acceptInvite = async (token, password, first_name, last_name) => {
  const res = await fetch(`${BASE_URL}/api/onboard/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password, first_name, last_name }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Failed to accept invite");
    err.status = res.status;
    throw err;
  }
  return data;
};
