import { anysearchEngine } from './anysearch'
import { bingEngine } from './bing'
import { ddgEngine } from './ddg'
import { ddgLiteEngine } from './ddg-lite'
import { searxngEngine } from './searxng'
import type { EngineId, SearchEngine } from './types'

/** All five engines in the default fallback order. */
export const ENGINES: readonly SearchEngine[] = Object.freeze([
  bingEngine,
  anysearchEngine,
  searxngEngine,
  ddgEngine,
  ddgLiteEngine,
])

/** Build an engine lookup, preserving the supplied order for chain construction. */
export function createEngineMap(engines: readonly SearchEngine[] = ENGINES): ReadonlyMap<EngineId, SearchEngine> {
  return new Map(engines.map(engine => [engine.id, engine]))
}

export { anysearchEngine, bingEngine, ddgEngine, ddgLiteEngine, searxngEngine }
export type { EngineContext, EngineId, SearchEngine } from './types'
export { ENGINE_IDS, ENGINE_TITLES, normalizeEngineId } from './types'
