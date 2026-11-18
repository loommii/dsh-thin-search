import { createAdvancedSearchTool } from './advanced-search'
import { createFreeSearchTestTool } from './free-search-test'
import { createPlatformSearchTool } from './platform-search'
import type { ToolHostDeps } from './types'

export type { PipelineLike, ToolHostDeps } from './types'

/** Build the three host tools bound to one pipeline/platform service. */
export function createTools(deps: ToolHostDeps) {
  return [
    createFreeSearchTestTool(deps),
    createPlatformSearchTool(deps),
    createAdvancedSearchTool(deps),
  ]
}
