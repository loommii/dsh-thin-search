import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { parse } from "node-html-parser";
import { defineTool } from "@deepseek-ai/dsh-tools";
// src/search/engines/types.ts
/** The five free engines, in their default fallback order: Bing, AnySearch, SearXNG, DDG, DDG Lite. */
const ENGINE_IDS = [
	"bing",
	"anysearch",
	"searxng",
	"ddg",
	"ddg-lite"
];
Object.freeze({
	bing: "Bing",
	anysearch: "AnySearch",
	searxng: "SearXNG",
	ddg: "DuckDuckGo HTML",
	"ddg-lite": "DuckDuckGo Lite"
});
/** Normalize an engine id, returning undefined for unknown values. */
function normalizeEngineId(value) {
	if (typeof value !== "string") return void 0;
	const normalized = value.trim().toLowerCase();
	return ENGINE_IDS.includes(normalized) ? normalized : void 0;
}
// src/platforms/types.ts
/** Platform ids supported by the {@code platform_search} tool. */
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
/** Keep only known platform ids, deduplicated, preserving registration order. */
function normalizePlatformIds(value) {
	if (!Array.isArray(value)) return [...PLATFORM_IDS];
	const requested = new Set(value.filter((entry) => typeof entry === "string"));
	return PLATFORM_IDS.filter((id) => requested.has(id));
}
/** Whether {@code value} names a supported platform. */
function isPlatformId(value) {
	return typeof value === "string" && PLATFORM_IDS.includes(value);
}
// src/config.ts
/** Schemastery schema for the plugin row. Exactly the nine agreed fields. */
const Config = z.object({
	provider: z.string().default("bing").volatile(),
	platforms: z.array(z.string()).default([...PLATFORM_IDS]).volatile(),
	cacheTtl: z.number().min(0).default(5).volatile(),
	searchEnhance: z.boolean().default(false).volatile(),
	enhanceModel: z.string().default("").volatile(),
	enhanceSystemPromptPath: z.string().default("").volatile(),
	bingMarket: z.string().default("zh-CN").volatile(),
	region: z.string().default("").volatile(),
	searxngInstances: z.array(z.string()).default([]).volatile()
});
/** Defaults applied when a reference is absent or invalid. */
const DEFAULT_CONFIG = Object.freeze({
	provider: "bing",
	platforms: Object.freeze([...PLATFORM_IDS]),
	cacheTtl: 5,
	searchEnhance: false,
	enhanceModel: "",
	enhanceSystemPromptPath: "",
	bingMarket: "zh-CN",
	region: "",
	searxngInstances: Object.freeze([])
});
/**
* Read one field from either a Cordis volatile reference or a plain value.
* Tests and programmatic callers use plain values; the loader passes references.
*/
function readValue(value, fallback) {
	if (value === void 0) return fallback;
	if (typeof value === "object" && value !== null && typeof value.get === "function") {
		const current = value.get();
		return current === void 0 ? fallback : current;
	}
	return value;
}
/** Clamp a cache lifetime to a non-negative whole number of minutes. */
function normalizeCacheTtl(value) {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) return 0;
	return Math.floor(numeric);
}
/** Keep only absolute http(s) SearXNG base URLs, deduplicated and slash-normalized. */
function normalizeSearxngInstances(value) {
	if (!Array.isArray(value)) return [];
	const seen = /* @__PURE__ */ new Set();
	const instances = [];
	for (const entry of value) {
		if (typeof entry !== "string") continue;
		const trimmed = entry.trim();
		if (trimmed.length === 0) continue;
		let parsed;
		try {
			parsed = new URL(trimmed);
		} catch {
			continue;
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
		const normalized = trimmed.replace(/\/+$/u, "");
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		instances.push(normalized);
	}
	return instances;
}
/** Resolve any supported config shape (references, plain object, or undefined) into one stable snapshot. */
function snapshotConfig(source) {
	const config = source ?? {};
	const provider = normalizeEngineId(readValue(config.provider, DEFAULT_CONFIG.provider));
	const platforms = normalizePlatformIds(readValue(config.platforms, [...DEFAULT_CONFIG.platforms]));
	return {
		provider: provider ?? DEFAULT_CONFIG.provider,
		platforms,
		cacheTtl: normalizeCacheTtl(readValue(config.cacheTtl, DEFAULT_CONFIG.cacheTtl)),
		searchEnhance: readValue(config.searchEnhance, DEFAULT_CONFIG.searchEnhance) === true,
		enhanceModel: String(readValue(config.enhanceModel, DEFAULT_CONFIG.enhanceModel)).trim(),
		enhanceSystemPromptPath: String(readValue(config.enhanceSystemPromptPath, DEFAULT_CONFIG.enhanceSystemPromptPath)).trim(),
		bingMarket: String(readValue(config.bingMarket, DEFAULT_CONFIG.bingMarket)).trim() || DEFAULT_CONFIG.bingMarket,
		region: String(readValue(config.region, DEFAULT_CONFIG.region)).trim(),
		searxngInstances: normalizeSearxngInstances(readValue(config.searxngInstances, []))
	};
}
/** Result-cache lifetime in milliseconds; 0 means disabled. */
function cacheTtlMs(config) {
	return config.cacheTtl > 0 ? config.cacheTtl * 6e4 : 0;
}
// src/util/abort.ts
/** Shared promise/abort-signal racing used by the HTTP, pipeline and prompt layers. */
/**
* Race one promise against an optional abort signal without leaking the abort
* listener. A missing signal leaves the promise untouched; an already-aborted
* signal rejects immediately with {@code makeError()} while attaching a
* rejection handler so the abandoned operation cannot become unhandled.
* @param promise - operation to await.
* @param signal - optional caller cancellation.
* @param makeError - builds the caller-specific cancellation error (same error
*   type and message the caller previously produced locally).
* @returns the operation result, or a rejection from the signal.
*/
function raceWithSignal(promise, signal, makeError) {
	if (signal === void 0) return promise;
	if (signal.aborted) {
		promise.catch(() => void 0);
		return Promise.reject(makeError());
	}
	return new Promise((resolvePromise, rejectPromise) => {
		const onAbort = () => {
			signal.removeEventListener("abort", onAbort);
			rejectPromise(makeError());
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolvePromise(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			rejectPromise(error);
		});
	});
}
// src/enhance/prompt.ts
/** Built-in fallback prompt used when no prompt file is configured or readable. */
const DEFAULT_ENHANCE_SYSTEM_PROMPT = [
	"You rewrite a user input into one compact web-search query.",
	"",
	"Rules:",
	"1. Identify the intent (informational, navigational, or transactional) and keep the core entities: product, brand, place, person, technical term, version, and date.",
	"2. Remove filler, greetings, and conversational phrasing such as \"please\", \"help me\", \"I want to know\", \"how much\", \"what is\", and \"thanks\".",
	"3. Add only context the search requires and the user implied: for example \"price\" for a cost question, or \"release notes\" for a latest-version question.",
	"4. Keep comparison and constraint words such as \"vs\", \"compare\", \"difference\", \"review\", \"recommend\", and \"ranking\".",
	"5. Order the most important entity first, separate terms with single spaces, and use at most 8 terms.",
	"",
	"Output:",
	"- Return exactly one line containing the search query.",
	"- Do not explain, quote, or add punctuation other than spaces.",
	"- Do not invent entities the user did not mention.",
	"- If the input is already a clean query, return it unchanged."
].join("\n");
/** Smallest accepted prompt byte size; larger files fall back to the built-in prompt. */
const MAX_ENHANCE_PROMPT_BYTES = 65536;
var PromptTooLargeError = class extends Error {
	maxBytes;
	constructor(maxBytes) {
		super("prompt file exceeds " + String(maxBytes) + " bytes");
		this.maxBytes = maxBytes;
		this.name = "PromptTooLargeError";
	}
};
function abortError$1(signal) {
	return new WebError("enhancement prompt read aborted", "WEB_ABORTED", { cause: signal?.reason });
}
/** Fresh aborted read; keeps TypeScript narrowing from hiding a later abort. */
function isAborted$1(signal) {
	return signal?.aborted === true;
}
/**
* Read one reader to EOF or maxBytes + 1 bytes. A short read is not EOF: the
* loop keeps reading at the next offset until the reader reports zero bytes or
* the cap is crossed, so a valid prompt is never silently truncated.
*/
async function readBounded(reader, maxBytes) {
	const buffer = Buffer.alloc(maxBytes + 1);
	let total = 0;
	while (total <= maxBytes) {
		const { bytesRead } = await reader.read(buffer, total, maxBytes + 1 - total, total);
		if (bytesRead <= 0) break;
		total += bytesRead;
	}
	if (total > maxBytes) throw new PromptTooLargeError(maxBytes);
	return buffer.subarray(0, total).toString("utf8");
}
/** Read at most maxBytes + 1 bytes so an oversized prompt is rejected without buffering it. */
async function readFileBounded(path, maxBytes) {
	const handle = await open(path, "r");
	try {
		return await readBounded(handle, maxBytes);
	} finally {
		await handle.close();
	}
}
function normalizeMaxBytes(value) {
	if (value === void 0 || !Number.isFinite(value) || value <= 0) return MAX_ENHANCE_PROMPT_BYTES;
	return Math.min(Math.floor(value), MAX_ENHANCE_PROMPT_BYTES);
}
/**
* Expand {@code ~} and validate an absolute path. Empty input means the built-in
* prompt; a relative path is invalid and also resolves to undefined. The page
* accepts absolute path shapes for every platform and leaves the final
* platform-specific decision here.
*/
function resolveEnhanceSystemPromptPath(input, home = homedir()) {
	const trimmed = input.trim();
	if (trimmed.length === 0) return void 0;
	if (trimmed.startsWith("~/")) return resolve(home, trimmed.slice(2));
	return isAbsolute(trimmed) ? trimmed : void 0;
}
/**
* Read the configured enhancement system prompt. An empty, invalid, unreadable,
* blank or oversized file falls back to {@link DEFAULT_ENHANCE_SYSTEM_PROMPT}
* instead of failing the search; the failure is logged when a logger is available.
* The read is bounded and races the caller signal so it stays inside the tool's
* timeout budget.
*/
async function loadEnhanceSystemPrompt(input, options = {}) {
	if (isAborted$1(options.signal)) throw abortError$1(options.signal);
	const path = resolveEnhanceSystemPromptPath(input, options.home ?? homedir());
	if (path === void 0) {
		if (input.trim().length > 0) options.logger?.warn("thin-search: enhancement prompt path \"" + input.trim() + "\" is not absolute or ~/...; using the built-in prompt");
		return DEFAULT_ENHANCE_SYSTEM_PROMPT;
	}
	const maxBytes = normalizeMaxBytes(options.maxBytes);
	const readText = options.readText ?? (async (file) => await readFileBounded(file, maxBytes));
	try {
		const text = await raceWithSignal(readText(path), options.signal, () => abortError$1(options.signal));
		if (isAborted$1(options.signal)) throw abortError$1(options.signal);
		if (Buffer.byteLength(text, "utf8") > maxBytes) {
			options.logger?.warn("thin-search: enhancement prompt file " + path + " exceeds " + String(maxBytes) + " bytes; using the built-in prompt");
			return DEFAULT_ENHANCE_SYSTEM_PROMPT;
		}
		const content = text.trim();
		if (content.length > 0) return content;
		options.logger?.warn("thin-search: enhancement prompt file " + path + " is empty; using the built-in prompt");
	} catch (error) {
		if (isAborted$1(options.signal)) throw abortError$1(options.signal);
		if (error instanceof PromptTooLargeError) {
			options.logger?.warn("thin-search: enhancement prompt file " + path + " exceeds " + String(maxBytes) + " bytes; using the built-in prompt");
			return DEFAULT_ENHANCE_SYSTEM_PROMPT;
		}
		options.logger?.warn("thin-search: cannot read enhancement prompt file " + path + " (" + (error instanceof Error ? error.message : String(error)) + "); using the built-in prompt");
	}
	return DEFAULT_ENHANCE_SYSTEM_PROMPT;
}
// src/enhance/index.ts
/**
* Optional query enhancement. Without an override it uses the current Agent
* model; a configured {@code provider:model} override is exclusive, and its
* failure is reported instead of silently spending tokens on another route.
*/
const DEFAULT_TIMEOUT_MS$1 = 8e3;
const MAX_ENHANCED_LENGTH = 80;
/** Parse a {@code provider:model} override; undefined when empty or malformed. */
function parseEnhanceModel(value) {
	const trimmed = value.trim();
	if (trimmed.length === 0) return void 0;
	const separator = trimmed.indexOf(":");
	if (separator <= 0 || separator === trimmed.length - 1) return void 0;
	const provider = trimmed.slice(0, separator).trim();
	const model = trimmed.slice(separator + 1).trim();
	return provider.length > 0 && model.length > 0 ? {
		provider,
		model
	} : void 0;
}
/** Strip quotes and collapse whitespace; reject empty or over-long model output. */
function sanitizeEnhancedQuery(text) {
	const cleaned = text.replace(/\s+/gu, " ").trim().replace(/^["'\u2018\u2019\u201c\u201d\x60]+|["'\u2018\u2019\u201c\u201d\x60]+$/gu, "").trim();
	if (cleaned.length === 0 || cleaned.length > MAX_ENHANCED_LENGTH) return void 0;
	return cleaned;
}
/** Throw the shared cancellation error when the caller already aborted. */
function throwIfAborted$1(signal) {
	if (signal?.aborted === true) throw new WebError("search enhancement aborted", "WEB_ABORTED", { cause: signal.reason });
}
/** Build the user message sent to the enhancement model. */
function enhancementMessage(query) {
	return [{
		role: "user",
		content: [{
			type: "text",
			text: `Input: ${JSON.stringify(query)}\nOutput:`
		}]
	}];
}
/** Run one model call and return the accumulated text. */
async function complete(llm, route, system, query, signal, timeoutMs) {
	const controller = new AbortController();
	let timedOut = false;
	let rejectTimeout;
	const timeout = new Promise((_resolve, reject) => {
		rejectTimeout = reject;
	});
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort(/* @__PURE__ */ new Error("enhancement timeout"));
		rejectTimeout(/* @__PURE__ */ new Error("enhancement timed out"));
	}, timeoutMs);
	let rejectAborted;
	const aborted = signal === void 0 ? void 0 : new Promise((_resolve, reject) => {
		rejectAborted = reject;
	});
	const onAbort = () => {
		controller.abort(signal?.reason);
		rejectAborted?.(new WebError("search enhancement aborted", "WEB_ABORTED", { cause: signal?.reason }));
	};
	signal?.addEventListener("abort", onAbort, { once: true });
	const collect = async () => {
		const chunks = [];
		let failure;
		const stream = llm.stream({
			provider: route.provider,
			model: route.model,
			messages: enhancementMessage(query),
			system,
			temperature: 0,
			maxTokens: 60,
			signal: controller.signal
		});
		for await (const chunk of stream) if (chunk.type === "text-delta") chunks.push(chunk.text);
		else if (chunk.type === "finish") {
			if (chunk.reason.kind === "error") failure = chunk.reason.failure.message.length > 0 ? chunk.reason.failure.message : chunk.reason.failure.code;
			else if (chunk.reason.kind === "aborted") failure = timedOut ? "enhancement timed out" : "enhancement aborted";
		}
		if (signal?.aborted === true) throw new WebError("search enhancement aborted", "WEB_ABORTED", { cause: signal.reason });
		if (failure !== void 0) throw new Error(failure);
		return chunks.join("");
	};
	try {
		return await Promise.race(aborted === void 0 ? [collect(), timeout] : [
			collect(),
			timeout,
			aborted
		]);
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
}
/** Create the optional query enhancer used before engine search. */
function createEnhancer(options) {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS$1;
	return async (query, signal) => {
		throwIfAborted$1(signal);
		const config = options.getConfig();
		const llm = options.getLlm();
		if (llm === void 0) return {
			query,
			enhanced: false,
			error: "llm service unavailable"
		};
		const configured = config.enhanceModel.trim();
		const override = parseEnhanceModel(configured);
		let candidates;
		if (configured.length > 0) {
			if (override === void 0) return {
				query,
				enhanced: false,
				error: `invalid enhanceModel "${config.enhanceModel}": expected "provider:model"`
			};
			candidates = [override];
		} else {
			const agent = options.getAgentSelection();
			candidates = agent === void 0 ? [] : [{
				provider: agent.provider,
				model: agent.model
			}];
		}
		if (candidates.length === 0) return {
			query,
			enhanced: false,
			error: "no model available"
		};
		const system = options.loadPrompt === void 0 ? await loadEnhanceSystemPrompt(config.enhanceSystemPromptPath, {
			...options.logger === void 0 ? {} : { logger: options.logger },
			...signal === void 0 ? {} : { signal }
		}) : await options.loadPrompt(config.enhanceSystemPromptPath);
		throwIfAborted$1(signal);
		let lastError;
		for (const candidate of candidates) {
			throwIfAborted$1(signal);
			try {
				const enhanced = sanitizeEnhancedQuery(await complete(llm, candidate, system, query, signal, timeoutMs));
				if (enhanced === void 0) {
					lastError = "empty or invalid enhancement";
					continue;
				}
				return {
					query: enhanced,
					enhanced: true,
					original: query,
					model: `${candidate.provider}:${candidate.model}`
				};
			} catch (error) {
				if (signal?.aborted === true) throw error;
				lastError = error instanceof Error ? error.message : String(error);
				options.logger?.warn(`thin-search: enhancement via ${candidate.provider}/${candidate.model} failed: ${lastError}`);
			}
		}
		return {
			query,
			enhanced: false,
			error: lastError ?? "enhancement failed"
		};
	};
}
// src/search/normalize.ts
/** Decode one numeric entity without throwing on malformed input. */
function fromCodePoint(value) {
	if (!Number.isInteger(value) || value < 0 || value > 1114111) return "";
	try {
		return String.fromCodePoint(value);
	} catch {
		return "";
	}
}
/** Decode the small HTML entity set search result titles and snippets use. */
function decodeEntities(text) {
	return String(text).replace(/&amp;/gu, "&").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, "\"").replace(/&#39;/gu, "'").replace(/&#x27;/gu, "'").replace(/&apos;/gu, "'").replace(/&nbsp;/gu, " ").replace(/&#(\d+);/gu, (_, code) => fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/giu, (_, code) => fromCodePoint(Number.parseInt(code, 16)));
}
/** Remove tags, decode entities, and collapse whitespace. */
function stripTags(html) {
	return decodeEntities(String(html).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim());
}
const SNIPPET_NOISE = /\b(sign up|sign in|log in|login|subscribe( to| for)?|member[- ]?only|become a member|create (a )?free account|read more|continue reading|story continues|get started|install (the )?app|view on|medium membership|join \w+ for free|get updates from this writer|stories in your inbox|remember me for|unlock this|free to read|become a patron)\b/giu;
/** Remove boilerplate phrases and markdown noise from a provider snippet. */
function cleanSnippet(text, maxLength = 300) {
	if (text === void 0) return void 0;
	const cleaned = String(text).replace(SNIPPET_NOISE, " ").replace(/^\s*(#{1,6}\s*|\[\s*x?\s*\]\s*|-\s*\[\s*x?\s*\]\s*|>\s*)/gmu, " ").replace(/\s+/gu, " ").trim();
	if (cleaned.length === 0) return void 0;
	return cleaned.slice(0, maxLength);
}
/** Accept only absolute http(s) URLs; returns undefined for relative, data, javascript, and malformed values. */
function sanitizeUrl(raw, base) {
	if (raw === void 0) return void 0;
	const trimmed = raw.trim();
	if (trimmed.length === 0) return void 0;
	try {
		const url = base === void 0 ? new URL(trimmed) : new URL(trimmed, base);
		if (url.protocol !== "http:" && url.protocol !== "https:") return void 0;
		return url.toString();
	} catch {
		return;
	}
}
/** Normalize one source: valid URL, clean title and snippet, bounded summary. */
function normalizeSource(source) {
	const url = sanitizeUrl(source.url);
	if (url === void 0) return void 0;
	const title = source.title === void 0 ? void 0 : decodeEntities(source.title).trim() || void 0;
	const snippet = cleanSnippet(source.snippet);
	const summary = source.summary === void 0 ? void 0 : decodeEntities(source.summary).trim() || void 0;
	const publishedAt = source.publishedAt === void 0 ? void 0 : source.publishedAt.trim() || void 0;
	return {
		url,
		...title === void 0 ? {} : { title },
		...snippet === void 0 ? {} : { snippet },
		...summary === void 0 ? {} : { summary },
		...publishedAt === void 0 ? {} : { publishedAt }
	};
}
/** Normalize, deduplicate by URL, and cap a source list. */
function normalizeSources(sources, limit) {
	const seen = /* @__PURE__ */ new Set();
	const normalized = [];
	for (const source of sources) {
		const candidate = normalizeSource(source);
		if (candidate === void 0 || seen.has(candidate.url)) continue;
		seen.add(candidate.url);
		normalized.push(candidate);
		if (normalized.length >= limit) break;
	}
	return normalized;
}
/** Extract a DuckDuckGo redirect target from an {@code href}. */
function extractDdgUrl(rel, base = "https://duckduckgo.com") {
	if (rel === void 0) return void 0;
	const trimmed = rel.trim();
	if (trimmed.length === 0) return void 0;
	const match = /[?&]uddg=([^&]+)/u.exec(trimmed);
	if (match !== null) {
		const encoded = match[1];
		if (encoded === void 0) return void 0;
		try {
			return sanitizeUrl(decodeURIComponent(encoded));
		} catch {
			return;
		}
	}
	if (trimmed.startsWith("//")) return sanitizeUrl(`https:${trimmed}`);
	return sanitizeUrl(trimmed, base);
}
/** Join optional text fragments with single newlines, dropping empty values. */
function joinNotes(notes) {
	const present = notes.filter((note) => note !== void 0 && note.trim().length > 0);
	return present.length === 0 ? void 0 : present.join("\n");
}
// src/platforms/bilibili.ts
/** Flatten Bilibili's grouped search response into sources. */
function parseBilibiliJson(payload, limit) {
	const response = payload ?? {};
	if (response.code !== 0 && response.code !== void 0) throw new Error(`Bilibili API error: ${typeof response.message === "string" ? response.message : String(response.code)}`);
	const sections = Array.isArray(response.data?.result) ? response.data.result : [];
	const sources = [];
	for (const section of sections) {
		if (!Array.isArray(section?.data)) continue;
		for (const raw of section.data) {
			if (typeof raw?.arcurl !== "string" || raw.arcurl.length === 0) continue;
			const title = typeof raw.title === "string" ? stripTags(raw.title) : typeof raw.bvid === "string" ? raw.bvid : "";
			const snippet = typeof raw.desc === "string" ? stripTags(raw.desc).slice(0, 200) : "";
			sources.push({
				url: raw.arcurl,
				...title.length === 0 ? {} : { title },
				...snippet.length === 0 ? {} : { snippet },
				...typeof raw.pubdate === "number" && raw.pubdate > 0 ? { publishedAt: (/* @__PURE__ */ new Date(raw.pubdate * 1e3)).toISOString() } : {}
			});
		}
	}
	return normalizeSources(sources, limit);
}
/** Bilibili video search through the web-interface API. */
const bilibiliPlatform = {
	id: "bilibili",
	title: "Bilibili",
	limitation: "May reject requests from data-center or proxy egress IPs (risk control).",
	async search(context) {
		const endpoint = new URL("https://api.bilibili.com/x/web-interface/search/all/v2");
		endpoint.searchParams.set("keyword", context.query);
		return parseBilibiliJson(await context.http.json(endpoint.toString(), {
			accept: "application/json",
			headers: { referer: "https://www.bilibili.com" },
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/platforms/github.ts
/** Parse GitHub's repository search response. */
function parseGithubJson(payload, limit) {
	const response = payload ?? {};
	if (!Array.isArray(response.items)) return [];
	const sources = [];
	for (const raw of response.items) {
		if (typeof raw?.html_url !== "string") continue;
		const title = typeof raw.full_name === "string" ? raw.full_name : typeof raw.name === "string" ? raw.name : void 0;
		const stars = typeof raw.stargazers_count === "number" && raw.stargazers_count > 0 ? ` ⭐${raw.stargazers_count}` : "";
		const snippet = `${typeof raw.description === "string" ? raw.description : ""}${stars}`.trim();
		sources.push({
			url: raw.html_url,
			...title === void 0 ? {} : { title },
			...snippet.length === 0 ? {} : { snippet },
			...typeof raw.updated_at === "string" ? { publishedAt: raw.updated_at } : {}
		});
	}
	return normalizeSources(sources, limit);
}
/** GitHub repository search through the public REST API. */
const githubPlatform = {
	id: "github",
	title: "GitHub",
	async search(context) {
		const endpoint = new URL("https://api.github.com/search/repositories");
		endpoint.searchParams.set("q", context.query);
		endpoint.searchParams.set("per_page", String(context.maxResults));
		return parseGithubJson(await context.http.json(endpoint.toString(), {
			accept: "application/vnd.github+json",
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/platforms/hn.ts
/** Parse an Algolia Hacker News search response. */
function parseHackerNewsJson(payload, limit) {
	const response = payload ?? {};
	if (!Array.isArray(response.hits)) return [];
	const sources = [];
	for (const raw of response.hits) {
		const title = typeof raw?.title === "string" ? raw.title : typeof raw.story_title === "string" ? raw.story_title : "";
		if (title.length === 0 && typeof raw?.objectID !== "string") continue;
		const url = typeof raw.url === "string" && raw.url.length > 0 ? raw.url : typeof raw.objectID === "string" ? `https://news.ycombinator.com/item?id=${raw.objectID}` : void 0;
		if (url === void 0) continue;
		const points = typeof raw.points === "number" ? raw.points : void 0;
		const comments = typeof raw.num_comments === "number" ? raw.num_comments : void 0;
		const snippet = points === void 0 && comments === void 0 ? void 0 : `HN discussion · ${points ?? 0} points · ${comments ?? 0} comments`;
		sources.push({
			url,
			...title.length === 0 ? {} : { title: stripTags(title) },
			...snippet === void 0 ? {} : { snippet },
			...typeof raw.created_at === "string" ? { publishedAt: raw.created_at } : {}
		});
	}
	return normalizeSources(sources, limit);
}
/** Hacker News search through the Algolia API. */
const hackerNewsPlatform = {
	id: "hn",
	title: "Hacker News",
	async search(context) {
		const endpoint = new URL("https://hn.algolia.com/api/v1/search");
		endpoint.searchParams.set("query", context.query);
		endpoint.searchParams.set("hitsPerPage", String(context.maxResults));
		return parseHackerNewsJson(await context.http.json(endpoint.toString(), {
			accept: "application/json",
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/platforms/npm.ts
/** Parse the npm registry search response. */
function parseNpmJson(payload, limit) {
	const response = payload ?? {};
	if (!Array.isArray(response.objects)) return [];
	const sources = [];
	for (const raw of response.objects) {
		const pkg = raw?.package;
		if (pkg === void 0 || typeof pkg.name !== "string" || pkg.name.length === 0) continue;
		const url = typeof pkg.links?.npm === "string" ? pkg.links.npm : `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`;
		const snippet = `${typeof pkg.version === "string" ? `v${pkg.version}` : ""} — ${typeof pkg.description === "string" ? pkg.description : ""}`.replace(/^\s*—\s*/u, "").trim();
		sources.push({
			url,
			title: pkg.name,
			...snippet.length === 0 ? {} : { snippet: snippet.slice(0, 200) },
			...typeof pkg.date === "string" ? { publishedAt: pkg.date } : {}
		});
	}
	return normalizeSources(sources, limit);
}
/** npm package search through the registry search API. */
const npmPlatform = {
	id: "npm",
	title: "npm",
	async search(context) {
		const endpoint = new URL("https://registry.npmjs.com/-/v1/search");
		endpoint.searchParams.set("text", context.query);
		endpoint.searchParams.set("size", String(context.maxResults));
		return parseNpmJson(await context.http.json(endpoint.toString(), {
			accept: "application/json",
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/platforms/reddit.ts
/** Parse one Reddit listing response. */
function parseRedditJson(payload, limit) {
	const listing = payload ?? {};
	const children = Array.isArray(listing.data?.children) ? listing.data.children : [];
	const sources = [];
	for (const child of children) {
		const post = child?.data;
		if (post === null || typeof post !== "object" || typeof post.url !== "string") continue;
		const title = typeof post.title === "string" ? stripTags(post.title) : "";
		const snippet = typeof post.selftext === "string" ? stripTags(post.selftext).slice(0, 200) : "";
		sources.push({
			url: post.url,
			...title.length === 0 ? {} : { title },
			...snippet.length === 0 ? {} : { snippet },
			...typeof post.created_utc === "number" && post.created_utc > 0 ? { publishedAt: (/* @__PURE__ */ new Date(post.created_utc * 1e3)).toISOString() } : {}
		});
	}
	return normalizeSources(sources, limit);
}
/** Reddit search through the legacy JSON listing. */
const redditPlatform = {
	id: "reddit",
	title: "Reddit",
	limitation: "May reject requests from data-center or proxy egress IPs (risk control).",
	async search(context) {
		const endpoint = new URL("https://old.reddit.com/search.json");
		endpoint.searchParams.set("q", context.query);
		endpoint.searchParams.set("limit", String(context.maxResults));
		endpoint.searchParams.set("sort", "relevance");
		return parseRedditJson(await context.http.json(endpoint.toString(), {
			accept: "application/json",
			headers: { "user-agent": "dsh-thin-search/1.0.0 (DeepSeekRuntime plugin)" },
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/platforms/stackoverflow.ts
/** Parse a Stack Exchange search response. */
function parseStackOverflowJson(payload, limit) {
	const response = payload ?? {};
	if (typeof response.error_message === "string" && response.error_message.length > 0) throw new Error(`Stack Exchange API error: ${response.error_message}`);
	if (!Array.isArray(response.items)) return [];
	const sources = [];
	for (const raw of response.items) {
		if (typeof raw?.link !== "string" || typeof raw.title !== "string") continue;
		const answered = raw.is_answered === true ? "answered" : "unanswered";
		const score = typeof raw.score === "number" ? raw.score : 0;
		const answers = typeof raw.answer_count === "number" ? raw.answer_count : 0;
		sources.push({
			url: raw.link,
			title: stripTags(raw.title),
			snippet: `${answered} · score ${score} · ${answers} answers`,
			...typeof raw.creation_date === "number" && raw.creation_date > 0 ? { publishedAt: (/* @__PURE__ */ new Date(raw.creation_date * 1e3)).toISOString() } : {}
		});
	}
	return normalizeSources(sources, limit);
}
/** Stack Overflow search through the Stack Exchange API. */
const stackOverflowPlatform = {
	id: "stackoverflow",
	title: "Stack Overflow",
	async search(context) {
		const endpoint = new URL("https://api.stackexchange.com/2.3/search/advanced");
		endpoint.searchParams.set("order", "desc");
		endpoint.searchParams.set("sort", "relevance");
		endpoint.searchParams.set("q", context.query);
		endpoint.searchParams.set("site", "stackoverflow");
		endpoint.searchParams.set("pagesize", String(context.maxResults));
		return parseStackOverflowJson(await context.http.json(endpoint.toString(), {
			accept: "application/json",
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/platforms/v2ex.ts
/** Filter V2EX hot topics case-insensitively by the query. */
function parseV2exJson(payload, query, limit) {
	if (!Array.isArray(payload)) return [];
	const needle = query.trim().toLowerCase();
	const sources = [];
	for (const raw of payload) {
		const title = typeof raw?.title === "string" ? stripTags(raw.title) : "";
		const content = typeof raw?.content === "string" ? stripTags(raw.content) : "";
		if (!title.toLowerCase().includes(needle) && !content.toLowerCase().includes(needle)) continue;
		if (typeof raw.id !== "number") continue;
		const snippet = content.slice(0, 200);
		sources.push({
			url: `https://www.v2ex.com/t/${raw.id}`,
			...title.length === 0 ? {} : { title },
			...snippet.length === 0 ? {} : { snippet }
		});
	}
	return normalizeSources(sources, limit);
}
/** V2EX hot-topic search; the public API exposes no general full-text search. */
const v2exPlatform = {
	id: "v2ex",
	title: "V2EX",
	limitation: "Searches the current hot-topic list only (the public V2EX API has no full-text search).",
	async search(context) {
		return parseV2exJson(await context.http.json("https://www.v2ex.com/api/topics/hot.json", {
			accept: "application/json",
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.query, context.maxResults);
	}
};
// src/platforms/wikipedia.ts
/** Pick the Wikipedia language edition that matches the query script. */
function wikipediaHost(query) {
	return /[\u3400-\u9fff]/u.test(query) ? "zh.wikipedia.org" : "en.wikipedia.org";
}
/** Parse the MediaWiki search API response. */
function parseWikipediaJson(payload, host, limit) {
	const response = payload ?? {};
	const results = Array.isArray(response.query?.search) ? response.query.search : [];
	const sources = [];
	for (const raw of results) {
		if (typeof raw?.title !== "string") continue;
		const title = stripTags(raw.title);
		const page = encodeURIComponent(title.replace(/ /gu, "_"));
		sources.push({
			url: `https://${host}/wiki/${page}`,
			title,
			...typeof raw.snippet === "string" && raw.snippet.length > 0 ? { snippet: stripTags(raw.snippet).slice(0, 200) } : {},
			...typeof raw.timestamp === "string" ? { publishedAt: raw.timestamp } : {}
		});
	}
	return normalizeSources(sources, limit);
}
// src/platforms/index.ts
/** All eight platform adapters in display order. */
const PLATFORMS = Object.freeze([
	githubPlatform,
	v2exPlatform,
	bilibiliPlatform,
	redditPlatform,
	hackerNewsPlatform,
	stackOverflowPlatform,
	{
		id: "wikipedia",
		title: "Wikipedia",
		async search(context) {
			const host = wikipediaHost(context.query);
			const endpoint = new URL(`https://${host}/w/api.php`);
			endpoint.searchParams.set("action", "query");
			endpoint.searchParams.set("list", "search");
			endpoint.searchParams.set("srsearch", context.query);
			endpoint.searchParams.set("format", "json");
			endpoint.searchParams.set("srlimit", String(context.maxResults));
			return parseWikipediaJson(await context.http.json(endpoint.toString(), {
				accept: "application/json",
				...context.signal === void 0 ? {} : { signal: context.signal },
				deadline: context.deadline
			}), host, context.maxResults);
		}
	},
	npmPlatform
]);
/** Platform lookup keyed by id. */
const PLATFORM_MAP = new Map(PLATFORMS.map((platform) => [platform.id, platform]));
/** Resolve one platform adapter. */
function getPlatform(id) {
	const platform = PLATFORM_MAP.get(id);
	if (platform === void 0) throw new Error(`unknown platform: ${id}`);
	return platform;
}
/** Create the platform-search service with one deadline shared by the adapter's requests. */
function createPlatformSearchService(options) {
	const now = options.now ?? Date.now;
	const timeoutMs = options.timeoutMs ?? 12e3;
	return { async search(platform, query, maxResults, signal) {
		const adapter = getPlatform(platform);
		const limit = Math.min(Math.max(Math.trunc(maxResults), 1), 10);
		const context = {
			query: query.trim(),
			maxResults: limit,
			config: options.getConfig(),
			http: options.http,
			...signal === void 0 ? {} : { signal },
			deadline: now() + timeoutMs
		};
		return await adapter.search(context);
	} };
}
// src/search/cache.ts
/**
* Insertion-ordered map used as an LRU. A successful {@link get} refreshes
* recency; an expired entry is removed on read. TTL 0 is not special here —
* callers disable the cache instead of inserting zero-lifetime entries.
*/
var ResultCache = class {
	capacity;
	now;
	entries = /* @__PURE__ */ new Map();
	constructor(capacity = 50, now = Date.now) {
		this.capacity = capacity;
		this.now = now;
		if (!Number.isInteger(capacity) || capacity <= 0) throw new TypeError("ResultCache capacity must be a positive integer");
	}
	/** Read and refresh one entry; expired entries are treated as absent. */
	get(key) {
		const entry = this.entries.get(key);
		if (entry === void 0) return void 0;
		if (entry.expiresAt <= this.now()) {
			this.entries.delete(key);
			return;
		}
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.value;
	}
	/** Insert or replace one entry, evicting the least-recently-used entry above capacity. */
	set(key, value, ttlMs) {
		if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
			this.entries.delete(key);
			return;
		}
		const expiresAt = this.now() + ttlMs;
		this.entries.delete(key);
		this.entries.set(key, {
			value,
			expiresAt
		});
		while (this.entries.size > this.capacity) {
			const oldest = this.entries.keys().next().value;
			if (oldest === void 0) break;
			this.entries.delete(oldest);
		}
	}
	/** Remove one entry. */
	delete(key) {
		return this.entries.delete(key);
	}
	/** Remove every entry. */
	clear() {
		this.entries.clear();
	}
	/** Number of retained entries, including entries that will expire on next read. */
	get size() {
		return this.entries.size;
	}
};
// src/search/http.ts
/** Global fetch wrapper: URL validation, per-attempt timeout, retry classification, and block-page detection. */
/** One classified transport failure. {@link transient} is true only for network errors and 5xx responses. */
var HttpError = class extends Error {
	code;
	status;
	transient;
	constructor(message, code, options = { transient: false }) {
		super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
		this.name = "HttpError";
		this.code = code;
		this.status = options.status;
		this.transient = options.transient;
	}
};
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const DEFAULT_ACCEPT_LANGUAGE = "zh-CN,zh;q=0.9,en;q=0.8";
const DEFAULT_ACCEPT = "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8";
const DEFAULT_TIMEOUT_MS = 12e3;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_MAX_BODY_BYTES = 2e6;
/**
* Challenge pages are identified by their interstitial form/title markup, never
* by free-text words: a legitimate result page may legitimately contain
* "captcha", "access denied", "unusual traffic" or "robot" in a query, title,
* or snippet. JSON responses and JSON-accepting requests are never challenge
* pages.
*/
const CHALLENGE_SIGNATURES = [
	/anomaly-modal|bots use DuckDuckGo too/iu,
	/<form\b[^>]*\bid\s*=\s*["']challenge-form["']/iu,
	/<form\b[^>]*\baction\s*=\s*["'][^"']*(?:\/anomaly|\/challenge|captcha-form|captcha)[^"']*["']/iu,
	/\b(?:id|class)\s*=\s*["'][^"']*\b(?:b_captcha|captcha-form|cf-challenge|challenge-platform|challenge-container)\b[^"']*["']/iu,
	/cf-browser-verification|attention-required/iu,
	/<title>\s*Just a moment\.\.\.\s*<\/title>/iu
];
/** Whether a response should be treated as JSON (and therefore never as a challenge page). */
function isJsonResponse(options = {}) {
	if ((options.accept ?? "").toLowerCase().includes("json")) return true;
	return (options.contentType ?? "").toLowerCase().includes("json");
}
/**
* Detect an anti-bot interstitial using challenge-specific markup. Legitimate
* pages that merely mention "captcha", "access denied" or "unusual traffic" are
* not challenges; JSON bodies are never inspected.
*/
function detectBlockPage(body, options = {}) {
	if (isJsonResponse(options)) return false;
	const sample = body.slice(0, 8e3);
	return CHALLENGE_SIGNATURES.some((pattern) => pattern.test(sample));
}
/** Fresh <code>aborted</code> read; a helper avoids TypeScript control-flow narrowing across awaits. */
function isAborted(signal) {
	return signal?.aborted === true;
}
/** True for a fetch/AbortSignal abort. */
function isAbortError(error) {
	return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}
/** Narrow an unknown failure to {@link HttpError}. */
function isHttpError(error) {
	return error instanceof HttpError;
}
function parseHttpUrl(raw) {
	let parsed;
	try {
		parsed = new URL(raw);
	} catch (error) {
		throw new HttpError(`invalid URL: ${String(raw)}`, "INVALID_URL", {
			transient: false,
			cause: error
		});
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new HttpError(`unsupported URL scheme: ${parsed.protocol}`, "INVALID_URL", { transient: false });
	return parsed.toString();
}
/** Wait for {@code ms}, rejecting with {@code ABORTED} when the caller cancels. */
function sleep(ms, signal) {
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve, reject) => {
		if (isAborted(signal)) {
			reject(new HttpError("request aborted", "ABORTED", {
				transient: false,
				cause: signal?.reason
			}));
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(new HttpError("request aborted", "ABORTED", {
				transient: false,
				cause: signal?.reason
			}));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
/** Parse a declared Content-Length; undefined when the header is absent or malformed. */
function declaredBodyLength(headers) {
	const raw = headers.get("content-length");
	if (raw === null) return void 0;
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 ? value : void 0;
}
/** Release an unread error response body; failures are ignored because the status error is authoritative. */
async function cancelResponseBody(response) {
	try {
		await response.body?.cancel();
	} catch {}
}
function bodyTooLarge(url, maxBytes, status, bytes) {
	return new HttpError(`response body from ${url} exceeds ${maxBytes} bytes (read ${bytes} bytes)`, "BODY_TOO_LARGE", {
		status,
		transient: false
	});
}
/**
* Read a response body with a running byte cap. Chunks are decoded as they
* arrive and the reader is cancelled as soon as the cap is crossed, so an
* oversized response is never buffered in full. Caller aborts cancel the reader.
*/
async function readBodyWithLimit(response, url, maxBytes, signal) {
	const reader = response.body?.getReader();
	if (reader === void 0) {
		const text = await response.text();
		const bytes = Buffer.byteLength(text, "utf8");
		if (bytes > maxBytes) throw bodyTooLarge(url, maxBytes, response.status, bytes);
		return text;
	}
	let total = 0;
	let text = "";
	const decoder = new TextDecoder();
	let cancelled = false;
	const cancel = () => {
		if (cancelled) return;
		cancelled = true;
		reader.cancel().catch(() => void 0);
	};
	const onAbort = () => {
		cancel();
	};
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		for (;;) {
			if (signal.aborted) throw new Error("body read aborted");
			const { done, value } = await reader.read();
			if (done) break;
			if (value === void 0) continue;
			total += value.byteLength;
			if (total > maxBytes) {
				cancel();
				throw bodyTooLarge(url, maxBytes, response.status, total);
			}
			text += decoder.decode(value, { stream: true });
		}
		return text + decoder.decode();
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}
var FetchHttpClient = class {
	fetchImpl;
	userAgent;
	acceptLanguage;
	retries;
	retryDelayMs;
	requestTimeoutMs;
	maxBodyBytes;
	now;
	logger;
	constructor(options) {
		this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
		this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
		this.acceptLanguage = options.acceptLanguage ?? DEFAULT_ACCEPT_LANGUAGE;
		this.retries = normalizeCount(options.retries, DEFAULT_RETRIES);
		this.retryDelayMs = normalizeDuration(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
		this.requestTimeoutMs = normalizeDuration(options.requestTimeoutMs, DEFAULT_TIMEOUT_MS, false);
		this.maxBodyBytes = normalizeDuration(options.maxBodyBytes, DEFAULT_MAX_BODY_BYTES, false);
		this.now = options.now ?? Date.now;
		this.logger = options.logger;
	}
	abortError(timedOut, callerSignal) {
		if (isAborted(callerSignal)) return new HttpError("request aborted", "ABORTED", {
			transient: false,
			cause: callerSignal?.reason
		});
		return new HttpError(`request timed out after ${this.requestTimeoutMs}ms`, "TIMEOUT", { transient: timedOut });
	}
	async request(rawUrl, options = {}) {
		const url = parseHttpUrl(rawUrl);
		const callerSignal = options.signal;
		if (isAborted(callerSignal)) throw new HttpError("request aborted", "ABORTED", {
			transient: false,
			cause: callerSignal?.reason
		});
		const deadline = options.deadline ?? this.now() + Math.max(1, options.timeoutMs ?? this.requestTimeoutMs);
		const retries = normalizeCount(options.retries, this.retries);
		const headers = {
			"user-agent": this.userAgent,
			"accept-language": this.acceptLanguage,
			...options.accept !== void 0 ? { accept: options.accept } : { accept: DEFAULT_ACCEPT },
			...options.headers
		};
		for (let attempt = 0;; attempt++) {
			if (isAborted(callerSignal)) throw new HttpError("request aborted", "ABORTED", {
				transient: false,
				cause: callerSignal?.reason
			});
			const remaining = deadline - this.now();
			if (remaining <= 0) throw new HttpError(`request deadline exceeded for ${url}`, "TIMEOUT", { transient: false });
			const controller = new AbortController();
			const state = { timedOut: false };
			const timer = setTimeout(() => {
				state.timedOut = true;
				controller.abort(/* @__PURE__ */ new Error("timeout"));
			}, remaining);
			const onCallerAbort = () => {
				controller.abort(callerSignal?.reason);
			};
			callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
			try {
				const response = await raceWithSignal(this.fetchImpl(url, {
					method: options.method ?? "GET",
					headers,
					...options.body === void 0 ? {} : { body: options.body },
					redirect: options.redirect ?? "follow",
					signal: controller.signal
				}), controller.signal, () => this.abortError(state.timedOut, callerSignal));
				if (response.status === 202) {
					await cancelResponseBody(response);
					throw new HttpError(`anti-bot challenge from ${url} (HTTP 202)`, "CAPTCHA", {
						status: 202,
						transient: false
					});
				}
				if (response.status === 403) {
					await cancelResponseBody(response);
					throw new HttpError(`HTTP 403 from ${url}; the site rejected this client`, "FORBIDDEN", {
						status: 403,
						transient: false
					});
				}
				if (response.status < 200 || response.status >= 300) {
					await cancelResponseBody(response);
					throw new HttpError(`HTTP ${response.status} from ${url}`, "HTTP_STATUS", {
						status: response.status,
						transient: response.status >= 500
					});
				}
				const declared = declaredBodyLength(response.headers);
				if (declared !== void 0 && declared > this.maxBodyBytes) {
					await cancelResponseBody(response);
					throw new HttpError(`response body from ${url} has Content-Length ${declared}, above the ${this.maxBodyBytes}-byte limit`, "BODY_TOO_LARGE", {
						status: response.status,
						transient: false
					});
				}
				const body = await raceWithSignal(readBodyWithLimit(response, url, this.maxBodyBytes, controller.signal), controller.signal, () => this.abortError(state.timedOut, callerSignal));
				if (detectBlockPage(body, {
					contentType: response.headers.get("content-type"),
					...options.accept === void 0 ? {} : { accept: options.accept }
				})) throw new HttpError(`anti-bot challenge page from ${url}`, "CAPTCHA", {
					status: response.status,
					transient: false
				});
				return {
					status: response.status,
					url: response.url || url,
					headers: response.headers,
					body
				};
			} catch (error) {
				const classified = error instanceof HttpError ? error : isAborted(callerSignal) ? new HttpError("request aborted", "ABORTED", {
					transient: false,
					cause: callerSignal?.reason
				}) : state.timedOut || isAbortError(error) ? new HttpError(`request timed out for ${url}`, "TIMEOUT", {
					transient: true,
					cause: error
				}) : new HttpError(`network error for ${url}: ${error instanceof Error ? error.message : String(error)}`, "NETWORK", {
					transient: true,
					cause: error
				});
				if (!classified.transient || attempt >= retries) throw classified;
				this.logger?.warn(`thin-search: retrying ${url} after ${classified.code}: ${classified.message}`);
				await sleep(this.retryDelayMs, callerSignal);
			} finally {
				clearTimeout(timer);
				callerSignal?.removeEventListener("abort", onCallerAbort);
			}
		}
	}
	async text(url, options = {}) {
		return (await this.request(url, options)).body;
	}
	async json(url, options = {}) {
		const body = await this.text(url, {
			...options,
			accept: options.accept ?? "application/json"
		});
		try {
			return JSON.parse(body);
		} catch (error) {
			throw new HttpError(`invalid JSON from ${url}`, "INVALID_BODY", {
				transient: false,
				cause: error
			});
		}
	}
};
function normalizeCount(value, fallback) {
	return value !== void 0 && Number.isInteger(value) && value >= 0 ? value : fallback;
}
function normalizeDuration(value, fallback, allowZero = true) {
	return value !== void 0 && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : fallback;
}
/** Create the fetch wrapper used by engines and platforms. */
function createHttpClient(options = {}) {
	return new FetchHttpClient(options);
}
// src/search/engines/anysearch.ts
/** AnySearch JSON endpoint. */
const ANYSEARCH_URL = "https://api.anysearch.com/v1/search";
/** Parse an AnySearch response body into normalized sources. */
function parseAnysearchJson(payload, limit) {
	const response = payload ?? {};
	if (response.code !== 0 && response.code !== void 0) throw new Error(`AnySearch API error: ${typeof response.message === "string" ? response.message : String(response.code)}`);
	if (!Array.isArray(response.data?.results)) return [];
	const sources = [];
	for (const raw of response.data.results) {
		if (typeof raw?.url !== "string") continue;
		sources.push({
			url: raw.url,
			...typeof raw.title === "string" && raw.title.trim().length > 0 ? { title: raw.title } : {},
			...typeof raw.snippet === "string" && raw.snippet.trim().length > 0 ? { snippet: raw.snippet } : {}
		});
	}
	return normalizeSources(sources, limit);
}
/** AnySearch AI search API. */
const anysearchEngine = {
	id: "anysearch",
	title: "AnySearch",
	supportsTimeRange: false,
	async search(context) {
		return parseAnysearchJson(await context.http.json(ANYSEARCH_URL, {
			method: "POST",
			accept: "application/json",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				query: context.query,
				max_results: context.maxResults
			}),
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/search/engines/bing.ts
/** Parse a Bing result page into normalized sources. */
function parseBingHtml(html, limit) {
	const root = parse(html);
	const sources = [];
	for (const block of root.querySelectorAll("li.b_algo")) {
		const link = block.querySelector("h2 a") ?? block.querySelector("a");
		const url = sanitizeUrl(link?.getAttribute("href"));
		if (url === void 0) continue;
		const title = link?.text.trim();
		const snippet = block.querySelector(".b_caption p")?.text ?? block.querySelector("p")?.text;
		sources.push({
			url,
			...title === void 0 || title.length === 0 ? {} : { title },
			...snippet === void 0 ? {} : { snippet }
		});
	}
	return normalizeSources(sources, limit);
}
/** Bing HTML search, the default free engine. */
const bingEngine = {
	id: "bing",
	title: "Bing",
	supportsTimeRange: false,
	async search(context) {
		const endpoint = new URL("https://www.bing.com/search");
		endpoint.searchParams.set("q", context.query);
		endpoint.searchParams.set("mkt", context.config.bingMarket);
		return parseBingHtml(await context.http.text(endpoint.toString(), {
			accept: "text/html,application/xhtml+xml",
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/search/time-range.ts
/** Relative days represented by each fixed tier. */
const DAYS_BY_RANGE = Object.freeze({
	day: 1,
	week: 7,
	month: 30,
	year: 365
});
const TIER_DAYS = Object.freeze({
	day: "day",
	"1d": "day",
	week: "week",
	"7d": "week",
	month: "month",
	"30d": "month",
	year: "year",
	"365d": "year"
});
const ABSOLUTE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const RELATIVE = /^(\d+(?:\.\d+)?)\s*(h|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|year|years)$/u;
/** Days in a proleptic Gregorian month. */
function daysInMonth(year, month) {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
/** Validate one absolute date and return it in canonical {@code YYYY-MM-DD} form. */
function normalizeAbsoluteDate(input) {
	const match = ABSOLUTE_DATE.exec(input.trim());
	if (match === null) return void 0;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12) return void 0;
	if (day < 1 || day > daysInMonth(year, month)) return void 0;
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/** Normalize one relative unit into fractional days. */
function relativeUnitToDays(value, unit) {
	if (unit === "h" || unit === "hour" || unit === "hours") return value / 24;
	if (unit === "w" || unit === "week" || unit === "weeks") return value * 7;
	if (unit === "mo" || unit === "month" || unit === "months") return value * 30;
	if (unit === "y" || unit === "year" || unit === "years") return value * 365;
	return value;
}
/**
* Whether an already-normalized absolute date is later than {@code now}'s local
* calendar day. Absolute dates are interpreted as local calendar dates: the
* input date and the local year/month/day are both expanded with
* {@link Date.UTC}, so the comparison is a pure calendar comparison and does
* not shift at UTC-day boundaries.
*/
function isFutureAbsoluteDate(date, now) {
	const [year, month, day] = date.split("-").map(Number);
	return Date.UTC(year, month - 1, day) > Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}
/**
* Parse a time range from a fixed tier, a relative duration ({@code 12h},
* {@code 3d}, {@code 2mo}, {@code 1y}), an absolute date ({@code 2026-07-01}),
* or an already-parsed object. Invalid input, including an absolute date later
* than {@code now}'s local calendar day, returns undefined. Absolute dates are
* interpreted as local calendar dates, not UTC instants.
* @param input - tier, duration, date, or already-parsed object.
* @param now - reference instant for future-date validation; defaults to now.
*/
function parseTimeRange(input, now = /* @__PURE__ */ new Date()) {
	if (input === void 0 || input === null) return void 0;
	if (typeof input === "object") {
		const candidate = input;
		if (typeof candidate.after === "string") {
			const after = normalizeAbsoluteDate(candidate.after);
			if (after !== void 0) return isFutureAbsoluteDate(after, now) ? void 0 : { after };
		}
		if (typeof candidate.days === "number" && Number.isFinite(candidate.days) && candidate.days > 0) return { days: candidate.days };
		return;
	}
	if (typeof input !== "string") return void 0;
	const text = input.trim().toLowerCase();
	if (text.length === 0) return void 0;
	const tier = TIER_DAYS[text];
	if (tier !== void 0) return { days: DAYS_BY_RANGE[tier] };
	const after = normalizeAbsoluteDate(text);
	if (after !== void 0) return isFutureAbsoluteDate(after, now) ? void 0 : { after };
	const match = RELATIVE.exec(text);
	if (match === null) return void 0;
	const rawValue = match[1];
	const unit = match[2];
	if (rawValue === void 0 || unit === void 0) return void 0;
	const days = relativeUnitToDays(Number.parseFloat(rawValue), unit);
	if (!Number.isFinite(days) || days <= 0) return void 0;
	return { days };
}
/**
* Days between an absolute date and {@code now}, rounded up and clamped to at
* least one. Future dates are rejected by {@link parseTimeRange}; the minimum
* here is only a defensive fallback for direct callers.
*/
function relativeDaysAfter(after, now = /* @__PURE__ */ new Date()) {
	const normalized = normalizeAbsoluteDate(after);
	if (normalized === void 0) return 1;
	const [year, month, day] = normalized.split("-").map(Number);
	const target = Date.UTC(year, month - 1, day);
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const days = Math.ceil((today - target) / 864e5);
	return Number.isFinite(days) && days > 0 ? days : 1;
}
/** Resolve a parsed window to days, converting absolute dates relative to {@code now}. */
function timeRangeDays(range, now = /* @__PURE__ */ new Date()) {
	return "days" in range ? range.days : relativeDaysAfter(range.after, now);
}
/** Map an arbitrary day count to the nearest fixed tier. */
function approximateTimeRange(days) {
	if (!Number.isFinite(days) || days <= 2) return "day";
	if (days <= 14) return "week";
	if (days <= 90) return "month";
	return "year";
}
/**
* Map a parsed window to a fixed tier. Absolute dates are converted to relative
* days first, so DDG and SearXNG receive a tier even for {@code 2026-07-01}.
*/
function timeRangeTier(range, now = /* @__PURE__ */ new Date()) {
	if (range === void 0) return void 0;
	return approximateTimeRange(timeRangeDays(range, now));
}
/** Stable cache-key fragment for a parsed window. */
function timeRangeKey(range) {
	if (range === void 0) return "";
	return "days" in range ? `days:${range.days}` : `after:${range.after}`;
}
/** Human-readable label used in notes and tool renders. */
function timeRangeLabel(range) {
	if (range === void 0) return "";
	return "days" in range ? `${range.days}d` : `after ${range.after}`;
}
const MONTH_NAMES = Object.freeze({
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	may: 5,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	oct: 10,
	nov: 11,
	dec: 12
});
function padDatePart(value) {
	return String(value).padStart(2, "0");
}
/**
* Normalize a search-result timestamp into {@code YYYY-MM-DD}. Only explicit,
* locale-independent formats are accepted: ISO/SQL dates, slash-separated
* numeric dates, and English month names. Unrecognized text returns undefined
* so callers omit the field instead of failing the parse.
*/
function normalizePublishedDate(input) {
	if (input === void 0) return void 0;
	const text = input.trim().slice(0, 64);
	if (text.length === 0) return void 0;
	const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/u.exec(text);
	if (iso !== null) return normalizeAbsoluteDate(`${iso[1]}-${padDatePart(Number(iso[2]))}-${padDatePart(Number(iso[3]))}`);
	const slash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/u.exec(text);
	if (slash !== null) return normalizeAbsoluteDate(`${slash[1]}-${padDatePart(Number(slash[2]))}-${padDatePart(Number(slash[3]))}`);
	const monthFirst = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/u.exec(text);
	if (monthFirst !== null) {
		const month = MONTH_NAMES[monthFirst[1].toLowerCase()];
		if (month === void 0) return void 0;
		return normalizeAbsoluteDate(`${monthFirst[3]}-${padDatePart(month)}-${padDatePart(Number(monthFirst[2]))}`);
	}
	const dayFirst = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})$/u.exec(text);
	if (dayFirst !== null) {
		const month = MONTH_NAMES[dayFirst[2].toLowerCase()];
		if (month === void 0) return void 0;
		return normalizeAbsoluteDate(`${dayFirst[3]}-${padDatePart(month)}-${padDatePart(Number(dayFirst[1]))}`);
	}
}
/** DuckDuckGo {@code df} parameter for a tier. */
function ddgDateFilter(tier) {
	switch (tier) {
		case "day": return "d";
		case "week": return "w";
		case "month": return "m";
		case "year": return "y";
		default: return;
	}
}
// src/search/engines/ddg.ts
/** Parse DuckDuckGo's HTML result page. */
function parseDdgHtml(html, limit) {
	const root = parse(html);
	const sources = [];
	for (const block of root.querySelectorAll(".result")) {
		const link = block.querySelector("a.result__a");
		if (link === null) continue;
		const url = extractDdgUrl(link.getAttribute("href"));
		if (url === void 0) continue;
		const title = link.text.trim();
		const snippet = block.querySelector(".result__snippet")?.text;
		const publishedAt = normalizePublishedDate(block.querySelector(".result__timestamp")?.text);
		sources.push({
			url,
			...title.length === 0 ? {} : { title },
			...snippet === void 0 ? {} : { snippet },
			...publishedAt === void 0 ? {} : { publishedAt }
		});
	}
	return normalizeSources(sources, limit);
}
/** DuckDuckGo HTML endpoint. */
const ddgEngine = {
	id: "ddg",
	title: "DuckDuckGo HTML",
	supportsTimeRange: true,
	async search(context) {
		const endpoint = new URL("https://html.duckduckgo.com/html/");
		endpoint.searchParams.set("q", context.query);
		if (context.config.region.length > 0) endpoint.searchParams.set("kl", context.config.region);
		const filter = ddgDateFilter(timeRangeTier(context.timeRange, new Date(context.now)));
		if (filter !== void 0) endpoint.searchParams.set("df", filter);
		return parseDdgHtml(await context.http.text(endpoint.toString(), {
			accept: "text/html,application/xhtml+xml",
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/search/engines/ddg-lite.ts
/**
* Parse DuckDuckGo Lite's table-based result page. Rows are walked in document
* order: a result-link row starts a result, and the snippet/timestamp cells that
* follow belong to that result until the next result-link row. Parallel
* querySelectorAll arrays are deliberately not used, because a missing timestamp
* in one result would shift every later date onto the wrong result.
*/
function parseDdgLiteHtml(html, limit) {
	const root = parse(html);
	const drafts = [];
	let current;
	const flush = () => {
		if (current !== void 0) drafts.push(current);
		current = void 0;
	};
	for (const row of root.querySelectorAll("tr")) {
		const link = row.querySelector("a.result-link");
		if (link !== null) {
			flush();
			const url = extractDdgUrl(link.getAttribute("href"));
			if (url !== void 0) current = {
				url,
				title: link.text.trim()
			};
		}
		if (current === void 0) continue;
		if (current.snippet === void 0) {
			const snippet = row.querySelector("td.result-snippet");
			if (snippet !== null) current.snippet = snippet.text;
		}
		if (current.publishedAt === void 0) {
			const publishedAt = normalizePublishedDate(row.querySelector(".result-timestamp")?.text);
			if (publishedAt !== void 0) current.publishedAt = publishedAt;
		}
	}
	flush();
	return normalizeSources(drafts.map((draft) => ({
		url: draft.url,
		...draft.title.length === 0 ? {} : { title: draft.title },
		...draft.snippet === void 0 ? {} : { snippet: draft.snippet },
		...draft.publishedAt === void 0 ? {} : { publishedAt: draft.publishedAt }
	})), limit);
}
/** DuckDuckGo Lite endpoint. */
const ddgLiteEngine = {
	id: "ddg-lite",
	title: "DuckDuckGo Lite",
	supportsTimeRange: true,
	async search(context) {
		const endpoint = new URL("https://lite.duckduckgo.com/lite/");
		endpoint.searchParams.set("q", context.query);
		if (context.config.region.length > 0) endpoint.searchParams.set("kl", context.config.region);
		const filter = ddgDateFilter(timeRangeTier(context.timeRange, new Date(context.now)));
		if (filter !== void 0) endpoint.searchParams.set("df", filter);
		return parseDdgLiteHtml(await context.http.text(endpoint.toString(), {
			accept: "text/html,application/xhtml+xml",
			...context.signal === void 0 ? {} : { signal: context.signal },
			deadline: context.deadline
		}), context.maxResults);
	}
};
// src/search/engines/searxng.ts
/** Default public SearXNG instances tried when the config lists none. */
const DEFAULT_SEARXNG_INSTANCES = Object.freeze([
	"https://opnxng.com",
	"https://priv.au",
	"https://searx.be",
	"https://searx.tiekoetter.com",
	"https://search.inetol.net",
	"https://paulgo.io"
]);
/** Parse one SearXNG JSON response into sources. */
function parseSearxngJson(payload, limit) {
	const response = payload ?? {};
	if (!Array.isArray(response.results)) return [];
	const sources = [];
	for (const raw of response.results) {
		if (typeof raw?.url !== "string") continue;
		sources.push({
			url: raw.url,
			...typeof raw.title === "string" && raw.title.trim().length > 0 ? { title: raw.title } : {},
			...typeof raw.content === "string" && raw.content.trim().length > 0 ? { snippet: raw.content } : {},
			...typeof raw.publishedDate === "string" && raw.publishedDate.trim().length > 0 ? { publishedAt: raw.publishedDate } : {}
		});
	}
	return normalizeSources(sources, limit);
}
// src/search/engines/index.ts
/** All five engines in the default fallback order. */
const ENGINES = Object.freeze([
	bingEngine,
	anysearchEngine,
	{
		id: "searxng",
		title: "SearXNG",
		supportsTimeRange: true,
		async search(context) {
			const instances = context.config.searxngInstances.length > 0 ? context.config.searxngInstances : DEFAULT_SEARXNG_INSTANCES;
			const tier = timeRangeTier(context.timeRange, new Date(context.now));
			const failures = [];
			for (const instance of instances) try {
				const endpoint = new URL(`${instance.replace(/\/+$/u, "")}/search`);
				endpoint.searchParams.set("q", context.query);
				endpoint.searchParams.set("format", "json");
				if (tier !== void 0) endpoint.searchParams.set("time_range", tier);
				const sources = parseSearxngJson(await context.http.json(endpoint.toString(), {
					accept: "application/json",
					...context.signal === void 0 ? {} : { signal: context.signal },
					deadline: context.deadline
				}), context.maxResults);
				if (sources.length > 0) return sources;
				failures.push(`${instance}: 0 results`);
			} catch (error) {
				if (context.signal?.aborted === true) throw error;
				failures.push(`${instance}: ${error instanceof Error ? error.message : String(error)}`);
			}
			throw new Error(`all SearXNG instances failed: ${failures.join("; ").slice(0, 400)}`);
		}
	},
	ddgEngine,
	ddgLiteEngine
]);
/** Build an engine lookup, preserving the supplied order for chain construction. */
function createEngineMap(engines = ENGINES) {
	return new Map(engines.map((engine) => [engine.id, engine]));
}
// src/search/pipeline.ts
/** Engine chain, fallback, result cache and normalization for the Thin Search provider. */
const DEFAULT_TOTAL_BUDGET_MS = 35e3;
const DEFAULT_ENGINE_TIMEOUT_MS = 12e3;
/**
* Fair-share floor for one engine when {@code engineTimeoutMs >= MIN_ENGINE_BUDGET_MS}.
* It is not a universal tail guarantee: a remaining total below this value wins
* (so the search never exceeds {@code totalBudgetMs}), and a configured
* engine timeout below this value is authoritative instead.
*/
const MIN_ENGINE_BUDGET_MS = 6e3;
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 10;
/**
* Split the remaining total budget fairly across the engines still to try:
* {@code floor(remaining / remainingEngines)}, clamped to
* [{@link MIN_ENGINE_BUDGET_MS}, engineTimeoutMs], and never above the
* remaining total budget.
*
* The MIN floor is conditional. The tail-engine guarantee holds only when
* {@code totalBudgetMs >= chainLength * MIN_ENGINE_BUDGET_MS} and
* {@code engineTimeoutMs >= MIN_ENGINE_BUDGET_MS}; under those conditions every
* engine is attempted and each reached engine gets at least MIN. The default
* engineTimeoutMs is 12000, above the 6000 floor. This does not make every
* engine reachable for every budget: when
* {@code totalBudgetMs < chainLength * MIN_ENGINE_BUDGET_MS} (for example
* 5 engines / 10 s), budgets degrade to {@code [6000, 4000, 0, 0, 0]} and the
* later engines are not attempted, because the total wall-clock cap wins. A
* longer chain likewise ends below MIN once the remaining budget runs out
* (6 engines / 35 s gives a 5000 ms tail). engineTimeoutMs is a hard cap; when
* {@code engineTimeoutMs < MIN_ENGINE_BUDGET_MS}, the configured engine timeout
* is authoritative and the floor never raises it (for example 5000 ms stays
* 5000 ms).
*/
function computeEngineBudget(remainingBudgetMs, remainingEngines, engineTimeoutMs) {
	if (!Number.isFinite(remainingBudgetMs) || remainingBudgetMs <= 0) return 0;
	if (!Number.isFinite(remainingEngines) || remainingEngines < 1) return Math.min(remainingBudgetMs, engineTimeoutMs);
	const fairShare = Math.floor(remainingBudgetMs / remainingEngines);
	return Math.max(0, Math.min(remainingBudgetMs, Math.min(engineTimeoutMs, Math.max(MIN_ENGINE_BUDGET_MS, fairShare))));
}
/** Clamp a requested result count into the range the free engines support. */
function clampMaxResults(value) {
	if (value === void 0 || !Number.isFinite(value)) return DEFAULT_MAX_RESULTS;
	return Math.min(Math.max(Math.trunc(value), 1), MAX_RESULTS_LIMIT);
}
/** Stable fingerprint of the engine-affecting config, joined into every cache key. */
function configCacheKey(config) {
	return [
		config.bingMarket,
		config.region,
		JSON.stringify([...config.searxngInstances]),
		config.searchEnhance ? "enhance:on" : "enhance:off",
		config.enhanceModel,
		config.enhanceSystemPromptPath
	].join("");
}
/** Stable cache key from the request and live config, computed before enhancement. */
function buildCacheKey(query, maxResults, timeRange, engine, config) {
	return [
		query.trim().toLowerCase(),
		maxResults,
		timeRangeKey(timeRange),
		engine,
		configCacheKey(config)
	].join("\0");
}
/**
* Build the fallback chain. Without a time window the preferred engine leads.
* With a time window, time-capable engines lead (preferred first when capable),
* because Bing and AnySearch cannot apply the filter.
*/
function buildEngineChain(preferred, timeRange, available) {
	const preferredEngine = available.find((engine) => engine.id === preferred);
	if (preferredEngine === void 0) {
		if (timeRange === void 0) return available.map((engine) => engine.id);
		return [...available.filter((engine) => engine.supportsTimeRange).map((engine) => engine.id), ...available.filter((engine) => !engine.supportsTimeRange).map((engine) => engine.id)];
	}
	if (timeRange === void 0) return [preferred, ...available.filter((engine) => engine.id !== preferred).map((engine) => engine.id)];
	return [
		...preferredEngine.supportsTimeRange ? [preferred] : [],
		...available.filter((engine) => engine.id !== preferred && engine.supportsTimeRange).map((engine) => engine.id),
		...available.filter((engine) => !engine.supportsTimeRange).map((engine) => engine.id)
	];
}
function abortError(signal) {
	return new WebError("search aborted", "WEB_ABORTED", { cause: signal?.reason });
}
function throwIfAborted(signal) {
	if (signal?.aborted === true) throw abortError(signal);
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
/** The provider pipeline: cache → optional enhancement → engine fallback → cache store. */
var SearchPipeline = class {
	options;
	engines;
	engineList;
	cache;
	enhance;
	logger;
	now;
	totalBudgetMs;
	engineTimeoutMs;
	constructor(options) {
		this.options = options;
		this.engineList = options.engines ?? ENGINES;
		this.engines = createEngineMap(this.engineList);
		this.cache = options.cache ?? new ResultCache();
		this.enhance = options.enhance;
		this.logger = options.logger;
		this.now = options.now ?? Date.now;
		this.totalBudgetMs = options.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
		this.engineTimeoutMs = options.engineTimeoutMs ?? DEFAULT_ENGINE_TIMEOUT_MS;
	}
	/**
	* Run one engine under its own timeout signal. The signal is also handed to the
	* engine so its HTTP requests abort at the same deadline.
	*/
	async runEngine(engine, context, callerSignal) {
		const controller = new AbortController();
		let timedOut = false;
		const budget = Math.max(1, context.deadline - this.now());
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort(/* @__PURE__ */ new Error("engine timeout"));
		}, budget);
		const onCallerAbort = () => {
			controller.abort(callerSignal?.reason);
		};
		callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
		try {
			return await raceWithSignal(engine.search({
				...context,
				signal: controller.signal
			}), controller.signal, () => /* @__PURE__ */ new Error("engine aborted"));
		} catch (error) {
			if (callerSignal?.aborted === true) throw abortError(callerSignal);
			if (timedOut) throw new Error(`engine "${engine.id}" timed out after ${budget}ms`);
			throw error;
		} finally {
			clearTimeout(timer);
			callerSignal?.removeEventListener("abort", onCallerAbort);
		}
	}
	/** Run one search through cache, enhancement and the engine chain. */
	async search(request, signal) {
		throwIfAborted(signal);
		const query = typeof request.query === "string" ? request.query.trim() : "";
		if (query.length === 0) throw new WebError("search query is required", "WEB_INVALID_REQUEST");
		const config = this.options.getConfig();
		const maxResults = clampMaxResults(request.maxResults);
		const timeRange = parseTimeRange(request.timeRange);
		const preferred = typeof request.engine === "string" ? request.engine.trim().toLowerCase() : "";
		const preferredId = this.engines.has(preferred) ? preferred : config.provider;
		const ttl = cacheTtlMs(config);
		const cacheKey = buildCacheKey(query, maxResults, timeRange, preferredId, config);
		if (ttl > 0) {
			const hit = this.cache.get(cacheKey);
			if (hit !== void 0) return {
				...hit,
				cached: true,
				sources: [...hit.sources]
			};
		}
		let effectiveQuery = query;
		let enhancement;
		if (config.searchEnhance && this.enhance !== void 0) {
			enhancement = await this.enhance(query, signal);
			throwIfAborted(signal);
			if (enhancement.enhanced) effectiveQuery = enhancement.query;
			else if (enhancement.error !== void 0) this.logger?.warn(`thin-search: enhancement skipped: ${enhancement.error}`);
		}
		const chain = buildEngineChain(preferredId, timeRange, this.engineList);
		const startedAt = this.now();
		const totalDeadline = startedAt + this.totalBudgetMs;
		const failures = /* @__PURE__ */ new Map();
		let lastError;
		let timedOut = false;
		for (const [index, engineId] of chain.entries()) {
			throwIfAborted(signal);
			const remaining = totalDeadline - this.now();
			if (remaining <= 0) {
				timedOut = true;
				break;
			}
			const engine = this.engines.get(engineId);
			if (engine === void 0) continue;
			const budget = computeEngineBudget(remaining, chain.length - index, this.engineTimeoutMs);
			const engineDeadline = Math.min(totalDeadline, this.now() + budget);
			const context = {
				query: effectiveQuery,
				maxResults,
				...timeRange === void 0 ? {} : { timeRange },
				config,
				http: this.options.http,
				deadline: engineDeadline,
				now: startedAt
			};
			try {
				const sources = await this.runEngine(engine, context, signal);
				throwIfAborted(signal);
				if (sources.length === 0) {
					lastError = `${engineId} returned 0 results`;
					failures.set(engineId, lastError);
					this.logger?.warn(`thin-search: ${engineId} returned 0 results; trying the next engine`);
					continue;
				}
				const normalized = normalizeSources(sources, maxResults);
				if (normalized.length === 0) {
					lastError = `${engineId} returned no valid http(s) sources`;
					failures.set(engineId, lastError);
					continue;
				}
				const preferredEngine = this.engines.get(preferredId);
				const preferredFailure = engineId === preferredId ? void 0 : failures.get(preferredId) ?? (timeRange !== void 0 && preferredEngine !== void 0 && !preferredEngine.supportsTimeRange ? `does not support time filtering (${timeRangeLabel(timeRange)})` : "unavailable");
				const timeFilterNote = timeRange !== void 0 && !engine.supportsTimeRange ? `Note: ${engineId} does not support time filtering (${timeRangeLabel(timeRange)}); results are not time-filtered.` : void 0;
				const content = joinNotes([
					enhancement?.enhanced === true ? `[enhanced] "${enhancement.original ?? query}" -> "${enhancement.query}"` : void 0,
					preferredFailure === void 0 ? void 0 : `Note: ${preferredId} ${preferredFailure}; used ${engineId}.`,
					timeFilterNote
				]);
				const result = {
					sources: normalized,
					truncated: false,
					engine: engineId,
					cached: false,
					...enhancement?.enhanced === true ? { enhanced: {
						original: enhancement.original ?? query,
						query: enhancement.query
					} } : {},
					...content === void 0 ? {} : { content }
				};
				if (ttl > 0) this.cache.set(cacheKey, result, ttl);
				return result;
			} catch (error) {
				throwIfAborted(signal);
				const message = errorMessage(error);
				failures.set(engineId, message);
				lastError = message;
				this.logger?.warn(`thin-search: engine "${engineId}" failed (${message}); trying the next engine`);
			}
		}
		if (timedOut) throw new WebError(`search timed out after ${Math.round(this.totalBudgetMs / 1e3)}s across ${chain.length} engines`, "WEB_PROVIDER_ERROR", lastError === void 0 ? void 0 : { cause: new Error(lastError) });
		const detail = [...failures.entries()].map(([id, message]) => `${id}: ${message}`).join("; ");
		throw new WebError(`all free search engines failed${detail.length === 0 ? "" : `: ${detail}`}`, "WEB_PROVIDER_ERROR");
	}
	/**
	* Run exactly one engine, without cache, enhancement, or fallback. Used by the
	* {@code free_search_test} diagnostic tool; cancellation still propagates.
	*/
	async testEngine(engineId, request, signal) {
		throwIfAborted(signal);
		const query = typeof request.query === "string" ? request.query.trim() : "";
		if (query.length === 0) throw new WebError("search query is required", "WEB_INVALID_REQUEST");
		const engine = this.engines.get(engineId);
		if (engine === void 0) return {
			engine: engineId,
			ok: false,
			sources: [],
			error: `unknown engine: ${engineId}`
		};
		const config = this.options.getConfig();
		const timeRange = parseTimeRange(request.timeRange);
		const startedAt = this.now();
		const context = {
			query,
			maxResults: clampMaxResults(request.maxResults),
			...timeRange === void 0 ? {} : { timeRange },
			config,
			http: this.options.http,
			deadline: startedAt + this.engineTimeoutMs,
			now: startedAt
		};
		try {
			const sources = await this.runEngine(engine, context, signal);
			throwIfAborted(signal);
			const normalized = normalizeSources(sources, context.maxResults);
			return {
				engine: engineId,
				ok: normalized.length > 0,
				sources: normalized,
				...normalized.length === 0 ? { error: sources.length === 0 ? "returned 0 results" : "returned no valid http(s) sources" } : {}
			};
		} catch (error) {
			throwIfAborted(signal);
			return {
				engine: engineId,
				ok: false,
				sources: [],
				error: errorMessage(error)
			};
		}
	}
};
// src/tools/markdown.ts
/** Shared Markdown escaping for tool render output. */
/** Escape one value used inside a Markdown link label or inline text. */
function escapeMarkdownLabel(text) {
	return text.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]").replaceAll("(", "\\(").replaceAll(")", "\\)").replace(/[\r\n]+/gu, " ");
}
/** Escape a newline-preserving block of untrusted text while keeping its line structure. */
function escapeMarkdownText(text) {
	return text.split(/\r?\n/u).map((line) => escapeMarkdownLabel(line)).join("\n");
}
/** Whether a URL may be emitted as a Markdown destination instead of plain escaped text. */
function isSafeMarkdownUrl(url) {
	return /^https?:\/\//iu.test(url.trim());
}
/** Escape a URL used as a Markdown link destination. */
function escapeMarkdownDestination(url) {
	return url.trim().replace(/[()<>\s[\]]/gu, (char) => {
		if (char === "(") return "%28";
		if (char === ")") return "%29";
		return encodeURIComponent(char);
	});
}
/**
* Render one source as a Markdown list item. Labels, snippets and timestamps are
* escaped; an unsafe destination (anything but http/https) is rendered as plain
* escaped text instead of a link.
*/
function renderSourceLine(source, maxSnippet = 120) {
	const url = source.url ?? "";
	const label = source.title ?? url;
	const details = `${source.snippet === void 0 ? "" : ` - ${escapeMarkdownLabel(source.snippet.slice(0, maxSnippet))}`}${source.publishedAt === void 0 ? "" : ` (${escapeMarkdownLabel(source.publishedAt)})`}`;
	if (!isSafeMarkdownUrl(url)) return `- ${escapeMarkdownLabel(label)}${details}`;
	return `- [${escapeMarkdownLabel(label)}](${escapeMarkdownDestination(url)})${details}`;
}
// src/tools/advanced-search.ts
/** Web search with an optional time window and engine hint, using the full fallback pipeline. */
function createAdvancedSearchTool(deps) {
	return defineTool({
		name: "advanced_search",
		description: "Search the web with optional time filtering or a forced first engine. Use this when the user wants results from a specific window (for example \"last week\" or \"this month\"). The same automatic engine fallback as web_search applies.",
		parameters: {
			query: {
				type: "string",
				required: true,
				description: "The search query."
			},
			maxResults: {
				type: "number",
				description: "Optional result count (default 5, max 10)."
			},
			timeRange: {
				type: "string",
				description: "Optional time filter: day, week, month, year; a relative duration such as 12h, 3d, 2mo, 1y; or an absolute date such as 2026-07-01 (published after that date). DuckDuckGo and SearXNG map absolute dates to the nearest fixed tier."
			},
			engine: {
				type: "string",
				description: `Optional preferred engine (default: the configured provider): ${ENGINE_IDS.join(", ")}. When timeRange is set, time-capable engines (SearXNG, DDG, DDG-Lite) are tried first; the preferred engine leads only when it supports time filtering.`
			}
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
								publishedAt: { type: "string" }
							}
						}
					}
				}
			},
			render(args, value) {
				const lines = (value.sources ?? []).map((source) => renderSourceLine(source));
				const body = `${`Search (${escapeMarkdownLabel(value.provider ?? "unknown")}${args.timeRange === void 0 ? "" : `, timeRange=${escapeMarkdownLabel(args.timeRange)}`}):`}\n${lines.length === 0 ? "No results found." : lines.join("\n")}`;
				return [{
					type: "text",
					text: value.content === void 0 || value.content.length === 0 ? body : `${body}\n\n${escapeMarkdownText(value.content)}`
				}];
			}
		},
		timeoutMs: 6e4,
		async execute(args, exec) {
			const query = args.query.trim();
			if (query.length === 0) throw new WebError("query is required", "WEB_INVALID_REQUEST");
			let timeRange = void 0;
			if (args.timeRange !== void 0) {
				timeRange = parseTimeRange(args.timeRange);
				if (timeRange === void 0) throw new WebError(`invalid timeRange ${JSON.stringify(args.timeRange)}: use day, week, month or year; a relative duration such as 12h, 3d, 2mo or 1y; or an absolute date such as 2026-07-01`, "WEB_INVALID_REQUEST");
			}
			const engine = normalizeEngineId(args.engine);
			if (args.engine !== void 0 && engine === void 0) throw new WebError(`unknown engine ${JSON.stringify(args.engine)}; use one of: ${ENGINE_IDS.join(", ")}`, "WEB_INVALID_REQUEST");
			const request = {
				query,
				maxResults: clampMaxResults(args.maxResults),
				...timeRange === void 0 ? {} : { timeRange },
				...engine === void 0 ? {} : { engine }
			};
			const result = await deps.pipeline.search(request, exec.signal);
			return {
				provider: result.engine,
				content: result.content ?? "",
				sources: result.sources.map((source) => ({
					url: source.url,
					...source.title === void 0 ? {} : { title: source.title },
					...source.snippet === void 0 ? {} : { snippet: source.snippet },
					...source.publishedAt === void 0 ? {} : { publishedAt: source.publishedAt }
				}))
			};
		}
	});
}
// src/tools/free-search-test.ts
const DEFAULT_TEST_QUERY = "today USD to JPY exchange rate";
/** Diagnostic tool that probes every free engine individually. */
function createFreeSearchTestTool(deps) {
	return defineTool({
		name: "free_search_test",
		description: "Test the free web-search engines one by one and report which work right now. Use this to diagnose search failures or verify engine availability. Each engine is probed directly, without fallback.",
		parameters: {
			engines: {
				type: "array",
				description: `Engines to test (default: all). Options: ${ENGINE_IDS.join(", ")}.`,
				items: { type: "string" }
			},
			query: {
				type: "string",
				description: `Optional probe query (default: "${DEFAULT_TEST_QUERY}").`
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { results: {
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
							sampleUrl: { type: "string" }
						}
					}
				} }
			},
			render(_args, value) {
				return [{
					type: "text",
					text: `Search engine test:\n${(value.results ?? []).map((result) => {
						const engine = escapeMarkdownLabel(result.engine ?? "unknown");
						if (result.status === "ok") {
							const sample = result.sampleTitle === void 0 ? "" : `, e.g. "${escapeMarkdownLabel(result.sampleTitle.slice(0, 40))}"`;
							return `- ${engine}: OK (${result.results ?? 0} results${sample})`;
						}
						return `- ${engine}: FAIL - ${escapeMarkdownLabel(result.error ?? "unknown error")}`;
					}).join("\n")}`
				}];
			}
		},
		timeoutMs: 65e3,
		async execute(args, exec) {
			const requested = args.engines !== void 0 && args.engines.length > 0 ? args.engines : [...ENGINE_IDS];
			const query = args.query === void 0 || args.query.trim().length === 0 ? DEFAULT_TEST_QUERY : args.query;
			const results = [];
			for (const raw of requested) {
				const engine = normalizeEngineId(raw);
				if (engine === void 0) {
					results.push({
						engine: raw,
						status: "fail",
						error: `unknown engine; use one of ${ENGINE_IDS.join(", ")}`
					});
					continue;
				}
				const result = await deps.pipeline.testEngine(engine, {
					query,
					maxResults: 3
				}, exec.signal);
				if (result.ok && result.sources.length > 0) {
					const first = result.sources[0];
					results.push({
						engine,
						status: "ok",
						results: result.sources.length,
						...first?.title === void 0 ? {} : { sampleTitle: first.title },
						...first?.url === void 0 ? {} : { sampleUrl: first.url }
					});
				} else results.push({
					engine,
					status: "fail",
					error: result.error ?? "no results"
				});
			}
			return { results };
		}
	});
}
// src/tools/platform-search.ts
/** Search one platform through its adapter. */
function createPlatformSearchTool(deps) {
	return defineTool({
		name: "platform_search",
		description: "Search one specific platform for a query and return source URLs with titles and snippets. Platforms: github, v2ex, bilibili, reddit, hn, stackoverflow, wikipedia, npm. Use this for repositories, forum threads, videos, discussions, questions, encyclopedia entries, or packages. V2EX searches the current hot-topic list only. Bilibili and Reddit may reject requests from data-center or proxy egress IPs.",
		parameters: {
			platform: {
				type: "string",
				required: true,
				description: `Platform to search: ${PLATFORM_IDS.join(", ")}.`
			},
			query: {
				type: "string",
				required: true,
				description: "The search query."
			},
			maxResults: {
				type: "number",
				description: "Optional result count (default 5, max 10)."
			}
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
								publishedAt: { type: "string" }
							}
						}
					}
				}
			},
			render(_args, value) {
				const lines = (value.sources ?? []).map((source) => renderSourceLine(source));
				return [{
					type: "text",
					text: `Platform search (${escapeMarkdownLabel(value.platform ?? "unknown")}):\n${lines.length === 0 ? "No results found." : lines.join("\n")}`
				}];
			}
		},
		timeoutMs: 3e4,
		async execute(args, exec) {
			if (!isPlatformId(args.platform)) throw new WebError(`unknown platform "${args.platform}"; use one of: ${PLATFORM_IDS.join(", ")}`, "WEB_INVALID_REQUEST");
			const platform = args.platform;
			if (!deps.getConfig().platforms.includes(platform)) throw new WebError(`platform "${platform}" is disabled in Thin Search settings; enable it on the plugin configuration page`, "WEB_INVALID_REQUEST");
			const query = args.query.trim();
			if (query.length === 0) throw new WebError("query is required", "WEB_INVALID_REQUEST");
			const limit = clampMaxResults(args.maxResults);
			let sources;
			try {
				sources = await deps.platforms.search(platform, query, limit, exec.signal);
			} catch (error) {
				const aborted = exec.signal.aborted || isHttpError(error) && error.code === "ABORTED";
				throw new WebError(aborted ? "platform search aborted" : `platform search failed: ${error instanceof Error ? error.message : String(error)}`, aborted ? "WEB_ABORTED" : "WEB_PROVIDER_ERROR", { cause: error });
			}
			return {
				platform,
				sources: sources.map((source) => ({
					url: source.url,
					...source.title === void 0 ? {} : { title: source.title },
					...source.snippet === void 0 ? {} : { snippet: source.snippet },
					...source.publishedAt === void 0 ? {} : { publishedAt: source.publishedAt }
				}))
			};
		}
	});
}
// src/tools/index.ts
/** Build the three host tools bound to one pipeline/platform service. */
function createTools(deps) {
	return [
		createFreeSearchTestTool(deps),
		createPlatformSearchTool(deps),
		createAdvancedSearchTool(deps)
	];
}
// src/index.ts
/** Cordis plugin name used by loader diagnostics. */
const name = "thin-search";
/** Services this plugin requires before {@code apply} runs. */
const inject = [
	"web",
	"tools",
	"systemPrompt"
];
/** Provider id registered with {@code ctx.web}; patch {@code web.searchProvider} to this value. */
const THIN_SEARCH_PROVIDER_ID = "thin-search";
/** Display name shown by provider pickers. */
const THIN_SEARCH_PROVIDER_TITLE = "Thin Search";
/** Picker description: what the provider does and when it costs tokens. */
const THIN_SEARCH_PROVIDER_DESCRIPTION = {
	en: "Free, keyless search through Bing, AnySearch, SearXNG, DuckDuckGo HTML and Lite with automatic fallback. No model tokens unless search enhancement is enabled.",
	zh: "免费、免密钥的网页搜索，依次使用 Bing、AnySearch、SearXNG、DuckDuckGo HTML 与 Lite 并自动回退；除非启用搜索增强，否则不消耗模型 token。"
};
/** Build the provider over a search pipeline. */
function createThinSearchProvider(pipeline) {
	return {
		id: THIN_SEARCH_PROVIDER_ID,
		title: THIN_SEARCH_PROVIDER_TITLE,
		description: THIN_SEARCH_PROVIDER_DESCRIPTION,
		available: () => true,
		async search(request, signal) {
			const result = await pipeline.search({
				query: request.query,
				...request.maxResults === void 0 ? {} : { maxResults: request.maxResults }
			}, signal);
			return {
				sources: result.sources,
				truncated: false,
				...result.content === void 0 ? {} : { content: result.content }
			};
		}
	};
}
/** Build the dynamic system-prompt section text for the current config. */
function buildSystemPromptText(config) {
	const platforms = config.platforms.length === 0 ? "(none enabled)" : config.platforms.map((id) => {
		const platform = PLATFORMS.find((candidate) => candidate.id === id);
		return platform?.limitation === void 0 ? id : `${id} (${platform.limitation})`;
	}).join(", ");
	return [
		"## Thin Search (free web search)",
		"",
		"Web search uses whichever provider is selected in the web search settings.",
		`When Thin Search is selected, web_search starts with the preferred engine ${config.provider} and falls back across Bing, AnySearch, SearXNG, DuckDuckGo HTML and DuckDuckGo Lite.`,
		"While Thin Search is selected, an engine that fails or returns no usable result is skipped automatically; the result note names the engine that actually answered.",
		"Do not tell the user that search is unavailable while that fallback can still succeed.",
		"",
		"Time filtering: use the advanced_search tool with timeRange.",
		"Fixed tiers are day, week, month, year; relative values such as 12h, 3d, 2mo, 1y and absolute dates such as 2026-07-01 are accepted.",
		"DuckDuckGo and SearXNG map absolute dates to the nearest fixed tier; Bing and AnySearch cannot apply a time filter, so time-capable engines move to the front for those searches.",
		"",
		`Search enhancement is ${config.searchEnhance ? "ON: each search first spends tokens on the current Agent model (or the configured provider:model override) to rewrite the query" : "OFF (the default): queries reach the engines unchanged and no model tokens are spent"}.`,
		"When the user asks for a time window, prefer advanced_search over web_search.",
		"",
		`Platform search is available for: ${platforms}.`,
		"Use platform_search for repository, forum, video, discussion, Q&A, encyclopedia, or package searches.",
		"V2EX only searches its current hot-topic list; Bilibili and Reddit may reject requests from data-center or proxy egress IPs.",
		"",
		"Use free_search_test to probe engines individually when diagnosing failures."
	].join("\n");
}
/** Register the provider, tools and prompt section. */
function apply(ctx, config) {
	const logger = ctx.logger("thin-search");
	const snapshot = () => snapshotConfig(config);
	const http = createHttpClient({ logger });
	const pipeline = new SearchPipeline({
		getConfig: snapshot,
		http,
		cache: new ResultCache(50),
		enhance: createEnhancer({
			getConfig: snapshot,
			getLlm: () => ctx.get("llm"),
			getAgentSelection: () => ctx.get("agents")?.currentInitiator()?.model.current(),
			logger
		}),
		logger
	});
	const tools = createTools({
		pipeline,
		platforms: createPlatformSearchService({
			http,
			getConfig: snapshot
		}),
		getConfig: snapshot,
		logger
	});
	ctx.web.registerSearchProvider(createThinSearchProvider(pipeline));
	ctx.systemPrompt.section({
		name: "thin-search:engines",
		order: ctx.systemPrompt.getSectionOrder("TOOL_WEB_SEARCH") + 5,
		text: () => buildSystemPromptText(snapshot())
	});
	for (const tool of tools) ctx.tools.register(tool);
}
export { Config, THIN_SEARCH_PROVIDER_DESCRIPTION, THIN_SEARCH_PROVIDER_ID, THIN_SEARCH_PROVIDER_TITLE, apply, buildSystemPromptText, createThinSearchProvider, inject, name };
