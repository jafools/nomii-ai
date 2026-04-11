/**
 * NOMII AI — Embed Script  (embed.js)
 *
 * Drop this on any page:
 *
 *   <script
 *     src="https://your-nomii-server.com/embed.js"
 *     data-widget-key="your-tenant-widget-key"
 *     data-user-email="user@example.com"
 *     data-user-name="Jane Doe"
 *   ></script>
 *
 * Optional attributes:
 *   data-primary-color   — override chat bubble colour  (default: #1E3A5F)
 *   data-position        — "bottom-right" | "bottom-left"  (default: bottom-right)
 *   data-label           — bubble label text  (default: "Chat")
 *   data-privacy-url     — URL of your Privacy Notice (shown as link inside the chat)
 *
 * SPA Auth Integration:
 *   Option A — Mutate the script tag attributes directly:
 *     document.querySelector('script[data-widget-key]')
 *       .setAttribute('data-user-email', 'user@example.com');
 *
 *   Option B — postMessage from the host page:
 *     window.postMessage({ type: 'nomii:setUser', email: 'user@example.com', name: 'Jane' }, '*');
 *     window.postMessage({ type: 'nomii:setUser', email: '', name: '' }, '*');  // logout
 */

(function () {
  'use strict';

  // ── Read config from the <script> tag ───────────────────────────────────────
  var scripts = document.querySelectorAll('script[data-widget-key]');
  var scriptTag = scripts[scripts.length - 1]; // use the last one if multiple

  var widgetKey    = scriptTag.getAttribute('data-widget-key')   || '';
  var userEmail    = scriptTag.getAttribute('data-user-email')   || '';
  var userName     = scriptTag.getAttribute('data-user-name')    || '';
  var primaryColor = scriptTag.getAttribute('data-primary-color')|| '#1E3A5F';
  var position     = scriptTag.getAttribute('data-position')     || 'bottom-right';
  var label        = scriptTag.getAttribute('data-label')        || 'Chat';
  var privacyUrl   = scriptTag.getAttribute('data-privacy-url')  || '';

  if (!widgetKey) {
    console.warn('[Nomii AI] No data-widget-key found — widget not loaded.');
    return;
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────────
  // Prevent double-init if the embed script is injected more than once
  // (common in React/SPA apps where the component mounts/remounts on navigation).
  // The existing instance's MutationObserver + postMessage listener handles updates.
  if (document.getElementById('nomii-launcher')) {
    return;
  }

  // Derive the API base from wherever embed.js was served from
  var scriptSrc    = scriptTag.src || '';
  var apiBase      = scriptSrc.replace(/\/embed\.js.*$/, '');

  // ── Styles ───────────────────────────────────────────────────────────────────
  var isRight = position !== 'bottom-left';
  var styles  = [
    /* Launcher bubble */
    '#nomii-launcher{position:fixed;' + (isRight ? 'right:24px' : 'left:24px') + ';bottom:24px;z-index:2147483646;',
    'display:flex;align-items:center;gap:8px;',
    'background:' + primaryColor + ';color:#fff;',
    'border:none;border-radius:999px;padding:12px 20px;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;font-weight:600;',
    'cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.25);',
    'transition:transform .15s,box-shadow .15s;}',

    '#nomii-launcher:hover{transform:scale(1.04);box-shadow:0 6px 28px rgba(0,0,0,.32);}',
    '#nomii-launcher svg{flex-shrink:0;}',

    /* iframe container */
    '#nomii-iframe-wrap{position:fixed;' + (isRight ? 'right:24px' : 'left:24px') + ';bottom:86px;z-index:2147483647;',
    'width:380px;height:600px;max-height:calc(100vh - 120px);',
    'border-radius:16px;overflow:hidden;',
    'box-shadow:0 8px 40px rgba(0,0,0,.30);',
    'display:none;transition:opacity .2s;}',

    '#nomii-iframe-wrap.open{display:block;}',
    '#nomii-iframe{width:100%;height:100%;border:none;border-radius:16px;}',

    /* Responsive — mobile full-screen */
    '@media(max-width:440px){',
    '#nomii-iframe-wrap{left:0;right:0;bottom:0;width:100%;height:100%;max-height:100%;border-radius:0;}',
    '#nomii-launcher{right:16px;bottom:16px;}',
    '}',
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // ── Launcher button ──────────────────────────────────────────────────────────
  var launcher = document.createElement('button');
  launcher.id = 'nomii-launcher';
  launcher.setAttribute('aria-label', 'Open ' + label);
  launcher.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
    '</svg>' +
    '<span>' + label + '</span>';

  document.body.appendChild(launcher);

  // ── iframe container ─────────────────────────────────────────────────────────
  var iframeWrap = document.createElement('div');
  iframeWrap.id = 'nomii-iframe-wrap';

  var iframe = document.createElement('iframe');
  iframe.id    = 'nomii-iframe';
  iframe.title = 'Nomii AI Chat';
  iframe.allow = 'autoplay';

  // ── Build widget URL and inject iframe ───────────────────────────────────────
  function buildWidgetUrl() {
    var p = new URLSearchParams({
      key:     widgetKey,
      email:   userEmail,
      name:    userName,
      color:   primaryColor,
      api:     apiBase,
      privacy: privacyUrl,
    });
    return apiBase + '/widget.html?' + p.toString();
  }

  iframe.src = buildWidgetUrl();
  iframeWrap.appendChild(iframe);
  document.body.appendChild(iframeWrap);

  // ── Reload widget when auth state changes ────────────────────────────────────
  function reloadWidget() {
    // Close the panel if open
    if (open) {
      open = false;
      iframeWrap.classList.remove('open');
      launcher.setAttribute('aria-expanded', 'false');
    }

    // Reset bubble label back to the default (from data-label attribute)
    var span = launcher.querySelector('span');
    if (span) span.textContent = label;
    launcher.setAttribute('aria-label', 'Open ' + label);

    // Reload iframe with new user params
    iframe.src = buildWidgetUrl();
  }

  // ── Phone-home: tell the server this widget is live ─────────────────────────
  // Fire-and-forget — flips widget_verified_at so the onboarding wizard
  // Step 4 polling turns green automatically. Never blocks widget loading.
  try {
    fetch(apiBase + '/api/widget/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ widget_key: widgetKey }),
      keepalive: true,
    }).catch(function () {});
  } catch (_) {}

  // ── Toggle open/closed ───────────────────────────────────────────────────────
  var open = false;

  function toggleWidget() {
    open = !open;
    iframeWrap.classList.toggle('open', open);
    launcher.setAttribute('aria-expanded', open.toString());

    // Tell the iframe we opened/closed (for focus management)
    try {
      iframe.contentWindow.postMessage({ type: 'nomii:toggle', open: open }, '*');
    } catch (_) {}
  }

  launcher.addEventListener('click', toggleWidget);

  // ── Listen for messages from the widget iframe ────────────────────────────────
  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.type) return;
    // Only accept messages from our iframe or from the host page itself
    var fromIframe = (iframe && e.source === iframe.contentWindow);
    var fromSelf   = (e.origin === window.location.origin);
    if (!fromIframe && !fromSelf) return;

    // Allow the widget to close the panel (e.g. a close button inside)
    if (e.data.type === 'nomii:close') {
      open = true;
      toggleWidget();
    }

    // Allow the widget to update the bubble label and color dynamically
    // (e.g. after /session returns the tenant's chat_bubble_name and primary_color)
    if (e.data.type === 'nomii:updateLabel' && e.data.label) {
      var span = launcher.querySelector('span');
      if (span) span.textContent = e.data.label;
      launcher.setAttribute('aria-label', 'Open ' + e.data.label);
      // Apply tenant's brand color to the launcher bubble
      if (e.data.color && /^#[0-9A-Fa-f]{6}$/.test(e.data.color)) {
        launcher.style.background = e.data.color;
      }
    }

    // SPA auth state push via postMessage — host page signals login/logout
    // Usage: window.postMessage({ type: 'nomii:setUser', email: '...', name: '...' }, '*')
    // For logout: window.postMessage({ type: 'nomii:setUser', email: '', name: '' }, '*')
    if (e.data.type === 'nomii:setUser') {
      var newEmail = e.data.email || '';
      var newName  = e.data.name  || '';
      if (newEmail !== userEmail || newName !== userName) {
        if (newEmail) {
          // User just authenticated — send identify signal into the iframe.
          // The widget calls /api/widget/session/claim internally and continues
          // the existing conversation without a full iframe reload.
          userEmail = newEmail;
          userName  = newName;
          try {
            iframe.contentWindow.postMessage(
              { type: 'nomii:identify', email: newEmail, name: newName },
              '*'
            );
          } catch (_) {
            // Fallback: full reload if postMessage fails (cross-origin edge case)
            reloadWidget();
          }
        } else {
          // User logged out — full reload to clear session and return to anonymous mode
          userEmail = newEmail;
          userName  = newName;
          reloadWidget();
        }
      }
    }
  });

  // ── MutationObserver: watch script tag attribute changes ─────────────────────
  // When a SPA changes data-user-email / data-user-name on the script tag,
  // automatically reload the widget with the new user context.
  // When data-widget-key changes, reload with the new tenant's widget.
  // This means logout → email cleared → widget reloads as anonymous visitor.
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function (mutations) {
      // Check for widget key change (swap to different tenant)
      var keyChanged = mutations.some(function (m) {
        return m.attributeName === 'data-widget-key';
      });
      if (keyChanged) {
        var newKey = scriptTag.getAttribute('data-widget-key') || '';
        if (newKey && newKey !== widgetKey) {
          widgetKey = newKey;
          reloadWidget();
          return;
        }
      }

      // Check for user changes (login/logout/user swap)
      var userChanged = mutations.some(function (m) {
        return m.attributeName === 'data-user-email' || m.attributeName === 'data-user-name';
      });
      if (userChanged) {
        var newEmail = scriptTag.getAttribute('data-user-email') || '';
        var newName  = scriptTag.getAttribute('data-user-name')  || '';
        if (newEmail !== userEmail || newName !== userName) {
          if (newEmail) {
            // Login — hand off in-place without reloading the iframe
            userEmail = newEmail;
            userName  = newName;
            try {
              iframe.contentWindow.postMessage(
                { type: 'nomii:identify', email: newEmail, name: newName },
                '*'
              );
            } catch (_) { reloadWidget(); }
          } else {
            // Logout — full reload back to anonymous mode
            userEmail = newEmail;
            userName  = newName;
            reloadWidget();
          }
        }
      }
    });
    observer.observe(scriptTag, { attributes: true,
      // Watch widget key, auth attributes, and other config changes
      attributeFilter: ['data-widget-key', 'data-user-email', 'data-user-name', 'data-label', 'data-position', 'data-primary-color'],
    });
  }

})();;
