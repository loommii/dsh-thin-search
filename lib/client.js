window.__ModuleLoader__.load({
  id: "dsh-thin-search",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");

    //#region css
    const css = [
      ".dsts-page{max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}",
      ".dsts-page h2{margin:0;font-size:18px;font-weight:600}",
      ".dsts-intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px}",
      ".dsts-sectionTitle{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;margin:14px 0 2px}",
      ".dsts-row{flex-direction:column;gap:6px;display:flex}",
      ".dsts-field{flex-direction:column;gap:4px;min-width:0;display:flex}",
      ".dsts-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500}",
      ".dsts-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin:0}",
      ".dsts-select{border:1px solid var(--dsw-alias-border-l2);font:inherit;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:6px;padding:6px 8px;font-size:13px;transition:border-color .13s,box-shadow .13s;width:100%}",
      ".dsts-select:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}",
      ".dsts-select{color-scheme:light dark}",
      ".dsts-select option,.dsts-select optgroup{background-color:#ffffff;color:#1f2328}",
      "@media (prefers-color-scheme:dark){.dsts-select{color-scheme:dark}.dsts-select option,.dsts-select optgroup{background-color:#1e1f24;color:#e8e8ea}}",
      ".dsts-input{border:1px solid var(--dsw-alias-border-l2);font:inherit;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:6px;padding:6px 8px;font-size:13px;transition:border-color .13s,box-shadow .13s;width:100%}",
      ".dsts-ttl{width:88px}",
      ".dsts-proxy-input{max-width:420px}",
      ".dsts-badgeRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".dsts-platforms{display:flex;flex-wrap:wrap;gap:6px 12px;padding-top:2px}",
      ".dsts-platform{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-primary);cursor:pointer}",
      ".dsts-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;padding:6px 10px;font-size:12px;font-weight:500;cursor:pointer;transition:border-color .13s,background .13s}",
      ".dsts-btn:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}",
      ".dsts-btn:disabled{opacity:.45;cursor:not-allowed}",
      ".dsts-btn.dsts-save{background:var(--dsw-alias-interactive-bg-primary);color:var(--dsw-alias-label-on-primary)}",
      ".dsts-btn.dsts-stop{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}",
      ".dsts-btn.dsts-stop:hover:not(:disabled){background:rgba(220,60,60,.08)}",
      ".dsts-link{color:var(--dsw-alias-link-primary);font-size:12px;text-decoration:none}",
      ".dsts-failed{color:var(--dsw-alias-state-error-primary);font-size:12px}",
      ".dsts-testOk{color:#7ddb9c;font-size:12px;line-height:1.5}",
      ".dsts-resultRow{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;margin-top:2px}",
      ".dsts-footer{justify-content:space-between;align-items:center;gap:8px;display:flex;flex-wrap:wrap}",
      ".dsts-footerRight{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".dsts-pending{color:var(--dsw-alias-state-warn-primary);white-space:nowrap;flex:none;font-size:12px}",
      ".dsts-restart{color:var(--dsw-alias-state-warn-primary);font-weight:600;white-space:nowrap;font-size:12px}",
      ".dsts-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}",
      ".dsts-switch input{position:absolute;opacity:0;width:0;height:0}",
      ".dsts-switchTrack{position:relative;width:36px;height:20px;border-radius:10px;background:var(--dsw-alias-border-l2);transition:background .15s;flex:none}",
      ".dsts-switchTrack::after{content:\"\";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.25)}",
      ".dsts-switch input:checked + .dsts-switchTrack{background:var(--dsw-alias-interactive-bg-primary)}",
      ".dsts-switch input:checked + .dsts-switchTrack::after{transform:translateX(16px)}",
      ".dsts-switch input:disabled + .dsts-switchTrack{opacity:.45}",
      ".dsts-switchState{color:var(--dsw-alias-label-tertiary);font-size:12px}",
      ".dsts-switchOn{color:var(--dsw-alias-interactive-bg-primary);font-weight:600}",
      ".dsts-warnRed{color:var(--dsw-alias-state-error-primary);font-weight:600}",
      ".dsts-enhanceRow{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%}",
      ".dsts-enhanceTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500}",
      ".dsts-testList{display:flex;flex-direction:column;gap:8px;width:100%;min-width:0}",
      ".dsts-testItem{display:flex;flex-direction:column;gap:2px;min-width:0}",
      ".dsts-testTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);text-decoration:none}",
      ".dsts-testTitle:hover{text-decoration:underline}",
      ".dsts-testUrl{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsts-testSnippet{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.4}",
      ".dsts-testEnhance{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:1.5;font-weight:500}",
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
      enhanceModelHint: "选择用于搜索增强的模型（消耗该模型的 Token）。留空 = 跟随 DSH 默认模型。",
      actions: "操作",
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

    // 独立设置页：设置 → 左侧导航「搜索引擎」
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
      const [provider, setProvider] = react.useState("anysearch");
      const [platforms, setPlatforms] = react.useState(ALL_PLATFORMS.map(([id]) => id));
      const [cacheTtl, setCacheTtl] = react.useState(5);
      const [searchEnhance, setSearchEnhance] = react.useState(false);
      const [enhanceModel, setEnhanceModel] = react.useState("");
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

      const load = react.useCallback(async () => {
        try {
          const result = await bridgeDescribe();
          if (result.ok) {
            const view = result.value.namespaces.find((n) => n.ns === NS);
            if (view) {
              const v = view.value ?? {};
              setProvider(v.provider ?? "anysearch");
              setPlatforms(Array.isArray(v.platforms) && v.platforms.length > 0 ? v.platforms : ALL_PLATFORMS.map(([id]) => id));
              setCacheTtl(v.cacheTtl === undefined ? 5 : Math.min(Math.max(Number(v.cacheTtl) ?? 5, 0), 5));
              setSearchEnhance(v.searchEnhance === true);
              setEnhanceModel(typeof v.enhanceModel === "string" ? v.enhanceModel : "");
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
        } catch {
          // 引擎模式不可用时保持默认，不阻塞页面
        }
        // 懒加载增强模型列表（不阻塞页面；失败静默，下拉为空）
        try {
          const modelsResult = await bridgeLlmModels();
          if (modelsResult.ok && Array.isArray(modelsResult.value?.groups)) {
            setModelGroups(modelsResult.value.groups);
          }
        } catch {
          // 忽略
        }
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
            { op: "set", path: ["proxy"], value: proxy.trim() },
          ];
          const result = await bridgeMutate({ ns: NS, ops });
          if (result.ok) {
            setDirty(false);
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

      if (state.status === "loading") return null;
      const ready = state.status === "ready";
      const currentEngine = ENGINES.find((e) => e.id === provider) ?? ENGINES[0];

      return react_jsx_runtime.jsx("div", {
        className: "dsts-page",
        children: [
          react_jsx_runtime.jsx("h2", { children: T.title }),
          react_jsx_runtime.jsx("p", { className: "dsts-intro", children: T.intro }),

          // ── 搜索提供方（免费引擎 / 官方 DeepSeek）──
          react_jsx_runtime.jsx("div", { className: "dsts-sectionTitle", children: T.mode }),
          react_jsx_runtime.jsx("div", {
            className: "dsts-row",
            children: [
              react_jsx_runtime.jsx("div", { className: "dsts-label", children: T.mode }),
              react_jsx_runtime.jsx("div", { className: "dsts-badgeRow", children: [
                react_jsx_runtime.jsx("select", {
                  className: "dsts-select",
                  value: engineMode,
                  style: { colorScheme: selectColorScheme, maxWidth: 340 },
                  disabled: !ready || modeSaving,
                  onChange: (e) => changeMode(e.target.value),
                  children: [
                    react_jsx_runtime.jsx("option", { value: "thin", children: T.modeThin }),
                    react_jsx_runtime.jsx("option", { value: "official", children: T.modeOfficial }),
                  ],
                }),
                modeSaving
                  ? react_jsx_runtime.jsx("span", { className: "dsts-pending", children: T.modeSaving })
                  : null,
                !engineModeApplied
                  ? react_jsx_runtime.jsx("span", { className: "dsts-restart", children: T.modeRestart })
                  : null,
                engineModeApplied && !modeSaving
                  ? react_jsx_runtime.jsx("span", { className: "dsts-testOk", children: T.modeApplied })
                  : null,
                modeFailed
                  ? react_jsx_runtime.jsx("span", { className: "dsts-failed", children: T.modeFail })
                  : null,
              ] }),
              react_jsx_runtime.jsx("p", { className: "dsts-hint", children: T.modeHint }),
            ],
          }),

          // ── 引擎 ──
          react_jsx_runtime.jsx("div", { className: "dsts-sectionTitle", children: T.engine }),
          react_jsx_runtime.jsx("div", {
            className: "dsts-row",
            children: [
              react_jsx_runtime.jsx("div", { className: "dsts-label", children: T.engineLabel }),
              react_jsx_runtime.jsx("div", { className: "dsts-badgeRow", children: [
                react_jsx_runtime.jsx("select", {
                  className: "dsts-select",
                  value: provider,
                  style: { colorScheme: selectColorScheme, maxWidth: 340 },
                  disabled: !ready || saving,
                  onChange: (e) => select(e.target.value),
                  children: ENGINES.map((engine) =>
                    react_jsx_runtime.jsx("option", { value: engine.id, children: engine.label }, engine.id)
                  ),
                }),
                currentEngine.link
                  ? react_jsx_runtime.jsx("a", {
                      className: "dsts-link",
                      href: currentEngine.link,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      children: T.visit,
                    })
                  : null,
              ] }),
              react_jsx_runtime.jsx("p", { className: "dsts-hint", children: T.engineHint }),
            ],
          }),

          // ── 平台搜索 ──
          react_jsx_runtime.jsx("div", { className: "dsts-sectionTitle", children: T.platforms }),
          react_jsx_runtime.jsx("div", {
            className: "dsts-row",
            children: [
              react_jsx_runtime.jsx("div", {
                className: "dsts-platforms",
                children: ALL_PLATFORMS.map(([id, label]) =>
                  react_jsx_runtime.jsx("label", {
                    className: "dsts-platform",
                    children: [
                      react_jsx_runtime.jsx("input", {
                        type: "checkbox",
                        checked: platforms.includes(id),
                        disabled: !ready || saving,
                        onChange: (e) => {
                          setPlatforms((prev) =>
                            e.target.checked ? [...prev, id] : prev.filter((p) => p !== id)
                          );
                          setDirty(true);
                          setFailed(false);
                        },
                      }),
                      label,
                    ],
                  }, id)
                ),
              }),
              react_jsx_runtime.jsx("p", { className: "dsts-hint", children: T.platformHint }),
            ],
          }),

          // ── 缓存 ──
          react_jsx_runtime.jsx("div", { className: "dsts-sectionTitle", children: T.cache }),
          react_jsx_runtime.jsx("div", {
            className: "dsts-row",
            children: [
              react_jsx_runtime.jsx("div", { className: "dsts-label", children: T.cacheLabel }),
              react_jsx_runtime.jsx("input", {
                className: "dsts-input dsts-ttl",
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
              react_jsx_runtime.jsx("p", { className: "dsts-hint", children: T.cacheHint }),
            ],
          }),

          // ── 网络代理 ──
          react_jsx_runtime.jsx("div", { className: "dsts-sectionTitle", children: T.proxy }),
          react_jsx_runtime.jsx("div", {
            className: "dsts-row",
            children: [
              react_jsx_runtime.jsx("div", { className: "dsts-label", children: T.proxy }),
              react_jsx_runtime.jsx("input", {
                className: "dsts-input dsts-proxy-input",
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
              react_jsx_runtime.jsx("p", { className: "dsts-hint", children: T.proxyHint }),
            ],
          }),

          // ── 搜索增强 ──
          react_jsx_runtime.jsx("div", { className: "dsts-enhanceRow", children: [
            react_jsx_runtime.jsx("span", { className: "dsts-enhanceTitle", children: T.enhance }),
            react_jsx_runtime.jsx("label", {
              className: "dsts-switch",
              children: [
                react_jsx_runtime.jsx("input", {
                  type: "checkbox",
                  checked: searchEnhance,
                  disabled: !ready || saving,
                  onChange: (e) => {
                    setSearchEnhance(e.target.checked);
                    setDirty(true);
                    setFailed(false);
                  },
                }),
                react_jsx_runtime.jsx("span", { className: "dsts-switchTrack" }),
                react_jsx_runtime.jsx("span", {
                  className: searchEnhance ? "dsts-switchState dsts-switchOn" : "dsts-switchState",
                  children: searchEnhance ? T.enhanceOn : T.enhanceOff,
                }),
              ],
            }),
          ] }),
          react_jsx_runtime.jsx("p", {
            className: "dsts-hint",
            children: [
              T.enhanceHintBefore,
              react_jsx_runtime.jsx("span", { className: "dsts-warnRed", children: T.enhanceToken }),
              T.enhanceHintAfter,
            ],
          }),
          react_jsx_runtime.jsx("div", {
            className: "dsts-row",
            children: [
              react_jsx_runtime.jsx("div", { className: "dsts-label", children: T.enhanceModelLabel }),
              react_jsx_runtime.jsx("select", {
                className: "dsts-select",
                value: enhanceModel,
                style: { colorScheme: selectColorScheme, maxWidth: 420 },
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
              react_jsx_runtime.jsx("p", { className: "dsts-hint", children: T.enhanceModelHint }),
            ],
          }),

          // ── 操作 ──
          react_jsx_runtime.jsx("div", { className: "dsts-sectionTitle", children: T.actions }),
          react_jsx_runtime.jsx("div", {
            className: "dsts-resultRow",
            children: [
              failed ? react_jsx_runtime.jsx("span", { className: "dsts-failed", children: T.saveFailed }) : null,
              testing ? react_jsx_runtime.jsx("span", { className: "dsts-pending", children: T.testing }) : null,
              testResult && !testResult.ok
                ? react_jsx_runtime.jsx("span", {
                    className: "dsts-failed",
                    children: testResult.stopped ? T.stopped : T.testFail(testResult.error),
                  })
                : null,
              testResult && testResult.ok
                ? react_jsx_runtime.jsx(react.Fragment, {
                    children: [
                      react_jsx_runtime.jsx("span", { className: "dsts-testOk", children: T.testOk(testResult) }),
                      testResult.enhance
                        ? react_jsx_runtime.jsx("span", {
                            className: testResult.enhance.error ? "dsts-failed" : "dsts-testEnhance",
                            children: testResult.enhance.error
                              ? T.testEnhanceFail(testResult.enhance)
                              : T.testEnhance(testResult.enhance),
                          })
                        : null,
                      testResult.sources && testResult.sources.length > 0
                        ? react_jsx_runtime.jsx("div", {
                            className: "dsts-testList",
                            children: testResult.sources.map((s, i) =>
                              react_jsx_runtime.jsx("div", {
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
                            ),
                          })
                        : null,
                    ],
                  })
                : null,
            ],
          }),
          !ready
            ? react_jsx_runtime.jsx("p", { className: "dsts-hint", children: T.unavailable })
            : null,
          react_jsx_runtime.jsx("div", {
            className: "dsts-footer",
            children: [
              react_jsx_runtime.jsx("div", { className: "dsts-footerRight", children: [
                react_jsx_runtime.jsx("button", {
                  className: testing ? "dsts-btn dsts-stop" : "dsts-btn",
                  type: "button",
                  onClick: testing ? stopTest : runTest,
                  disabled: saving || !ready,
                  children: testing ? T.stopTest : T.testEngine,
                }),
                react_jsx_runtime.jsx("button", {
                  className: "dsts-btn",
                  type: "button",
                  onClick: () => {
                    setProvider("anysearch");
                    setDirty(true);
                    setFailed(false);
                  },
                  disabled: saving || !ready || provider === "anysearch",
                  children: T.restoreDefault,
                }),
                react_jsx_runtime.jsx("button", {
                  className: "dsts-btn",
                  type: "button",
                  onClick: discard,
                  disabled: saving || !dirty,
                  children: T.discard,
                }),
                react_jsx_runtime.jsx("button", {
                  className: "dsts-btn dsts-save",
                  type: "button",
                  onClick: save,
                  disabled: saving || !dirty || !ready,
                  children: saving ? T.saving : T.save,
                }),
              ] }),
            ],
          }),
        ],
      });
    }

    const inject = ["slots", "commandUi"];

    function apply(ctx) {
      // 独立设置页：设置 → 左侧导航「搜索引擎」
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
      // /thin-search-engine 弹出式命令
      ctx.inject(["commandUi"], (sctx) => {
        const command = sctx.get("commandUi");
        sctx.effect(() => {
          const dispose = command.register({
            name: "thin-search-engine",
            description: "切换搜索引擎",
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
                await bridgeMutate({ ns: NS, ops: [{ op: "set", path: ["provider"], value: option.id }] });
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
