import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import {
  Config,
  SETTINGS_ENTRY_ID,
  THIN_SEARCH_NS,
  apply,
  detectEngineMode,
  effectiveSearchProviderId,
  setEngineMode,
} from "../lib/index.js";

const CONFIG_FIELDS = [
  "provider",
  "searchEnhance",
  "enhanceModel",
  "enhanceSystemPrompt",
  "proxy",
  "cache",
  "cacheTtl",
  "region",
  "bingMarket",
  "searxngInstances",
  "platforms",
];

function parseVolatileConfig(input = {}) {
  const result = Config["~standard"].validate(input);
  assert.equal(result.issues, undefined);
  return result.value;
}

function readConfig(config) {
  return Object.fromEntries(CONFIG_FIELDS.map((key) => [key, config[key].get()]));
}

function createHarness(overrides = {}, options = {}) {
  let values = {
    provider: "bing",
    searchEnhance: false,
    enhanceModel: "",
    enhanceSystemPrompt: "",
    proxy: "",
    cache: true,
    cacheTtl: 5,
    region: "cn-zh",
    bingMarket: "zh-CN",
    searxngInstances: [],
    platforms: ["github", "v2ex", "bilibili", "reddit", "hn", "stackoverflow", "wikipedia", "npm"],
    ...overrides,
  };
  let revision = 0;
  // 官方 web entry 的假实现：0.2.1 为 volatile 配置引用；webVolatile: false 模拟 0.1.7/0.2.0
  let webProviderId = options.webProviderId ?? "thin-search";
  let webFetchProviderId = options.webFetchProviderId ?? "http";
  let webRevision = 0;
  let webConflictPending = options.webConflictOnce === true;
  const documentPath = options.documentPath ?? join(tmpdir(), "dsh-thin-search-test-profile", "cordis.patch.yml");
  const config = Object.fromEntries(
    CONFIG_FIELDS.map((key) => [key, { get: () => values[key] }]),
  );

  const configureCalls = [];
  const registeredTools = [];
  const registeredProviders = [];
  const routes = new Map();
  const promptSections = new Map();
  const eventHandlers = new Map();

  const descriptor = () => ({
    ns: SETTINGS_ENTRY_ID,
    autoGenerate: false,
    schema: Config.toJSON(),
    value: structuredClone(values),
    revision,
    applies: "live",
  });
  const webDescriptor = () => ({
    ns: "web",
    schema: {},
    value: { searchProvider: webProviderId, fetchProvider: webFetchProviderId },
    revision: webRevision,
    applies: "live",
  });
  const settings = {
    writable: true,
    documentPath,
    configure(policy, owner) {
      configureCalls.push({ policy, owner });
      return () => {};
    },
    describe() {
      return [descriptor(), webDescriptor()];
    },
    async mutate(ns, ops, expectedRevision) {
      if (ns === "web") {
        // 0.1.7 / 0.2.0：web 的字段不是 volatile，SettingsForms 拒绝写入
        if (options.webVolatile === false) {
          throw new Error('Plugin entry "web" has no volatile fields');
        }
        if (webConflictPending) {
          // 模拟官方设置页同时保存：revision 前进后抛出冲突，插件应重读并重试一次
          webConflictPending = false;
          webRevision += 1;
          throw Object.assign(new Error("settings conflict"), { code: "SETTINGS_CONFLICT" });
        }
        assert.equal(expectedRevision, webRevision);
        for (const operation of ops) {
          assert.equal(operation.op, "set");
          if (operation.path[0] === "searchProvider") webProviderId = operation.value;
          if (operation.path[0] === "fetchProvider") webFetchProviderId = operation.value;
        }
        webRevision += 1;
        return;
      }
      assert.equal(ns, SETTINGS_ENTRY_ID);
      assert.equal(expectedRevision, 0);
      for (const operation of ops) {
        assert.equal(operation.op, "set");
        assert.deepEqual(operation.path.length, 1);
        values[operation.path[0]] = structuredClone(operation.value);
      }
      revision += 1;
      eventHandlers.get("loader/volatile-update")?.(ops.map((operation) => operation.path));
    },
  };

  const effect = (callback) => {
    const dispose = callback();
    return typeof dispose === "function" ? dispose : () => {};
  };
  const webServer = {
    register(route) {
      routes.set(route.path, route);
      return () => routes.delete(route.path);
    },
  };
  const tools = {
    register(tool) {
      registeredTools.push(tool);
      return () => {};
    },
  };
  const systemPrompt = {
    section(section) {
      promptSections.set(section.name, section);
      return () => promptSections.delete(section.name);
    },
  };
  // DSH 0.2.1 起 dsh-web 没有 searchProviderId 实例字段，只保留 volatile 配置引用
  const web = {
    config: { searchProvider: { get: () => webProviderId } },
    registerSearchProvider(provider) {
      registeredProviders.push(provider);
      return () => {};
    },
  };

  const ctx = {
    fiber: {
      entry: {
        id: `plugin-bundle:${SETTINGS_ENTRY_ID}`,
        options: { id: SETTINGS_ENTRY_ID },
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    web,
    get() {
      return undefined;
    },
    on(event, handler) {
      eventHandlers.set(event, handler);
      return () => eventHandlers.delete(event);
    },
    inject(dependencies, callback) {
      if (dependencies.length === 1 && dependencies[0] === "settings") {
        return callback({ settings, effect });
      }
      if (dependencies.includes("webServer") && dependencies.includes("settings")) {
        return callback({ settings, webServer, effect });
      }
      if (dependencies.length === 1 && dependencies[0] === "tools") {
        return callback({ tools, effect });
      }
      if (dependencies.length === 1 && dependencies[0] === "systemPrompt") {
        return callback({ systemPrompt, effect });
      }
      throw new Error(`unexpected injection: ${dependencies.join(",")}`);
    },
  };

  return {
    config,
    ctx,
    configureCalls,
    registeredTools,
    registeredProviders,
    settings,
    web,
    routes,
    promptSections,
    eventHandlers,
    getWebProvider() {
      return webProviderId;
    },
    getWebFetchProvider() {
      return webFetchProviderId;
    },
    setValue(key, value) {
      values[key] = value;
    },
    getValue(key) {
      return values[key];
    },
  };
}

async function invokeRoute(route, body) {
  let resolveResponse;
  let rejectResponse;
  const response = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const request = body === undefined
    ? { socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:3080" }, method: "POST" }
    : Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "127.0.0.1:3080" },
        method: "POST",
      });
  const result = {
    destroyed: false,
    writableEnded: false,
    statusCode: 200,
    writeHead(status) {
      this.statusCode = status;
      this.writableEnded = true;
    },
    end(payload) {
      try {
        resolveResponse({ status: this.statusCode, body: JSON.parse(payload) });
      } catch (error) {
        rejectResponse(error);
      }
    },
  };

  await route.handler(request, result);
  return response;
}

test("DSH 0.1.7 Config exposes every editable field as volatile", () => {
  assert.equal(SETTINGS_ENTRY_ID, THIN_SEARCH_NS, "entry id must preserve legacy settings.yaml import");
  const patch = readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8");
  assert.match(patch, /^\s*- id: thin-search$/m);
  const json = Config.toJSON();
  const root = json.refs[json.uid];
  for (const key of CONFIG_FIELDS) {
    assert.equal(json.refs[root.dict[key]].meta.volatile, true, `${key} must be volatile`);
  }

  const config = parseVolatileConfig({ region: "cn-zh" });
  const values = readConfig(config);
  assert.equal(values.provider, "anysearch");
  assert.equal(values.cache, true);
  assert.equal(values.cacheTtl, 5);
  assert.equal(values.bingMarket, "zh-CN");
  assert.deepEqual(values.platforms, [
    "github",
    "v2ex",
    "bilibili",
    "reddit",
    "hn",
    "stackoverflow",
    "wikipedia",
    "npm",
  ]);
});

test("client forwards SettingsForms revisions on save and command updates", () => {
  const client = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /bridgeMutate\(\{ ns: NS, ops, expectedRevision: revision \}\)/);
  assert.match(client, /expectedRevision: view\.revision/);
});

test("engine-mode edits use an explicit profile path with atomic locking", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-thin-search-"));
  const patchPath = join(directory, "cordis.patch.yml");
  try {
    await writeFile(join(directory, "package.json"), "{}\n");
    await writeFile(patchPath, "[]\n");
    assert.equal(await detectEngineMode(patchPath), "thin");

    await setEngineMode("official", patchPath);
    const official = await readFile(patchPath, "utf8");
    assert.match(official, /dsh-thin-search: engine-mode block/);
    assert.match(official, /searchProvider: deepseek-official/);
    assert.equal(await detectEngineMode(patchPath), "official");

    await setEngineMode("thin", patchPath);
    assert.equal(await detectEngineMode(patchPath), "thin");
    assert.equal((await readFile(patchPath, "utf8")).trim(), "[]");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("apply integrates with DSH 0.2.1 SettingsForms and volatile config events", async () => {
  const harness = createHarness();
  apply(harness.ctx, harness.config);

  assert.equal(harness.configureCalls.length, 1);
  assert.deepEqual(harness.configureCalls[0].policy, { auto: false });
  assert.equal(harness.configureCalls[0].owner, harness.ctx.fiber);

  assert.equal(harness.registeredProviders.length, 1);
  assert.equal(harness.registeredProviders[0].id, "thin-search");
  assert.equal(harness.registeredProviders[0].available(), true);
  // 0.2.1 删除了 searchProviderId：插件不得再写该字段（写入只会成为无效自有属性）
  assert.equal(Object.hasOwn(harness.web, "searchProviderId"), false);
  assert.deepEqual(
    harness.registeredTools.map((tool) => tool.name),
    ["free_search_test", "platform_search", "advanced_search"],
  );

  const describeRoute = harness.routes.get("/api/dsh-thin-search-settings/describe");
  assert.ok(describeRoute);
  const described = await invokeRoute(describeRoute);
  assert.equal(described.status, 200);
  assert.equal(described.body.ok, true);
  assert.equal(described.body.value.namespaces.length, 1);
  assert.equal(described.body.value.namespaces[0].ns, THIN_SEARCH_NS);
  assert.equal(described.body.value.namespaces[0].value.provider, "bing");

  const engineModeRoute = harness.routes.get("/api/dsh-thin-search-settings/engine-mode");
  const engineMode = await invokeRoute(engineModeRoute, { action: "get" });
  assert.equal(engineMode.body.ok, true);
  assert.equal(engineMode.body.value.mode, "thin");
  assert.equal(engineMode.body.value.applied, true);
  assert.equal(engineMode.body.value.provider, "thin-search");

  const mutateRoute = harness.routes.get("/api/dsh-thin-search-settings/mutate");
  const mutated = await invokeRoute(mutateRoute, {
    ns: THIN_SEARCH_NS,
    ops: [{ op: "set", path: ["provider"], value: "anysearch" }],
    expectedRevision: 0,
  });
  assert.equal(mutated.body.ok, true);
  assert.equal(mutated.body.value.ns, THIN_SEARCH_NS);
  assert.equal(harness.getValue("provider"), "anysearch");

  const initialPrompt = harness.promptSections.get("thin-search:engines")?.text;
  assert.match(initialPrompt, /Current engine: anysearch/);
  harness.setValue("provider", "searxng");
  harness.eventHandlers.get("loader/volatile-update")();
  const refreshedPrompt = harness.promptSections.get("thin-search:engines")?.text;
  assert.match(refreshedPrompt, /Current engine: searxng/);
});

test("effectiveSearchProviderId reads the 0.2.1 volatile config, then the legacy field, then the env", () => {
  const saved = process.env.DSH_WEB_SEARCH_PROVIDER;
  delete process.env.DSH_WEB_SEARCH_PROVIDER;
  try {
    assert.equal(
      effectiveSearchProviderId({ config: { searchProvider: { get: () => "thin-search" } } }),
      "thin-search",
    );
    assert.equal(effectiveSearchProviderId({ searchProviderId: "deepseek-official" }), "deepseek-official");
    assert.equal(effectiveSearchProviderId({}), undefined);
    assert.equal(effectiveSearchProviderId({ config: { searchProvider: { get: () => undefined } } }), undefined);
    process.env.DSH_WEB_SEARCH_PROVIDER = "env-provider";
    assert.equal(effectiveSearchProviderId({}), "env-provider");
    // config 引用优先于 legacy 字段与环境变量
    assert.equal(
      effectiveSearchProviderId({ config: { searchProvider: { get: () => "thin-search" } }, searchProviderId: "x" }),
      "thin-search",
    );
  } finally {
    if (saved === undefined) delete process.env.DSH_WEB_SEARCH_PROVIDER;
    else process.env.DSH_WEB_SEARCH_PROVIDER = saved;
  }
});

test("engine mode switches the official web entry through SettingsForms on 0.2.1", async () => {
  const harness = createHarness();
  apply(harness.ctx, harness.config);
  const route = harness.routes.get("/api/dsh-thin-search-settings/engine-mode");

  const official = await invokeRoute(route, { action: "set", mode: "official" });
  assert.equal(official.body.ok, true);
  assert.equal(official.body.value.mode, "official");
  assert.equal(official.body.value.applied, true);
  assert.equal(official.body.value.via, "settings");
  assert.equal(official.body.value.provider, "deepseek-official");
  assert.equal(harness.getWebProvider(), "deepseek-official");
  assert.equal(harness.getWebFetchProvider(), "http");

  const thin = await invokeRoute(route, { action: "set", mode: "thin" });
  assert.equal(thin.body.ok, true);
  assert.equal(thin.body.value.mode, "thin");
  assert.equal(thin.body.value.applied, true);
  assert.equal(thin.body.value.via, "settings");
  assert.equal(harness.getWebProvider(), "thin-search");
});

test("engine mode retries once on a settings conflict", async () => {
  const harness = createHarness({}, { webConflictOnce: true });
  apply(harness.ctx, harness.config);
  const route = harness.routes.get("/api/dsh-thin-search-settings/engine-mode");
  const result = await invokeRoute(route, { action: "set", mode: "official" });
  assert.equal(result.body.ok, true);
  assert.equal(result.body.value.via, "settings");
  assert.equal(result.body.value.applied, true);
  assert.equal(harness.getWebProvider(), "deepseek-official");
});

test("engine-mode refuses to duplicate a user-managed web row", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-thin-search-dup-"));
  const patchPath = join(directory, "cordis.patch.yml");
  const userRow = "- id: web\n  config:\n    searchProvider: deepseek-search-api\n    fetchProvider: http\n";
  try {
    await writeFile(join(directory, "package.json"), "{}\n");
    await writeFile(patchPath, userRow);
    // 追加第二条 `- id: web` 会让 ConfigEditor 把该行判为不可寻址（settings 里直接消失），必须拒绝
    await assert.rejects(() => setEngineMode("official", patchPath), /user-managed/);
    await assert.rejects(() => setEngineMode("thin", patchPath), /user-managed/);
    assert.equal(await readFile(patchPath, "utf8"), userRow, "refused writes must leave the patch untouched");

    // 目标值已经一致时视为 no-op，不报错也不写第二行
    const thinRow = "- id: web\n  config:\n    searchProvider: thin-search\n    fetchProvider: http\n";
    await writeFile(patchPath, thinRow);
    await setEngineMode("thin", patchPath);
    assert.equal(await readFile(patchPath, "utf8"), thinRow);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("engine-mode rejects a patch that already has both the managed block and a user web row", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-thin-search-dup2-"));
  const patchPath = join(directory, "cordis.patch.yml");
  const content = [
    "- id: web",
    "  config:",
    "    searchProvider: deepseek-search-api",
    "# >>> dsh-thin-search: engine-mode block (managed, do not edit) >>>",
    "- id: web",
    "  config:",
    "    searchProvider: deepseek-official",
    "    fetchProvider: http",
    "# <<< dsh-thin-search: engine-mode block <<<",
    "",
  ].join("\n");
  try {
    await writeFile(join(directory, "package.json"), "{}\n");
    await writeFile(patchPath, content);
    await assert.rejects(() => setEngineMode("official", patchPath), /both the thin-search managed block/);
    assert.equal(await readFile(patchPath, "utf8"), content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("engine mode falls back to the profile patch when the web entry is not volatile", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-thin-search-engine-"));
  const patchPath = join(directory, "cordis.patch.yml");
  try {
    await writeFile(join(directory, "package.json"), "{}\n");
    await writeFile(patchPath, "[]\n");
    const harness = createHarness({}, { webVolatile: false, documentPath: patchPath });
    apply(harness.ctx, harness.config);
    const route = harness.routes.get("/api/dsh-thin-search-settings/engine-mode");

    const official = await invokeRoute(route, { action: "set", mode: "official" });
    assert.equal(official.body.ok, true);
    assert.equal(official.body.value.via, "file");
    // 0.1.7 / 0.2.0 的文件回退路径要重启才生效
    assert.equal(official.body.value.applied, false);
    assert.match(await readFile(patchPath, "utf8"), /searchProvider: deepseek-official/);
    assert.equal(harness.getWebProvider(), "thin-search");

    const thin = await invokeRoute(route, { action: "set", mode: "thin" });
    assert.equal(thin.body.ok, true);
    assert.equal((await readFile(patchPath, "utf8")).trim(), "[]");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
