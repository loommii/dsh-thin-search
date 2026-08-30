# dsh-thin-search

[![node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)
[![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.1.1--rc.1-4c8dff)](https://github.com/deepseek-ai/deepseek-harness)
[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-blue)](https://github.com/deepseek-ai/deepseek-harness)

**DeepSeek Harness 免费搜索插件 —— 零成本、零 API key、零模型调用。**

DSH 官方网页搜索强制依赖 DeepSeek V4 Flash 模型（Anthropic 格式），每次搜索都消耗一次模型调用。本插件用纯 HTTP 抓取免费搜索引擎（Bing / DuckDuckGo / SearXNG / AnySearch），**不调用任何模型、不需要任何 API key**，任何第三方网关/中转用户都能直接联网搜索。

[中文](#中文) · [English](#english)

---

## 中文

### 为什么需要它

DSH 官方自带的网页搜索插件（`dsh-web-search-deepseek`）会强制调用 DeepSeek V4 Flash 模型，并以 Anthropic 格式（`/anthropic/v1/messages` + `web_search_20250305` 工具）发起请求：

- 使用第三方 DeepSeek V4 Flash 网关时，对方不一定提供 Anthropic 协议，搜索直接不可用；
- 即使可用，每次搜索都会消耗一次模型调用，需要额外付费。

**本插件用普通 HTTP 抓取免费搜索引擎，完全不调用模型，任何网络环境都能用，搜索本身零成本。**

### 功能一览

| 功能 | 说明 |
|---|---|
| 🆓 **零成本搜索** | 全部引擎免费、无需 API key、无需注册 |
| 🚫 **零模型调用** | 只发普通 HTTP 请求，不消耗任何 token，不依赖 Anthropic 协议 |
| 🔁 **自动回退** | 任一引擎失败（限流/反爬/网络错误/0 结果）自动尝试下一个，结果注明实际生效引擎 |
| 🌐 **多引擎** | AnySearch（默认）/ Bing / DuckDuckGo / SearXNG，支持自定义 SearXNG 实例 |
| ⚙️ **网页设置页** | 设置 → 搜索引擎：引擎选择、官方搜索切换、增强开关、平台开关、缓存时长 |
| 💬 **弹出式切换** | 聊天框输入 `/thin-search-engine`，点选即切换引擎 |
| 🧪 **引擎测试** | `free_search_test` 工具 + 设置页"测试引擎"按钮 |
| 🕒 **时效** | 按时间范围限定搜索结果，如「最近一周的新闻」 |
| 🔎 **平台搜索** | `platform_search`：GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm（公开 API，零 key） |
| 🧠 **搜索增强** | 可选（默认关）：LLM 把口语化输入规范化为搜索关键词，改善中文问句效果；⚠️ 开启后消耗 Token |
| 🚀 **网络代理** | 内置 HTTP/HTTPS 代理（undici ProxyAgent），仅本插件生效，不污染 DSH 全局 |
| 📦 **结果缓存** | LRU 50 条，TTL 0-5 分钟可配，防免费引擎限流 |
| 🤝 **干净集成** | 实现官方 `WebSearchProvider` seam，与官方插件共存，patch 自动接管 `web.searchProvider` |

### 引擎

| id | 引擎 | 说明 |
|---|---|---|
| `anysearch` | AnySearch AI | **默认引擎**，对中文自然语言问句理解最好，免费无 key |
| `bing` | Bing | 免费，速度快，中文优化（`bingMarket: zh-CN`） |
| `searxng` | SearXNG 元搜索 | 免费，多个公开实例自动切换，支持自定义实例 |
| `ddg` | DuckDuckGo HTML | 免费，共享 IP 上可能限流（自动回退） |
| `ddg-lite` | DuckDuckGo Lite | 免费，同上 |

### 安装

```sh
# 从 npm 安装（发布后）
dsh plugin --profile web add dsh-thin-search

# 或从 GitHub 安装
dsh plugin --profile web add github:loommii/dsh-thin-search

# 或本地源码（开发/自用）
git clone git@github.com:loommii/dsh-thin-search.git
dsh plugin --profile web add /path/to/dsh-thin-search
```

安装后**重启 `dsh web`** 生效。插件通过 patch 自动把 `web.searchProvider` 指向本插件，无需手动配置。

#### 卸载

```sh
dsh plugin --profile web remove dsh-thin-search
```

卸载后**重启 `dsh web`**，即可恢复 DSH 官方默认搜索。

> 依赖说明：对 `@deepseek-ai/dsh-settings` 和 `@deepseek-ai/dsh-tools` 使用 `peerDependencies`，DSH 运行时必须使用安装树中的唯一实例。请用 `dsh plugin --profile <profile> add ...` 安装，不要把 DSH 核心包复制进 profile 的本地 `node_modules`。

### 快速开始

安装重启后，在任意会话直接对 agent 说"帮我搜索……"即可 —— 默认引擎 AnySearch，开箱即用。

### 使用

#### 网页设置页（推荐）

打开 **设置 → 搜索引擎**：

- **搜索提供方**：免费引擎（默认）/ 官方 DeepSeek 搜索 —— 切换会写 profile 的 `cordis.patch.yml`，**重启 DSH 后生效**（页面会提示）
- **搜索引擎**：下拉框切换，保存即生效（默认 `anysearch`）
- **搜索增强**：**默认关闭**。开启后会用 LLM 把口语化输入规范化为搜索关键词（如「今天美元兑换日元的汇率多少？」→「美元 日元 汇率」），改善 Bing 等引擎对中文问句的效果。⚠️ **开启后每次搜索会消耗 Token**；关闭则完全免费、零模型调用
- **增强模型**：可选指定用于搜索增强的 LLM 模型（下拉列出 DSH 中已配置的全部模型）。留空 = 跟随 DSH 默认模型；指定模型失败时自动回退默认模型
- **网络代理**：可选填 HTTP/HTTPS 代理地址（如 `http://127.0.0.1:7890`），用于访问需要外网的引擎。V2Ray / Clash 需开启 HTTP 端口；不支持 SOCKS5。留空 = 直连，保存即生效
- **平台搜索**：勾选启用的平台（`platform_search` 工具按此过滤）
- **结果缓存时长**：0 关闭缓存，1-5 分钟
- **测试引擎**：直测当前引擎可用性


#### 聊天框切换引擎（/thin-search-engine）

输入 `/thin-search-engine` 弹出引擎选择窗口（和 `/model` 一样的交互），点选即切换，当前引擎会标记出来。命令只改首选引擎，搜索仍走自动回退链。

#### 配置文件（`~/.dsh/settings.yaml`）

```yaml
thin-search:
  provider: anysearch        # anysearch / bing / ddg / ddg-lite / searxng
  searchEnhance: false        # 搜索增强：LLM 规范化搜索词（默认关，开启消耗 Token）
  enhanceModel: ""            # 增强模型 "provider:model"；空 = 跟随 DSH 默认模型
  proxy: ""                   # HTTP/HTTPS 代理，如 http://127.0.0.1:7890；空 = 直连
  bingMarket: zh-CN           # Bing 市场
  region: cn-zh               # DuckDuckGo 区域（可选）
  searxngInstances:           # 自定义 SearXNG 实例（可选）
    - https://your-instance.example
  platforms:                  # platform_search 启用列表
    - github
    - v2ex
    - bilibili
    - reddit
    - hn
    - stackoverflow
    - wikipedia
    - npm
  cacheTtl: 5                 # 结果缓存分钟数（0-5）
```

### 网络代理（国内用户）

Bing / AnySearch 在多数网络环境可直接访问；DuckDuckGo / SearXNG / GitHub 等可能需要代理。本插件内置 HTTP/HTTPS 代理支持（基于 undici `ProxyAgent`），**无需设置系统环境变量**：

- **设置 → 搜索引擎 → 网络代理**：填 `http://127.0.0.1:7890`（V2Ray / Clash 的 HTTP 端口），保存即生效，无需重启
- 或直接写 `~/.dsh/settings.yaml` 的 `thin-search.proxy`
- 留空 = 直连

**作用域**：代理只作用于本插件的 11 处引擎请求，不设置全局 dispatcher、不修改 DSH 全局 fetch，其他插件和 DSH 本身不受影响。

> ⚠️ **已知限制**：DuckDuckGo 对代理/数据中心出口 IP 有反爬（HTTP 202 风控页），公共 SearXNG 实例对代理 IP 普遍限流（HTTP 429）。代理场景下推荐 **Bing / AnySearch**（实测稳定）。如自建 SearXNG 实例，填入 `searxngInstances` 即可。

### 工具

#### free_search_test

对 agent 说"测试一下所有搜索引擎"，它会调用 `free_search_test` 工具并报告：

```
Search engine test:
- bing: OK (3 results, e.g. "DeepSeek Harness developer preview: Everything is a plugin")
- anysearch: OK (3 results, ...)
- ddg: FAIL - DuckDuckGo anti-bot challenge (HTTP 202): DDG blocks datacenter/proxy egress IPs. Try Bing instead.
```

#### 时效（advanced_search）

对 agent 说「最近一周的新闻」「最近 3 天的消息」，搜索即自动限定在对应时间段，返回较新的结果。

| 形式 | 示例 | 含义 |
|---|---|---|
| 固定档 | `day` / `week` / `month` / `year` | 1 / 7 / 30 / 365 天 |
| 自定义相对值 | `12h`、`3d`、`2mo`、`1y` | 最近 N 小时/天/月/年 |
| 绝对日期 | `2026-07-01` | 该日期（含）之后发布的结果 |

实现上，支持时间范围的引擎（SearXNG / DDG / DDG Lite）会把天数映射到最近似档位（`≤2 天 → day`，`≤14 天 → week`，`≤90 天 → month`，否则 `year`）；Bing / AnySearch 无对应参数会忽略。带 `timeRange` 时支持时间范围的引擎自动排到回退链前面。

#### platform_search（平台搜索）

`platform_search` 支持 GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm，全部走公开 API（零 key）。可在设置页勾选启用哪些平台。

### 工作原理

- `lib/index.js`（host 端）：实现 `WebSearchProvider`（`id: thin-search` / `available()` / `search()`），统一引擎路由 + 自动回退 + 时间过滤解析 + 结果缓存；注册 `thin-search` settings namespace；提供 `/api/dsh-thin-search-settings` 读写桥（describe / mutate / raw-search，仅限 loopback）；注册 `free_search_test`、`platform_search`、`advanced_search` 工具；动态注入引擎清单到系统提示词
- `lib/client.js`（浏览器端）：React 设置页（挂 `settings.section` 插槽，设置 → 搜索引擎）+ `/thin-search-engine` 弹出式命令（`commandUi` popupSelect）
- `lib/proxy.js`：undici `ProxyAgent` 封装，单例缓存 + `fetchWithProxy`，仅本插件使用
- `cordis.patch.yml`：插件 loader 配置，patch 同时把 `web.searchProvider` 设为 `thin-search`（保留 `fetchProvider: http`）

### 兼容性

| 项目 | 要求 |
|---|---|
| DSH | `>= 0.1.1-rc.1`（依赖 `@deepseek-ai/dsh-settings` / `dsh-tools` `>= 0.1.0-rc.6`） |
| Node.js | `>= 20` |

### 与官方插件的关系

- 官方 `web-search-deepseek`（`deepseek-official`）与本插件可共存；`searchProvider` 指向谁就用谁
- 本插件默认通过 patch 接管搜索（无需 key、零成本）；**设置页"搜索提供方"开关**一键切回官方（写 profile patch 的 `searchProvider: deepseek-official`，需重启 DSH 生效），也可手动改 `~/.dsh/profiles/<profile>/cordis.patch.yml`
- 本插件**不包含**任何模型调用逻辑，也不读取 `DEEPSEEK_API_KEY` —— 第三方网关用户可直接使用

### License

MIT

---

## English

### Why

DSH's official web-search plugin forces a DeepSeek V4 Flash model call in Anthropic format (`/anthropic/v1/messages` + `web_search_20250305`). If you use a third-party gateway, it may not speak the Anthropic protocol — and even when it does, every search costs a model turn.

**This plugin scrapes free search engines with plain HTTP (Bing / DuckDuckGo / SearXNG / AnySearch). No model calls, no Anthropic protocol, no API keys — searching costs nothing and works with any gateway.**

### Features

- **Zero cost** — all engines free, no keys, no registration
- **Zero model calls** — plain HTTP only; no tokens consumed
- **Auto fallback** — any engine failure (rate limit / anti-bot / network / 0 results) automatically tries the next free engine, with a `Note: ... using ...` marker
- **Engines**: `anysearch` (default, best for Chinese natural-language queries) · `bing` (fast, zh-CN) · `searxng` (multi-instance, custom instances) · `ddg` · `ddg-lite`
- **Search enhancement** — optional (default OFF): rewrites natural-language queries into compact keywords via the current default LLM. ⚠️ Consumes tokens while ON; OFF keeps searching fully free
- **Web settings page** — Settings → Search Engine
- **Popup command** — `/thin-search-engine` in chat
- **Engine test** — `free_search_test` tool + "Test engine" button
- **Fresh results** — ask for "last week's news" or "the latest updates" and get recent results instead of stale ones
- **Platform search** — GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm
- **HTTP(S) proxy** — built-in (undici ProxyAgent), plugin-scoped only; works with V2Ray / Clash HTTP ports; no SOCKS5
- **Result caching** — LRU 50, TTL 0-5 min
- **web_fetch preserved** — official `dsh-web-fetch-http` stays enabled
- **Clean integration** — official `WebSearchProvider` seam; coexists with official plugins

### Install

```sh
dsh plugin --profile web add dsh-thin-search        # from npm (once published)
dsh plugin --profile web add github:loommii/dsh-thin-search   # from GitHub
```

Restart `dsh web` after installing. The plugin's patch points `web.searchProvider` to itself automatically.

To uninstall:

```sh
dsh plugin --profile web remove dsh-thin-search
```

Restart `dsh web` afterwards to restore DSH's official search.

### Usage

Settings page: **Settings → Search Engine** (provider switch, engine, enhancement, platforms, cache TTL, proxy). Chat command: `/thin-search-engine`. Config file: `~/.dsh/settings.yaml` under `thin-search:` (see the Chinese section above for the full schema).

### Proxy notes

Set `thin-search.proxy` (e.g. `http://127.0.0.1:7890`) in the settings page or `~/.dsh/settings.yaml` — no env vars needed. HTTP/HTTPS only; no SOCKS5. Only this plugin's requests go through the proxy; DSH and other plugins are untouched.

> **Known limits**: DuckDuckGo anti-bot (HTTP 202) and public SearXNG rate limits (HTTP 429) apply to proxy/datacenter egress IPs. Prefer **Bing / AnySearch** behind a proxy. Self-hosted SearXNG instances can be added via `searxngInstances`.

### Compatibility

| Item | Requirement |
|---|---|
| DSH | `>= 0.1.1-rc.1` |
| Node.js | `>= 20` |

### License

MIT