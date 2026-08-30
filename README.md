# dsh-thin-search

**DeepSeek Harness 免费搜索插件（v0.1.0）** —— 零模型调用、零 API key 的网页搜索。

DSH 官方网页搜索依赖 DeepSeek V4 Flash 模型（Anthropic 格式），每次搜索消耗一次模型调用。本插件用纯 HTTP 抓取免费搜索引擎（AnySearch / Bing / DuckDuckGo / SearXNG），支持多引擎自动回退、平台搜索、时间过滤、搜索增强（可选）、结果缓存与 HTTP/HTTPS 代理，**任何网关/中转用户都能零成本联网搜索**。

## 特性

- 🆓 零成本 —— 全部引擎免费，无需 API key
- 🚫 零模型调用 —— 纯 HTTP，不依赖 Anthropic 协议，不消耗 token
- 🔁 多引擎自动回退 —— AnySearch（默认）/ Bing / DDG / SearXNG
- 🔎 平台搜索 —— GitHub / V2EX / Bilibili / Reddit / HN / Stack Overflow / Wikipedia / npm
- 🕒 时间过滤 —— `advanced_search` 支持 `timeRange`
- 🧠 搜索增强（可选，默认关）—— LLM 规范化搜索词，⚠️ 消耗 Token
- 🚀 HTTP/HTTPS 代理 —— 仅本插件生效（undici ProxyAgent），支持 V2Ray / Clash
- ⚙️ 网页设置页 + `/thin-search-engine` 命令 + `free_search_test` 测试

## 安装

```sh
dsh plugin --profile web add dsh-thin-search        # npm（发布后）
dsh plugin --profile web add "github:loommii/dsh-thin-search#path:dsh-thin-search"   # GitHub（monorepo 子目录）
```

安装后重启 `dsh web`。插件 patch 自动把 `web.searchProvider` 指向本插件。

## 文档

完整的中英文 README（设置项、代理说明、已知限制、工作原理）见 [dsh-thin-search/README.md](dsh-thin-search/README.md)。

## 目录

```text
dsh-thin-search/
├── lib/index.js          # host 端：引擎路由、回退、缓存、工具注册、settings 桥
├── lib/client.js         # 浏览器端：设置页 + /thin-search-engine 命令
├── lib/proxy.js          # undici ProxyAgent 封装（仅本插件）
├── cordis.patch.yml      # 插件 loader patch（searchProvider → thin-search）
├── assets/               # 设置页截图
└── package.json
```

## License

MIT