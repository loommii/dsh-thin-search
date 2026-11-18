import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ResolvedConfig } from '../config'
import type { PlatformId, PlatformSearchService } from '../platforms'
import type { PipelineLike } from '../search/pipeline'
import type { LoggerLike } from '../search/http'

/** Dependencies shared by the three Agent tools. */
export interface ToolHostDeps {
  readonly pipeline: PipelineLike
  readonly platforms: PlatformSearchService
  readonly getConfig: () => ResolvedConfig
  readonly logger?: LoggerLike
}

export type { PipelineLike, PlatformId, ToolDefinition }
