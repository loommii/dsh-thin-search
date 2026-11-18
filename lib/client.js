window.__ModuleLoader__.load({ id: "dsh-thin-search", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");

// src/client/config.ts
/**
* Thin Search client configuration model: the fields the bundle settings card
* exposes, their defaults, and the per-field write mapping the ConfigForm
* receives. Every setting is a profile-scoped ConfigForms field.
*
* Nothing here talks to the Host: the runtime holds
* `configForms.get('thin-search')` and writes one field at a time as the user
* picks a value.
* @module dsh-thin-search/client/config
*/
/** Settings namespace the plugin row declares in `cordis.patch.yml`. */
const THIN_SEARCH_NAMESPACE = "thin-search";
/** Settings namespace the web capability owns; its `searchProvider` selects the backend. */
const WEB_NAMESPACE = "web";
/** Slot a bundle's own configuration registers into on its bundle page. */
const BUNDLE_CONFIG_SLOT = "plugins.bundle.config";
/** The keyed slot key is the bundle package name. */
const BUNDLE_CONFIG_KEY = "dsh-thin-search";
/** Client command that switches the preferred free engine. */
const COMMAND_NAME = "thin-search-engine";
/** Locale namespace owned by this client plugin. */
const LOCALE_NAMESPACE = "thin-search";
/** `web` settings field the global provider switch writes. */
const SEARCH_PROVIDER_FIELD = "searchProvider";
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
/**
* Validate one field value before it reaches the Host. The card writes a
* single field at a time, so each write is checked on its own.
* @param field - draft field being written.
* @param value - proposed value.
* @returns the localized error key, or undefined when the value is usable.
*/
function validateSetting(field, value) {
	if (field === "cacheTtl") return typeof value === "number" && Number.isInteger(value) && value >= 0 ? void 0 : { key: "validation.cacheTtl" };
	if (field === "enhanceSystemPromptPath") {
		const path = typeof value === "string" ? value.trim() : "";
		return path === "" || path.startsWith("~/") || path.startsWith("/") ? void 0 : { key: "validation.enhanceSystemPromptPath" };
	}
	if (field === "searxngText") {
		const { invalid } = parseSearxngInstances(typeof value === "string" ? value : "");
		return invalid.length === 0 ? void 0 : {
			key: "validation.searxng",
			params: { entries: invalid.join(", ") }
		};
	}
}
/**
* Map one card control write onto the ConfigForm field/value pair. The
* SearXNG textarea becomes the instance array; every other field keeps its
* own name. Text values are trimmed; platform ids are canonicalized.
* @param field - draft field being written.
* @param value - proposed value.
* @returns the Host field and value.
*/
function settingWrite(field, value) {
	if (field === "searxngText") return {
		field: "searxngInstances",
		value: parseSearxngInstances(typeof value === "string" ? value : "").instances
	};
	if (field === "platforms") return {
		field: "platforms",
		value: canonicalPlatforms(Array.isArray(value) ? value : [])
	};
	if (field === "enhanceModel" || field === "enhanceSystemPromptPath" || field === "bingMarket" || field === "region") return {
		field,
		value: typeof value === "string" ? value.trim() : ""
	};
	return {
		field,
		value
	};
}

// src/client/locales.ts
/** English dictionary; its key union is the namespace's message key type. */
const en = {
	"status.loading": "Loading settings…",
	"status.unavailable": "Thin Search settings are not served by this deployment.",
	"status.readOnly": "This deployment stores settings read-only.",
	"status.writeFailed": "The Host refused the change.",
	"settings.clear": "Clear",
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
	"advanced.searxngHint": "One absolute http(s) base URL per line. Shift+Enter adds a line; Enter saves. Empty uses the built-in instance list.",
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
	"status.loading": "正在加载设置…",
	"status.unavailable": "当前部署未提供 Thin Search 设置。",
	"status.readOnly": "当前部署的设置为只读。",
	"status.writeFailed": "Host 拒绝了这次修改。",
	"settings.clear": "清除",
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
	"advanced.searxngHint": "每行一个绝对 http(s) 基础 URL。Shift+Enter 换行，Enter 保存。留空使用内置实例列表。",
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
/**
* dsh-context v0.85.1-style settings controls: grouped rows with a label on
* the left, a pill select (custom accessible menu) or switch on the right, and
* text/textarea rows that commit on blur or Enter and clear on Escape.
*
* Every control is native and keyboard operable; a popup menu is a sibling of
* its trigger, never a child, so no interactive element nests another.
* @module dsh-thin-search/client/components
*/
/** One group of settings rows, titled like dsh-context's settings card. */
function Group({ title, children }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsts-settings-group",
		role: "group",
		"aria-label": title,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "dsts-settings-group-title",
			children: title
		}), children]
	});
}
/** One label-left/control-right row. */
function Row({ label, htmlFor, labelId, textRow, children }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: textRow === true ? "dsts-settings-row dsts-settings-textrow" : "dsts-settings-row",
		children: [htmlFor === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: "dsts-settings-label",
			id: labelId,
			children: label
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
			className: "dsts-settings-label",
			id: labelId,
			htmlFor,
			children: label
		}), children]
	});
}
/** A note under a row or group. */
function Note({ children, role, error, id }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: error === true ? "dsts-settings-note dsts-settings-note-error" : "dsts-settings-note",
		id,
		role,
		children
	});
}
/** Focus an element when the host renderer supplies a focusable node. */
function focusNode(node) {
	if (typeof node?.focus === "function") node.focus();
}
/** A 36px-high, 18px-radius pill with an accessible menu. */
function PillSelect({ id, control, label, value, options, disabled, placeholder, describedBy, onChange }) {
	const [open, setOpen] = (0, react.useState)(false);
	const buttonRef = (0, react.useRef)(null);
	const wrapRef = (0, react.useRef)(null);
	const optionRefs = (0, react.useRef)([]);
	const selectedLabel = options.find((option) => option.id === value)?.label ?? (value === "" ? placeholder ?? "" : value);
	(0, react.useEffect)(() => {
		if (!open) return;
		const selectedIndex = options.findIndex((option) => option.id === value);
		focusNode(optionRefs.current[selectedIndex >= 0 ? selectedIndex : 0]);
		if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
		const dismiss = (event) => {
			if (wrapRef.current?.contains(event.target) === true) return;
			setOpen(false);
		};
		document.addEventListener("mousedown", dismiss);
		return () => {
			document.removeEventListener("mousedown", dismiss);
		};
	}, [
		open,
		options,
		value
	]);
	const close = () => {
		setOpen(false);
		focusNode(buttonRef.current);
	};
	const move = (current, step) => {
		if (options.length === 0) return;
		const next = (current + step + options.length) % options.length;
		focusNode(optionRefs.current[next]);
	};
	const onMenuKeyDown = (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			close();
			return;
		}
		if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			focusNode(optionRefs.current[event.key === "Home" ? 0 : options.length - 1]);
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const active = typeof document === "undefined" ? -1 : optionRefs.current.findIndex((node) => node === document.activeElement);
			move(active, event.key === "ArrowDown" ? 1 : -1);
		}
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		className: "dsts-settings-pillwrap",
		ref: wrapRef,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			ref: buttonRef,
			id,
			type: "button",
			className: "dsts-settings-select",
			"data-control": control,
			"aria-haspopup": "menu",
			"aria-expanded": open,
			"aria-labelledby": `${id}-label`,
			"aria-describedby": describedBy,
			disabled: disabled === true,
			onClick: () => {
				setOpen(!open);
			},
			onKeyDown: (event) => {
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					setOpen(true);
				} else if (event.key === "Escape" && open) {
					event.preventDefault();
					setOpen(false);
				}
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsts-settings-select-label",
				children: selectedLabel
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsts-settings-chevron",
				"aria-hidden": "true"
			})]
		}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "dsts-settings-menu",
			role: "menu",
			"aria-label": label,
			onKeyDown: onMenuKeyDown,
			children: options.map((option, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				ref: (node) => {
					optionRefs.current[index] = node;
				},
				type: "button",
				role: "menuitemradio",
				"aria-checked": option.id === value,
				className: option.id === value ? "dsts-settings-menu-item dsts-settings-menu-item-on" : "dsts-settings-menu-item",
				"data-control": `${control}-option`,
				"data-value": option.id,
				onClick: () => {
					setOpen(false);
					focusNode(buttonRef.current);
					onChange(option.id);
				},
				children: option.label
			}, option.id))
		}) : null]
	});
}
/** A switch row; the toggle writes immediately. */
function SwitchRow({ id, control, label, checked, disabled, onChange }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
		label,
		labelId: `${id}-label`,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			id,
			type: "button",
			role: "switch",
			"data-control": control,
			"aria-checked": checked,
			"aria-labelledby": `${id}-label`,
			className: checked ? "dsts-settings-switch dsts-settings-switch-on" : "dsts-settings-switch",
			disabled,
			onClick: () => {
				onChange(!checked);
			},
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsts-settings-switch-thumb",
				"aria-hidden": "true"
			})
		})
	});
}
/** Text/textarea row with dsh-context commit and clear semantics. */
function TextControl({ id, control, label, value, disabled, multiline, rows, placeholder, hint, error, clearLabel, inputMode, commit }) {
	const [draft, setDraft] = (0, react.useState)(value);
	const [focused, setFocused] = (0, react.useState)(false);
	const inputRef = (0, react.useRef)(null);
	const areaRef = (0, react.useRef)(null);
	const latest = (0, react.useRef)({
		draft,
		value,
		commit
	});
	latest.current = {
		draft,
		value,
		commit
	};
	if (!focused && draft !== value && error === void 0) setDraft(value);
	(0, react.useEffect)(() => () => {
		const current = latest.current;
		if (current.draft !== current.value) current.commit(current.draft);
	}, []);
	const describedBy = [hint === void 0 ? void 0 : `${id}-hint`, error === void 0 ? void 0 : `${id}-error`].filter((part) => part !== void 0).join(" ");
	const focus = () => {
		focusNode(multiline === true ? areaRef.current : inputRef.current);
	};
	const doCommit = () => {
		if (draft !== value) commit(draft);
	};
	const onKeyDown = (event) => {
		if (event.nativeEvent?.isComposing === true) return;
		if (event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
			if (draft === "") return;
			event.preventDefault();
			event.stopPropagation();
			setDraft("");
			focus();
			return;
		}
		if (event.key === "Enter") {
			if (multiline === true && event.shiftKey) return;
			event.preventDefault();
			doCommit();
		}
	};
	const clear = () => {
		setDraft("");
		focus();
	};
	const aria = {
		"aria-describedby": describedBy === "" ? void 0 : describedBy,
		"aria-invalid": error === void 0 ? void 0 : true,
		onFocus: () => {
			setFocused(true);
		},
		onBlur: () => {
			setFocused(false);
			doCommit();
		},
		onKeyDown
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsts-settings-field",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				label,
				htmlFor: id,
				labelId: `${id}-label`,
				textRow: multiline === true,
				children: multiline === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dsts-settings-textwrap",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						...aria,
						ref: areaRef,
						id,
						"data-control": control,
						className: "dsts-settings-textarea",
						rows: rows ?? 3,
						value: draft,
						placeholder,
						disabled,
						onChange: (event) => {
							setDraft(event.currentTarget.value);
						}
					}), !disabled && draft !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsts-settings-textx",
						"data-control": `clear-${control}`,
						"aria-label": clearLabel,
						title: clearLabel,
						onMouseDown: (event) => {
							event.preventDefault();
						},
						onClick: clear,
						children: "×"
					}) : null]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					...aria,
					ref: inputRef,
					id,
					"data-control": control,
					className: "dsts-settings-input",
					type: "text",
					inputMode,
					value: draft,
					placeholder,
					disabled,
					onChange: (event) => {
						setDraft(event.currentTarget.value);
					}
				})
			}),
			hint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				id: `${id}-hint`,
				children: hint
			}),
			error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				id: `${id}-error`,
				role: "alert",
				error: true,
				children: error
			})
		]
	});
}

// src/client/page.tsx
/**
* The Thin Search bundle settings card on the installed-plugin detail page.
*
* DSH 0.2.2-rc.3 passes no owner form props to `plugins.bundle.config`, so the
* card subscribes to the runtime's ConfigForm store instead. Every control
* writes immediately (select on pick, switch on toggle, text on blur/Enter,
* Escape clears a draft); there is no Save/Discard footer. Layout follows
* dsh-context v0.85.1: grouped sections, label-left/control-right rows,
* 36px/18px pill selects, textarea clear affordances, and read-only notes.
* @module dsh-thin-search/client/page
*/
/** Subscribe one ConfigForm snapshot through React's external store. */
function useConfigFormSnapshot(form) {
	const subscribe = (0, react.useCallback)((listener) => form.subscribe(listener), [form]);
	const snapshot = (0, react.useCallback)(() => form.getSnapshot(), [form]);
	return (0, react.useSyncExternalStore)(subscribe, snapshot, snapshot);
}
/** The bundle settings card. */
function ThinSearchBundleConfig({ runtime }) {
	const t = runtime.t;
	const settings = (0, react.useSyncExternalStore)(runtime.subscribeSettings, runtime.getSettingsSnapshot, runtime.getSettingsSnapshot);
	const webState = useConfigFormSnapshot(runtime.webForm);
	const providers = (0, react.useSyncExternalStore)(runtime.subscribeProviders, runtime.getProvidersSnapshot, runtime.getProvidersSnapshot);
	const [providerError, setProviderError] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		runtime.ensureProviders();
	}, [runtime]);
	const fieldError = (key) => settings.error?.key === key ? t(settings.error.key, settings.error.params) : void 0;
	const pickProvider = async (id) => {
		setProviderError(false);
		try {
			if (!await runtime.setSearchProvider(id)) setProviderError(true);
		} catch {
			setProviderError(true);
		}
	};
	const togglePlatform = (id) => {
		const platforms = settings.values.platforms.includes(id) ? settings.values.platforms.filter((candidate) => candidate !== id) : canonicalPlatforms([...settings.values.platforms, id]);
		runtime.writeSetting("platforms", platforms);
	};
	const commitCacheTtl = (text) => {
		const trimmed = text.trim();
		const value = trimmed === "" ? NaN : Number(trimmed);
		runtime.writeSetting("cacheTtl", value);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsts-settings-prefs",
		children: [
			settings.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				role: "status",
				children: t("status.loading")
			}) : null,
			settings.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				role: "status",
				children: t("status.unavailable")
			}) : null,
			settings.status === "ready" && !settings.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				role: "status",
				children: t("status.readOnly")
			}) : null,
			settings.writeFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				role: "alert",
				error: true,
				children: t("status.writeFailed")
			}) : null,
			settings.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderGroup, {
					runtime,
					webState,
					providers,
					error: providerError,
					onPick: (id) => {
						pickProvider(id);
					},
					onRetry: () => {
						runtime.refreshProviders();
					}
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
					title: t("engine.title"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: t("engine.description") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
							label: t("engine.label"),
							labelId: "dsts-engine-label",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillSelect, {
								id: "dsts-engine",
								control: "engine",
								label: t("engine.label"),
								value: settings.values.provider,
								options: ENGINE_IDS.map((id) => ({
									id,
									label: t(engineLabelKey(id))
								})),
								disabled: !settings.writable,
								describedBy: "dsts-engine-hint",
								onChange: (id) => {
									if (isEngineId(id)) runtime.writeSetting("provider", id);
								}
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
							id: "dsts-engine-hint",
							children: t("engine.hint")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
					title: t("enhance.title"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: t("enhance.description") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							id: "dsts-enhance",
							control: "enhance",
							label: t("enhance.toggle"),
							checked: settings.values.searchEnhance,
							disabled: !settings.writable,
							onChange: (next) => {
								runtime.writeSetting("searchEnhance", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: t("enhance.hint") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextControl, {
							id: "dsts-enhance-model",
							control: "enhance-model",
							label: t("enhance.modelLabel"),
							value: settings.values.enhanceModel,
							disabled: !settings.writable,
							placeholder: t("enhance.modelPlaceholder"),
							hint: t("enhance.modelHint"),
							clearLabel: t("settings.clear"),
							commit: (value) => {
								runtime.writeSetting("enhanceModel", value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextControl, {
							id: "dsts-enhance-prompt",
							control: "enhance-prompt-path",
							label: t("enhance.promptPathLabel"),
							value: settings.values.enhanceSystemPromptPath,
							disabled: !settings.writable,
							placeholder: t("enhance.promptPathPlaceholder"),
							hint: t("enhance.promptPathHint"),
							error: fieldError("validation.enhanceSystemPromptPath"),
							clearLabel: t("settings.clear"),
							commit: (value) => {
								runtime.writeSetting("enhanceSystemPromptPath", value);
							}
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
					title: t("platforms.title"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
						className: "dsts-settings-platforms",
						disabled: !settings.writable,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", {
							className: "dsts-settings-legend",
							children: t("platforms.legend")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsts-settings-chips",
							children: PLATFORM_IDS.map((id) => {
								const enabled = settings.values.platforms.includes(id);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: enabled ? "dsts-settings-chip dsts-settings-chip-on" : "dsts-settings-chip",
									htmlFor: `dsts-platform-${id}`,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: `dsts-platform-${id}`,
										"data-control": "platforms",
										type: "checkbox",
										checked: enabled,
										disabled: !settings.writable,
										onChange: () => {
											togglePlatform(id);
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(platformLabelKey(id)) })]
								}, id);
							})
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: settings.values.platforms.length === 0 ? t("platforms.allDisabled") : t("platforms.hint") })]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Group, {
					title: t("advanced.title"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: t("advanced.description") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextControl, {
							id: "dsts-cache-ttl",
							control: "cache-ttl",
							label: t("advanced.cacheLabel"),
							value: String(settings.values.cacheTtl),
							disabled: !settings.writable,
							inputMode: "numeric",
							hint: t("advanced.cacheHint"),
							error: fieldError("validation.cacheTtl"),
							clearLabel: t("settings.clear"),
							commit: commitCacheTtl
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextControl, {
							id: "dsts-bing-market",
							control: "bing-market",
							label: t("advanced.bingMarketLabel"),
							value: settings.values.bingMarket,
							disabled: !settings.writable,
							hint: t("advanced.bingMarketHint"),
							clearLabel: t("settings.clear"),
							commit: (value) => {
								runtime.writeSetting("bingMarket", value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextControl, {
							id: "dsts-region",
							control: "region",
							label: t("advanced.regionLabel"),
							value: settings.values.region,
							disabled: !settings.writable,
							hint: t("advanced.regionHint"),
							clearLabel: t("settings.clear"),
							commit: (value) => {
								runtime.writeSetting("region", value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextControl, {
							id: "dsts-searxng",
							control: "searxng-instances",
							label: t("advanced.searxngLabel"),
							value: settings.values.searxngText,
							disabled: !settings.writable,
							multiline: true,
							rows: Math.min(8, Math.max(2, settings.values.searxngText.split("\n").length)),
							placeholder: t("advanced.searxngPlaceholder"),
							hint: t("advanced.searxngHint"),
							error: fieldError("validation.searxng"),
							clearLabel: t("settings.clear"),
							commit: (value) => {
								runtime.writeSetting("searxngText", value);
							}
						})
					]
				})
			] }) : null
		]
	});
}
/** The global provider group: Host providers plus the ConfigForms write. */
function ProviderGroup({ runtime, webState, providers, error, onPick, onRetry }) {
	const t = runtime.t;
	const list = providers.providers;
	const selected = webState.value?.searchProvider ?? "";
	const selectedInfo = list.find((provider) => provider.id === selected);
	const loading = providers.status === "loading" && list.length === 0;
	const options = list.map((provider) => ({
		id: provider.id,
		label: provider.title ?? provider.id
	}));
	if (selected !== "" && selectedInfo === void 0) options.push({
		id: selected,
		label: t("provider.missingOption", { id: selected })
	});
	const describedBy = error ? "dsts-provider-hint dsts-provider-error" : "dsts-provider-hint";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Group, {
		title: t("provider.title"),
		children: webState.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
			role: "status",
			children: t("provider.unavailable")
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: t("provider.description") }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				label: t("provider.label"),
				labelId: "dsts-provider-label",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PillSelect, {
					id: "dsts-provider",
					control: "provider",
					label: t("provider.label"),
					value: selected,
					options,
					placeholder: t("provider.none"),
					disabled: webState.status !== "ready" || !webState.writable || loading || providers.status === "error",
					describedBy,
					onChange: onPick
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				id: "dsts-provider-hint",
				children: t("provider.hint")
			}),
			loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				role: "status",
				children: t("provider.loading")
			}) : null,
			providers.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Note, {
				role: "alert",
				error: true,
				children: [
					t("provider.error"),
					" ",
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsts-settings-inline-action",
						"data-control": "provider-retry",
						onClick: onRetry,
						children: t("provider.retry")
					})
				]
			}) : null,
			selectedInfo?.description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: runtime.resolveText(selectedInfo.description) }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, { children: t("provider.current", { name: selectedInfo?.title ?? (selected === "" ? t("provider.none") : selected) }) }),
			error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Note, {
				id: "dsts-provider-error",
				role: "alert",
				error: true,
				children: t("provider.switchFailed")
			}) : null
		] })
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
	rerun = false;
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
	* Re-read the provider list. A request arriving while a read is in flight
	* schedules exactly one rerun after that read settles; concurrent callers
	* share the running promise. No rerun starts after disposal.
	*/
	async refresh() {
		if (this.disposed) return;
		if (this.loading !== void 0) {
			this.rerun = true;
			return this.loading;
		}
		const task = this.refreshLoop();
		this.loading = task;
		try {
			await task;
		} finally {
			if (this.loading === task) this.loading = void 0;
		}
	}
	/** Run the current read, then at most one coalesced rerun. */
	async refreshLoop() {
		this.rerun = false;
		await this.readOnce();
		if (!this.rerun || this.disposed) return;
		this.rerun = false;
		await this.readOnce();
	}
	/** Perform one read and publish its latest answer. */
	async readOnce() {
		const sequence = ++this.sequence;
		this.publish({
			status: this.snapshot.status === "ready" ? "ready" : "loading",
			providers: this.snapshot.providers
		});
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
		this.rerun = false;
		this.sequence += 1;
		this.listeners.clear();
	}
};

// src/client/runtime.ts
/**
* The bundle card's bridge to the Host-owned services: the thin-search
* ConfigForm store, the web provider selection, the provider directory, and
* the locale dictionary.
*
* DSH 0.2.2-rc.3 renders `plugins.bundle.config` without owner form props, so
* the runtime holds `configForms.get('thin-search')` itself and exposes one
* synchronous snapshot plus immediate per-field writes. Every write goes
* through the ConfigForm, which fences it with the latest namespace revision.
* @module dsh-thin-search/client/runtime
*/
/** Build the snapshot before the ConfigForm is attached. */
function loadingSnapshot() {
	return {
		status: "loading",
		writable: false,
		revision: void 0,
		values: normalizeDraft(void 0),
		error: null,
		writeFailed: false
	};
}
/** Shared client state for the bundle card, the command, and provider reads. */
var ThinSearchRuntime = class {
	ctx;
	directory;
	translate;
	disposers;
	listeners = /* @__PURE__ */ new Set();
	pending = /* @__PURE__ */ new Set();
	form;
	snapshot = loadingSnapshot();
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
	/** The thin-search ConfigForm, held by the runtime rather than owner props. */
	get configForm() {
		return this.form ?? this.ctx.configForms.get("thin-search");
	}
	/** The web namespace form that owns the global provider selection. */
	get webForm() {
		return this.ctx.configForms.get("web");
	}
	/**
	* Attach the Host form the card reads. The returned disposer detaches the
	* subscription and returns the card to its loading state.
	* @param form - `configForms.get('thin-search')`.
	* @returns subscription disposer.
	*/
	attach(form) {
		this.form = form;
		this.pending.clear();
		this.sync(form.getSnapshot(), {
			error: null,
			writeFailed: false
		});
		const off = form.subscribe(() => {
			this.sync(form.getSnapshot());
		});
		return () => {
			off();
			if (this.form !== form) return;
			this.form = void 0;
			this.pending.clear();
			this.snapshot = loadingSnapshot();
			this.notify();
		};
	}
	/** Current immutable settings snapshot (stable until the next change). */
	getSettingsSnapshot = () => this.snapshot;
	/** Observe settings snapshot replacements. */
	subscribeSettings = (listener) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	/**
	* Write one field immediately. The card calls this on a pill pick, a switch
	* toggle, a platform check, or a text commit; no Save control exists.
	* ConfigForm.set carries the latest namespace revision and queues writes in
	* order. On a refused write the optimistic value is replaced by the Host's
	* accepted section and the card shows a note.
	* @param field - draft field to write.
	* @param value - value selected or committed by the control.
	* @returns whether the Host accepted the write.
	*/
	async writeSetting(field, value) {
		const form = this.form;
		if (form === void 0 || this.snapshot.status !== "ready" || !this.snapshot.writable) return false;
		const error = validateSetting(field, value);
		if (error !== void 0) {
			this.publish({
				...this.snapshot,
				error,
				writeFailed: false
			});
			return false;
		}
		const optimistic = { ...this.snapshot.values };
		optimistic[field] = value;
		this.pending.add(field);
		this.publish({
			...this.snapshot,
			values: optimistic,
			error: null,
			writeFailed: false
		});
		const write = settingWrite(field, value);
		try {
			const accepted = await form.set(write.field, write.value);
			this.pending.delete(field);
			if (this.form === form) this.sync(form.getSnapshot(), accepted ? {} : { writeFailed: true });
			return accepted;
		} catch {
			this.pending.delete(field);
			if (this.form === form) this.sync(form.getSnapshot(), { writeFailed: true });
			return false;
		}
	}
	/** Switch the global search provider through ConfigForms. */
	setSearchProvider(id) {
		return this.ctx.configForms.get("web").set(SEARCH_PROVIDER_FIELD, id);
	}
	/** Current thin-search preferred engine, falling back to the schema default. */
	currentEngine() {
		const provider = this.snapshot.values.provider;
		return isEngineId(provider) ? provider : DEFAULT_ENGINE;
	}
	/** Write the preferred engine through `configForms.get('thin-search').set('provider', id)`. */
	setPreferredEngine(id) {
		return this.writeSetting("provider", id);
	}
	/** Ensure the provider list has been read once. */
	ensureProviders = () => {
		this.directory.ensure();
	};
	/** Re-read the registered providers. */
	refreshProviders = () => this.directory.refresh();
	/** Current provider-directory snapshot for the card's external store. */
	getProvidersSnapshot = () => this.directory.getSnapshot();
	/** Subscribe the card to provider-directory changes. */
	subscribeProviders = (listener) => this.directory.subscribe(listener);
	/** Release event subscriptions and stop publishing provider reads. */
	dispose() {
		for (const dispose of this.disposers) dispose();
		this.directory.dispose();
		this.listeners.clear();
	}
	/** Fold one accepted ConfigForm snapshot into the card state. */
	sync(formSnapshot, overrides = {}) {
		const values = normalizeDraft(formSnapshot.value);
		const merged = values;
		for (const field of this.pending) merged[field] = this.snapshot.values[field];
		this.publish({
			status: formSnapshot.status,
			writable: formSnapshot.writable,
			revision: formSnapshot.revision,
			values,
			error: this.snapshot.error,
			writeFailed: this.snapshot.writeFailed,
			...overrides
		});
	}
	/** Replace the snapshot and notify subscribers. */
	publish(next) {
		this.snapshot = next;
		this.notify();
	}
	/** Wake every mounted card. */
	notify() {
		for (const listener of [...this.listeners]) listener();
	}
};

// src/client/styles.ts
/**
* Thin Search bundle-card styles, matched to dsh-context v0.85.1's settings
* card: grouped rows, 36px/18px pill selects, textarea clear affordance, and
* label-left/control-right layout. Every color and focus treatment reads a
* theme token so light and dark themes follow the shell.
* @module dsh-thin-search/client/styles
*/
/** Stylesheet id used to inject once per document. */
const STYLE_ID = "dsh-thin-search/client.css";
/** Bundle-card styles. */
const STYLES = [
	".dsts-settings-prefs{padding:4px 0}",
	".dsts-settings-group+.dsts-settings-group{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:18px;padding-top:18px}",
	".dsts-settings-group-title{letter-spacing:.01em;color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600;line-height:24px}",
	".dsts-settings-row{align-items:center;gap:8px;padding:8px 0;display:flex}",
	".dsts-settings-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:14px;font-weight:400}",
	".dsts-settings-field{flex-direction:column;display:flex}",
	".dsts-settings-select{background:var(--dsw-alias-bg-module-platform);height:36px;max-width:260px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;transition:background-color .2s ease-in-out;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}",
	".dsts-settings-select:hover:enabled{background:var(--dsw-alias-interactive-bg-hover)}",
	".dsts-settings-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
	".dsts-settings-select:disabled{opacity:.5;cursor:default}",
	".dsts-settings-select-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
	".dsts-settings-chevron{border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;width:6px;height:6px;transform:rotate(45deg) translateY(-1px);flex:none}",
	".dsts-settings-pillwrap{position:relative;display:inline-flex;justify-content:flex-end}",
	".dsts-settings-menu{position:absolute;z-index:20;top:calc(100% + 4px);right:0;min-width:180px;max-width:280px;padding:4px;display:flex;flex-direction:column;gap:2px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:0 6px 20px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)}",
	".dsts-settings-menu-item{appearance:none;border:0;background:transparent;text-align:left;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);padding:6px 10px;border-radius:6px;cursor:pointer}",
	".dsts-settings-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}",
	".dsts-settings-menu-item:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-1px}",
	".dsts-settings-menu-item-on{background:var(--dsw-alias-bg-module-platform);font-weight:600}",
	".dsts-settings-note{color:var(--dsw-alias-label-tertiary);margin:12px 0 4px;font-size:12px;line-height:1.5}",
	".dsts-settings-group .dsts-settings-note{margin:4px 0 0}",
	".dsts-settings-note-error{color:var(--dsw-alias-state-error-primary)}",
	".dsts-settings-inline-action{appearance:none;border:0;background:transparent;font:inherit;font-size:12px;color:var(--dsw-alias-state-business-primary);cursor:pointer;padding:0;text-decoration:underline}",
	".dsts-settings-inline-action:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}",
	".dsts-settings-textrow{flex-direction:column;align-items:stretch}",
	".dsts-settings-textwrap{display:flex;position:relative}",
	".dsts-settings-textwrap>.dsts-settings-textarea{flex:1;min-width:0;padding-right:30px}",
	".dsts-settings-textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);width:100%;color:var(--dsw-alias-label-primary);font:inherit;resize:vertical;transition:border-color .2s ease-in-out;outline:none;padding:6px 12px;font-size:13px;line-height:1.5}",
	".dsts-settings-textarea:focus{border-color:var(--dsw-alias-state-business-primary)}",
	".dsts-settings-textarea:disabled{opacity:.5;cursor:default}",
	".dsts-settings-textarea::placeholder{color:var(--dsw-alias-label-dimmed)}",
	".dsts-settings-input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);width:100%;max-width:320px;height:32px;color:var(--dsw-alias-label-primary);font:inherit;transition:border-color .2s ease-in-out;outline:none;padding:0 12px;font-size:13px;line-height:1.5}",
	".dsts-settings-input:focus{border-color:var(--dsw-alias-state-business-primary)}",
	".dsts-settings-input:disabled{opacity:.5;cursor:default}",
	".dsts-settings-input::placeholder{color:var(--dsw-alias-label-dimmed)}",
	".dsts-settings-textx{position:absolute;top:8px;right:8px;width:18px;height:18px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:14px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}",
	".dsts-settings-textx:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
	".dsts-settings-textx:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
	".dsts-settings-switch{position:relative;flex:none;box-sizing:border-box;width:36px;height:20px;padding:2px;border:0;border-radius:10px;background:var(--dsw-alias-border-l3);cursor:pointer}",
	".dsts-settings-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}",
	".dsts-settings-switch:disabled{opacity:.5;cursor:default}",
	".dsts-settings-switch-on{background:var(--dsw-alias-brand-primary)}",
	".dsts-settings-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform .12s}",
	".dsts-settings-switch-on .dsts-settings-switch-thumb{transform:translate(16px)}",
	".dsts-settings-platforms{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;border:0}",
	".dsts-settings-legend{padding:0;margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
	".dsts-settings-chips{display:flex;flex-wrap:wrap;gap:6px}",
	".dsts-settings-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}",
	".dsts-settings-chip input{accent-color:var(--dsw-alias-brand-primary);margin:0}",
	".dsts-settings-chip input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}",
	".dsts-settings-chip-on{background:var(--dsw-alias-bg-module-platform);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}"
].join("");
/**
* Inject the stylesheet once per document, if a document exists. The browser
* bundle calls this from `apply`; server-side renders and tests have none.
*/
function installStyles() {
	if (typeof document === "undefined") return;
	const selector = `style[data-plugin-css="${STYLE_ID}"]`;
	const existing = document.querySelector(selector);
	if (existing !== null) {
		existing.textContent = STYLES;
		return;
	}
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
* Register the settings card and command. The card is mounted only while the
* Host serves `thin-search`; the command is optional so a composition without
* the command UI still gets the card.
* @param ctx - the browser plugin context.
*/
function apply(ctx) {
	installStyles();
	ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, DICTIONARIES), "thin-search: locale dictionaries");
	const runtime = new ThinSearchRuntime(ctx);
	ctx.effect(() => () => {
		runtime.dispose();
	}, "thin-search: client runtime");
	ctx.effect(() => runtime.attach(ctx.configForms.get(THIN_SEARCH_NAMESPACE)), "thin-search: config form");
	const BundleConfigCard = createBundleConfigComponent(runtime);
	ctx.effect(() => ctx.configForms.whileServed([THIN_SEARCH_NAMESPACE], () => ctx.slots.inject(BUNDLE_CONFIG_SLOT, () => ctx.slots.register({
		name: BUNDLE_CONFIG_SLOT,
		key: BUNDLE_CONFIG_KEY,
		locale: LOCALE_NAMESPACE
	}, BundleConfigCard))), "thin-search: bundle settings card");
	ctx.inject(["commandUi"], (commandCtx) => {
		const commandUi = commandCtx.get("commandUi");
		if (commandUi === void 0) return;
		commandCtx.effect(() => commandUi.register(createEngineCommand(runtime)), "thin-search: /thin-search-engine command");
	});
}
/** Close the runtime over the component the bundle slot stores. */
function createBundleConfigComponent(runtime) {
	return function ThinSearchBundleConfigPage(_props) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThinSearchBundleConfig, { runtime });
	};
}

exports.BUNDLE_CONFIG_KEY = BUNDLE_CONFIG_KEY;
exports.BUNDLE_CONFIG_SLOT = BUNDLE_CONFIG_SLOT;
exports.COMMAND_NAME = COMMAND_NAME;
exports.THIN_SEARCH_NAMESPACE = THIN_SEARCH_NAMESPACE;
exports.ThinSearchBundleConfig = ThinSearchBundleConfig;
exports.WEB_NAMESPACE = WEB_NAMESPACE;
exports.apply = apply;
exports.inject = inject;
return module.exports; } });