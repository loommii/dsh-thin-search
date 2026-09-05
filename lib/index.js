import { SettingsConflictError } from "@deepseek-ai/dsh-settings";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
import { readFile, rename, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fetchWithProxy } from "./proxy.js";

// dsh-thin-search: 免费网络搜索插件（零成本、零 key、零模型调用）。
// 实现官方 WebSearchProvider seam（ctx.web.registerSearchProvider），
// 只用普通 HTTP 抓取免费搜索引擎（Bing / DuckDuckGo / SearXNG / AnySearch），
// 不依赖 DeepSeek 模型、不发起 Anthropic 格式请求，任何第三方网关都能直接用。

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/";
const BING_URL = "https://www.bing.com/search";
const ANYSEARCH_URL = "https://api.anysearch.com/v1/search";
const SEARXNG_INSTANCES = [
  "https://opnxng.com",
  "https://priv.au",
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://search.inetol.net",
  "https://paulgo.io",
];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ACCEPT_LANG = "zh-CN,zh;q=0.9,en;q=0.8";
const REQUEST_TIMEOUT_MS = 12000;
const CHAIN_BUDGET_MS = 35000;
const TEST_TIMEOUT_MS = 25000; // 引擎测试：搜索增强(≤8s) + 引擎直测

// dsh >= 0.1.2-alpha.2：settingsNamespace() 已移除，register/installSection 直接接受
// 小写连字符形式的命名空间字符串（"thin-search"），运行时非法值才抛 TypeError。
const THIN_SEARCH_NS = "thin-search";
const BRIDGE_PREFIX = "/api/dsh-thin-search-settings";
const PROVIDER_ID = "thin-search";
const OFFICIAL_PROVIDER_ID = "deepseek-official";
const PROFILE_PATCH_FILENAME = "cordis.patch.yml";
// profile cordis.patch.yml 里的托管块：切到官方 DeepSeek 搜索时写入，切回时删除
const ENGINE_MODE_BLOCK_START = "# >>> dsh-thin-search: engine-mode block (managed, do not edit) >>>";
const ENGINE_MODE_BLOCK_END = "# <<< dsh-thin-search: engine-mode block <<<";

const FREE_ENGINES = ["bing", "ddg", "ddg-lite", "searxng", "anysearch"];

// 搜索增强默认系统提示词（用户未自定义时使用）
// 设计原则：意图识别 → 上下文补全 → 关键词提取 → 格式规范化
const DEFAULT_ENHANCE_SYSTEM_PROMPT = [
  "## 角色",
  "你是搜索引擎查询优化专家。你的任务是把用户的自然语言输入转换为高召回率、低歧义的搜索关键词查询。",
  "",
  "## 查询分类",
  "首先判断用户输入的类型：",
  "- **信息型**（what/why/how/是什么/为什么/怎么样）：用户想获取知识，保留核心主题 + 意图词",
  "- **导航型**（某个网站/登录/下载）：用户想访问特定资源，保留品牌名/产品名 + 动作词",
  "- **事务型**（购买/预订/安装）：用户想完成操作，保留产品/服务名 + 动作词",
  "",
  "## 优化规则",
  "1. **识别核心意图**：剥离语气词、敬语、闲聊成分（今天/多少/怎么/如何/是什么/帮我/我想知道/请问/怎么样/咋/怎样/谢谢/辛苦了）",
  "2. **保留关键实体**：产品名、品牌名、地名、人名、技术术语、版本号、日期范围等具体信息",
  "3. **补全隐含上下文**：口语中省略但搜索必需的信息（如「多少钱」→ 补充「价格/报价」，「最新版」→ 补充「最新版本/更新日志」）",
  "4. **去除搜索噪音**：「帮我找一下」「我想了解一下」「有没有推荐」「求告知」「在线等」等纯语气成分",
  "5. **结构化排列**：核心实体放前面，修饰/限定词放后面；关键词用空格分隔，不超过 8 个词",
  "6. **保留比较/限定语义**：如「vs」「对比」「区别」「优缺点」「推荐」「排行」等表达意图的词",
  "",
  "## 输出约束",
  "- 只输出一行关键词，不要解释、不要引号、不要标点（除空格外的符号都会被搜索引擎当作精确匹配）",
  "- 不要添加用户未提及的臆造词汇",
  "- 如果输入已经是规范关键词（如「Python 3.12 release notes」），原样输出",
  "",
  "## 示例",
  "输入：今天美元兑换日元的汇率多少？ → 美元 日元 汇率",
  "输入：北京明天天气怎么样 → 北京 明天 天气",
  "输入：帮我找一下 DeepSeek 的最新版本发布说明 → DeepSeek 最新版本 发布说明",
  "输入：Python 和 Go 哪个更适合后端开发 → Python Go 后端开发 对比",
  "输入：有没有推荐的性价比高的蓝牙耳机 200 元以内 → 蓝牙耳机 推荐 200元 性价比",
  "输入：我想了解一下大模型微调的方法 → 大模型 微调 方法",
  "输入：帮我把这个 PDF 转成 Word → PDF 转 Word 工具",
  "输入：iPhone 16 Pro Max 国行价格 → iPhone 16 Pro Max 国行 价格",
].join("\n");

const TIME_RANGES = ["day", "week", "month", "year"];
const DAYS_BY_RANGE = { day: 1, week: 7, month: 30, year: 365 };
const SEARXNG_TIME = { day: "day", week: "week", month: "month", year: "year" };

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

// 把用户/agent 给的 timeRange 解析成统一对象：{ days } 相对天数，或 { after } 绝对日期。
// 输入支持：day/week/month/year、12h/3d/2mo/1y、2026-07-01，或已解析的 {days}/{after} 对象。
// 无效返回 undefined。
function parseTimeRange(input) {
  if (input === undefined || input === null) return undefined;
  if (typeof input === "object") {
    if (typeof input.after === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.after)) return { after: input.after };
    if (typeof input.days === "number" && Number.isFinite(input.days) && input.days > 0) return { days: input.days };
    return undefined;
  }
  const s = String(input).trim().toLowerCase();
  if (s.length === 0) return undefined;
  if (TIME_RANGES.includes(s)) return { days: DAYS_BY_RANGE[s] };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { after: s };
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(h|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|year|years)$/);
  if (m) {
    const n = parseFloat(m[1]);
    const unit = m[2][0];
    const days =
      unit === "h" ? n / 24 : unit === "d" ? n : unit === "w" ? n * 7 : unit === "m" ? n * 30 : n * 365;
    return { days };
  }
  return undefined;
}

// 把自定义天数映射到只支持固定档的引擎（SearXNG / DDG）的最近似档位
function approximateTimeRange(days) {
  if (days <= 2) return "day";
  if (days <= 14) return "week";
  if (days <= 90) return "month";
  return "year";
}

function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// 统一的 snippet 清洗：剔除登录/付费墙/订阅等噪音短语，折叠空白，限制长度。
const SNIPPET_NOISE =
  /\b(sign up|sign in|log in|login|subscribe( to| for)?|member[- ]?only|become a member|create (a )?free account|read more|continue reading|story continues|get started|install (the )?app|view on|medium membership|join \w+ for free|get updates from this writer|stories in your inbox|remember me for|unlock this|free to read|become a patron)\b/gi;

function cleanSnippet(text) {
  if (!text) return text;
  return String(text)
    .replace(SNIPPET_NOISE, " ")
    .replace(/^\s*(#{1,6}\s*|\[\s*x?\s*\]\s*|-\s*\[\s*x?\s*\]\s*|>\s*)/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractDdgUrl(rel) {
  if (!rel) return null;
  const m = rel.match(/uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  if (rel.startsWith("//")) return `https:${rel}`;
  return rel;
}

function uniqueSources(sources, limit) {
  const seen = new Set();
  const out = [];
  for (const s of sources) {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url);
      out.push(s);
    }
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchHtml(url, signal, proxyUrl) {
  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    response = await fetchWithProxy(url, {
      headers: { "user-agent": USER_AGENT, "accept-language": ACCEPT_LANG },
      signal: controller.signal,
      redirect: "follow",
    }, proxyUrl);
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error?.name === "AbortError") throw new Error(`timeout after ${REQUEST_TIMEOUT_MS / 1000}s (engine unreachable)`);
    throw new Error(`connection error: ${error?.message ?? String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.split("?")[0]}`);
  }
  const html = await response.text();
  if (response.status === 202 || /anomaly|captcha|unusual traffic|robot check/i.test(html.slice(0, 4000))) {
    // 202 或风控页面 = DDG 反爬拦截（对数据中心/代理出口 IP 常见），不是代理配置错误
    throw new Error(
      "DuckDuckGo anti-bot challenge (HTTP 202): DDG blocks datacenter/proxy egress IPs. " +
        "Try Bing instead, or switch to a residential proxy."
    );
  }
  return html;
}

async function fetchHtmlWithRetry(url, signal, retries = 3, proxyUrl) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const html = await fetchHtml(url, signal, proxyUrl);
      if (html.length > 500) return html;
      lastError = new Error(`empty response (${html.length} bytes)`);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (signal?.aborted) throw lastError ?? new Error("fetch aborted");
    }
  }
  throw lastError ?? new Error("fetch failed");
}

async function searchDdgHtml(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query });
  if (options?.region) params.set("kl", options.region);
  if (options?.timeRange) {
    const df = { day: "d", week: "w", month: "m", year: "y" }[approximateTimeRange(options.timeRange.days ?? 7)];
    if (df) params.set("df", df);
  }
  const html = await fetchHtmlWithRetry(`${DDG_HTML_URL}?${params}`, signal, options?.retries ?? 3, options?.proxy);
  const blocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) ?? [];
  const sources = [];
  for (const block of blocks) {
    const urlMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"/);
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/);
    const dateMatch = block.match(/<span[^>]*>\s*([\dT:.+-]+)\s*<\/span>/);
    const url = extractDdgUrl(urlMatch?.[1]);
    if (!url) continue;
    sources.push({
      url,
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
      ...(dateMatch ? { publishedAt: dateMatch[1] } : {}),
    });
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

async function searchDdgLite(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query });
  if (options?.timeRange) {
    const df = { day: "d", week: "w", month: "m", year: "y" }[approximateTimeRange(options.timeRange.days ?? 7)];
    if (df) params.set("df", df);
  }
  const html = await fetchHtmlWithRetry(`${DDG_LITE_URL}?${params}`, signal, options?.retries ?? 3, options?.proxy);
  const linkMatches = html.match(/<a[^>]*class=['"]result-link['"][^>]*>[\s\S]*?<\/a>/g) ?? [];
  const snippetMatches = html.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g) ?? [];
  const sources = [];
  for (let i = 0; i < linkMatches.length; i++) {
    const tag = linkMatches[i];
    const hrefMatch = tag.match(/href="([^"]*)"/);
    const titleMatch = tag.match(/class=['"]result-link['"][^>]*>(.*?)<\/a>/);
    if (!hrefMatch) continue;
    const url = extractDdgUrl(hrefMatch[1]);
    if (!url) continue;
    const snippet = snippetMatches[i]?.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/)?.[1];
    sources.push({
      url,
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippet ? { snippet: stripTags(snippet) } : {}),
    });
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

async function searchBing(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query, mkt: options?.bingMarket ?? "zh-CN" });
  const html = await fetchHtmlWithRetry(`${BING_URL}?${params}`, signal, options?.retries ?? 3, options?.proxy);
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? [];
  const sources = [];
  for (const block of blocks) {
    const hrefMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/);
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!hrefMatch) continue;
    sources.push({
      url: hrefMatch[1],
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
    });
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

async function searchSearxng(query, maxResults, options, signal) {
  const instances = options?.searxngInstances?.length ? options.searxngInstances : SEARXNG_INSTANCES;
  const errors = [];
  for (const base of instances) {
    try {
      const params = new URLSearchParams({ q: query, format: "json" });
      if (options?.timeRange) {
        const tr = SEARXNG_TIME[approximateTimeRange(options.timeRange.days ?? 7)];
        if (tr) params.set("time_range", tr);
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener("abort", onAbort);
      const response = await fetchWithProxy(`${base}/search?${params}`, {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: ctrl.signal,
      }, options?.proxy);
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (!response.ok) {
        errors.push(`${base}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      if (!data || !Array.isArray(data.results)) {
        errors.push(`${base}: invalid JSON`);
        continue;
      }
      const sources = data.results
        .filter((r) => r.url)
        .map((r) => ({
          url: r.url,
          ...(r.title ? { title: String(r.title) } : {}),
          ...(r.content ? { snippet: String(r.content) } : {}),
        }));
      if (sources.length > 0) {
        return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
      }
      errors.push(`${base}: 0 results`);
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${base}: ${message}`);
    }
  }
  const detail = errors.length > 0 ? errors.join(", ") : "no instances configured";
  throw new Error(`all SearXNG instances failed: ${detail.slice(0, 300)}`);
}

async function searchAnysearch(query, maxResults, signal, proxyUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetchWithProxy(ANYSEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, max_results: maxResults ?? 5 }),
      signal: controller.signal,
    }, proxyUrl);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`AnySearch request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) throw new Error(`AnySearch API error (HTTP ${response.status})`);
  const data = await response.json();
  if (data.code !== 0) throw new Error(`AnySearch API error: ${data.message ?? data.code}`);
  const results = data.data?.results ?? [];
  return {
    sources: results
      .filter((r) => r.url)
      .map((r) => ({
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(r.snippet ? { snippet: String(r.snippet).slice(0, 300) } : {}),
      })),
    truncated: false,
  };
}

//#region platform search (GitHub / V2EX / Bilibili / Reddit / HN / StackOverflow / Wikipedia / npm)
const PLATFORMS = {
  github: { name: "GitHub" },
  v2ex: { name: "V2EX" },
  bilibili: { name: "Bilibili" },
  reddit: { name: "Reddit" },
  hn: { name: "Hacker News" },
  stackoverflow: { name: "Stack Overflow" },
  wikipedia: { name: "Wikipedia" },
  npm: { name: "npm" },
};

async function searchGithub(query, maxResults, signal, proxyUrl) {
  const response = await fetchWithProxy(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${maxResults ?? 5}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/vnd.github+json" },
      ...(signal !== undefined ? { signal } : {}),
    },
    proxyUrl
  );
  if (!response.ok) throw new Error(`GitHub API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.items ?? []).map((item) => ({
      url: item.html_url,
      title: item.full_name ?? item.name,
      snippet: `${item.description ?? ""}${item.stargazers_count ? ` ⭐${item.stargazers_count}` : ""}`.trim(),
    })),
    truncated: false,
  };
}

async function searchV2ex(query, maxResults, signal, proxyUrl) {
  const response = await fetchWithProxy("https://www.v2ex.com/api/topics/hot.json", {
    headers: { "user-agent": USER_AGENT },
    ...(signal !== undefined ? { signal } : {}),
  }, proxyUrl);
  if (!response.ok) throw new Error(`V2EX API error (HTTP ${response.status})`);
  const topics = await response.json();
  const q = query.toLowerCase();
  const matched = Array.isArray(topics)
    ? topics.filter((t) => (t.title ?? "").toLowerCase().includes(q) || (t.content ?? "").toLowerCase().includes(q))
    : [];
  return {
    sources: matched.slice(0, maxResults ?? 5).map((t) => ({
      url: `https://www.v2ex.com/t/${t.id}`,
      title: t.title,
      ...(t.content ? { snippet: String(t.content).slice(0, 200) } : {}),
    })),
    truncated: false,
  };
}

async function searchBilibili(query, maxResults, signal, proxyUrl) {
  const response = await fetchWithProxy(
    `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(query)}`,
    {
      headers: { "user-agent": USER_AGENT, referer: "https://www.bilibili.com" },
      ...(signal !== undefined ? { signal } : {}),
    },
    proxyUrl
  );
  if (!response.ok) throw new Error(`Bilibili API error (HTTP ${response.status})`);
  const data = await response.json();
  if (data.code !== 0) throw new Error(`Bilibili API error: ${data.message ?? data.code}`);
  const sources = [];
  for (const section of data.data?.result ?? []) {
    for (const item of section.data ?? []) {
      if (!item.arcurl) continue;
      sources.push({
        url: item.arcurl,
        title: item.title ? String(item.title).replace(/<[^>]+>/g, "") : item.bvid,
        ...(item.desc ? { snippet: String(item.desc).slice(0, 200) } : {}),
      });
      if (sources.length >= (maxResults ?? 5)) break;
    }
    if (sources.length >= (maxResults ?? 5)) break;
  }
  return { sources, truncated: false };
}

async function searchReddit(query, maxResults, signal, proxyUrl) {
  const response = await fetchWithProxy(
    `https://old.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${maxResults ?? 5}&sort=relevance`,
    {
      headers: {
        "user-agent": `${USER_AGENT} (dsh-thin-search; contact: github.com/DDDMUC)`,
        accept: "application/json",
      },
      ...(signal !== undefined ? { signal } : {}),
    },
    proxyUrl
  );
  if (!response.ok) throw new Error(`Reddit API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.data?.children ?? [])
      .map((c) => c.data)
      .filter((p) => p && p.url)
      .map((p) => ({
        url: p.url,
        title: p.title ?? "",
        ...(p.selftext ? { snippet: String(p.selftext).slice(0, 200) } : {}),
      })),
    truncated: false,
  };
}

async function searchHackerNews(query, maxResults, signal, proxyUrl) {
  const response = await fetchWithProxy(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${maxResults ?? 5}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      ...(signal !== undefined ? { signal } : {}),
    },
    proxyUrl
  );
  if (!response.ok) throw new Error(`Hacker News API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.hits ?? [])
      .filter((h) => h.title || h.story_title)
      .map((h) => ({
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: h.title ?? h.story_title,
        ...((h.points !== undefined && h.points !== null) || (h.num_comments !== undefined && h.num_comments !== null)
          ? { snippet: `HN discussion · ${h.points ?? 0} points · ${h.num_comments ?? 0} comments` }
          : {}),
      })),
    truncated: false,
  };
}

async function searchStackOverflow(query, maxResults, signal, proxyUrl) {
  const response = await fetchWithProxy(
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=${maxResults ?? 5}&filter=!nNPvSNVZJS`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      ...(signal !== undefined ? { signal } : {}),
    },
    proxyUrl
  );
  if (!response.ok) throw new Error(`Stack Exchange API error (HTTP ${response.status})`);
  const data = await response.json();
  if (data.error_message) throw new Error(`Stack Exchange API error: ${data.error_message}`);
  return {
    sources: (data.items ?? []).map((it) => ({
      url: it.link,
      title: it.title,
      ...(it.score !== undefined || it.answer_count !== undefined
        ? { snippet: `${it.is_answered ? "✓ answered" : "unanswered"} · score ${it.score ?? 0} · ${it.answer_count ?? 0} answers` }
        : {}),
    })),
    truncated: false,
  };
}

async function searchWikipedia(query, maxResults, signal, proxyUrl) {
  const host = "zh.wikipedia.org";
  const response = await fetchWithProxy(
    `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${maxResults ?? 5}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      ...(signal !== undefined ? { signal } : {}),
    },
    proxyUrl
  );
  if (!response.ok) throw new Error(`Wikipedia API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.query?.search ?? []).map((s) => ({
      url: `https://${host}/wiki/${encodeURIComponent(String(s.title).replace(/ /g, "_"))}`,
      title: s.title,
      ...(s.snippet ? { snippet: stripTags(s.snippet).slice(0, 200) } : {}),
    })),
    truncated: false,
  };
}

async function searchNpm(query, maxResults, signal, proxyUrl) {
  const response = await fetchWithProxy(
    `https://registry.npmjs.com/-/v1/search?text=${encodeURIComponent(query)}&size=${maxResults ?? 5}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      ...(signal !== undefined ? { signal } : {}),
    },
    proxyUrl
  );
  if (!response.ok) throw new Error(`npm registry API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.objects ?? [])
      .map((o) => o.package)
      .filter((p) => p && p.name)
      .map((p) => ({
        url: p.links?.npm ?? `https://www.npmjs.com/package/${p.name}`,
        title: p.name,
        ...((p.description || p.version)
          ? { snippet: `v${p.version ?? "?"} — ${String(p.description ?? "").slice(0, 160)}` }
          : {}),
      })),
    truncated: false,
  };
}

async function searchPlatform(platform, query, maxResults, signal, proxyUrl) {
  switch (platform) {
    case "github":
      return searchGithub(query, maxResults, signal, proxyUrl);
    case "v2ex":
      return searchV2ex(query, maxResults, signal, proxyUrl);
    case "bilibili":
      return searchBilibili(query, maxResults, signal, proxyUrl);
    case "reddit":
      return searchReddit(query, maxResults, signal, proxyUrl);
    case "hn":
      return searchHackerNews(query, maxResults, signal, proxyUrl);
    case "stackoverflow":
      return searchStackOverflow(query, maxResults, signal, proxyUrl);
    case "wikipedia":
      return searchWikipedia(query, maxResults, signal, proxyUrl);
    case "npm":
      return searchNpm(query, maxResults, signal, proxyUrl);
    default:
      throw new Error(`unknown platform: ${platform}`);
  }
}
//#endregion

//#region bridge
const MAX_JSON_BODY_BYTES = 64 * 1024;

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL("http://" + host);
  } catch {
    return false;
  }
  if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function writeJson(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  const payload = JSON.stringify(body);
  try {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "referrer-policy": "no-referrer" });
    res.end(payload);
  } catch {
    // 客户端已断开（如点击停止测试）时忽略写入错误
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) return undefined;
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

function toView(descriptor) {
  return {
    ns: String(descriptor.ns),
    schema: descriptor.schema,
    value: descriptor.value,
    ...(descriptor.base === undefined ? {} : { base: descriptor.base }),
    ...(descriptor.user === undefined ? {} : { user: descriptor.user }),
    ...(descriptor.secrets === undefined
      ? {}
      : { secrets: descriptor.secrets.map((secret) => ({ path: [...secret.path], set: secret.set })) }),
    revision: descriptor.revision,
  };
}

// 引擎模式：决定 DSH 的 web.searchProvider 指向谁。
// "thin"  = 本插件的免费引擎链（默认；bundle patch 里 searchProvider: thin-search）
// "official" = 官方 DeepSeek 搜索（在 profile cordis.patch.yml 写托管块覆盖 searchProvider）
// 托管块只做文本增删（按标记行找头尾），不解析整个 YAML，避免破坏用户手写的其他 patch。
const OFFICIAL_PATCH_BLOCK = [
  "",
  ENGINE_MODE_BLOCK_START,
  "- id: web",
  "  config:",
  "    searchProvider: deepseek-official",
  "    fetchProvider: http",
  ENGINE_MODE_BLOCK_END,
  "",
].join("\n");

/**
 * 当前 profile 的 cordis.patch.yml 路径。
 * 优先 DSH_PROFILE 环境变量；否则枚举 $DSH_HOME/profiles/* 找包含本插件的 profile。
 * （与 dsh-app-boot 的 profile 目录约定一致。）
 */
let cachedProfileDir = null;
function resolveProfilePatchPath() {
  if (cachedProfileDir !== null) return join(cachedProfileDir, PROFILE_PATCH_FILENAME);
  const home = process.env.DSH_HOME || join(process.env.HOME || "", ".dsh");
  const explicit = process.env.DSH_PROFILE;
  if (explicit) {
    cachedProfileDir = join(home, "profiles", explicit);
    return join(cachedProfileDir, PROFILE_PATCH_FILENAME);
  }
  // 探测：找含 dsh-thin-search 依赖的 profile（枚举目录，读取 package.json）
  const profilesRoot = join(home, "profiles");
  try {
    for (const name of readdirSync(profilesRoot)) {
      const dir = join(profilesRoot, name);
      if (name === "node_modules" || !existsSync(join(dir, "package.json"))) continue;
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (Object.keys(deps).some((d) => d === "dsh-thin-search" || d.startsWith("dsh-thin-search@"))) {
        cachedProfileDir = dir;
        break;
      }
    }
  } catch {
    // 探测失败时回落默认 web
  }
  cachedProfileDir ??= join(home, "profiles", "web");
  return join(cachedProfileDir, PROFILE_PATCH_FILENAME);
}

/** 读 profile patch 文件内容；文件不存在/不可读时按空处理。 */
async function readProfilePatchFile() {
  try {
    return await readFile(resolveProfilePatchPath(), "utf8");
  } catch {
    return "";
  }
}

/** 托管块在文件中的 [start, endExclusive] 行区间；没有则返回 null。 */
function findManagedBlock(content) {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === ENGINE_MODE_BLOCK_START);
  if (start === -1) return null;
  let end = lines.findIndex((line, index) => index > start && line.trim() === ENGINE_MODE_BLOCK_END);
  if (end === -1) end = lines.length;
  return [start, end + 1];
}

/** 当前生效模式（读文件为准）：official 或 thin。 */
async function detectEngineMode() {
  const content = await readProfilePatchFile();
  return findManagedBlock(content) === null ? "thin" : "official";
}

/**
 * 切换模式：official 时写入托管块，thin 时删除托管块。
 * 写入是"读-改-原子替换"（先写临时文件再 rename），避免并发写坏。
 * 文件里其他内容（用户手写的 patch、注释）原样保留。
 */
async function setEngineMode(mode) {
  const file = resolveProfilePatchPath();
  let content = await readProfilePatchFile();
  const block = findManagedBlock(content);
  if (mode === "official" && block === null) {
    // profile 默认内容是 []（空数组）；此时整体替换为托管块，否则 [] 后面追加序列会 YAML 解析失败
    const trimmed = content.trim();
    content = trimmed === "" || trimmed === "[]" ? OFFICIAL_PATCH_BLOCK : trimmed + OFFICIAL_PATCH_BLOCK;
  } else if (mode === "thin" && block !== null) {
    const lines = content.split("\n");
    lines.splice(block[0], block[1] - block[0]);
    content = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    // cordis.patch.yml 必须保持顶层 YAML 数组；删除后若只剩空白，写回 DSH 默认的空 patch []
    content = content.length === 0 ? "[]\n" : content + "\n";
  }
  const tmp = file + ".tmp";
  await writeFile(tmp, content, "utf8");
  await rename(tmp, file);
  return content;
}

function makeBridgeRoutes(settings, search, testEngine, webProviderId, enhance, llm) {
  const allowlisted = () =>
    settings
      .describe({ redactSecrets: true })
      .filter((descriptor) => String(descriptor.ns) === THIN_SEARCH_NS)
      .map((descriptor) => String(descriptor.ns));

  const handlers = {
    async rawSearch(request, res) {
      if (request === null || typeof request !== "object" || typeof request.query !== "string" || request.query.length === 0) {
        return { ok: false, code: "search-rejected", message: "malformed bridge search request (query is required)" };
      }
      const maxResults = Math.min(Math.max(Number(request.maxResults) || 5, 1), 10);
      const timeRange = parseTimeRange(request.timeRange);
      if (typeof request.engine === "string" && request.engine.length > 0) {
        if (typeof testEngine !== "function") {
          return { ok: false, code: "search-unavailable", message: "engine test is not wired" };
        }
        // 引擎测试兜底超时 + 客户端断开（点击停止测试）时同步取消
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
        const onClose = () => controller.abort();
        res?.once?.("close", onClose);
        try {
          // 测试可选走搜索增强：与真实搜索同一条 LLM 规范化链路（消耗 token）
          let query = request.query;
          let enhanceInfo = null;
          if (request.enhance === true && typeof enhance === "function") {
            const enhanced = await enhance(request.query, controller.signal);
            query = enhanced.query;
            if (enhanced.enhanced) {
              enhanceInfo = { original: enhanced.original, enhanced: enhanced.query };
            } else if (enhanced.error) {
              // 增强失败：把原因透传给前端展示，方便排查（仍用原句继续测试）
              enhanceInfo = { original: request.query, enhanced: request.query, error: enhanced.error };
            }
          }
          if (controller.signal.aborted) {
            return { ok: false, code: "engine-stopped", message: "engine test stopped" };
          }
          const result = await testEngine(request.engine, query, timeRange, controller.signal);
          if (result.ok === false) {
            return { ok: false, code: "engine-failed", message: result.error ?? `${request.engine} failed` };
          }
          if (controller.signal.aborted && result.aborted !== true) {
            return { ok: false, code: "engine-stopped", message: "engine test stopped" };
          }
          return {
            ok: true,
            value: {
              provider: request.engine,
              sources: result.sources ?? [],
              content: result.content ?? "",
              ...(enhanceInfo !== null ? { enhance: enhanceInfo } : {}),
            },
          };
        } catch (error) {
          if (controller.signal.aborted) {
            return { ok: false, code: "engine-stopped", message: "engine test stopped" };
          }
          return { ok: false, code: "engine-failed", message: error instanceof Error ? error.message : String(error) };
        } finally {
          clearTimeout(timer);
          res?.off?.("close", onClose);
        }
      }
      if (typeof search !== "function") {
        return { ok: false, code: "search-unavailable", message: "search provider is not wired" };
      }
      try {
        const result = await search({ ...request, maxResults, timeRange });
        return {
          ok: true,
          value: {
            provider: result.provider ?? request.engine ?? request.provider ?? "anysearch",
            sources: result.sources ?? [],
            content: result.content ?? "",
            cache: result._cache === "hit" ? "hit" : "miss",
          },
        };
      } catch (error) {
        return { ok: false, code: "search-failed", message: error instanceof Error ? error.message : String(error) };
      }
    },
    async llmModels() {
      // 枚举用户配置的全部 LLM 模型，供设置页"增强模型"下拉使用
      if (!llm || typeof llm.listProviders !== "function" || typeof llm.listModels !== "function") {
        return { ok: false, code: "llm-unavailable", message: "llm service is not wired" };
      }
      let providers;
      try {
        providers = llm.listProviders();
      } catch (error) {
        return { ok: false, code: "llm-unavailable", message: error instanceof Error ? error.message : String(error) };
      }
      const groups = [];
      await Promise.all(
        providers.map(async (provider) => {
          const id = provider.id;
          const displayName = provider.name ?? provider.displayName ?? id;
          let models = [];
          try {
            models = await llm.listModels(id);
          } catch {
            models = []; // 单个 provider 失败不阻塞整体
          }
          groups.push({
            provider: id,
            displayName,
            models: models.map((m) => ({ id: m.id, name: m.name ?? m.id })),
          });
        })
      );
      groups.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return { ok: true, value: { groups } };
    },
    async describe() {
      const descriptors = settings.describe({ redactSecrets: true });
      return {
        ok: true,
        value: {
          namespaces: allowlisted()
            .map((ns) => descriptors.find((descriptor) => String(descriptor.ns) === ns))
            .filter((descriptor) => descriptor !== undefined)
            .map(toView),
          writable: settings.writable !== false,
        },
      };
    },
    async mutate(request) {
      const body = request;
      if (body === null || typeof body !== "object" || typeof body.ns !== "string" || !Array.isArray(body.ops)) {
        return { ok: false, code: "settings-rejected", message: "malformed bridge settings request" };
      }
      const { ns } = body;
      if (!allowlisted().includes(ns)) {
        return { ok: false, code: "settings-not-exposed", message: `settings namespace "${ns}" is not exposed` };
      }
      const expectedRevision = typeof body.expectedRevision === "number" ? body.expectedRevision : undefined;
      try {
        await settings.mutate(ns, body.ops, expectedRevision);
      } catch (error) {
        if (error instanceof SettingsConflictError) {
          return { ok: false, code: "settings-conflict", message: error.message };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, code: "internal", message };
      }
      const descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === ns);
      if (descriptor === undefined) {
        return { ok: false, code: "internal", message: `settings namespace "${ns}" was disposed after the mutate` };
      }
      return { ok: true, value: toView(descriptor) };
    },
    async engineMode(request) {
      const body = request ?? {};
      const action = body.action;
      if (action !== undefined && action !== "get" && action !== "set") {
        return { ok: false, code: "engine-mode-rejected", message: "action must be 'get' or 'set'" };
      }
      const mode = action === "set" ? body.mode : undefined;
      if (action === "set" && mode !== "thin" && mode !== "official") {
        return { ok: false, code: "engine-mode-rejected", message: "mode must be 'thin' or 'official'" };
      }
      try {
        if (action === "set") await setEngineMode(mode);
        const current = await detectEngineMode();
        return {
          ok: true,
          value: {
            mode: current,
            // 运行时 web.searchProviderId 是否已指向当前模式（false = 需要重启才生效）
            applied: webProviderId === (current === "official" ? OFFICIAL_PROVIDER_ID : PROVIDER_ID),
          },
        };
      } catch (error) {
        return { ok: false, code: "engine-mode-failed", message: error instanceof Error ? error.message : String(error) };
      }
    },
  };

  const guard = (req, res) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: "loopback requests only" });
      return false;
    }
    if (req.method !== "POST") {
      writeJson(res, 405, { error: "method not allowed: " + (req.method ?? "") });
      return false;
    }
    return true;
  };

  return [
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/describe`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        writeJson(res, 200, await handlers.describe());
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/mutate`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        const body = await readJsonBody(req);
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: "settings-rejected", message: "malformed JSON body" });
          return;
        }
        writeJson(res, 200, await handlers.mutate(body));
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/raw-search`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        const body = await readJsonBody(req);
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: "search-rejected", message: "malformed JSON body" });
          return;
        }
        writeJson(res, 200, await handlers.rawSearch(body, res));
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/llm-models`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        writeJson(res, 200, await handlers.llmModels());
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/engine-mode`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        const body = await readJsonBody(req);
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: "engine-mode-rejected", message: "malformed JSON body" });
          return;
        }
        writeJson(res, 200, await handlers.engineMode(body));
      },
    },
  ];
}
//#endregion

const name = "web-thin-search";
const inject = ["web"];

const Config = z.object({
  provider: z.string().default("anysearch"),
  searchEnhance: z.boolean().default(false), // 搜索增强：用 LLM 把口语化输入规范化为搜索关键词（消耗 token）
  enhanceModel: z.string().default(""), // 增强模型（"provider:model"；空 = 跟随 DSH 默认模型）
  enhanceSystemPrompt: z.string().default(""), // 自定义搜索增强系统提示词（空 = 使用内置默认）
  proxy: z.string().default(""), // HTTP/HTTPS 代理（如 http://127.0.0.1:7890；空 = 直连；DDG/SearXNG/GitHub 等外网引擎需要）
  cache: z.boolean().default(true),
  cacheTtl: z.number().default(5),
  region: z.string(),
  bingMarket: z.string().default("zh-CN"),
  searxngInstances: z.array(z.string()),
  platforms: z.array(z.string()).default(["github", "v2ex", "bilibili", "reddit", "hn", "stackoverflow", "wikipedia", "npm"]),
});

function apply(ctx, config) {
  let current = () => config ?? {};
  // setSource 传进来的是"取当前 section 的函数"，与官方插件模式一致
  let applySource = (source) => {
    current = source;
  };
  const logger = ctx.logger;

  const searchCache = new Map();
  const CACHE_MAX_ENTRIES = 50;

  function buildCacheKey(query, maxResults, timeRangeLabel, preferred) {
    return [query ?? "", maxResults ?? 5, timeRangeLabel ?? "", preferred].join("\u0000");
  }

  // 解析实际使用的系统提示词：用户自定义（非空）优先，否则用内置默认
  function resolveEnhanceSystemPrompt() {
    const cfg = current();
    const sys = typeof cfg.enhanceSystemPrompt === "string" ? cfg.enhanceSystemPrompt.trim() : "";
    return sys.length > 0 ? sys : DEFAULT_ENHANCE_SYSTEM_PROMPT;
  }

  async function enhanceQuery(query, signal) {
    // 非口语问句（无问号/疑问词）直接原样返回，省 token
    if (!/[?？]|多少|怎么|如何|是什么|为什么|哪|帮我|请问|怎么样|咋|怎样/.test(query)) {
      return { query, enhanced: false };
    }
    // Restricted Context：未 inject 的服务不能属性访问，用 ctx.get() 获取
    let llm = null;
    try {
      llm = ctx.get?.("llm") ?? ctx.llm;
    } catch {
      llm = null;
    }
    if (!llm || typeof llm.stream !== "function") {
      return { query, enhanced: false, error: "llm service unavailable" };
    }
    // 候选模型链：用户指定 > 默认模型。逐个尝试，全部失败才回退原句。
    const candidates = [];
    const cfg = current();
    if (typeof cfg.enhanceModel === "string" && cfg.enhanceModel.length > 0 && cfg.enhanceModel.includes(":")) {
      const sep = cfg.enhanceModel.indexOf(":");
      candidates.push({ provider: cfg.enhanceModel.slice(0, sep), model: cfg.enhanceModel.slice(sep + 1), label: "enhanceModel" });
    }
    try {
      const agentDefaultModel = ctx.get?.("agentDefaultModel") ?? ctx.agentDefaultModel;
      const def = agentDefaultModel?.currentSelection?.();
      if (def && def.provider && def.model) {
        candidates.push({ provider: def.provider, model: def.model, label: "default" });
      }
    } catch (error) {
      logger.warn(`thin-search: agentDefaultModel lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (candidates.length === 0) {
      return { query, enhanced: false, error: "no default model" };
    }
    // 去重（同 provider:model 只试一次）
    const seen = new Set();
    const chain = candidates.filter((c) => {
      const key = c.provider + ":" + c.model;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const systemPrompt = resolveEnhanceSystemPrompt();
      let lastError = null;
      for (const candidate of chain) {
        if (controller.signal.aborted) {
          return { query, enhanced: false, error: "aborted" };
        }
        const attempt = await enhanceWithModel(llm, candidate, systemPrompt, "输入：{query}", query, controller);
        if (attempt.ok) {
          return attempt.result;
        }
        lastError = attempt.error;
        logger.warn(`thin-search: enhance via ${candidate.label} (${candidate.provider}/${candidate.model}) failed: ${lastError}`);
      }
      return { query, enhanced: false, error: lastError ?? "enhancement failed" };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  // 用单个模型执行一次增强调用；失败返回 { ok:false, error }，成功返回 { ok:true, result }
  async function enhanceWithModel(llm, model, systemPrompt, promptTemplate, query, controller) {
    const chunks = [];
    let failure = null;
    try {
      for await (const chunk of llm.stream({
        provider: model.provider,
        model: model.model,
        messages: [
          createUserMessage({
            content: [{ type: "text", text: promptTemplate.replace("{query}", JSON.stringify(query)) }],
            source: { kind: "plugin", plugin: "web-thin-search" },
          }),
        ],
        system: systemPrompt,
        temperature: 0,
        maxTokens: 60,
        signal: controller.signal,
      })) {
        if (chunk.type === "text-delta") {
          chunks.push(chunk.text);
        } else if (chunk.type === "finish") {
          // LLM 失败通过 finish chunk 交付（error/aborted），不再静默吞掉
          if (chunk.reason?.kind === "error") {
            const failureInfo = chunk.reason.failure;
            failure = failureInfo?.message ?? failureInfo?.code ?? "llm stream failed";
          } else if (chunk.reason?.kind === "aborted") {
            failure = controller.signal.aborted ? "aborted" : "llm stream aborted";
          }
        }
      }
      if (failure !== null) {
        return { ok: false, error: failure };
      }
      const enhanced = chunks.join("").trim().replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, "").trim();
      if (!enhanced || enhanced.length === 0 || enhanced.length > 80) {
        return { ok: false, error: "empty or invalid enhancement" };
      }
      return { ok: true, result: { query: enhanced, enhanced: true, original: query } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const provider = {
    id: PROVIDER_ID,
    available() {
      return true;
    },
    async search(request, signal) {
      if (request === null || typeof request !== "object" || typeof request.query !== "string" || request.query.trim().length === 0) {
        throw new Error("query is required");
      }
      const cfg = current();
      const preferred =
        typeof request.engine === "string" && FREE_ENGINES.includes(request.engine)
          ? request.engine
          : cfg.provider ?? "anysearch";
      const timeRange = parseTimeRange(request.timeRange);
      const timeRangeLabel = typeof request.timeRange === "string" ? request.timeRange : String(timeRange?.days ?? timeRange?.after ?? "");

      // 搜索增强（默认关闭）：LLM 把口语化输入规范化为搜索关键词
      const enhance = cfg.searchEnhance === true;
      let query = request.query;
      let enhanceInfo = null;
      if (enhance) {
        const result = await enhanceQuery(request.query, signal);
        query = result.query;
        if (result.enhanced) enhanceInfo = { original: result.original, enhanced: result.query };
      }

      const cacheTtlMs = (Math.min(Math.max(Number(cfg.cacheTtl) ?? 5, 0), 5)) * 60 * 1000;
      const cacheEnabled = cfg.cache !== false && cacheTtlMs > 0;
      const cacheKey = cacheEnabled
        ? buildCacheKey(query, request.maxResults, timeRangeLabel, preferred)
        : null;
      if (cacheKey !== null) {
        const hit = searchCache.get(cacheKey);
        if (hit && hit.expiresAt > Date.now()) {
          if (signal?.aborted) throw new Error("search aborted");
          searchCache.delete(cacheKey);
          searchCache.set(cacheKey, hit);
          return { ...hit.value, sources: hit.value.sources?.slice(), _cache: "hit" };
        }
        if (hit) searchCache.delete(cacheKey);
      }

      // 时间过滤时支持过滤的引擎排前（searxng / ddg / ddg-lite），首选若支持仍优先
      const timeEngines = ["searxng", "ddg", "ddg-lite"];
      let chain;
      let preferredSkippedReason = null;
      if (timeRange) {
        const preferredFirst = [preferred].filter((e) => timeEngines.includes(e));
        const otherTime = timeEngines.filter((e) => e !== preferred);
        const noTime = FREE_ENGINES.filter((e) => !timeEngines.includes(e) && e !== preferred);
        chain = [...preferredFirst, ...otherTime, ...noTime];
        if (!timeEngines.includes(preferred)) {
          preferredSkippedReason = "time-filter";
        }
      } else {
        chain = [preferred, ...FREE_ENGINES.filter((e) => e !== preferred)];
      }

      let lastError = null;
      let usedEngine = null;
      let preferredFailure = null;
      const deadline = Date.now() + CHAIN_BUDGET_MS;
      for (const engine of chain) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new Error(`search timed out after ${CHAIN_BUDGET_MS / 1000}s`);
        }
        const effSignal = AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(remaining)]);
        try {
          let result;
          if (engine === "ddg") {
            result = await searchDdgHtml(query, request.maxResults, { ...cfg, timeRange }, effSignal);
          } else if (engine === "ddg-lite") {
            result = await searchDdgLite(query, request.maxResults, { ...cfg, timeRange }, effSignal);
          } else if (engine === "bing") {
            result = await searchBing(query, request.maxResults, cfg, effSignal);
          } else if (engine === "searxng") {
            result = await searchSearxng(query, request.maxResults, { ...cfg, timeRange }, effSignal);
          } else if (engine === "anysearch") {
            result = await searchAnysearch(query, request.maxResults, effSignal, cfg.proxy);
          } else {
            continue;
          }

          if (result.sources.length > 0) {
            usedEngine = engine;
            result.sources = result.sources.map((s) =>
              s.snippet ? { ...s, snippet: cleanSnippet(s.snippet) } : s
            );
            if (engine !== preferred) {
              if (preferredSkippedReason === "time-filter") {
                result.content = `Note: ${preferred} does not support time filtering (timeRange=${timeRangeLabel}), using ${engine}.`;
              } else if (preferredFailure) {
                result.content = `Note: ${preferred} unavailable or failed (${preferredFailure}), using ${engine}.`;
              } else {
                result.content = `Note: ${preferred} unavailable or failed, using ${engine}.`;
              }
            }
            const cached = { ...result, provider: engine, engine };
            if (cacheKey !== null) {
              const entryTtlMs = engine !== preferred ? Math.max(cacheTtlMs / 5, 1000) : cacheTtlMs;
              searchCache.set(cacheKey, { value: cached, expiresAt: Date.now() + entryTtlMs });
              if (searchCache.size > CACHE_MAX_ENTRIES) {
                const oldest = searchCache.keys().next().value;
                if (oldest !== undefined) searchCache.delete(oldest);
              }
            }
            if (enhanceInfo) {
              result.content = `[搜索增强] 原输入：「${enhanceInfo.original}」→ 优化为「${enhanceInfo.enhanced}」${result.content ? "\n" + result.content : ""}`;
            }
            return { ...cached, _cache: "miss" };
          }
          lastError = new Error(`engine "${engine}" returned 0 results`);
          if (engine === preferred) preferredFailure = "returned 0 results";
          logger.warn(`thin-search: ${engine} returned 0 results, trying next engine`);
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          if (engine === preferred) preferredFailure = message;
          logger.warn(`thin-search: engine "${engine}" failed (${message}), trying next engine`);
        }
      }
      throw lastError ?? new Error("all search engines failed");
    },
  };

  let refreshPrompt = null;
  // dsh >= 0.1.2-alpha.2：installSettingsSection 模块级函数被移除，
  // 改用 SettingsProvider 实例方法 installSection（与官方插件同款写法）。
  // owner 传本插件 ctx：注册是本插件 fiber 上的 effect，插件卸载时自动反注册。
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, THIN_SEARCH_NS, Config, config ?? {}, {
      setSource: (source) => {
        applySource(source);
      },
      onChange: () => {
        // settings 变更时刷新系统提示词；systemPrompt seam 未就绪时安全跳过
        if (typeof refreshPrompt === "function") refreshPrompt();
      },
    });
  });

  ctx.inject(["webServer", "settings"], (sctx) => {
    sctx.effect(() => {
      const disposers = makeBridgeRoutes(
        sctx.settings,
        (request) => provider.search(request, undefined),
        (engine, query, timeRange) => runEngineTest(engine, query, timeRange),
        ctx.web.searchProviderId,
        (query, signal) => enhanceQuery(query, signal),
        (() => {
          try {
            return ctx.get?.("llm") ?? ctx.llm;
          } catch {
            return undefined;
          }
        })()
      ).map((route) => sctx.webServer.register(route));
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "thin-search: settings bridge");
  });

  ctx.web.registerSearchProvider(provider);

  // 运行时兜底：profile patch 覆盖掉 searchProvider 时自动接管（用户显式配置其他 provider 则不动）
  if (!ctx.web.searchProviderId) {
    ctx.web.searchProviderId = provider.id;
    logger.info(`thin-search: web.searchProvider was unset (patch override or missing config), taking over as "${provider.id}"`);
  }

  const runEngineTest = async (engine, query, timeRange, signal) => {
    const cfg = current();
    const q = query || "今天美元兑换日元的汇率是多少？";
    const tr = parseTimeRange(timeRange);
    const attempt = async () => {
      if (signal?.aborted) return { ok: false, aborted: true, error: "stopped" };
      switch (engine) {
        case "ddg":
          return await searchDdgHtml(q, 2, { ...cfg, timeRange: tr, retries: 1 }, signal);
        case "ddg-lite":
          return await searchDdgLite(q, 2, { ...cfg, timeRange: tr, retries: 1 }, signal);
        case "bing":
          return await searchBing(q, 2, { ...cfg, retries: 1 }, signal);
        case "searxng":
          return await searchSearxng(q, 2, { ...cfg, timeRange: tr }, signal);
        case "anysearch":
          return await searchAnysearch(q, 2, signal, cfg.proxy);
        default:
          return { ok: false, error: `unknown engine: ${engine}` };
      }
    };
    try {
      if (signal?.aborted) return { ok: false, aborted: true, error: "stopped" };
      const result = await attempt();
      if (signal?.aborted) return { ok: false, aborted: true, error: "stopped" };
      if (result.ok === false) return result;
      if (result.sources && result.sources.length === 0) {
        if (signal?.aborted) return { ok: false, aborted: true, error: "stopped" };
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (signal?.aborted) return { ok: false, aborted: true, error: "stopped" };
        return await attempt();
      }
      return {
        ok: true,
        sources: (result.sources ?? []).map((s) =>
          s.snippet ? { ...s, snippet: cleanSnippet(s.snippet) } : s
        ),
        truncated: result.truncated ?? false,
      };
    } catch (error) {
      if (signal?.aborted) return { ok: false, aborted: true, error: "stopped" };
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "free_search_test",
          description:
            "Test every configured web search engine and report which ones work. Use this to verify engine availability or diagnose search failures.",
          parameters: {
            engines: {
              type: "array",
              description: "Which engines to test (default: all). Options: anysearch, bing, ddg, ddg-lite, searxng.",
              items: { type: "string" },
            },
            query: {
              type: "string",
              description: "Optional search query to use for the test (default: '今天美元兑换日元的汇率是多少？').",
            },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      engine: { type: "string" },
                      status: { type: "string" },
                      results: { type: "number" },
                      error: { type: "string" },
                      sampleTitle: { type: "string" },
                      sampleUrl: { type: "string" },
                    },
                  },
                },
              },
            },
            render(args, value) {
              const lines = value.results.map((r) => {
                if (r.status === "ok") {
                  return `- ${r.engine}: OK (${r.results} results${r.sampleTitle ? `, e.g. "${r.sampleTitle.slice(0, 40)}"` : ""})`;
                }
                return `- ${r.engine}: FAIL - ${r.error}`;
              });
              return `Search engine test:
${lines.join("\n")}`;
            },
          },
          async execute(args) {
            const engines = args.engines && args.engines.length > 0 ? args.engines : FREE_ENGINES;
            const results = [];
            for (const engine of engines) {
              const r = await runEngineTest(engine, args.query);
              if (r.ok) {
                const item = { engine, status: "ok", results: r.sources.length };
                if (r.sources[0]?.title) item.sampleTitle = String(r.sources[0].title);
                if (r.sources[0]?.url) item.sampleUrl = String(r.sources[0].url);
                results.push(item);
              } else {
                results.push({ engine, status: "fail", error: r.error ?? "unknown error" });
              }
            }
            return { results };
          },
          finalizeContent(exec, result) {
            const text = result.content;
            if (typeof text === "string" && text.length > 0) {
              return [{ type: "text", text }];
            }
            return undefined;
          },
        })
      );
      return () => {
        dispose();
      };
    }, "thin-search: test engines tool");
  });

  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "platform_search",
          description:
            "Search a specific platform (GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm) for a query. Returns source URLs with titles and snippets. Use this when the user asks about repos, code, forum threads, videos, discussions, Q&A, encyclopedia entries, or packages.",
          parameters: {
            platform: {
              type: "string",
              description: "Platform to search: github, v2ex, bilibili, reddit, hn, stackoverflow, wikipedia, npm",
            },
            query: {
              type: "string",
              description: "The search query.",
            },
            maxResults: {
              type: "number",
              description: "Optional result count (default 5, max 10).",
            },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                platform: { type: "string" },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      url: { type: "string" },
                      title: { type: "string" },
                      snippet: { type: "string" },
                    },
                  },
                },
              },
            },
            render(args, value) {
              const lines = value.sources.map((s, i) => `- [${s.title ?? s.url}](${s.url})${s.snippet ? ` - ${s.snippet.slice(0, 120)}` : ""}`);
              return `Platform search (${value.platform}):
${lines.join("\n") || "No results found."}`;
            },
          },
          async execute(args) {
            const platform = args.platform;
            if (!PLATFORMS[platform]) {
              throw new Error(`unknown platform "${platform}" - use one of: ${Object.keys(PLATFORMS).join(", ")}`);
            }
            const enabled = current().platforms ?? ["github", "v2ex", "bilibili", "reddit", "hn", "stackoverflow", "wikipedia", "npm"];
            if (!enabled.includes(platform)) {
              throw new Error(
                `platform "${platform}" is disabled in Thin Search settings - enable it in Settings > Plugins > Thin Search to use it`
              );
            }
            const limit = Math.min(args.maxResults ?? 5, 10);
            const result = await searchPlatform(platform, args.query, limit, undefined, current().proxy);
            const sources = (result.sources ?? []).map((s) => {
              const source = {};
              if (s.url !== undefined && s.url !== null && s.url !== "") source.url = s.url;
              if (s.title !== undefined && s.title !== null && s.title !== "") source.title = String(s.title);
              if (s.snippet !== undefined && s.snippet !== null && s.snippet !== "") source.snippet = String(s.snippet);
              return source;
            });
            return { platform, sources };
          },
          finalizeContent(exec, result) {
            const text = result.content;
            return typeof text === "string" && text.length > 0 ? [{ type: "text", text }] : undefined;
          },
        })
      );
      return () => {
        dispose();
      };
    }, "thin-search: platform search tool");
  });

  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "advanced_search",
          description:
            "Search the web with optional time filtering. Use when the user wants results from a specific time window (e.g. 'last week', 'this month') or when you need to force a specific engine. Falls back across engines automatically just like web_search.",
          parameters: {
            query: {
              type: "string",
              description: "The search query.",
            },
            maxResults: {
              type: "number",
              description: "Optional result count (default 5, max 10).",
            },
            timeRange: {
              type: "string",
              description: "Optional time filter. Fixed tiers: day, week, month, year. Custom: relative like 12h, 3d, 2mo, 1y, or an absolute date like 2026-07-01 (published after that date). SearXNG/DDG map to the nearest tier.",
            },
            engine: {
              type: "string",
              description: "Optional specific engine to try first (default: configured engine): anysearch, bing, ddg, ddg-lite, searxng.",
            },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                provider: { type: "string" },
                content: { type: "string" },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      url: { type: "string" },
                      title: { type: "string" },
                      snippet: { type: "string" },
                      publishedAt: { type: "string" },
                    },
                  },
                },
              },
            },
            render(args, value) {
              const lines = value.sources.map((s, i) => `- [${s.title ?? s.url}](${s.url})${s.snippet ? ` - ${s.snippet.slice(0, 120)}` : ""}${s.publishedAt ? ` (${s.publishedAt})` : ""}`);
              return `Search (${value.provider}${args.timeRange ? `, timeRange=${args.timeRange}` : ""}):
${lines.join("\n") || "No results found."}${value.content ? `

${value.content}` : ""}`;
            },
          },
          async execute(args) {
            if (!args.query || !String(args.query).trim()) throw new Error("query is required");
            const request = {
              query: args.query,
              maxResults: Math.min(args.maxResults ?? 5, 10),
            };
            if (parseTimeRange(args.timeRange) !== undefined) request.timeRange = args.timeRange;
            if (args.engine && FREE_ENGINES.includes(args.engine)) request.engine = args.engine;
            const result = await provider.search(request);
            return {
              provider: result.provider ?? result._provider ?? "anysearch",
              content: typeof result.content === "string" ? result.content : "",
              sources: (result.sources ?? []).map((s) => {
                const source = {};
                if (s.url !== undefined && s.url !== null && s.url !== "") source.url = s.url;
                if (s.title !== undefined && s.title !== null && s.title !== "") source.title = String(s.title);
                if (s.snippet !== undefined && s.snippet !== null && s.snippet !== "") source.snippet = String(s.snippet);
                if (s.publishedAt !== undefined && s.publishedAt !== null && s.publishedAt !== "") {
                  source.publishedAt = String(s.publishedAt);
                }
                return source;
              }),
            };
          },
          finalizeContent(exec, result) {
            const text = result.content;
            return typeof text === "string" && text.length > 0 ? [{ type: "text", text }] : undefined;
          },
        })
      );
      return () => {
        dispose();
      };
    }, "thin-search: advanced search tool");
  });

  ctx.inject(["systemPrompt"], (sctx) => {
    let disposeSection = null;
    refreshPrompt = () => {
      if (disposeSection) {
        disposeSection();
        disposeSection = null;
      }
      disposeSection = sctx.systemPrompt.section({
        name: "thin-search:engines",
        order: 500,
        text: [
          "## Available web search engines (thin-search plugin)",
          "",
          "You have the web_search tool. Its backend engine is chosen in Settings > Plugins > Thin Search.",
          "Current engine: " + (current().provider ?? "anysearch"),
          "",
          "Available engines (no API key needed):",
          "- anysearch (AI search) - default, best for natural-language Chinese queries",
          "- bing (Bing) - fast, zh-CN optimized",
          "- searxng (meta-search, multi-instance)",
          "- ddg (DuckDuckGo HTML) - may be rate-limited",
          "- ddg-lite (DuckDuckGo Lite) - may be rate-limited",
          "",
          "Search enhancement (Settings > Search Engines > Search Enhancement): when enabled (default OFF), your query is first rewritten by an LLM into compact search keywords before hitting the engines. This consumes tokens on every search and is OFF by default to keep searching free.",
          "",
          "IMPORTANT: If the configured engine fails (rate limit, anti-bot, 0 results, or network error), web_search automatically tries the other free engines in order and the results include a note showing which engine was actually used. Never tell the user search is unavailable - it always falls back.",
          "",
          "Use the free_search_test tool to test which engines actually work right now.",
          "",
          "When the user wants results from a specific time window (e.g. 'last week', 'this month', 'last 3 days'), use the advanced_search tool with timeRange. Fixed tiers: day|week|month|year. Custom: 12h, 3d, 2mo, 1y, or an absolute date like 2026-07-01.",
          "",
          "For platform-specific searches (GitHub repos, V2EX threads, Bilibili videos, Reddit posts, Hacker News discussions, Stack Overflow questions, Wikipedia articles, npm packages), use the platform_search tool with platform: github|v2ex|bilibili|reddit|hn|stackoverflow|wikipedia|npm.",
          "",
          "The user can switch the search engine themselves by typing /thin-search-engine in the chat - it opens a picker to choose an engine, just like the settings page. This changes the preferred engine; search still falls back to other engines automatically if it fails.",
        ].join("\n"),
      });
    };
    sctx.effect(() => {
      refreshPrompt();
      return () => {
        if (disposeSection) disposeSection();
        disposeSection = null;
      };
    }, "thin-search: engine list prompt section");
  });
}

export {
  ANYSEARCH_URL,
  BING_URL,
  Config,
  DDG_HTML_URL,
  DDG_LITE_URL,
  FREE_ENGINES,
  PLATFORMS,
  PROVIDER_ID,
  detectEngineMode,
  resolveProfilePatchPath,
  setEngineMode,
  SEARXNG_INSTANCES,
  THIN_SEARCH_NS,
  TIME_RANGES,
  apply,
  approximateTimeRange,
  inject,
  name,
  parseTimeRange,
  searchAnysearch,
  searchBing,
  searchBilibili,
  searchDdgHtml,
  searchDdgLite,
  searchGithub,
  searchHackerNews,
  searchNpm,
  searchPlatform,
  searchReddit,
  searchSearxng,
  searchStackOverflow,
  searchV2ex,
  searchWikipedia,
};
