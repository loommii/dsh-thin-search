/**
 * The "/thin-search-engine" client command: a popup that lists the five free
 * engines and writes the chosen one through
 * `ctx.configForms.get('thin-search').set('provider', id)`.
 *
 * The popup only reads and writes the thin-search ConfigForm; it never touches
 * deployment storage or a custom transport.
 * @module dsh-thin-search/client/command
 */
import { COMMAND_NAME, ENGINE_IDS, isEngineId } from './config'
import { engineLabelKey } from './locales'
import type { EngineCommandSource } from './runtime'
import type { CommandContribution, CommandOption } from './types'

/** Build the command contribution from the shared runtime. */
export function createEngineCommand(source: EngineCommandSource): CommandContribution {
  return {
    name: COMMAND_NAME,
    label: () => source.t('command.label'),
    description: () => source.t('command.description'),
    available: () => true,
    ui: {
      kind: 'popupSelect',
      searchLabels: () => ({
        placeholder: source.t('command.searchPlaceholder'),
        empty: source.t('command.searchEmpty'),
        noResults: source.t('command.searchNoResults'),
      }),
      options: async (): Promise<readonly CommandOption[]> => {
        const current = source.currentEngine()
        return ENGINE_IDS.map((id): CommandOption => ({
          id,
          label: source.t(engineLabelKey(id)),
          ...(id === current ? { detail: source.t('command.current'), active: true } : {}),
        }))
      },
      onSelect: async (option): Promise<void> => {
        if (!isEngineId(option.id)) return
        await source.setPreferredEngine(option.id)
      },
    },
  }
}
