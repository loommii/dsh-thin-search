import { defineConfig } from 'tsdown'

/**
 * Browser half for the DSH client module loader: one CommonJS chunk wrapped in
 * `window.__ModuleLoader__.load({ id, factory })`. React stays external because
 * the shell's module table supplies it; every other capability arrives through
 * the Cordis client context.
 */
export default defineConfig({
  name: 'dsh-thin-search/client',
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: ['cjs'],
  target: 'es2022',
  inputOptions: { platform: 'browser' },
  dts: false,
  clean: false,
  hash: false,
  minify: false,
  sourcemap: false,
  outExtensions: () => ({ js: '.js' }),
  deps: {
    neverBundle: ['react', 'react/jsx-runtime'],
  },
  banner: 'window.__ModuleLoader__.load({ id: "dsh-thin-search", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  footer: 'return module.exports; } });',
})
