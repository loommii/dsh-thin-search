import { defineConfig } from 'tsdown'

/** Host ESM bundle for the Cordis loader: one file, DSH packages left as peer imports. */
export default defineConfig({
  name: 'dsh-thin-search',
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  dts: false,
  clean: false,
  fixedExtension: false,
  deps: {
    neverBundle: [/^@deepseek-ai\//, 'node-html-parser'],
  },
})
