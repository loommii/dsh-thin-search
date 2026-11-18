/**
 * dsh-thin-search browser half: registers the locale dictionaries, the
 * `plugins.row.config` page on the Plugins page while the Host serves the
 * `thin-search` namespace, and the `/thin-search-engine` command.
 *
 * The bundle requires only `react` and `react/jsx-runtime`; services arrive
 * through the Cordis client context.
 * @module dsh-thin-search/client
 */
import type { ReactNode } from 'react'
import { createEngineCommand } from './command'
import {
  LOCALE_NAMESPACE,
  ROW_CONFIG_KEY,
  ROW_CONFIG_SLOT,
  THIN_SEARCH_NAMESPACE,
} from './config'
import { DICTIONARIES } from './locales'
import { ThinSearchRowConfig } from './page'
import { ThinSearchRuntime } from './runtime'
import { installStyles } from './styles'
import type { ClientContext, CommandUiService, PluginConfigViewProps } from './types'

/** Services the browser half requires before `apply` runs. */
export const inject = ['slots', 'locale', 'remote', 'remote.web', 'configForms']

/**
 * Register the page and command. The row page is mounted only while the Host
 * serves `thin-search`; the command is optional so a composition without the
 * command UI still gets the page.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  installStyles()
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, DICTIONARIES), 'thin-search: locale dictionaries')

  const runtime = new ThinSearchRuntime(ctx)
  ctx.effect(() => () => { runtime.dispose() }, 'thin-search: client runtime')

  const RowConfigPage = createRowConfigComponent(runtime)
  ctx.effect(
    () => ctx.configForms.whileServed([THIN_SEARCH_NAMESPACE], () => ctx.slots.inject(
      ROW_CONFIG_SLOT,
      () => ctx.slots.register({ name: ROW_CONFIG_SLOT, key: ROW_CONFIG_KEY }, RowConfigPage),
    )),
    'thin-search: plugin manager row configuration',
  )

  ctx.inject(['commandUi'], (commandCtx) => {
    const commandUi = commandCtx.get<CommandUiService>('commandUi')
    if (commandUi === undefined) return
    commandCtx.effect(
      () => commandUi.register(createEngineCommand(runtime)),
      'thin-search: /thin-search-engine command',
    )
  })
}

/**
 * Close the runtime over the component the slot registry stores. The page
 * function is called directly so the `summary` view returns its one-line
 * string, exactly as the Plugins page expects.
 */
function createRowConfigComponent(runtime: ThinSearchRuntime) {
  return function ThinSearchRowConfigPage(props: PluginConfigViewProps): ReactNode {
    return ThinSearchRowConfig({ ...props, runtime })
  }
}

export { ThinSearchRowConfig } from './page'
export { COMMAND_NAME, ROW_CONFIG_KEY, THIN_SEARCH_NAMESPACE, WEB_NAMESPACE } from './config'
