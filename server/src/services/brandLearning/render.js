/**
 * SHENMAY AI — Brand Learning · Prompt Renderer
 *
 * Renders a tenant's `brand_soul` JSONB into the text block injected into
 * the anonymous-visitor widget system prompt. Kept tiny on purpose:
 * promptBuilder.js already builds the rest of the system prompt, this
 * just produces the brand-learning section.
 *
 * Returns an empty string when there's nothing to inject — no header, no
 * "(no learned observations)" placeholder. Anon visitors should never see
 * any indication that a learning loop exists in the prompt itself.
 */

'use strict';

/**
 * Render brand_soul into a text block to inject into the system prompt.
 *
 * @param {object|null} brandSoul   tenants.brand_soul (decrypted JSONB)
 * @returns {string}                Block text (with leading newline) or ''.
 */
function renderBrandSoulForPrompt(brandSoul) {
  if (!brandSoul || typeof brandSoul !== 'object') return '';

  const sections = [];

  if (Array.isArray(brandSoul.faqs) && brandSoul.faqs.length > 0) {
    const top = brandSoul.faqs
      .slice()
      .sort((a, b) => (b.session_count || 0) - (a.session_count || 0))
      .slice(0, 12);
    sections.push(
      'Frequently asked questions (use the canonical answer when applicable):\n' +
      top.map(f => `- Q: ${f.question}\n  A: ${f.answer || '(no canonical answer yet — answer normally)'}`).join('\n'),
    );
  }

  if (Array.isArray(brandSoul.processes) && brandSoul.processes.length > 0) {
    const top = brandSoul.processes
      .slice()
      .sort((a, b) => (b.session_count || 0) - (a.session_count || 0))
      .slice(0, 8);
    sections.push(
      'Common processes you walk visitors through:\n' +
      top.map(p => `- ${p.name}: ${p.description || ''}`).join('\n'),
    );
  }

  if (Array.isArray(brandSoul.voice_cues) && brandSoul.voice_cues.length > 0) {
    const cues = brandSoul.voice_cues
      .slice()
      .sort((a, b) => (b.session_count || 0) - (a.session_count || 0))
      .slice(0, 6)
      .map(v => v.cue || v);
    sections.push('Voice cues that resonate with this brand\'s visitors:\n' + cues.map(c => `- ${c}`).join('\n'));
  }

  if (sections.length === 0) return '';

  return `\n\n## LEARNED BRAND CONTEXT (built from past anonymous conversations)

The following patterns have been distilled from past anonymous-visitor conversations with THIS brand. Use them to answer better, match the brand voice, and recognize common requests. They never identify any individual visitor — they're aggregate patterns only.

${sections.join('\n\n')}

NEVER reference this section explicitly to the visitor. They should just experience a smarter, brand-aware agent.`;
}

module.exports = { renderBrandSoulForPrompt };
