/**
 * Thin Search bundle-card styles, matched to dsh-context v0.85.1's settings
 * card: grouped rows, 36px/18px pill selects, textarea clear affordance, and
 * label-left/control-right layout. Every color and focus treatment reads a
 * theme token so light and dark themes follow the shell.
 * @module dsh-thin-search/client/styles
 */

/** Stylesheet id used to inject once per document. */
export const STYLE_ID = 'dsh-thin-search/client.css'

/** Bundle-card styles. */
export const STYLES = [
  '.dsts-settings-prefs{padding:4px 0}',
  '.dsts-settings-group+.dsts-settings-group{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:18px;padding-top:18px}',
  '.dsts-settings-group-title{letter-spacing:.01em;color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600;line-height:24px}',

  '.dsts-settings-row{align-items:center;gap:8px;padding:8px 0;display:flex}',
  '.dsts-settings-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:14px;font-weight:400}',
  '.dsts-settings-field{flex-direction:column;display:flex}',

  '.dsts-settings-select{background:var(--dsw-alias-bg-module-platform);height:36px;max-width:260px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;transition:background-color .2s ease-in-out;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}',
  '.dsts-settings-select:hover:enabled{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsts-settings-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
  '.dsts-settings-select:disabled{opacity:.5;cursor:default}',
  '.dsts-settings-select-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsts-settings-chevron{border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;width:6px;height:6px;transform:rotate(45deg) translateY(-1px);flex:none}',
  '.dsts-settings-pillwrap{position:relative;display:inline-flex;justify-content:flex-end}',

  '.dsts-settings-menu{position:absolute;z-index:20;top:calc(100% + 4px);right:0;min-width:180px;max-width:280px;padding:4px;display:flex;flex-direction:column;gap:2px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:0 6px 20px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)}',
  '.dsts-settings-menu-item{appearance:none;border:0;background:transparent;text-align:left;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);padding:6px 10px;border-radius:6px;cursor:pointer}',
  '.dsts-settings-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsts-settings-menu-item:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-1px}',
  '.dsts-settings-menu-item-on{background:var(--dsw-alias-bg-module-platform);font-weight:600}',

  '.dsts-settings-note{color:var(--dsw-alias-label-tertiary);margin:12px 0 4px;font-size:12px;line-height:1.5}',
  '.dsts-settings-group .dsts-settings-note{margin:4px 0 0}',
  '.dsts-settings-note-error{color:var(--dsw-alias-state-error-primary)}',
  '.dsts-settings-inline-action{appearance:none;border:0;background:transparent;font:inherit;font-size:12px;color:var(--dsw-alias-state-business-primary);cursor:pointer;padding:0;text-decoration:underline}',
  '.dsts-settings-inline-action:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',

  '.dsts-settings-textrow{flex-direction:column;align-items:stretch}',
  '.dsts-settings-textwrap{display:flex;position:relative}',
  '.dsts-settings-textwrap>.dsts-settings-textarea{flex:1;min-width:0;padding-right:30px}',
  '.dsts-settings-textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);width:100%;color:var(--dsw-alias-label-primary);font:inherit;resize:vertical;transition:border-color .2s ease-in-out;outline:none;padding:6px 12px;font-size:13px;line-height:1.5}',
  '.dsts-settings-textarea:focus{border-color:var(--dsw-alias-state-business-primary)}',
  '.dsts-settings-textarea:disabled{opacity:.5;cursor:default}',
  '.dsts-settings-textarea::placeholder{color:var(--dsw-alias-label-dimmed)}',
  '.dsts-settings-input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);width:100%;max-width:320px;height:32px;color:var(--dsw-alias-label-primary);font:inherit;transition:border-color .2s ease-in-out;outline:none;padding:0 12px;font-size:13px;line-height:1.5}',
  '.dsts-settings-input:focus{border-color:var(--dsw-alias-state-business-primary)}',
  '.dsts-settings-input:disabled{opacity:.5;cursor:default}',
  '.dsts-settings-input::placeholder{color:var(--dsw-alias-label-dimmed)}',
  '.dsts-settings-textx{position:absolute;top:8px;right:8px;width:18px;height:18px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:14px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}',
  '.dsts-settings-textx:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.dsts-settings-textx:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',

  '.dsts-settings-switch{position:relative;flex:none;box-sizing:border-box;width:36px;height:20px;padding:2px;border:0;border-radius:10px;background:var(--dsw-alias-border-l3);cursor:pointer}',
  '.dsts-settings-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
  '.dsts-settings-switch:disabled{opacity:.5;cursor:default}',
  '.dsts-settings-switch-on{background:var(--dsw-alias-brand-primary)}',
  '.dsts-settings-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform .12s}',
  '.dsts-settings-switch-on .dsts-settings-switch-thumb{transform:translate(16px)}',

  '.dsts-settings-platforms{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;border:0}',
  '.dsts-settings-legend{padding:0;margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
  '.dsts-settings-chips{display:flex;flex-wrap:wrap;gap:6px}',
  '.dsts-settings-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
  '.dsts-settings-chip input{accent-color:var(--dsw-alias-brand-primary);margin:0}',
  '.dsts-settings-chip input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
  '.dsts-settings-chip-on{background:var(--dsw-alias-bg-module-platform);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}',
].join('')

/**
 * Inject the stylesheet once per document, if a document exists. The browser
 * bundle calls this from `apply`; server-side renders and tests have none.
 */
export function installStyles(): void {
  if (typeof document === 'undefined') return
  const selector = `style[data-plugin-css="${STYLE_ID}"]`
  const existing = document.querySelector(selector)
  if (existing !== null) {
    // A reloaded bundle updates the stylesheet instead of keeping stale rules.
    existing.textContent = STYLES
    return
  }
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-thin-search'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = STYLES
  document.head.appendChild(tag)
}
