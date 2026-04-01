const BASE_URL = "https://api.pontensolutions.com";

// Auth helpers
export const getToken = () => localStorage.getItem("nomii_portal_token");
export const setToken = (token) => localStorage.setItem("nomii_portal_token", token);
export const clearToken = () => localStorage.removeItem("nomii_portal_token");
export const isLoggedIn = () => !!getToken();

// API request helper
export async function apiRequest(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

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

// Auth endpoints
export const register = (email, password, firstName, lastName, companyName, vertical, tosAccepted, newsletterOptIn = false) =>
  apiRequest("POST", "/api/onboard/register", {
    email, password, first_name: firstName, last_name: lastName,
    company_name: companyName, vertical, tos_accepted: tosAccepted,
    newsletter_opt_in: newsletterOptIn,
  });

export const verifyEmail = async (token) => {
  const data = await apiRequest("GET", `/api/onboard/verify/${token}`);
  if (data.token) setToken(data.token);
  return data;
};

export const resendVerification = (email) =>
  apiRequest("POST", "/api/onboard/resend-verification", { email });

export const forgotPassword = (email) =>
  apiRequest("POST", "/api/onboard/forgot-password", { email });

export const resetPassword = (token, new_password) =>
  apiRequest("POST", "/api/onboard/reset-password", { token, new_password });

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
export const downloadTranscript = async (conversationId, customerName) => {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/api/portal/conversations/${conversationId}/transcript`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Transcript download failed");
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  const safe = (customerName || conversationId).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  a.download = `transcript_${safe}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
export const getConcerns = () => apiRequest("GET", "/api/portal/concerns");
export const getVisitors = () => apiRequest("GET", "/api/portal/visitors");

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
export const exportCustomerData = async (customerId, customerName) => {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/api/portal/customers/${customerId}/export`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Export failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (customerName || customerId).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  a.download = `data_export_${safeName}_${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
