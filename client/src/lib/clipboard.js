// Copy text to clipboard with a legacy-HTTP fallback.
//
// navigator.clipboard is only available on HTTPS / localhost, so
// self-hosted installs served over plain HTTP need an execCommand
// fallback. Previously duplicated in ShenmaySettings and Step4InstallWidget.
export const copyToClipboard = (text) => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => _fallbackCopy(text));
  }
  _fallbackCopy(text);
};

const _fallbackCopy = (text) => {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
};
