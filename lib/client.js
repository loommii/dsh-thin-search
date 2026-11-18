window.__ModuleLoader__.load({ id: "dsh-thin-search", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");

// src/client/config.ts
/** Settings namespace the plugin row declares in `cordis.patch.yml`. */
const THIN_SEARCH_NAMESPACE = "thin-search";
/** Settings namespace the web capability owns; its `searchProvider` selects the backend. */
const WEB_NAMESPACE = "web";
/** Slot a bundle's row configuration registers into. */
const ROW_CONFIG_SLOT = "plugins.row.config";
/** Key joining this bundle's package name and the row id the patch declares. */
const ROW_CONFIG_KEY = "dsh-thin-search#thin-search";
/** Client command that switches the preferred free engine. */
const COMMAND_NAME = "thin-search-engine";
/** Locale namespace owned by this client plugin. */
const LOCALE_NAMESPACE = "thin-search";
/** `web` settings field the global provider switch writes. */
const SEARCH_PROVIDER_FIELD = "searchProvider";
/** Thin Search settings field the preferred-engine switch writes. */
const ENGINE_FIELD = "provider";
/** Free engines in fallback order; the first one is the default. */
const ENGINE_IDS = [
	"bing",
	"anysearch",
	"searxng",
	"ddg",
	"ddg-lite"
];
/** Default engine, matching the Host schema. */
const DEFAULT_ENGINE = "bing";
/** Platform adapters the plugin ships, in the Host's default order. */
const PLATFORM_IDS = [
	"github",
	"v2ex",
	"bilibili",
	"reddit",
	"hn",
	"stackoverflow",
	"wikipedia",
	"npm"
];
/** Whether `value` names a free engine this client can offer. */
function isEngineId(value) {
	return typeof value === "string" && ENGINE_IDS.includes(value);
}
/** Whether `value` names a platform adapter the plugin ships. */
function isPlatformId(value) {
	return typeof value === "string" && PLATFORM_IDS.includes(value);
}
/** Defaults used when an accepted section omits a field. These mirror the Host schema. */
const DEFAULT_DRAFT = Object.freeze({
	provider: DEFAULT_ENGINE,
	platforms: Object.freeze([...PLATFORM_IDS]),
	cacheTtl: 5,
	searchEnhance: false,
	enhanceModel: "",
	enhanceSystemPromptPath: "",
	bingMarket: "zh-CN",
	region: "",
	searxngText: ""
});
/** Keep platform ids in the Host's canonical order, without duplicates. */
function canonicalPlatforms(value) {
	const selected = new Set(value);
	return PLATFORM_IDS.filter((id) => selected.has(id));
}
/** Split a SearXNG textarea into normalized entries and the lines that are not absolute http(s) URLs. */
function parseSearxngInstances(text) {
	const instances = [];
	const invalid = [];
	const seen = /* @__PURE__ */ new Set();
	for (const raw of text.split(/\r?\n/u)) {
		const entry = raw.trim();
		if (entry.length === 0) continue;
		let url;
		try {
			url = new URL(entry);
		} catch {
			invalid.push(entry);
			continue;
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			invalid.push(entry);
			continue;
		}
		const normalized = entry.replace(/\/+$/u, "");
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		instances.push(normalized);
	}
	return {
		instances,
		invalid
	};
}
/** Read one string field, trimmed, with a fallback when it is absent. */
function readString(value, fallback) {
	return typeof value === "string" ? value.trim() : fallback;
}
/** Read one non-negative whole-number field. */
function readCount(value, fallback) {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}
/** Turn an accepted Host section into the page's editable draft. */
function normalizeDraft(value) {
	const section = typeof value === "object" && value !== null ? value : {};
	const platforms = Array.isArray(section.platforms) ? section.platforms.filter(isPlatformId) : [...DEFAULT_DRAFT.platforms];
	const instances = Array.isArray(section.searxngInstances) ? section.searxngInstances.filter((entry) => typeof entry === "string") : [];
	return {
		provider: isEngineId(section.provider) ? section.provider : DEFAULT_DRAFT.provider,
		platforms: canonicalPlatforms(platforms),
		cacheTtl: readCount(section.cacheTtl, DEFAULT_DRAFT.cacheTtl),
		searchEnhance: section.searchEnhance === true,
		enhanceModel: readString(section.enhanceModel, DEFAULT_DRAFT.enhanceModel),
		enhanceSystemPromptPath: readString(section.enhanceSystemPromptPath, DEFAULT_DRAFT.enhanceSystemPromptPath),
		bingMarket: readString(section.bingMarket, DEFAULT_DRAFT.bingMarket),
		region: readString(section.region, DEFAULT_DRAFT.region),
		searxngText: instances.join("\n")
	};
}
/** Whether two ordered string lists carry the same entries. */
function sameList(left, right) {
	return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
/** Validate the draft before it reaches the Host. */
function validateDraft(draft) {
	const errors = [];
	if (!Number.isInteger(draft.cacheTtl) || draft.cacheTtl < 0) errors.push({ key: "validation.cacheTtl" });
	const path = draft.enhanceSystemPromptPath.trim();
	if (path !== "" && !path.startsWith("~/") && !path.startsWith("/")) errors.push({ key: "validation.enhanceSystemPromptPath" });
	const { invalid } = parseSearxngInstances(draft.searxngText);
	if (invalid.length > 0) errors.push({
		key: "validation.searxng",
		params: { entries: invalid.join(", ") }
	});
	return errors;
}
/**
* Compare the draft with the accepted section and return only the writes that
* changed. Fields compare in their normalized form so an untouched field never
* produces a write.
*/
function draftOps(draft, accepted) {
	const base = normalizeDraft(accepted);
	const ops = [];
	if (draft.provider !== base.provider) ops.push({
		op: "set",
		path: [ENGINE_FIELD],
		value: draft.provider
	});
	const platforms = canonicalPlatforms(draft.platforms);
	if (!sameList(platforms, base.platforms)) ops.push({
		op: "set",
		path: ["platforms"],
		value: platforms
	});
	if (draft.cacheTtl !== base.cacheTtl) ops.push({
		op: "set",
		path: ["cacheTtl"],
		value: draft.cacheTtl
	});
	if (draft.searchEnhance !== base.searchEnhance) ops.push({
		op: "set",
		path: ["searchEnhance"],
		value: draft.searchEnhance
	});
	const model = draft.enhanceModel.trim();
	if (model !== base.enhanceModel) ops.push({
		op: "set",
		path: ["enhanceModel"],
		value: model
	});
	const promptPath = draft.enhanceSystemPromptPath.trim();
	if (promptPath !== base.enhanceSystemPromptPath) ops.push({
		op: "set",
		path: ["enhanceSystemPromptPath"],
		value: promptPath
	});
	const bingMarket = draft.bingMarket.trim();
	if (bingMarket !== base.bingMarket) ops.push({
		op: "set",
		path: ["bingMarket"],
		value: bingMarket
	});
	const region = draft.region.trim();
	if (region !== base.region) ops.push({
		op: "set",
		path: ["region"],
		value: region
	});
	const { instances } = parseSearxngInstances(draft.searxngText);
	if (!sameList(instances, parseSearxngInstances(base.searxngText).instances)) ops.push({
		op: "set",
		path: ["searxngInstances"],
		value: instances
	});
	return ops;
}

// src/client/locales.ts
/** English dictionary; its key union is the namespace's message key type. */
const en = {
	summary: "Free, keyless web search with engine fallback, result caching, optional model enhancement, and platform search.",
	"page.title": "Thin Search",
	"page.intro": "Free, keyless web search. Choose the provider that serves web search, then tune the free engines behind Thin Search.",
	"status.loading": "Loading settings…",
	"status.unavailable": "Thin Search settings are not served by this deployment.",
	"status.readOnly": "This deployment stores settings read-only.",
	"status.unsaved": "Unsaved changes",
	"status.saved": "Saved",
	"status.saveFailed": "Save failed. The Host rejected the change.",
	"status.saving": "Saving…",
	"status.invalid": "Fix the highlighted fields before saving.",
	"actions.save": "Save",
	"actions.discard": "Discard changes",
	"provider.title": "Search provider",
	"provider.description": "Which provider answers web search and the web_search tool for every Agent.",
	"provider.label": "Web search provider",
	"provider.hint": "The switch writes the global web.searchProvider setting immediately; no restart is needed.",
	"provider.none": "No provider selected",
	"provider.missingOption": "{id} (not registered)",
	"provider.loading": "Loading registered providers…",
	"provider.error": "Could not load the registered providers.",
	"provider.retry": "Retry",
	"provider.switchFailed": "The Host refused the provider change.",
	"provider.unavailable": "The web settings namespace is not served, so the provider cannot be switched here.",
	"provider.current": "Current provider: {name}",
	"engine.title": "Preferred engine",
	"engine.description": "The free engine Thin Search tries first; failures fall back automatically.",
	"engine.label": "First engine",
	"engine.hint": "Bing is the default. AnySearch handles Chinese questions well; SearXNG, DuckDuckGo HTML, and Lite may need network access.",
	"engine.bing": "Bing",
	"engine.anysearch": "AnySearch",
	"engine.searxng": "SearXNG",
	"engine.ddg": "DuckDuckGo HTML",
	"engine.ddg-lite": "DuckDuckGo Lite",
	"enhance.title": "Search enhancement",
	"enhance.description": "Rewrite conversational input into search keywords with one model call.",
	"enhance.toggle": "Enable search enhancement",
	"enhance.hint": "Off by default. While on, each cache miss makes one extra model call and spends tokens.",
	"enhance.modelLabel": "Enhancement model",
	"enhance.modelPlaceholder": "provider:model",
	"enhance.modelHint": "Leave empty to use the current Agent model. A provider:model override must name an installed model; this page offers no model list.",
	"enhance.promptPathLabel": "System prompt file",
	"enhance.promptPathPlaceholder": "~/.dsh/thin-search/system-prompt.md",
	"enhance.promptPathHint": "Leave empty to use the built-in prompt. Supports ~/... or an absolute path.",
	"platforms.title": "Platform search",
	"platforms.description": "Enable the platforms the platform_search tool may query.",
	"platforms.legend": "Enabled platforms",
	"platforms.hint": "Disabled platforms are skipped. V2EX returns hot posts only; Bilibili and Reddit may be rate-limited.",
	"platforms.allDisabled": "No platform is enabled; platform_search will answer with an error.",
	"platform.github": "GitHub",
	"platform.v2ex": "V2EX",
	"platform.bilibili": "Bilibili",
	"platform.reddit": "Reddit",
	"platform.hn": "Hacker News",
	"platform.stackoverflow": "Stack Overflow",
	"platform.wikipedia": "Wikipedia",
	"platform.npm": "npm",
	"advanced.title": "Advanced settings",
	"advanced.description": "Cache lifetime and per-engine parameters.",
	"advanced.cacheLabel": "Result cache (minutes)",
	"advanced.cacheHint": "0 disables the cache. A cache hit is served before any enhancement call.",
	"advanced.bingMarketLabel": "Bing market",
	"advanced.bingMarketHint": "Bing mkt value, for example zh-CN; empty uses the deployment default.",
	"advanced.regionLabel": "DuckDuckGo region",
	"advanced.regionHint": "DuckDuckGo kl value, for example cn-zh; empty leaves the default.",
	"advanced.searxngLabel": "SearXNG instances",
	"advanced.searxngPlaceholder": "https://searx.example.com",
	"advanced.searxngHint": "One absolute http(s) base URL per line. Empty uses the built-in instance list.",
	"validation.cacheTtl": "Use a whole number of minutes, 0 or greater.",
	"validation.enhanceSystemPromptPath": "Use ~/... or an absolute path.",
	"validation.searxng": "These entries are not absolute http(s) URLs: {entries}",
	"command.label": "Thin Search engine",
	"command.description": "Choose the free engine Thin Search tries first.",
	"command.current": "current",
	"command.searchPlaceholder": "Search engines",
	"command.searchEmpty": "No engines available.",
	"command.searchNoResults": "No matching engines."
};
/** Chinese dictionary, key-for-key identical to {@link en}. */
const zh = {
	summary: "免密钥的免费网页搜索：引擎回退、结果缓存、可选模型增强与平台搜索。",
	"page.title": "Thin Search",
	"page.intro": "免费、免密钥的网页搜索。先选择提供网页搜索的提供方，再调整 Thin Search 使用的免费引擎。",
	"status.loading": "正在加载设置…",
	"status.unavailable": "当前部署未提供 Thin Search 设置。",
	"status.readOnly": "当前部署的设置为只读。",
	"status.unsaved": "有未保存的修改",
	"status.saved": "已保存",
	"status.saveFailed": "保存失败：Host 拒绝了这次修改。",
	"status.saving": "正在保存…",
	"status.invalid": "请先修正标出的字段再保存。",
	"actions.save": "保存",
	"actions.discard": "撤销修改",
	"provider.title": "搜索提供方",
	"provider.description": "选择由哪个提供方为所有 Agent 的网页搜索与 web_search 工具提供结果。",
	"provider.label": "网页搜索提供方",
	"provider.hint": "切换会立即写入全局 web.searchProvider 设置，无需重启。",
	"provider.none": "未选择提供方",
	"provider.missingOption": "{id}（未注册）",
	"provider.loading": "正在加载已注册的提供方…",
	"provider.error": "无法加载已注册的提供方。",
	"provider.retry": "重试",
	"provider.switchFailed": "Host 拒绝了提供方切换。",
	"provider.unavailable": "当前部署未提供 web 设置命名空间，无法在此切换提供方。",
	"provider.current": "当前提供方：{name}",
	"engine.title": "首选引擎",
	"engine.description": "Thin Search 首先尝试的免费引擎；失败后会自动回退。",
	"engine.label": "首选引擎",
	"engine.hint": "默认使用 Bing。AnySearch 对中文问句效果较好；SearXNG、DuckDuckGo HTML 与 Lite 可能需要外网访问。",
	"engine.bing": "Bing",
	"engine.anysearch": "AnySearch",
	"engine.searxng": "SearXNG",
	"engine.ddg": "DuckDuckGo HTML",
	"engine.ddg-lite": "DuckDuckGo Lite",
	"enhance.title": "搜索增强",
	"enhance.description": "用一次模型调用把口语化输入改写为搜索关键词。",
	"enhance.toggle": "启用搜索增强",
	"enhance.hint": "默认关闭。开启后每次缓存未命中都会额外调用一次模型并消耗 token。",
	"enhance.modelLabel": "增强模型",
	"enhance.modelPlaceholder": "provider:model",
	"enhance.modelHint": "留空则使用当前 Agent 模型。provider:model 覆盖必须指向已安装模型；本页不提供模型下拉列表。",
	"enhance.promptPathLabel": "系统提示词文件",
	"enhance.promptPathPlaceholder": "~/.dsh/thin-search/system-prompt.md",
	"enhance.promptPathHint": "留空则使用内置提示词。支持 ~/... 或绝对路径。",
	"platforms.title": "平台搜索",
	"platforms.description": "启用 platform_search 工具可查询的平台。",
	"platforms.legend": "已启用的平台",
	"platforms.hint": "禁用的平台会被跳过。V2EX 仅返回热帖；Bilibili 与 Reddit 可能受风控限制。",
	"platforms.allDisabled": "未启用任何平台；platform_search 将返回错误。",
	"platform.github": "GitHub",
	"platform.v2ex": "V2EX",
	"platform.bilibili": "Bilibili",
	"platform.reddit": "Reddit",
	"platform.hn": "Hacker News",
	"platform.stackoverflow": "Stack Overflow",
	"platform.wikipedia": "Wikipedia",
	"platform.npm": "npm",
	"advanced.title": "高级设置",
	"advanced.description": "缓存时长与各引擎参数。",
	"advanced.cacheLabel": "结果缓存（分钟）",
	"advanced.cacheHint": "0 关闭缓存。命中缓存时不会调用增强模型。",
	"advanced.bingMarketLabel": "Bing 市场",
	"advanced.bingMarketHint": "Bing mkt 值，例如 zh-CN；留空使用部署默认。",
	"advanced.regionLabel": "DuckDuckGo 区域",
	"advanced.regionHint": "DuckDuckGo kl 值，例如 cn-zh；留空使用默认。",
	"advanced.searxngLabel": "SearXNG 实例",
	"advanced.searxngPlaceholder": "https://searx.example.com",
	"advanced.searxngHint": "每行一个绝对 http(s) 基础 URL。留空使用内置实例列表。",
	"validation.cacheTtl": "请填写大于或等于 0 的整数分钟数。",
	"validation.enhanceSystemPromptPath": "请使用 ~/... 或绝对路径。",
	"validation.searxng": "以下条目不是绝对 http(s) URL：{entries}",
	"command.label": "Thin Search 引擎",
	"command.description": "选择 Thin Search 首先尝试的免费引擎。",
	"command.current": "当前",
	"command.searchPlaceholder": "搜索引擎",
	"command.searchEmpty": "没有可用引擎。",
	"command.searchNoResults": "没有匹配的引擎。"
};
/** Message key of one engine's display name. */
function engineLabelKey(id) {
	return `engine.${id}`;
}
/** Message key of one platform's display name. */
function platformLabelKey(id) {
	return `platform.${id}`;
}
/** The baseline dictionaries registered for this namespace. */
const DICTIONARIES = {
	en,
	zh
};

// src/client/command.ts
/**
* The "/thin-search-engine" client command: a popup that lists the five free
* engines and writes the chosen one through
* `ctx.configForms.get('thin-search').set('provider', id)`.
*
* The popup only reads and writes the thin-search ConfigForm; it never touches
* deployment storage or a custom transport.
* @module dsh-thin-search/client/command
*/
/** Build the command contribution from the shared runtime. */
function createEngineCommand(source) {
	return {
		name: COMMAND_NAME,
		label: () => source.t("command.label"),
		description: () => source.t("command.description"),
		available: () => true,
		ui: {
			kind: "popupSelect",
			searchLabels: () => ({
				placeholder: source.t("command.searchPlaceholder"),
				empty: source.t("command.searchEmpty"),
				noResults: source.t("command.searchNoResults")
			}),
			options: async () => {
				const current = source.currentEngine();
				return ENGINE_IDS.map((id) => ({
					id,
					label: source.t(engineLabelKey(id)),
					...id === current ? {
						detail: source.t("command.current"),
						active: true
					} : {}
				}));
			},
			onSelect: async (option) => {
				if (!isEngineId(option.id)) return;
				await source.setPreferredEngine(option.id);
			}
		}
	};
}

// src/client/components/index.tsx
/** Build the `aria-describedby` value for one control. */
function describedBy(id, hint, error) {
	const ids = [hint === void 0 ? void 0 : `${id}-hint`, error === void 0 ? void 0 : `${id}-error`].filter((value) => value !== void 0);
	return ids.length === 0 ? void 0 : ids.join(" ");
}
/** One labelled field row. */
function Field({ id, label, hint, error, children }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsts-field",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
				className: "dsts-label",
				htmlFor: id,
				children: label
			}),
			children,
			hint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-hint",
				id: `${id}-hint`,
				children: hint
			}),
			error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-error",
				id: `${id}-error`,
				role: "alert",
				children: error
			})
		]
	});
}
/** One page card. */
function Section({ title, description, children }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dsts-card",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
				className: "dsts-cardTitle",
				children: title
			}),
			description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-cardDesc",
				children: description
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsts-cardBody",
				children
			})
		]
	});
}
/** A labelled switch that never nests a second interactive element. */
function Switch({ id, control, label, hint, checked, disabled, onToggle }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsts-field dsts-fieldRow",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsts-fieldText",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsts-label",
				id: `${id}-label`,
				children: label
			}), hint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-hint",
				id: `${id}-hint`,
				children: hint
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			id,
			type: "button",
			role: "switch",
			"data-control": control,
			"aria-checked": checked,
			"aria-labelledby": `${id}-label`,
			"aria-describedby": hint === void 0 ? void 0 : `${id}-hint`,
			className: checked ? "dsts-switch dsts-switchOn" : "dsts-switch",
			disabled,
			onClick: () => {
				onToggle(!checked);
			},
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsts-switchThumb",
				"aria-hidden": "true"
			})
		})]
	});
}

// src/client/save.ts
/**
* One save step for the row page: validate the draft, diff it against the
* accepted section, and submit the changed fields through the owner form's
* `mutate` with the revision the editor read.
* @module dsh-thin-search/client/save
*/
/**
* Submit the draft through the owner form. An invalid draft never reaches the
* Host; an unchanged draft submits no operation; a transport failure is
* reported without throwing into React's event handler.
* @param form - the page's owner form handoff.
* @param draft - the edited values.
* @returns the outcome the page localizes.
*/
async function saveDraft(form, draft) {
	const errors = validateDraft(draft);
	if (errors.length > 0) return {
		status: "invalid",
		errors
	};
	const ops = draftOps(draft, form.state.value);
	if (ops.length === 0) return {
		status: "unchanged",
		errors: []
	};
	try {
		return {
			status: await form.mutate(ops, form.state.revision) ? "saved" : "rejected",
			errors: []
		};
	} catch {
		return {
			status: "failed",
			errors: []
		};
	}
}

// src/client/page.tsx
/**
* The Thin Search row page on the Plugins page.
*
* The page reads the accepted section from the owner form props and saves
* every edit through the owner's `mutate`; the global provider card is the one
* other surface, and it reads `web` through ConfigForms and switches with
* `configForms.get('web').set('searchProvider', id)`. All copy comes from
* `ctx.locale`; all controls are native and theme-token styled.
* @module dsh-thin-search/client/page
*/
/**
* The `plugins.row.config` component: the summary line for a row without a
* package description, and the full page for `view: 'page'`.
*/
function ThinSearchRowConfig({ view, form, runtime }) {
	if (view === "summary") return runtime.t("summary");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThinSearchPage, {
		form,
		runtime
	});
}
/** Subscribe one ConfigForm snapshot through React's external store. */
function useConfigFormSnapshot(form) {
	const subscribe = (0, react.useCallback)((listener) => form.subscribe(listener), [form]);
	const snapshot = (0, react.useCallback)(() => form.getSnapshot(), [form]);
	return (0, react.useSyncExternalStore)(subscribe, snapshot, snapshot);
}
/** The page shell shared by the loading, unavailable, and ready branches. */
function PageFrame({ runtime, busy, children }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dsts-page",
		"aria-busy": busy,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
			className: "dsts-header",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "dsts-title",
				children: runtime.t("page.title")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-intro",
				children: runtime.t("page.intro")
			})]
		}), children]
	});
}
/** The page body. */
function ThinSearchPage({ form, runtime }) {
	const t = runtime.t;
	const state = form?.state;
	const [draft, setDraft] = (0, react.useState)(() => normalizeDraft(state?.value));
	const [syncedRevision, setSyncedRevision] = (0, react.useState)(state?.revision);
	const [fieldErrors, setFieldErrors] = (0, react.useState)([]);
	const [saveState, setSaveState] = (0, react.useState)("idle");
	const [saving, setSaving] = (0, react.useState)(false);
	const [providerError, setProviderError] = (0, react.useState)(false);
	const webState = useConfigFormSnapshot(runtime.webForm);
	const providers = (0, react.useSyncExternalStore)(runtime.subscribeProviders, runtime.getProvidersSnapshot, runtime.getProvidersSnapshot);
	(0, react.useEffect)(() => {
		runtime.ensureProviders();
	}, [runtime]);
	(0, react.useEffect)(() => {
		if (state?.revision === syncedRevision) return;
		setSyncedRevision(state?.revision);
		setDraft(normalizeDraft(state?.value));
		setFieldErrors([]);
		setSaveState("idle");
	}, [
		state?.revision,
		state?.value,
		syncedRevision
	]);
	const editable = state?.status === "ready" && state.writable && !saving;
	const dirty = draftOps(draft, state?.value).length > 0;
	const errorText = (key) => {
		const error = fieldErrors.find((candidate) => candidate.key === key);
		return error === void 0 ? void 0 : t(error.key, error.params);
	};
	const togglePlatform = (id) => {
		const selected = new Set(draft.platforms);
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
		setDraft({
			...draft,
			platforms: canonicalPlatforms([...selected])
		});
	};
	const discard = () => {
		setDraft(normalizeDraft(state?.value));
		setFieldErrors([]);
		setSaveState("idle");
	};
	const submit = async () => {
		if (form === void 0 || !editable) return;
		const errors = validateDraft(draft);
		if (errors.length > 0) {
			setFieldErrors(errors);
			setSaveState("invalid");
			return;
		}
		setSaving(true);
		setSaveState("idle");
		try {
			const outcome = await saveDraft(form, draft);
			setFieldErrors(outcome.errors);
			setSaveState(outcome.status === "saved" || outcome.status === "unchanged" ? "saved" : outcome.status === "invalid" ? "invalid" : "failed");
		} finally {
			setSaving(false);
		}
	};
	const switchProvider = async (id) => {
		setProviderError(false);
		try {
			if (!await runtime.setSearchProvider(id)) setProviderError(true);
		} catch {
			setProviderError(true);
		}
	};
	const statusText = saveState === "saved" ? t("status.saved") : saveState === "failed" ? t("status.saveFailed") : saveState === "invalid" ? t("status.invalid") : dirty ? t("status.unsaved") : "";
	if (form === void 0 || state === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageFrame, {
		runtime,
		busy: false,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "dsts-status",
			role: "status",
			children: t("status.unavailable")
		})
	});
	if (state.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageFrame, {
		runtime,
		busy: true,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "dsts-status",
			role: "status",
			children: t("status.loading")
		})
	});
	if (state.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageFrame, {
		runtime,
		busy: false,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "dsts-status",
			role: "status",
			children: t("status.unavailable")
		})
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(PageFrame, {
		runtime,
		busy: saving,
		children: [
			state.writable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-status",
				children: t("status.readOnly")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderCard, {
				runtime,
				webState,
				providers,
				providerError,
				onSelect: (id) => {
					switchProvider(id);
				},
				onRetry: () => {
					runtime.refreshProviders();
				}
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, {
				title: t("engine.title"),
				description: t("engine.description"),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
					id: "dsts-engine",
					label: t("engine.label"),
					hint: t("engine.hint"),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						id: "dsts-engine",
						"data-control": "engine",
						className: "dsts-select",
						value: draft.provider,
						disabled: !editable,
						"aria-describedby": describedBy("dsts-engine", t("engine.hint"), void 0),
						onChange: (event) => {
							const next = event.currentTarget.value;
							if (isEngineId(next)) setDraft({
								...draft,
								provider: next
							});
						},
						children: ENGINE_IDS.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: id,
							children: t(engineLabelKey(id))
						}, id))
					})
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
				title: t("enhance.title"),
				description: t("enhance.description"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
						id: "dsts-enhance",
						control: "enhance",
						label: t("enhance.toggle"),
						hint: t("enhance.hint"),
						checked: draft.searchEnhance,
						disabled: !editable,
						onToggle: (next) => {
							setDraft({
								...draft,
								searchEnhance: next
							});
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
						id: "dsts-enhance-model",
						label: t("enhance.modelLabel"),
						hint: t("enhance.modelHint"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "dsts-enhance-model",
							"data-control": "enhance-model",
							className: "dsts-input",
							type: "text",
							value: draft.enhanceModel,
							placeholder: t("enhance.modelPlaceholder"),
							disabled: !editable || !draft.searchEnhance,
							"aria-describedby": describedBy("dsts-enhance-model", t("enhance.modelHint"), void 0),
							onChange: (event) => {
								setDraft({
									...draft,
									enhanceModel: event.currentTarget.value
								});
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
						id: "dsts-enhance-prompt",
						label: t("enhance.promptPathLabel"),
						hint: t("enhance.promptPathHint"),
						error: errorText("validation.enhanceSystemPromptPath"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "dsts-enhance-prompt",
							"data-control": "enhance-prompt-path",
							className: "dsts-input",
							type: "text",
							value: draft.enhanceSystemPromptPath,
							placeholder: t("enhance.promptPathPlaceholder"),
							disabled: !editable || !draft.searchEnhance,
							"aria-describedby": describedBy("dsts-enhance-prompt", t("enhance.promptPathHint"), errorText("validation.enhanceSystemPromptPath")),
							onChange: (event) => {
								setDraft({
									...draft,
									enhanceSystemPromptPath: event.currentTarget.value
								});
							}
						})
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
				title: t("platforms.title"),
				description: t("platforms.description"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
					className: "dsts-platforms",
					disabled: !editable,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", {
						className: "dsts-legend",
						children: t("platforms.legend")
					}), PLATFORM_IDS.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsts-platform",
						htmlFor: `dsts-platform-${id}`,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: `dsts-platform-${id}`,
							"data-control": "platforms",
							type: "checkbox",
							checked: draft.platforms.includes(id),
							disabled: !editable,
							onChange: () => {
								togglePlatform(id);
							}
						}), t(platformLabelKey(id))]
					}, id))]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsts-hint",
					children: draft.platforms.length === 0 ? t("platforms.allDisabled") : t("platforms.hint")
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
				title: t("advanced.title"),
				description: t("advanced.description"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
						id: "dsts-cache-ttl",
						label: t("advanced.cacheLabel"),
						hint: t("advanced.cacheHint"),
						error: errorText("validation.cacheTtl"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "dsts-cache-ttl",
							"data-control": "cache-ttl",
							className: "dsts-input",
							type: "number",
							min: 0,
							step: 1,
							value: draft.cacheTtl,
							disabled: !editable,
							"aria-describedby": describedBy("dsts-cache-ttl", t("advanced.cacheHint"), errorText("validation.cacheTtl")),
							onChange: (event) => {
								const next = Number(event.currentTarget.value);
								setDraft({
									...draft,
									cacheTtl: Number.isFinite(next) ? next : 0
								});
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
						id: "dsts-bing-market",
						label: t("advanced.bingMarketLabel"),
						hint: t("advanced.bingMarketHint"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "dsts-bing-market",
							"data-control": "bing-market",
							className: "dsts-input",
							type: "text",
							value: draft.bingMarket,
							disabled: !editable,
							"aria-describedby": describedBy("dsts-bing-market", t("advanced.bingMarketHint"), void 0),
							onChange: (event) => {
								setDraft({
									...draft,
									bingMarket: event.currentTarget.value
								});
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
						id: "dsts-region",
						label: t("advanced.regionLabel"),
						hint: t("advanced.regionHint"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "dsts-region",
							"data-control": "region",
							className: "dsts-input",
							type: "text",
							value: draft.region,
							disabled: !editable,
							"aria-describedby": describedBy("dsts-region", t("advanced.regionHint"), void 0),
							onChange: (event) => {
								setDraft({
									...draft,
									region: event.currentTarget.value
								});
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
						id: "dsts-searxng",
						label: t("advanced.searxngLabel"),
						hint: t("advanced.searxngHint"),
						error: errorText("validation.searxng"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							id: "dsts-searxng",
							"data-control": "searxng-instances",
							className: "dsts-textarea",
							rows: 3,
							value: draft.searxngText,
							placeholder: t("advanced.searxngPlaceholder"),
							disabled: !editable,
							"aria-describedby": describedBy("dsts-searxng", t("advanced.searxngHint"), errorText("validation.searxng")),
							onChange: (event) => {
								setDraft({
									...draft,
									searxngText: event.currentTarget.value
								});
							}
						})
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
				className: "dsts-footer",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsts-actions",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsts-btn dsts-btnOutline",
						"data-control": "discard",
						disabled: !editable || !dirty,
						onClick: discard,
						children: t("actions.discard")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsts-btn dsts-btnPrimary",
						"data-control": "save",
						disabled: !editable || !dirty,
						onClick: () => {
							submit();
						},
						children: saving ? t("status.saving") : t("actions.save")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsts-status",
					role: "status",
					"aria-live": "polite",
					children: statusText
				})]
			})
		]
	});
}
/** The global provider card: lists the Host's registered search providers. */
function ProviderCard({ runtime, webState, providers, providerError, onSelect, onRetry }) {
	const t = runtime.t;
	const list = providers.providers;
	const selected = webState.value?.searchProvider ?? "";
	const selectedInfo = list.find((provider) => provider.id === selected);
	const missing = selected !== "" && selectedInfo === void 0;
	const loading = providers.status === "loading" && list.length === 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
		title: t("provider.title"),
		description: t("provider.description"),
		children: [
			providers.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsts-inlineAlert",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsts-error",
					role: "alert",
					children: t("provider.error")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsts-btn dsts-btnOutline",
					"data-control": "provider-retry",
					onClick: onRetry,
					children: t("provider.retry")
				})]
			}) : null,
			webState.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-status",
				children: t("provider.unavailable")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
				id: "dsts-provider",
				label: t("provider.label"),
				hint: t("provider.hint"),
				error: providerError ? t("provider.switchFailed") : void 0,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
					id: "dsts-provider",
					"data-control": "provider",
					className: "dsts-select",
					value: selected,
					disabled: webState.status !== "ready" || !webState.writable || loading,
					"aria-describedby": describedBy("dsts-provider", t("provider.hint"), providerError ? t("provider.switchFailed") : void 0),
					onChange: (event) => {
						onSelect(event.currentTarget.value);
					},
					children: [
						selected === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							disabled: true,
							children: t("provider.none")
						}) : null,
						list.map((provider) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: provider.id,
							children: provider.title ?? provider.id
						}, provider.id)),
						missing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: selected,
							children: t("provider.missingOption", { id: selected })
						}) : null
					]
				})
			}),
			loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-status",
				role: "status",
				children: t("provider.loading")
			}) : null,
			webState.status === "unavailable" || selectedInfo === void 0 || selectedInfo.description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-hint",
				children: runtime.resolveText(selectedInfo.description)
			}),
			webState.status === "unavailable" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsts-hint",
				children: t("provider.current", { name: selectedInfo?.title ?? (selected === "" ? t("provider.none") : selected) })
			})
		]
	});
}

// src/client/provider-directory.ts
/** The empty snapshot before the first read. */
const EMPTY_PROVIDER_DIRECTORY = Object.freeze({
	status: "idle",
	providers: Object.freeze([])
});
/** Reads and caches the registered search providers. */
var ProviderDirectory = class {
	web;
	snapshot = EMPTY_PROVIDER_DIRECTORY;
	listeners = /* @__PURE__ */ new Set();
	loading;
	sequence = 0;
	disposed = false;
	/**
	* @param web - the `remote.web` client namespace.
	*/
	constructor(web) {
		this.web = web;
	}
	/** Current snapshot; stable until the next accepted read. */
	getSnapshot = () => this.snapshot;
	/** Observe snapshot replacements. */
	subscribe = (listener) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	/** Load once if no read has started; repeated calls are no-ops. */
	ensure() {
		if (this.snapshot.status === "idle") this.refresh();
	}
	/**
	* Re-read the provider list. A read already in flight is reused; only the
	* latest read publishes.
	*/
	async refresh() {
		if (this.disposed) return;
		if (this.loading !== void 0) return this.loading;
		const sequence = ++this.sequence;
		this.publish({
			status: this.snapshot.status === "ready" ? "ready" : "loading",
			providers: this.snapshot.providers
		});
		const task = this.read(sequence);
		this.loading = task;
		try {
			await task;
		} finally {
			if (this.sequence === sequence) this.loading = void 0;
		}
	}
	/** Perform one read and publish its latest answer. */
	async read(sequence) {
		try {
			const response = await this.web.listProviders();
			if (this.disposed || sequence !== this.sequence) return;
			if (response.ok) this.publish({
				status: "ready",
				providers: response.value.search
			});
			else this.publish({
				status: "error",
				providers: this.snapshot.providers
			});
		} catch {
			if (this.disposed || sequence !== this.sequence) return;
			this.publish({
				status: "error",
				providers: this.snapshot.providers
			});
		}
	}
	/** Publish one immutable snapshot and notify subscribers. */
	publish(next) {
		this.snapshot = Object.freeze(next);
		for (const listener of [...this.listeners]) listener();
	}
	/** Stop publishing; queued and in-flight answers become stale. */
	dispose() {
		this.disposed = true;
		this.sequence += 1;
		this.listeners.clear();
	}
};

// src/client/runtime.ts
/**
* The page's one bridge to the Host-owned services: the thin-search form, the
* web provider selection, the provider directory, and the locale dictionary.
*
* All writes go through ConfigForms. The page registers the row in
* `plugins.row.config`; the command and the page share this runtime so both
* use the same form instance.
* @module dsh-thin-search/client/runtime
*/
/** Shared client state for the row page, the provider card, and the command. */
var ThinSearchRuntime = class {
	ctx;
	directory;
	translate;
	disposers;
	/**
	* @param ctx - the browser plugin context; `configForms`, `locale`, and `remote.web` are required.
	*/
	constructor(ctx) {
		this.ctx = ctx;
		this.translate = ctx.locale.bind("thin-search");
		this.directory = new ProviderDirectory(ctx.remote.web);
		this.disposers = [ctx.remote.$on("web/providers-changed", () => {
			this.directory.refresh();
		}), ctx.on("connection/reset", () => {
			this.directory.refresh();
		})];
	}
	/** Localized copy for this plugin's namespace. */
	t = (key, params) => this.translate(key, params);
	/** Resolve a provider's localized description through the locale service. */
	resolveText = (text) => this.ctx.locale.resolveText(text);
	/** The thin-search row form, shared with whoever else edits the same namespace. */
	get configForm() {
		return this.ctx.configForms.get(THIN_SEARCH_NAMESPACE);
	}
	/** The web namespace form that owns the global provider selection. */
	get webForm() {
		return this.ctx.configForms.get("web");
	}
	/**
	* Switch the global search provider through ConfigForms — exactly
	* `ctx.configForms.get('web').set('searchProvider', id)`. The Host applies
	* the write live; no deployment patch and no restart.
	*/
	setSearchProvider(id) {
		return this.ctx.configForms.get("web").set(SEARCH_PROVIDER_FIELD, id);
	}
	/** Current thin-search preferred engine, falling back to the schema default. */
	currentEngine() {
		const provider = this.configForm.getSnapshot().value?.provider;
		return isEngineId(provider) ? provider : DEFAULT_ENGINE;
	}
	/** Write the preferred engine through `configForms.get('thin-search').set('provider', id)`. */
	setPreferredEngine(id) {
		return this.ctx.configForms.get(THIN_SEARCH_NAMESPACE).set(ENGINE_FIELD, id);
	}
	/** Ensure the provider list has been read once. */
	ensureProviders = () => {
		this.directory.ensure();
	};
	/** Re-read the registered providers. */
	refreshProviders = () => this.directory.refresh();
	/** Current provider-directory snapshot for the page's external store. */
	getProvidersSnapshot = () => this.directory.getSnapshot();
	/** Subscribe the page to provider-directory changes. */
	subscribeProviders = (listener) => this.directory.subscribe(listener);
	/** Release event subscriptions and stop publishing provider reads. */
	dispose() {
		for (const dispose of this.disposers) dispose();
		this.directory.dispose();
	}
};

// src/client/styles.ts
/**
* Thin Search client stylesheet. Every color and focus treatment reads a
* theme token (`--dsw-alias-*` / `--dsw-focus-ring-*`) so the page follows the
* active light or dark theme without hard-coded colors.
* @module dsh-thin-search/client/styles
*/
/** Stylesheet id used to inject once per document. */
const STYLE_ID = "dsh-thin-search/client.css";
/** Page, card, control, and status styles. */
const STYLES = [
	".dsts-page{display:flex;flex-direction:column;gap:12px;max-width:720px;color:var(--dsw-alias-label-primary)}",
	".dsts-header{display:flex;flex-direction:column;gap:4px}",
	".dsts-title{margin:0;font-size:16px;font-weight:600;line-height:24px;color:var(--dsw-alias-label-primary)}",
	".dsts-intro{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-tertiary)}",
	".dsts-card{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border:.5px solid var(--dsw-alias-border-l4);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}",
	".dsts-cardTitle{margin:0;font-size:14px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}",
	".dsts-cardDesc{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
	".dsts-cardBody{display:flex;flex-direction:column;gap:10px;margin-top:8px}",
	".dsts-field{display:flex;flex-direction:column;gap:5px}",
	".dsts-fieldRow{flex-direction:row;align-items:flex-start;justify-content:space-between;gap:16px}",
	".dsts-fieldText{display:flex;flex-direction:column;gap:4px;min-width:0}",
	".dsts-label{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}",
	".dsts-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
	".dsts-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}",
	".dsts-status{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
	".dsts-input,.dsts-select,.dsts-textarea{box-sizing:border-box;width:100%;max-width:360px;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:0 10px;height:32px}",
	".dsts-textarea{min-height:66px;padding:7px 10px;height:auto;resize:vertical;max-width:none}",
	".dsts-input::placeholder,.dsts-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}",
	".dsts-input:focus-visible,.dsts-select:focus-visible,.dsts-textarea:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px;border-color:var(--dsw-alias-brand-primary)}",
	".dsts-input:disabled,.dsts-select:disabled,.dsts-textarea:disabled{opacity:.55;cursor:default}",
	".dsts-select{color-scheme:light dark}",
	".dsts-switch{position:relative;flex:none;box-sizing:border-box;width:36px;height:20px;padding:2px;border:0;border-radius:10px;background:var(--dsw-alias-border-l3);cursor:pointer}",
	".dsts-switch:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}",
	".dsts-switch:disabled{opacity:.5;cursor:default}",
	".dsts-switchOn{background:var(--dsw-alias-brand-primary)}",
	".dsts-switchThumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform .12s}",
	".dsts-switchOn .dsts-switchThumb{transform:translate(16px)}",
	".dsts-platforms{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;border:0}",
	".dsts-legend{padding:0;margin:0 0 2px;font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}",
	".dsts-platform{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
	".dsts-platform input{accent-color:var(--dsw-alias-brand-primary);margin:0}",
	".dsts-platform input:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}",
	".dsts-inlineAlert{display:flex;flex-direction:column;gap:6px;align-items:flex-start}",
	".dsts-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding-top:4px}",
	".dsts-actions{display:flex;align-items:center;gap:8px}",
	".dsts-btn{appearance:none;font:inherit;font-size:13px;line-height:1.5;padding:5px 14px;border-radius:8px;border:1px solid transparent;cursor:pointer}",
	".dsts-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}",
	".dsts-btn:disabled{opacity:.5;cursor:default}",
	".dsts-btnPrimary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}",
	".dsts-btnOutline{background:transparent;border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}"
].join("");
/**
* Inject the stylesheet once per document, if a document exists. The browser
* bundle calls this from `apply`; server-side renders and tests have none.
*/
function installStyles() {
	if (typeof document === "undefined") return;
	const selector = `style[data-plugin-css="${STYLE_ID}"]`;
	if (document.querySelector(selector) !== null) return;
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-thin-search";
	tag.dataset.pluginCss = STYLE_ID;
	tag.textContent = STYLES;
	document.head.appendChild(tag);
}

// src/client/index.tsx
/** Services the browser half requires before `apply` runs. */
const inject = [
	"slots",
	"locale",
	"remote",
	"remote.web",
	"configForms"
];
/**
* Register the page and command. The row page is mounted only while the Host
* serves `thin-search`; the command is optional so a composition without the
* command UI still gets the page.
* @param ctx - the browser plugin context.
*/
function apply(ctx) {
	installStyles();
	ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, DICTIONARIES), "thin-search: locale dictionaries");
	const runtime = new ThinSearchRuntime(ctx);
	ctx.effect(() => () => {
		runtime.dispose();
	}, "thin-search: client runtime");
	const RowConfigPage = createRowConfigComponent(runtime);
	ctx.effect(() => ctx.configForms.whileServed([THIN_SEARCH_NAMESPACE], () => ctx.slots.inject(ROW_CONFIG_SLOT, () => ctx.slots.register({
		name: ROW_CONFIG_SLOT,
		key: ROW_CONFIG_KEY
	}, RowConfigPage))), "thin-search: plugin manager row configuration");
	ctx.inject(["commandUi"], (commandCtx) => {
		const commandUi = commandCtx.get("commandUi");
		if (commandUi === void 0) return;
		commandCtx.effect(() => commandUi.register(createEngineCommand(runtime)), "thin-search: /thin-search-engine command");
	});
}
/**
* Close the runtime over the component the slot registry stores. The page
* function is called directly so the `summary` view returns its one-line
* string, exactly as the Plugins page expects.
*/
function createRowConfigComponent(runtime) {
	return function ThinSearchRowConfigPage(props) {
		return ThinSearchRowConfig({
			...props,
			runtime
		});
	};
}

exports.COMMAND_NAME = COMMAND_NAME;
exports.ROW_CONFIG_KEY = ROW_CONFIG_KEY;
exports.THIN_SEARCH_NAMESPACE = THIN_SEARCH_NAMESPACE;
exports.ThinSearchRowConfig = ThinSearchRowConfig;
exports.WEB_NAMESPACE = WEB_NAMESPACE;
exports.apply = apply;
exports.inject = inject;
return module.exports; } });