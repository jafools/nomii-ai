/**
 * SHENMAY AI — Brand Learning · Public Module Surface
 *
 * Re-exports the worker entry points + helpers used elsewhere (the widget's
 * anon system-prompt builder needs `renderBrandSoulForPrompt`; the portal
 * route needs the worker's `runOneTenant` to allow ad-hoc force-runs).
 */

'use strict';

const worker = require('./worker');
const promote = require('./promote');
const scrub = require('./scrub');
const distill = require('./distill');
const renderer = require('./render');

module.exports = {
  // Cron lifecycle
  start: worker.start,
  stop:  worker.stop,
  // Single-cycle entry (used by tests + force-run from portal)
  runOneTenant: worker.runOneTenant,
  runCycle:     worker.runCycle,
  // Pure helpers (exported for tests + reuse)
  applyAndPromote: promote.applyAndPromote,
  scrubMessagesForDistillation: scrub.scrubMessagesForDistillation,
  quickScanForResidualPii: scrub.quickScanForResidualPii,
  distillBrandObservations: distill.distillBrandObservations,
  normalizeObservations: distill.normalizeObservations,
  buildAnchorList: distill.buildAnchorList,
  buildDistillSystem: distill.buildDistillSystem,
  renderBrandSoulForPrompt: renderer.renderBrandSoulForPrompt,
};
