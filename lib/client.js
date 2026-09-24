window.__ModuleLoader__.load({
  id: "dsh-thin-search",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");

    // 内置默认搜索增强系统提示词（与 lib/index.js 同步）
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

    //#region css
    const css = [
      // Page
      ".dsts{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex;padding-bottom:80px}",
      ".dsts-header{display:flex;flex-direction:column;gap:4px}",
      ".dsts-title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}",
      ".dsts-intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}",

      // Card
      ".dsts-card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);border-radius:16px;flex-direction:column;display:flex;transition:border-color .16s,background .16s}",
      ".dsts-card:hover{border-color:var(--dsw-alias-label-dimmed)}",
      ".dsts-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",

      // Card header
      ".dsts-cardHeader{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
      ".dsts-cardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
      ".dsts-cardHeaderText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
      ".dsts-cardName{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
      ".dsts-cardDesc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
      ".dsts-cardChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}",
      ".dsts-cardChevronOpen{transform:rotate(180deg)}",

      // Card body
      ".dsts-cardBody{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",

      // Field
      ".dsts-field{flex-direction:column;gap:6px;padding:12px 0;display:flex}",
      ".dsts-field+.dsts-field{border-top:.5px solid var(--dsw-alias-border-l2)}",
      ".dsts-fieldHead{align-items:center;gap:8px;display:flex}",
      ".dsts-fieldLabel{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}",
      ".dsts-fieldBadges{align-items:center;gap:8px;display:inline-flex}",
      ".dsts-fieldBadge{corner-shape:round;white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
      ".dsts-fieldBadgeMuted{corner-shape:round;white-space:nowrap;color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}",
      ".dsts-fieldReset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}",
      ".dsts-fieldReset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
      ".dsts-fieldReset:disabled{cursor:default}",

      // Input
      ".dsts-input{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}",
      ".dsts-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
      ".dsts-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
      ".dsts-inputInvalid{border-color:var(--dsw-alias-state-error-primary, #ec1313)}",

      // Textarea
      ".dsts-textarea{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);width:100%;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 12px;font-size:13px;line-height:1.5;resize:vertical;min-height:60px}",
      ".dsts-textarea:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
      ".dsts-textarea:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
      ".dsts-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}",

      // Select
      ".dsts-select{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%}",
      ".dsts-select:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
      ".dsts-select:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
      ".dsts-select{color-scheme:light dark}",
      ".dsts-select option,.dsts-select optgroup{background-color:#fff;color:#1f2328}",
      "@media(prefers-color-scheme:dark){.dsts-select{color-scheme:dark}.dsts-select option,.dsts-select optgroup{background-color:#1e1f24;color:#e8e8ea}}",

      // Hint & error
      ".dsts-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
      ".dsts-error{color:var(--dsw-alias-state-error-primary, #ec1313);margin:0;font-size:12px;line-height:1.5}",

      // Switch
      ".dsts-switch{box-sizing:border-box;background:var(--dsw-alias-border-l3);cursor:pointer;border:0;border-radius:10px;flex:none;width:36px;height:20px;padding:2px;position:relative}",
      ".dsts-switchOn{background:var(--dsw-alias-brand-primary)}",
      ".dsts-switch:disabled{cursor:default;opacity:.5}",
      ".dsts-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
      ".dsts-switchThumb{corner-shape:round;background:var(--dsw-alias-label-primary-foreground);border-radius:50%;width:16px;height:16px;transition:transform .12s;display:block}",
      ".dsts-switchOn .dsts-switchThumb{transform:translate(16px)}",

      // Platform tags
      ".dsts-tags{flex-wrap:wrap;gap:8px;display:flex}",
      ".dsts-tag{align-items:center;gap:6px;display:inline-flex}",
      ".dsts-tag input{position:absolute;opacity:0;width:0;height:0}",
      ".dsts-tagLabel{corner-shape:round;cursor:pointer;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border:.5px solid var(--dsw-alias-border-l4);border-radius:999px;padding:4px 12px;font-size:12px;font-weight:500;line-height:17px;transition:all .15s}",
      ".dsts-tagLabel:hover{border-color:var(--dsw-alias-label-dimmed)}",
      ".dsts-tag input:checked+.dsts-tagLabel{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);border-color:var(--dsw-alias-brand-primary)}",
      ".dsts-tag input:focus-visible+.dsts-tagLabel{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",

      // Test results - standalone section
      ".dsts-testSection{flex-direction:column;gap:8px;display:flex}",
      ".dsts-testResults{flex-direction:column;gap:8px;display:flex}",
      ".dsts-testItem{border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:10px 12px}",
      ".dsts-testTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:22px;text-decoration:none}",
      ".dsts-testTitle:hover{text-decoration:underline}",
      ".dsts-testUrl{color:var(--dsw-alias-label-tertiary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsts-testSnippet{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}",
      ".dsts-testOk{color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:1.5}",
      ".dsts-testEnhance{color:var(--dsw-alias-state-warn-label);font-size:12px;line-height:1.5;font-weight:500}",

      // Fixed footer actions
      ".dsts-footer{position:sticky;bottom:0;background:transparent;border-top:none;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;margin-top:8px;display:flex;flex-wrap:wrap}",
      ".dsts-footerLeft{display:flex;align-items:center;gap:8px}",
      ".dsts-footerRight{display:flex;align-items:center;gap:8px}",
      ".dsts-footerError{min-width:0;color:var(--dsw-alias-state-error-primary, #ec1313);flex:1;margin:0;font-size:12px;line-height:1.5}",

      // Buttons
      ".dsts-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}",
      ".dsts-btn-outline{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:transparent}",
      ".dsts-btn-outline:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
      ".dsts-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}",
      ".dsts-btn-primary:hover:not(:disabled){filter:brightness(.95)}",
      ".dsts-btn:disabled{opacity:.5;cursor:default}",

      // Status badges
      ".dsts-badge{corner-shape:round;white-space:nowrap;border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
      ".dsts-badge-ok{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}",
      ".dsts-badge-warn{background:rgba(240,180,60,.1);color:var(--dsw-alias-state-warn-label)}",
      ".dsts-badge-err{background:rgba(240,90,90,.1);color:var(--dsw-alias-state-error-primary, #ec1313)}",

      // Pending/unsaved indicator
      ".dsts-pending{corner-shape:round;white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",

      // Read-only
      ".dsts-readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}",

      // Tooltip - minimal and elegant
      ".dsts-info{display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary);font-size:9px;font-weight:600;font-style:italic;cursor:help;flex:none;transition:all .15s}",
      ".dsts-info:hover{background:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}",
      ".dsts-infoWrap{position:relative;display:inline-flex}",
      ".dsts-infoTip{z-index:9999;visibility:hidden;opacity:0;pointer-events:none;position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:32px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:4px;padding:4px 8px;min-width:140px;max-width:220px;box-shadow:0 1px 8px rgba(0,0,0,.08);transition:opacity .1s}",
      ".dsts-infoWrap:hover .dsts-infoTip{visibility:visible;opacity:1}",
      ".dsts-infoTipText{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.4;margin:0}",
    ].join("");
    const tagId = "dsh-thin-search/card.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-thin-search";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    //#endregion

    const BRIDGE_PREFIX = "/api/dsh-thin-search-settings";
    const NS = "thin-search";
    const T = {
      title: "搜索引擎",
      intro: "配置 DSH 的网页搜索：选择免费引擎，或在免费引擎与官方 DeepSeek 搜索之间切换。",
      engine: "引擎",
      mode: "搜索提供方",
      modeThin: "免费引擎（默认）",
      modeOfficial: "官方 DeepSeek 搜索",
      modeHint: "官方 DeepSeek 搜索需要 DeepSeek API Key（走 Anthropic 格式的模型调用，按用量计费）；免费引擎零成本、无需 Key。切换后需重启 DSH 才生效。",
      modeApplied: "当前已生效",
      modeRestart: "已修改，重启 DSH 后生效",
      modeSaving: "保存中…",
      modeSaved: "已保存",
      modeFail: "切换失败",
      engineLabel: "搜索引擎",
      visit: "访问官网 →",
      engineHint: "AnySearch（默认）对中文问句理解最好；Bing 快且中文优化。DuckDuckGo / SearXNG 可能需要代理。所有引擎失败时自动回退到下一个。",
      platforms: "平台搜索",
      platformHint: "为 agent 的 platform_search 工具启用平台。禁用的平台会被跳过。",
      cache: "缓存",
      cacheLabel: "结果缓存时长（分钟）",
      cacheHint: "0 关闭缓存，最长 5 分钟。缩短可加快时效，延长可防限流。",
      proxy: "网络代理",
      proxyPlaceholder: "如 http://127.0.0.1:10808（留空 = 直连）",
      proxyHint: "用于访问需要外网的引擎（DuckDuckGo / SearXNG / GitHub 等）。支持 HTTP/HTTPS 代理（V2Ray、Clash 等需开启 HTTP 端口）。SOCKS5 不支持。改动保存后立即生效，无需重启。",
      enhance: "搜索增强",
      enhanceHintBefore: "用 LLM 把口语化输入规范化为搜索关键词（如「今天美元兑换日元的汇率多少？」→「美元 日元 汇率」），改善 Bing 等引擎的中文问句效果。默认关闭：开启后每次搜索会",
      enhanceToken: "消耗 Token",
      enhanceHintAfter: "（按当前默认模型计费）。",
      enhanceOn: "已开启",
      enhanceOff: "已关闭",
      enhanceModelLabel: "增强模型",
      enhanceModelDefault: "跟随默认模型",
      enhanceSystemPromptLabel: "增强系统提示词",
      enhanceSystemPromptHint: "自定义 LLM 搜索增强的系统提示词（System Prompt）。文本框始终显示当前生效内容：未自定义或清空时自动使用内置默认；点击「恢复默认」将写入内置默认提示词。",
      testEngine: "测试引擎",
      testing: "测试中…",
      restoreDefault: "恢复默认",
      discard: "撤销",
      saving: "保存中…",
      save: "保存",
      unsaved: "未保存",
      saveFailed: "保存失败",
      unavailable: "设置不可用 —— thin-search 桥接未暴露。",
      testOk: (r) => `✓ ${r.count} 条结果（引擎: ${r.engine}）${r.content ? ` — ${r.content}` : ""}`,
      testEnhance: (info) => `[搜索增强] 原输入：「${info.original}」→ 优化为「${info.enhanced}」`,
      testEnhanceFail: (info) => `[搜索增强] 失败（已用原句测试）：${info.error}`,
      testFail: (e) => `✗ ${e}`,
      stopTest: "停止测试",
      stopped: "已停止",
      advanced: "高级设置",
      expand: "展开",
      collapse: "收起",
      overridden: "已覆盖",
      reset: "恢复默认",
      readOnly: "此部署存储设置为只读。",
    };
    const ENGINES = [
      { id: "anysearch", label: "AnySearch · AI", link: "https://anysearch.com" },
      { id: "bing", label: "Bing", link: "https://www.bing.com" },
      { id: "searxng", label: "SearXNG · 元搜索", link: "https://github.com/searxng/searxng" },
      { id: "ddg", label: "DuckDuckGo · HTML", link: "https://duckduckgo.com" },
      { id: "ddg-lite", label: "DuckDuckGo · Lite", link: "https://duckduckgo.com" },
    ];
    const ALL_PLATFORMS = [
      ["github", "GitHub"], ["v2ex", "V2EX"], ["bilibili", "Bilibili"], ["reddit", "Reddit"],
      ["hn", "Hacker News"], ["stackoverflow", "Stack Overflow"], ["wikipedia", "Wikipedia"], ["npm", "npm"],
    ];

    async function bridgeDescribe() {
      const response = await fetch(`${BRIDGE_PREFIX}/describe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      return response.json();
    }

    async function bridgeMutate(payload) {
      const response = await fetch(`${BRIDGE_PREFIX}/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return response.json();
    }

    async function bridgeRawSearch(payload, signal) {
      const response = await fetch(`${BRIDGE_PREFIX}/raw-search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        ...(signal !== undefined ? { signal } : {}),
      });
      return response.json();
    }

    async function bridgeEngineMode(action, mode) {
      const response = await fetch(`${BRIDGE_PREFIX}/engine-mode`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(mode !== undefined ? { mode } : {}) }),
      });
      return response.json();
    }

    async function bridgeLlmModels() {
      const response = await fetch(`${BRIDGE_PREFIX}/llm-models`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      return response.json();
    }

    // Chevron icon
    function IconChevron({ open }) {
      return react_jsx_runtime.jsx("svg", {
        width: "14",
        height: "14",
        viewBox: "0 0 16 16",
        fill: "none",
        "aria-hidden": true,
        style: {
          transform: open ? "rotate(180deg)" : void 0,
          transition: "transform 160ms ease"
        },
        children: react_jsx_runtime.jsx("path", {
          d: "M4 6l4 4 4-4",
          stroke: "currentColor",
          strokeWidth: "1.5",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        })
      });
    }

    // Small italic "i" tooltip
    function InfoTip({ text }) {
      return react_jsx_runtime.jsxs("span", {
        className: "dsts-infoWrap",
        children: [
          react_jsx_runtime.jsx("span", { className: "dsts-info", children: "i" }),
          react_jsx_runtime.jsx("span", {
            className: "dsts-infoTip",
            role: "tooltip",
            children: react_jsx_runtime.jsx("span", { className: "dsts-infoTipText", children: text }),
          }),
        ],
      });
    }

    // Search Engine Settings Page
    function SearchEnginePage(props) {
      const isDarkScheme = react.useMemo(() => {
        try {
          const root = document.body || document.documentElement;
          const bg = getComputedStyle(root).getPropertyValue("--dsw-alias-bg-base").trim();
          const m = bg.match(/(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/);
          if (m) {
            const l = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
            return l < 128;
          }
          if (/^#([0-9a-f]{3,8})/i.test(bg)) {
            const hex = bg.slice(1);
            const h = hex.length <= 4 ? hex.replace(/./g, (c) => c + c) : hex;
            const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
            return 0.299 * r + 0.587 * g + 0.114 * b < 128;
          }
        } catch {}
        return typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : false;
      }, []);
      const selectColorScheme = isDarkScheme ? "dark" : "light";

      const [state, setState] = react.useState({ status: "loading" });
      const [revision, setRevision] = react.useState(0);
      const [provider, setProvider] = react.useState("anysearch");
      const [platforms, setPlatforms] = react.useState(ALL_PLATFORMS.map(([id]) => id));
      const [cacheTtl, setCacheTtl] = react.useState(5);
      const [searchEnhance, setSearchEnhance] = react.useState(false);
      const [enhanceModel, setEnhanceModel] = react.useState("");
      const [enhanceSystemPrompt, setEnhanceSystemPrompt] = react.useState("");
      // 当前实际生效的系统提示词：用户自定义（非空）优先，否则用内置默认
      const effectiveSystemPrompt = enhanceSystemPrompt.trim().length > 0 ? enhanceSystemPrompt : DEFAULT_ENHANCE_SYSTEM_PROMPT;
      const [modelGroups, setModelGroups] = react.useState([]);
      const [proxy, setProxy] = react.useState("");
      const [dirty, setDirty] = react.useState(false);
      const [saving, setSaving] = react.useState(false);
      const [failed, setFailed] = react.useState(false);
      const [testing, setTesting] = react.useState(false);
      const [testResult, setTestResult] = react.useState(null);
      const [engineMode, setEngineMode] = react.useState("thin");
      const [engineModeApplied, setEngineModeApplied] = react.useState(true);
      const [modeSaving, setModeSaving] = react.useState(false);
      const [modeFailed, setModeFailed] = react.useState(false);
      const [openSections, setOpenSections] = react.useState(new Set(["mode", "engine"]));

      const load = react.useCallback(async () => {
        try {
          const result = await bridgeDescribe();
          if (result.ok) {
            const view = result.value.namespaces.find((n) => n.ns === NS);
            if (view) {
              const v = view.value ?? {};
              setRevision(Number.isSafeInteger(view.revision) ? view.revision : 0);
              setProvider(v.provider ?? "anysearch");
              setPlatforms(Array.isArray(v.platforms) && v.platforms.length > 0 ? v.platforms : ALL_PLATFORMS.map(([id]) => id));
              setCacheTtl(v.cacheTtl === undefined ? 5 : Math.min(Math.max(Number(v.cacheTtl) ?? 5, 0), 5));
              setSearchEnhance(v.searchEnhance === true);
              setEnhanceModel(typeof v.enhanceModel === "string" ? v.enhanceModel : "");
              setEnhanceSystemPrompt(typeof v.enhanceSystemPrompt === "string" ? v.enhanceSystemPrompt : "");
              setProxy(typeof v.proxy === "string" ? v.proxy : "");
              setState({ status: "ready", writable: result.value.writable });
            } else {
              setState({ status: "unavailable" });
            }
          } else {
            setState({ status: "unavailable" });
          }
        } catch {
          setState({ status: "unavailable" });
        }
        try {
          const modeResult = await bridgeEngineMode("get");
          if (modeResult.ok) {
            setEngineMode(modeResult.value.mode);
            setEngineModeApplied(modeResult.value.applied);
          }
        } catch {}
        try {
          const modelsResult = await bridgeLlmModels();
          if (modelsResult.ok && Array.isArray(modelsResult.value?.groups)) {
            setModelGroups(modelsResult.value.groups);
          }
        } catch {}
      }, []);

      react.useEffect(() => {
        load();
        return () => testAbortRef.current?.abort();
      }, [load]);

      const select = (value) => {
        setProvider(value);
        setDirty(true);
        setFailed(false);
      };

      const save = async () => {
        setSaving(true);
        setFailed(false);
        try {
          const ops = [
            { op: "set", path: ["provider"], value: provider },
            { op: "set", path: ["platforms"], value: platforms },
            { op: "set", path: ["cacheTtl"], value: Math.min(Math.max(Number(cacheTtl) ?? 5, 0), 5) },
            { op: "set", path: ["searchEnhance"], value: searchEnhance },
            { op: "set", path: ["enhanceModel"], value: enhanceModel },
            { op: "set", path: ["enhanceSystemPrompt"], value: enhanceSystemPrompt },
            { op: "set", path: ["proxy"], value: proxy.trim() },
          ];
          const result = await bridgeMutate({ ns: NS, ops, expectedRevision: revision });
          if (result.ok) {
            setDirty(false);
            setRevision(Number.isSafeInteger(result.value.revision) ? result.value.revision : revision);
            setProvider(result.value.value.provider ?? provider);
            setFailed(false);
            load();
          } else {
            setFailed(true);
          }
        } catch {
          setFailed(true);
        } finally {
          setSaving(false);
        }
      };

      const discard = () => {
        load();
        setDirty(false);
        setFailed(false);
      };

      const changeMode = async (mode) => {
        setModeSaving(true);
        setModeFailed(false);
        try {
          const result = await bridgeEngineMode("set", mode);
          if (result.ok) {
            setEngineMode(result.value.mode);
            setEngineModeApplied(result.value.applied);
          } else {
            setModeFailed(true);
          }
        } catch {
          setModeFailed(true);
        } finally {
          setModeSaving(false);
        }
      };

      const testAbortRef = react.useRef(null);
      const runTest = async () => {
        setTesting(true);
        setTestResult(null);
        setFailed(false);
        const controller = new AbortController();
        testAbortRef.current = controller;
        try {
          const result = await bridgeRawSearch(
            {
              query: "今天美元兑换日元的汇率是多少？",
              maxResults: 2,
              engine: provider,
              enhance: searchEnhance,
            },
            controller.signal
          );
          if (controller.signal.aborted) {
            setTestResult({ ok: false, stopped: true });
            return;
          }
          if (result.ok) {
            const sources = result.value.sources ?? [];
            setTestResult({
              ok: true,
              count: sources.length,
              engine: result.value.provider ?? provider,
              content: result.value.content ?? "",
              enhance: result.value.enhance ?? null,
              sources: sources.map((s) => ({ title: s.title ?? "", url: s.url ?? "", snippet: s.snippet ?? "" })),
            });
          } else {
            setTestResult({ ok: false, error: result.message ?? "unknown error", stopped: result.code === "engine-stopped" });
          }
        } catch {
          if (controller.signal.aborted) {
            setTestResult({ ok: false, stopped: true });
          } else {
            setTestResult({ ok: false, error: "request failed" });
          }
        } finally {
          testAbortRef.current = null;
          setTesting(false);
        }
      };
      const stopTest = () => {
        testAbortRef.current?.abort();
      };

      const toggleSection = (id) => {
        setOpenSections((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      };

      if (state.status === "loading") return null;
      const ready = state.status === "ready";
      const currentEngine = ENGINES.find((e) => e.id === provider) ?? ENGINES[0];

      return react_jsx_runtime.jsx("div", {
        className: "dsts",
        children: [
          // Header
          react_jsx_runtime.jsxs("div", {
            className: "dsts-header",
            children: [
              react_jsx_runtime.jsx("h2", { className: "dsts-title", children: T.title }),
              react_jsx_runtime.jsx("p", { className: "dsts-intro", children: T.intro }),
            ],
          }),

          // ── 搜索提供方 ──
          react_jsx_runtime.jsxs("div", {
            className: openSections.has("mode") ? "dsts-card dsts-card-open" : "dsts-card",
            children: [
              react_jsx_runtime.jsxs("button", {
                type: "button",
                className: "dsts-cardHeader",
                "aria-expanded": openSections.has("mode"),
                onClick: () => toggleSection("mode"),
                children: [
                  react_jsx_runtime.jsxs("span", {
                    className: "dsts-cardHeaderText",
                    children: [
                      react_jsx_runtime.jsx("span", { className: "dsts-cardName", children: T.mode }),
                      react_jsx_runtime.jsxs("span", { className: "dsts-cardDesc", children: [
                        "免费引擎零成本 · 官方搜索需 Key",
                        react_jsx_runtime.jsx(InfoTip, { text: T.modeHint }),
                      ] }),
                    ],
                  }),
                  modeSaving
                    ? react_jsx_runtime.jsx("span", { className: "dsts-pending", children: T.modeSaving })
                    : null,
                  engineModeApplied && !modeSaving
                    ? react_jsx_runtime.jsxs("span", { className: "dsts-badge dsts-badge-ok", children: ["✓ ", T.modeApplied] })
                    : null,
                  !engineModeApplied && !modeSaving
                    ? react_jsx_runtime.jsxs("span", { className: "dsts-badge dsts-badge-warn", children: ["⟳ ", T.modeRestart] })
                    : null,
                  modeFailed
                    ? react_jsx_runtime.jsx("span", { className: "dsts-badge dsts-badge-err", children: T.modeFail })
                    : null,
                  react_jsx_runtime.jsx(IconChevron, { open: openSections.has("mode") }),
                ],
              }),
              openSections.has("mode")
                ? react_jsx_runtime.jsx("div", {
                    className: "dsts-cardBody",
                    children: react_jsx_runtime.jsx("div", {
                      className: "dsts-field",
                      children: react_jsx_runtime.jsxs("div", {
                        className: "dsts-fieldHead",
                        children: [
                          react_jsx_runtime.jsx("label", { className: "dsts-fieldLabel", children: T.mode }),
                          react_jsx_runtime.jsx("select", {
                            className: "dsts-select",
                            value: engineMode,
                            style: { colorScheme: selectColorScheme, maxWidth: 320 },
                            disabled: !ready || modeSaving,
                            onChange: (e) => changeMode(e.target.value),
                            children: [
                              react_jsx_runtime.jsx("option", { value: "thin", children: T.modeThin }),
                              react_jsx_runtime.jsx("option", { value: "official", children: T.modeOfficial }),
                            ],
                          }),
                        ],
                      }),
                    }),
                  })
                : null,
            ],
          }),

          // ── 搜索引擎 ──
          react_jsx_runtime.jsxs("div", {
            className: openSections.has("engine") ? "dsts-card dsts-card-open" : "dsts-card",
            children: [
              react_jsx_runtime.jsxs("button", {
                type: "button",
                className: "dsts-cardHeader",
                "aria-expanded": openSections.has("engine"),
                onClick: () => toggleSection("engine"),
                children: [
                  react_jsx_runtime.jsxs("span", {
                    className: "dsts-cardHeaderText",
                    children: [
                      react_jsx_runtime.jsx("span", { className: "dsts-cardName", children: T.engine }),
                      react_jsx_runtime.jsxs("span", { className: "dsts-cardDesc", children: [
                        "选择免费搜索引擎",
                        react_jsx_runtime.jsx(InfoTip, { text: T.engineHint }),
                      ] }),
                    ],
                  }),
                  react_jsx_runtime.jsx(IconChevron, { open: openSections.has("engine") }),
                ],
              }),
              openSections.has("engine")
                ? react_jsx_runtime.jsxs("div", {
                    className: "dsts-cardBody",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dsts-field",
                        children: react_jsx_runtime.jsxs("div", {
                          className: "dsts-fieldHead",
                          children: [
                            react_jsx_runtime.jsx("label", { className: "dsts-fieldLabel", children: T.engineLabel }),
                            react_jsx_runtime.jsx("select", {
                              className: "dsts-select",
                              value: provider,
                              style: { colorScheme: selectColorScheme, maxWidth: 320 },
                              disabled: !ready || saving,
                              onChange: (e) => select(e.target.value),
                              children: ENGINES.map((engine) =>
                                react_jsx_runtime.jsx("option", { value: engine.id, children: engine.label }, engine.id)
                              ),
                            }),
                          ],
                        }),
                      }),
                      currentEngine.link
                        ? react_jsx_runtime.jsx("div", {
                            className: "dsts-field",
                            children: react_jsx_runtime.jsx("a", {
                              className: "dsts-testTitle",
                              href: currentEngine.link,
                              target: "_blank",
                              rel: "noopener noreferrer",
                              children: T.visit,
                            }),
                          })
                        : null,
                    ],
                  })
                : null,
            ],
          }),

          // ── 搜索增强 ──
          react_jsx_runtime.jsxs("div", {
            className: openSections.has("enhance") ? "dsts-card dsts-card-open" : "dsts-card",
            children: [
              react_jsx_runtime.jsxs("button", {
                type: "button",
                className: "dsts-cardHeader",
                "aria-expanded": openSections.has("enhance"),
                onClick: () => toggleSection("enhance"),
                children: [
                  react_jsx_runtime.jsxs("span", {
                    className: "dsts-cardHeaderText",
                    children: [
                      react_jsx_runtime.jsx("span", { className: "dsts-cardName", children: T.enhance }),
                      react_jsx_runtime.jsxs("span", { className: "dsts-cardDesc", children: [
                        "LLM 语义优化，改善中文搜索",
                        react_jsx_runtime.jsx(InfoTip, { text: T.enhanceHintBefore + T.enhanceToken + T.enhanceHintAfter }),
                      ] }),
                    ],
                  }),
                  react_jsx_runtime.jsx("button", {
                    type: "button",
                    role: "switch",
                    "aria-checked": searchEnhance,
                    "aria-label": T.enhance,
                    className: searchEnhance ? "dsts-switch dsts-switchOn" : "dsts-switch",
                    disabled: !ready || saving,
                    onClick: (e) => {
                      e.stopPropagation();
                      setSearchEnhance(!searchEnhance);
                      setDirty(true);
                      setFailed(false);
                    },
                    children: react_jsx_runtime.jsx("span", { className: "dsts-switchThumb" }),
                  }),
                  react_jsx_runtime.jsx(IconChevron, { open: openSections.has("enhance") }),
                ],
              }),
              openSections.has("enhance")
                ? react_jsx_runtime.jsx("div", {
                    className: "dsts-cardBody",
                    children: searchEnhance
                      ? react_jsx_runtime.jsxs("div", {
                          className: "dsts-field",
                          children: [
                            react_jsx_runtime.jsxs("div", {
                              className: "dsts-fieldHead",
                              children: [
                                react_jsx_runtime.jsx("label", { className: "dsts-fieldLabel", children: T.enhanceModelLabel }),
                                react_jsx_runtime.jsx("select", {
                                  className: "dsts-select",
                                  value: enhanceModel,
                                  style: { colorScheme: selectColorScheme, maxWidth: 320 },
                                  disabled: !ready || saving,
                                  onChange: (e) => {
                                    setEnhanceModel(e.target.value);
                                    setDirty(true);
                                    setFailed(false);
                                  },
                                  children: [
                                    react_jsx_runtime.jsx("option", { value: "", children: T.enhanceModelDefault }),
                                    modelGroups.map((group) =>
                                      react_jsx_runtime.jsx("optgroup", {
                                        label: group.displayName,
                                        children: group.models.map((m) =>
                                          react_jsx_runtime.jsx("option", {
                                            value: `${group.provider}:${m.id}`,
                                            children: m.name,
                                          }, m.id)
                                        ),
                                      }, group.provider)
                                    ),
                                  ],
                                }),
                              ],
                            }),
                            react_jsx_runtime.jsxs("div", {
                              className: "dsts-field",
                              children: [
                                react_jsx_runtime.jsxs("div", {
                                  className: "dsts-fieldHead",
                                  children: [
                                    react_jsx_runtime.jsx("label", { className: "dsts-fieldLabel", children: T.enhanceSystemPromptLabel }),
                                    react_jsx_runtime.jsx("span", {
                                      className: "dsts-fieldReset",
                                      onClick: () => { setEnhanceSystemPrompt(DEFAULT_ENHANCE_SYSTEM_PROMPT); setDirty(true); setFailed(false); },
                                      children: T.reset,
                                    }),
                                  ],
                                }),
                                react_jsx_runtime.jsx("textarea", {
                                  className: "dsts-textarea",
                                  value: effectiveSystemPrompt,
                                  rows: 4,
                                  disabled: !ready || saving,
                                  onChange: (e) => {
                                    setEnhanceSystemPrompt(e.target.value);
                                    setDirty(true);
                                    setFailed(false);
                                  },
                                }),
                                react_jsx_runtime.jsx("p", { className: "dsts-hint", children: T.enhanceSystemPromptHint }),
                              ],
                            }),
                          ],
                        })
                      : react_jsx_runtime.jsx("p", { className: "dsts-readOnly", children: T.enhanceOff }),
                  })
                : null,
            ],
          }),

          // ── 平台搜索 ──
          react_jsx_runtime.jsxs("div", {
            className: openSections.has("platforms") ? "dsts-card dsts-card-open" : "dsts-card",
            children: [
              react_jsx_runtime.jsxs("button", {
                type: "button",
                className: "dsts-cardHeader",
                "aria-expanded": openSections.has("platforms"),
                onClick: () => toggleSection("platforms"),
                children: [
                  react_jsx_runtime.jsxs("span", {
                    className: "dsts-cardHeaderText",
                    children: [
                      react_jsx_runtime.jsx("span", { className: "dsts-cardName", children: T.platforms }),
                      react_jsx_runtime.jsxs("span", { className: "dsts-cardDesc", children: [
                        "启用/禁用平台搜索",
                        react_jsx_runtime.jsx(InfoTip, { text: T.platformHint }),
                      ] }),
                    ],
                  }),
                  react_jsx_runtime.jsx(IconChevron, { open: openSections.has("platforms") }),
                ],
              }),
              openSections.has("platforms")
                ? react_jsx_runtime.jsx("div", {
                    className: "dsts-cardBody",
                    children: react_jsx_runtime.jsx("div", {
                      className: "dsts-field",
                      children: react_jsx_runtime.jsxs("div", {
                        className: "dsts-tags",
                        children: ALL_PLATFORMS.map(([id, label]) =>
                          react_jsx_runtime.jsxs("label", {
                            className: "dsts-tag",
                            children: [
                              react_jsx_runtime.jsx("input", {
                                type: "checkbox",
                                checked: platforms.includes(id),
                                disabled: !ready || saving,
                                onChange: () => {
                                  setPlatforms((prev) =>
                                    prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
                                  );
                                  setDirty(true);
                                  setFailed(false);
                                },
                              }),
                              react_jsx_runtime.jsx("span", { className: "dsts-tagLabel", children: label }),
                            ],
                          }, id)
                        ),
                      }),
                    }),
                  })
                : null,
            ],
          }),

          // ── 高级设置 ──
          react_jsx_runtime.jsxs("div", {
            className: openSections.has("advanced") ? "dsts-card dsts-card-open" : "dsts-card",
            children: [
              react_jsx_runtime.jsxs("button", {
                type: "button",
                className: "dsts-cardHeader",
                "aria-expanded": openSections.has("advanced"),
                onClick: () => toggleSection("advanced"),
                children: [
                  react_jsx_runtime.jsxs("span", {
                    className: "dsts-cardHeaderText",
                    children: [
                      react_jsx_runtime.jsx("span", { className: "dsts-cardName", children: T.advanced }),
                      react_jsx_runtime.jsx("span", { className: "dsts-cardDesc", children: "缓存、代理等" }),
                    ],
                  }),
                  react_jsx_runtime.jsx(IconChevron, { open: openSections.has("advanced") }),
                ],
              }),
              openSections.has("advanced")
                ? react_jsx_runtime.jsxs("div", {
                    className: "dsts-cardBody",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dsts-field",
                        children: react_jsx_runtime.jsxs("div", {
                          className: "dsts-fieldHead",
                          children: [
                            react_jsx_runtime.jsx("label", { className: "dsts-fieldLabel", children: T.cacheLabel }),
                            react_jsx_runtime.jsx("input", {
                              className: "dsts-input",
                              type: "number",
                              min: 0,
                              max: 5,
                              step: 1,
                              value: cacheTtl,
                              disabled: !ready || saving,
                              onChange: (e) => {
                                setCacheTtl(Number(e.target.value));
                                setDirty(true);
                                setFailed(false);
                              },
                            }),
                          ],
                        }),
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dsts-field",
                        children: react_jsx_runtime.jsxs("div", {
                          className: "dsts-fieldHead",
                          children: [
                            react_jsx_runtime.jsx("label", { className: "dsts-fieldLabel", children: T.proxy }),
                            react_jsx_runtime.jsx("input", {
                              className: "dsts-input",
                              type: "text",
                              value: proxy,
                              placeholder: T.proxyPlaceholder,
                              disabled: !ready || saving,
                              onChange: (e) => {
                                setProxy(e.target.value);
                                setDirty(true);
                                setFailed(false);
                              },
                            }),
                          ],
                        }),
                      }),
                    ],
                  })
                : null,
            ],
          }),

          // ── 测试结果 (独立区域，始终可见) ──
          testResult
            ? react_jsx_runtime.jsxs("div", {
                className: "dsts-testSection",
                children: [
                  testing
                    ? react_jsx_runtime.jsx("p", { className: "dsts-hint", children: T.testing })
                    : null,
                  testResult && !testResult.ok
                    ? react_jsx_runtime.jsx("p", {
                        className: "dsts-error",
                        children: testResult.stopped ? T.stopped : T.testFail(testResult.error),
                      })
                    : null,
                  testResult && testResult.ok
                    ? react_jsx_runtime.jsxs("div", {
                        className: "dsts-testResults",
                        children: [
                          react_jsx_runtime.jsx("span", { className: "dsts-testOk", children: T.testOk(testResult) }),
                          testResult.enhance
                            ? react_jsx_runtime.jsx("span", {
                                className: testResult.enhance.error ? "dsts-error" : "dsts-testEnhance",
                                children: testResult.enhance.error
                                  ? T.testEnhanceFail(testResult.enhance)
                                  : T.testEnhance(testResult.enhance),
                              })
                            : null,
                          testResult.sources && testResult.sources.length > 0
                            ? testResult.sources.map((s, i) =>
                                react_jsx_runtime.jsxs("div", {
                                  className: "dsts-testItem",
                                  children: [
                                    react_jsx_runtime.jsx("a", {
                                      className: "dsts-testTitle",
                                      href: s.url,
                                      target: "_blank",
                                      rel: "noopener noreferrer",
                                      children: s.title || s.url,
                                    }),
                                    react_jsx_runtime.jsx("span", { className: "dsts-testUrl", children: s.url }),
                                    s.snippet
                                      ? react_jsx_runtime.jsx("span", { className: "dsts-testSnippet", children: s.snippet })
                                      : null,
                                  ],
                                }, i)
                              )
                            : null,
                        ],
                      })
                    : null,
                ],
              })
            : null,

          // ── 固定底部操作栏 ──
          react_jsx_runtime.jsxs("div", {
            className: "dsts-footer",
            children: [
              react_jsx_runtime.jsxs("div", {
                className: "dsts-footerLeft",
                children: [
                  failed
                    ? react_jsx_runtime.jsx("span", { className: "dsts-footerError", children: T.saveFailed })
                    : null,
                  dirty && !failed
                    ? react_jsx_runtime.jsx("span", { className: "dsts-pending", children: T.unsaved })
                    : null,
                ],
              }),
              react_jsx_runtime.jsxs("div", {
                className: "dsts-footerRight",
                children: [
                  react_jsx_runtime.jsx("button", {
                    type: "button",
                    className: "dsts-btn dsts-btn-outline",
                    onClick: testing ? stopTest : runTest,
                    disabled: saving || !ready,
                    children: testing ? T.stopTest : T.testEngine,
                  }),
                  react_jsx_runtime.jsx("button", {
                    type: "button",
                    className: "dsts-btn dsts-btn-outline",
                    onClick: () => {
                      setProvider("anysearch");
                      setDirty(true);
                      setFailed(false);
                    },
                    disabled: saving || !ready || provider === "anysearch",
                    children: T.restoreDefault,
                  }),
                  react_jsx_runtime.jsx("button", {
                    type: "button",
                    className: "dsts-btn dsts-btn-outline",
                    onClick: discard,
                    disabled: saving || !dirty,
                    children: T.discard,
                  }),
                  react_jsx_runtime.jsx("button", {
                    type: "button",
                    className: "dsts-btn dsts-btn-primary",
                    onClick: save,
                    disabled: saving || !dirty || !ready,
                    children: saving ? T.saving : T.save,
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    }

    const inject = ["slots", "commandUi"];

    function apply(ctx) {
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            name: "settings.section",
            id: "thin-search-settings",
            order: 40,
            label: () => T.title,
          },
          SearchEnginePage
        )
      );
      ctx.inject(["commandUi"], (sctx) => {
        const command = sctx.get("commandUi");
        sctx.effect(() => {
          const dispose = command.register({
            name: "thin-search-engine",
            description: () => "切换搜索引擎",
            available: () => true,
            ui: {
              kind: "popupSelect",
              options: async () => {
                const result = await bridgeDescribe();
                const view = result.ok ? result.value.namespaces.find((n) => n.ns === NS) : undefined;
                const current = view?.value?.provider ?? "anysearch";
                return ENGINES.map((e) => ({
                  id: e.id,
                  label: e.label,
                  detail: e.id === current ? "当前" : undefined,
                  active: e.id === current,
                }));
              },
              onSelect: async (option) => {
                const latest = await bridgeDescribe();
                const view = latest.ok ? latest.value.namespaces.find((n) => n.ns === NS) : undefined;
                if (!view || !Number.isSafeInteger(view.revision)) return;
                await bridgeMutate({
                  ns: NS,
                  ops: [{ op: "set", path: ["provider"], value: option.id }],
                  expectedRevision: view.revision,
                });
              },
            },
          });
          return dispose;
        }, "thin-search: /thin-search-engine command");
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
