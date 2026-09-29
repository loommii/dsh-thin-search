/**
 * Browser-half contract test: the configuration entry must live on the DSH
 * 0.1.7 Plugins page (`plugins.row.config`, keyed `<pkg>#<row id>`), guarded by
 * `configForms.whileServed`, and must NOT register the legacy global-settings
 * card (`settings.section`).
 *
 * The module is a `window.__ModuleLoader__.load({ factory })` bundle, so the
 * test provides the loader global and a stub `require`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

/** Minimal React stand-ins: the module only needs these callables to build. */
function stubReact() {
  const passthrough = () => null;
  return {
    createElement: passthrough,
    useCallback: (fn) => fn,
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useState: (value) => [typeof value === "function" ? value() : value, () => {}],
  };
}

/**
 * Load the browser half and return its exports plus the records of every slot
 * registration and field write it performed.
 */
function loadClientHalf() {
  const registrations = [];
  const whileServedCalls = [];

  const jsxRuntime = { jsx: () => null, jsxs: () => null, Fragment: Symbol("Fragment") };
  const require = (specifier) => {
    if (specifier === "react") return stubReact();
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    throw new Error(`unexpected require("${specifier}")`);
  };

  let definition;
  const sandbox = {
    document: {
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
      head: { appendChild: () => {} },
      body: null,
      documentElement: null,
    },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    matchMedia: () => ({ matches: false }),
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: false }) }),
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.window = { __ModuleLoader__: { load: (value) => { definition = value; } } };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);

  assert.equal(definition?.id, "dsh-thin-search", "the bundle must declare its package id");
  const exports = definition.factory(require);

  /** Collect disposers so the test can assert they are handed back. */
  const disposers = [];
  const slots = {
    inject: (name, register) => {
      const dispose = register();
      disposers.push(dispose);
      return dispose;
    },
    register: (options, component) => {
      registrations.push({ options, component });
      return () => {};
    },
  };
  const configForms = {
    whileServed: (namespaces, register) => {
      whileServedCalls.push(namespaces);
      const dispose = register(new Set(namespaces));
      return dispose;
    },
    get: () => undefined,
  };
  const ctx = {
    slots,
    configForms,
    effect: (fn) => {
      const dispose = fn();
      return typeof dispose === "function" ? dispose : () => {};
    },
    inject: () => {},
    get: () => undefined,
  };

  exports.apply(ctx);
  return { exports, registrations, whileServedCalls };
}

test("browser half registers the row configuration on the Plugins page", () => {
  const { exports, registrations, whileServedCalls } = loadClientHalf();

  assert.ok(exports.inject.includes("configForms"), "configForms must be a declared dependency");

  const slots = registrations.map((entry) => entry.options.name);
  assert.deepEqual(slots, ["plugins.row.config"], "the only configuration slot is the Plugins page row");

  const [registration] = registrations;
  assert.equal(
    registration.options.key,
    "dsh-thin-search#thin-search",
    "the key joins the package name and the row id cordis.patch.yml declares",
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(whileServedCalls)),
    [["thin-search"]],
    "the entry must be guarded by the thin-search settings namespace",
  );
});

test("browser half never registers the legacy global settings card", () => {
  const { registrations } = loadClientHalf();
  assert.equal(
    registrations.filter((entry) => entry.options.name === "settings.section").length,
    0,
    "settings.section was replaced by the Plugins page entry",
  );
});

test("the row entry answers the page's summary and page views", () => {
  const { registrations } = loadClientHalf();
  const [{ component }] = registrations;

  const summary = component({ view: "summary" });
  assert.equal(typeof summary, "string", "summary renders a one-liner as text");
  assert.ok(summary.length > 0, "summary text must not be empty");

  assert.doesNotThrow(() => component({ view: "page" }), "page view renders the form");
});

test("cordis.patch.yml declares the row id the registration keys on", () => {
  const patch = readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8");
  assert.match(
    patch,
    /^\s*- id: thin-search$/m,
    "the package name plus this row id is the row.config key",
  );
  assert.match(patch, /^\s*name: dsh-thin-search$/m, "the row must name this package");
});
