/**
 * dsh-thin-search browser half: registers the locale dictionaries, the
 * `plugins.bundle.config` settings card on the installed bundle's detail page
 * while the Host serves the `thin-search` namespace, and the
 * `/thin-search-engine` command.
 *
 * Bundle configuration receives no owner form props in DSH 0.2.2-rc.3 or
 * 0.2.2-rc.5, so the runtime holds `configForms.get('thin-search')` itself.
 * The bundle requires only `react` and `react/jsx-runtime`; services arrive
 * through the Cordis client context.
 * @module dsh-thin-search/client
 */
import type { ReactNode } from 'react'
import { createEngineCommand } from './command'
import {
  BUNDLE_CONFIG_KEY,
  BUNDLE_CONFIG_SLOT,
  LOCALE_NAMESPACE,
  THIN_SEARCH_NAMESPACE,
} from './config'
import { DICTIONARIES } from './locales'
import { ThinSearchBundleConfig } from './page'
import { ThinSearchRuntime } from './runtime'
import { installStyles } from './styles'
import type { BundleConfigViewProps, ClientContext, CommandUiService } from './types'

/** Services the browser half requires before `apply` runs. */
export const inject = ['slots', 'locale', 'remote', 'remote.web', 'configForms']

/**
 * Register the settings card and command. The card is mounted only while the
 * Host serves `thin-search`; the command is optional so a composition without
 * the command UI still gets the card.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  installStyles()
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, DICTIONARIES), 'thin-search: locale dictionaries')

  const runtime = new ThinSearchRuntime(ctx)
  ctx.effect(() => () => { runtime.dispose() }, 'thin-search: client runtime')
  ctx.effect(() => runtime.attach(ctx.configForms.get(THIN_SEARCH_NAMESPACE)), 'thin-search: config form')

  const BundleConfigCard = createBundleConfigComponent(runtime)
  ctx.effect(
    () => ctx.configForms.whileServed([THIN_SEARCH_NAMESPACE], () => ctx.slots.inject(
      BUNDLE_CONFIG_SLOT,
      () => ctx.slots.register({
        name: BUNDLE_CONFIG_SLOT,
        key: BUNDLE_CONFIG_KEY,
        locale: LOCALE_NAMESPACE,
      }, BundleConfigCard),
    )),
    'thin-search: bundle settings card',
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

/** Close the runtime over the component the bundle slot stores. */
function createBundleConfigComponent(runtime: ThinSearchRuntime) {
  return function ThinSearchBundleConfigPage(_props: BundleConfigViewProps): ReactNode {
    return <ThinSearchBundleConfig runtime={runtime} />
  }
}

export { ThinSearchBundleConfig } from './page'
export { BUNDLE_CONFIG_KEY, BUNDLE_CONFIG_SLOT, COMMAND_NAME, THIN_SEARCH_NAMESPACE, WEB_NAMESPACE } from './config'
