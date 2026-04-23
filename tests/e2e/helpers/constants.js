/**
 * Shared constants for E2E tests
 */

const SERVER_PORT = Number(process.env.PORT) || 3001;
const CLIENT_PORT = Number(process.env.VITE_PORT) || 5173;

module.exports = {
  SERVER_PORT,
  CLIENT_PORT,
  API_BASE: `http://localhost:${SERVER_PORT}`,
  CLIENT_BASE: `http://localhost:${CLIENT_PORT}`,

  // Credentials — loaded from server/.env
  TEST_EMAIL: process.env.TEST_ADMIN_EMAIL || '',
  TEST_PASSWORD: process.env.TEST_ADMIN_PASSWORD || '',

  // Timeouts
  NAV_TIMEOUT: 15_000,
  ACTION_TIMEOUT: 10_000,

  // Selectors — login page
  SEL_LOGIN: {
    emailInput: '#email',
    passwordInput: '#password',
    submitBtn: 'button[type="submit"]',
    errorMsg: '[data-testid="login-error"]',
    forgotLink: 'button:has-text("Forgot password?")',
    signupLink: 'a[href="/shenmay/signup"]',
  },

  // Selectors — dashboard
  SEL_DASHBOARD: {
    sidebar: 'nav, [class*="sidebar"], aside',
    welcomeHeading: 'h1, h2',
    navConversations: 'a[href*="conversations"]',
    navCustomers: 'a[href*="customers"]',
    navTools: 'a[href*="tools"]',
    navSettings: 'a[href*="settings"]',
    navTeam: 'a[href*="team"]',
  },

  // Selectors — widget
  SEL_WIDGET: {
    launcher: '#nomii-launcher',
    iframeWrap: '#nomii-iframe-wrap',
    iframe: '#nomii-iframe',
    chatInput: '#input',
    sendBtn: '#send-btn',
    closeBtn: '#close-btn',
    messages: '#messages',
    typing: '#typing',
    header: '#header',
    agentName: '#agent-name',
  },
};
