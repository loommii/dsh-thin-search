/**
 * Thin Search client stylesheet. Every color and focus treatment reads a
 * theme token (`--dsw-alias-*` / `--dsw-focus-ring-*`) so the page follows the
 * active light or dark theme without hard-coded colors.
 * @module dsh-thin-search/client/styles
 */

/** Stylesheet id used to inject once per document. */
export const STYLE_ID = 'dsh-thin-search/client.css'

/** Page, card, control, and status styles. */
export const STYLES = [
  '.dsts-page{display:flex;flex-direction:column;gap:12px;max-width:720px;color:var(--dsw-alias-label-primary)}',
  '.dsts-header{display:flex;flex-direction:column;gap:4px}',
  '.dsts-title{margin:0;font-size:16px;font-weight:600;line-height:24px;color:var(--dsw-alias-label-primary)}',
  '.dsts-intro{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-tertiary)}',

  '.dsts-card{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border:.5px solid var(--dsw-alias-border-l4);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}',
  '.dsts-cardTitle{margin:0;font-size:14px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}',
  '.dsts-cardDesc{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
  '.dsts-cardBody{display:flex;flex-direction:column;gap:10px;margin-top:8px}',

  '.dsts-field{display:flex;flex-direction:column;gap:5px}',
  '.dsts-fieldRow{flex-direction:row;align-items:flex-start;justify-content:space-between;gap:16px}',
  '.dsts-fieldText{display:flex;flex-direction:column;gap:4px;min-width:0}',
  '.dsts-label{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}',
  '.dsts-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
  '.dsts-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}',
  '.dsts-status{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',

  '.dsts-input,.dsts-select,.dsts-textarea{box-sizing:border-box;width:100%;max-width:360px;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:0 10px;height:32px}',
  '.dsts-textarea{min-height:66px;padding:7px 10px;height:auto;resize:vertical;max-width:none}',
  '.dsts-input::placeholder,.dsts-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}',
  '.dsts-input:focus-visible,.dsts-select:focus-visible,.dsts-textarea:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px;border-color:var(--dsw-alias-brand-primary)}',
  '.dsts-input:disabled,.dsts-select:disabled,.dsts-textarea:disabled{opacity:.55;cursor:default}',
  '.dsts-select{color-scheme:light dark}',

  '.dsts-switch{position:relative;flex:none;box-sizing:border-box;width:36px;height:20px;padding:2px;border:0;border-radius:10px;background:var(--dsw-alias-border-l3);cursor:pointer}',
  '.dsts-switch:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
  '.dsts-switch:disabled{opacity:.5;cursor:default}',
  '.dsts-switchOn{background:var(--dsw-alias-brand-primary)}',
  '.dsts-switchThumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform .12s}',
  '.dsts-switchOn .dsts-switchThumb{transform:translate(16px)}',

  '.dsts-platforms{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;border:0}',
  '.dsts-legend{padding:0;margin:0 0 2px;font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}',
  '.dsts-platform{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
  '.dsts-platform input{accent-color:var(--dsw-alias-brand-primary);margin:0}',
  '.dsts-platform input:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',

  '.dsts-inlineAlert{display:flex;flex-direction:column;gap:6px;align-items:flex-start}',
  '.dsts-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding-top:4px}',
  '.dsts-actions{display:flex;align-items:center;gap:8px}',
  '.dsts-btn{appearance:none;font:inherit;font-size:13px;line-height:1.5;padding:5px 14px;border-radius:8px;border:1px solid transparent;cursor:pointer}',
  '.dsts-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
  '.dsts-btn:disabled{opacity:.5;cursor:default}',
  '.dsts-btnPrimary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
  '.dsts-btnOutline{background:transparent;border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
].join('')

/**
 * Inject the stylesheet once per document, if a document exists. The browser
 * bundle calls this from `apply`; server-side renders and tests have none.
 */
export function installStyles(): void {
  if (typeof document === 'undefined') return
  const selector = `style[data-plugin-css="${STYLE_ID}"]`
  if (document.querySelector(selector) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-thin-search'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = STYLES
  document.head.appendChild(tag)
}
