/**
 * Thin Search client copy. Every visible string the page and the
 * `/thin-search-engine` command render comes from this namespace through
 * `ctx.locale.bind('thin-search')`; no component carries literal copy.
 *
 * The two baseline dictionaries must stay key-for-key identical: the locale
 * service registers both in one call and the Host's baseline locales are
 * `zh` and `en`.
 * @module dsh-thin-search/client/locales
 */
import type { EngineId, PlatformId } from './config'

/** English dictionary; its key union is the namespace's message key type. */
export const en = {
  'status.loading': 'Loading settings…',
  'status.unavailable': 'Thin Search settings are not served by this deployment.',
  'status.readOnly': 'This deployment stores settings read-only.',
  'status.writeFailed': 'The Host refused the change.',

  'settings.clear': 'Clear',

  'provider.title': 'Search provider',
  'provider.description': 'Which provider answers web search and the web_search tool for every Agent.',
  'provider.label': 'Web search provider',
  'provider.hint': 'The switch writes the global web.searchProvider setting immediately; no restart is needed.',
  'provider.none': 'No provider selected',
  'provider.missingOption': '{id} (not registered)',
  'provider.loading': 'Loading registered providers…',
  'provider.error': 'Could not load the registered providers.',
  'provider.retry': 'Retry',
  'provider.switchFailed': 'The Host refused the provider change.',
  'provider.unavailable': 'The web settings namespace is not served, so the provider cannot be switched here.',
  'provider.current': 'Current provider: {name}',

  'engine.title': 'Preferred engine',
  'engine.description': 'The free engine Thin Search tries first; failures fall back automatically.',
  'engine.label': 'First engine',
  'engine.hint': 'Bing is the default. AnySearch handles Chinese questions well; SearXNG, DuckDuckGo HTML, and Lite may need network access.',
  'engine.bing': 'Bing',
  'engine.anysearch': 'AnySearch',
  'engine.searxng': 'SearXNG',
  'engine.ddg': 'DuckDuckGo HTML',
  'engine.ddg-lite': 'DuckDuckGo Lite',

  'enhance.title': 'Search enhancement',
  'enhance.description': 'Rewrite conversational input into search keywords with one model call.',
  'enhance.toggle': 'Enable search enhancement',
  'enhance.hint': 'Off by default. While on, each cache miss makes one extra model call and spends tokens.',
  'enhance.modelLabel': 'Enhancement model',
  'enhance.modelPlaceholder': 'provider:model',
  'enhance.modelHint': 'Leave empty to use the current Agent model. A provider:model override must name an installed model; this page offers no model list.',
  'enhance.promptPathLabel': 'System prompt file',
  'enhance.promptPathPlaceholder': '~/.dsh/thin-search/system-prompt.md',
  'enhance.promptPathHint': 'Leave empty to use the built-in prompt. Supports ~/... or an absolute path.',

  'platforms.title': 'Platform search',
  'platforms.description': 'Enable the platforms the platform_search tool may query.',
  'platforms.legend': 'Enabled platforms',
  'platforms.hint': 'Disabled platforms are skipped. V2EX returns hot posts only; Bilibili and Reddit may be rate-limited.',
  'platforms.allDisabled': 'No platform is enabled; platform_search will answer with an error.',
  'platform.github': 'GitHub',
  'platform.v2ex': 'V2EX',
  'platform.bilibili': 'Bilibili',
  'platform.reddit': 'Reddit',
  'platform.hn': 'Hacker News',
  'platform.stackoverflow': 'Stack Overflow',
  'platform.wikipedia': 'Wikipedia',
  'platform.npm': 'npm',

  'advanced.title': 'Advanced settings',
  'advanced.description': 'Cache lifetime and per-engine parameters.',
  'advanced.cacheLabel': 'Result cache (minutes)',
  'advanced.cacheHint': '0 disables the cache. A cache hit is served before any enhancement call.',
  'advanced.bingMarketLabel': 'Bing market',
  'advanced.bingMarketHint': 'Bing mkt value, for example zh-CN; empty uses the deployment default.',
  'advanced.regionLabel': 'DuckDuckGo region',
  'advanced.regionHint': 'DuckDuckGo kl value, for example cn-zh; empty leaves the default.',
  'advanced.searxngLabel': 'SearXNG instances',
  'advanced.searxngPlaceholder': 'https://searx.example.com',
  'advanced.searxngHint': 'One absolute http(s) base URL per line. Shift+Enter adds a line; Enter saves. Empty uses the built-in instance list.',

  'validation.cacheTtl': 'Use a whole number of minutes, 0 or greater.',
  'validation.enhanceSystemPromptPath': 'Use ~/... or an absolute path.',
  'validation.searxng': 'These entries are not absolute http(s) URLs: {entries}',

  'command.label': 'Thin Search engine',
  'command.description': 'Choose the free engine Thin Search tries first.',
  'command.current': 'current',
  'command.searchPlaceholder': 'Search engines',
  'command.searchEmpty': 'No engines available.',
  'command.searchNoResults': 'No matching engines.',
} as const

/** Every message key the namespace owns. */
export type MessageKey = keyof typeof en

/** Chinese dictionary, key-for-key identical to {@link en}. */
export const zh: Record<MessageKey, string> = {
  'status.loading': '正在加载设置…',
  'status.unavailable': '当前部署未提供 Thin Search 设置。',
  'status.readOnly': '当前部署的设置为只读。',
  'status.writeFailed': 'Host 拒绝了这次修改。',

  'settings.clear': '清除',

  'provider.title': '搜索提供方',
  'provider.description': '选择由哪个提供方为所有 Agent 的网页搜索与 web_search 工具提供结果。',
  'provider.label': '网页搜索提供方',
  'provider.hint': '切换会立即写入全局 web.searchProvider 设置，无需重启。',
  'provider.none': '未选择提供方',
  'provider.missingOption': '{id}（未注册）',
  'provider.loading': '正在加载已注册的提供方…',
  'provider.error': '无法加载已注册的提供方。',
  'provider.retry': '重试',
  'provider.switchFailed': 'Host 拒绝了提供方切换。',
  'provider.unavailable': '当前部署未提供 web 设置命名空间，无法在此切换提供方。',
  'provider.current': '当前提供方：{name}',

  'engine.title': '首选引擎',
  'engine.description': 'Thin Search 首先尝试的免费引擎；失败后会自动回退。',
  'engine.label': '首选引擎',
  'engine.hint': '默认使用 Bing。AnySearch 对中文问句效果较好；SearXNG、DuckDuckGo HTML 与 Lite 可能需要外网访问。',
  'engine.bing': 'Bing',
  'engine.anysearch': 'AnySearch',
  'engine.searxng': 'SearXNG',
  'engine.ddg': 'DuckDuckGo HTML',
  'engine.ddg-lite': 'DuckDuckGo Lite',

  'enhance.title': '搜索增强',
  'enhance.description': '用一次模型调用把口语化输入改写为搜索关键词。',
  'enhance.toggle': '启用搜索增强',
  'enhance.hint': '默认关闭。开启后每次缓存未命中都会额外调用一次模型并消耗 token。',
  'enhance.modelLabel': '增强模型',
  'enhance.modelPlaceholder': 'provider:model',
  'enhance.modelHint': '留空则使用当前 Agent 模型。provider:model 覆盖必须指向已安装模型；本页不提供模型下拉列表。',
  'enhance.promptPathLabel': '系统提示词文件',
  'enhance.promptPathPlaceholder': '~/.dsh/thin-search/system-prompt.md',
  'enhance.promptPathHint': '留空则使用内置提示词。支持 ~/... 或绝对路径。',

  'platforms.title': '平台搜索',
  'platforms.description': '启用 platform_search 工具可查询的平台。',
  'platforms.legend': '已启用的平台',
  'platforms.hint': '禁用的平台会被跳过。V2EX 仅返回热帖；Bilibili 与 Reddit 可能受风控限制。',
  'platforms.allDisabled': '未启用任何平台；platform_search 将返回错误。',
  'platform.github': 'GitHub',
  'platform.v2ex': 'V2EX',
  'platform.bilibili': 'Bilibili',
  'platform.reddit': 'Reddit',
  'platform.hn': 'Hacker News',
  'platform.stackoverflow': 'Stack Overflow',
  'platform.wikipedia': 'Wikipedia',
  'platform.npm': 'npm',

  'advanced.title': '高级设置',
  'advanced.description': '缓存时长与各引擎参数。',
  'advanced.cacheLabel': '结果缓存（分钟）',
  'advanced.cacheHint': '0 关闭缓存。命中缓存时不会调用增强模型。',
  'advanced.bingMarketLabel': 'Bing 市场',
  'advanced.bingMarketHint': 'Bing mkt 值，例如 zh-CN；留空使用部署默认。',
  'advanced.regionLabel': 'DuckDuckGo 区域',
  'advanced.regionHint': 'DuckDuckGo kl 值，例如 cn-zh；留空使用默认。',
  'advanced.searxngLabel': 'SearXNG 实例',
  'advanced.searxngPlaceholder': 'https://searx.example.com',
  'advanced.searxngHint': '每行一个绝对 http(s) 基础 URL。Shift+Enter 换行，Enter 保存。留空使用内置实例列表。',

  'validation.cacheTtl': '请填写大于或等于 0 的整数分钟数。',
  'validation.enhanceSystemPromptPath': '请使用 ~/... 或绝对路径。',
  'validation.searxng': '以下条目不是绝对 http(s) URL：{entries}',

  'command.label': 'Thin Search 引擎',
  'command.description': '选择 Thin Search 首先尝试的免费引擎。',
  'command.current': '当前',
  'command.searchPlaceholder': '搜索引擎',
  'command.searchEmpty': '没有可用引擎。',
  'command.searchNoResults': '没有匹配的引擎。',
}

/** Message key of one engine's display name. */
export function engineLabelKey(id: EngineId): MessageKey {
  return `engine.${id}`
}

/** Message key of one platform's display name. */
export function platformLabelKey(id: PlatformId): MessageKey {
  return `platform.${id}`
}

/** The baseline dictionaries registered for this namespace. */
export const DICTIONARIES: Record<string, Record<string, string>> = { en, zh }
