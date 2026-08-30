// dsh-thin-search: HTTP/HTTPS 代理支持（V2Ray / Clash 等提供 HTTP 端口）
// 用 undici 的 ProxyAgent（CONNECT 隧道）。SOCKS5 不支持（undici 6.x 原生限制，客户一般用 HTTP 端口）。
// 关键：必须用 undici 自己的 fetch 而不是 Node 全局 fetch —— Node 26 全局 fetch + ProxyAgent 会报
// UND_ERR_INVALID_ARG "invalid onError method"（undici 内部校验与 Node fetch 的 handler 不兼容）。
import { ProxyAgent, fetch as undiciFetch } from "undici";

let cachedAgent = null;
let cachedUrl = null;

/**
 * 获取（缓存）代理 Agent。proxyUrl 为空/null/非 http(s) 时返回 null（直连）。
 * @param {string} proxyUrl - 例如 "http://127.0.0.1:7890"
 * @returns {import("undici").ProxyAgent|null}
 */
export function getProxyAgent(proxyUrl) {
  if (!proxyUrl || typeof proxyUrl !== "string") return null;
  const url = proxyUrl.trim();
  if (!/^https?:\/\//i.test(url)) return null;
  if (cachedUrl === url && cachedAgent) return cachedAgent;
  cachedUrl = url;
  cachedAgent = new ProxyAgent({ uri: url });
  return cachedAgent;
}

/**
 * 带代理发起 fetch（用 undici 的 fetch，避免 Node 全局 fetch 与 ProxyAgent 的兼容问题）。
 * proxyUrl 为空时回退到 Node 全局 fetch（直连）。
 * @param {string|URL} url
 * @param {object} [fetchOpts]
 * @param {string} [proxyUrl]
 * @returns {Promise<Response>}
 */
export async function fetchWithProxy(url, fetchOpts = {}, proxyUrl) {
  const agent = getProxyAgent(proxyUrl);
  if (!agent) return fetch(url, fetchOpts);
  return undiciFetch(url, { ...fetchOpts, dispatcher: agent });
}

/**
 * 给 fetch 选项附加代理 dispatcher（供调用方直接使用 undici fetch 时）。
 * proxyUrl 为空时原样返回（直连）。
 */
export function withProxy(fetchOpts, proxyUrl) {
  const agent = getProxyAgent(proxyUrl);
  if (!agent) return fetchOpts;
  return { ...fetchOpts, dispatcher: agent };
}

/** 清理缓存的代理 Agent（设置变更后调用，避免旧连接残留）。 */
export function resetProxyAgent() {
  if (cachedAgent) {
    try { cachedAgent.close?.(); } catch {}
  }
  cachedAgent = null;
  cachedUrl = null;
}
