# ADR-0002: 设置入口迁移到已安装插件列表（对齐 dsh-context v0.85.1）

- 状态：Accepted
- 日期：2026-11-18
- 适用：dsh-thin-search v1.0.0–v1.0.1 / DSH 0.2.2-rc.3、0.2.2-rc.5
- 决策者：lead

## 背景

v1.0.0 当前把 Thin Search 配置注册为 `plugins.row.config`，key 为 `dsh-thin-search#thin-search`，入口落在单个 patch row 的详情页。用户要求把设置入口调整到“插件 - 已安装插件”列表中的插件设置界面，并参照 `dsh-context` v0.85.1 的交互、布局和控件。

## 核实结果

### dsh-context v0.85.1

已读取其 npm 包与 v0.85.1 源码：

- `src/client/index.ts`：在 `ctx.inject(['configForms'], ...)` 内执行
  - `settings.attach(configForms.get(NS))`（NS = `dsh-context`）
  - `configForms.whileServed([NS], () => slots.inject('plugins.bundle.config', () => slots.register({ name: 'plugins.bundle.config', key: NS, locale: NS, inject: cardFace }, PluginConfigCard)))`
- 没有 `settings.section`，也没有全局设置项。
- `src/client/components/settingsCard.tsx`：设置卡片由分组（Group）+ 行（row）组成；选择类控件是 pill 按钮 + Menu；多行文本是 textarea，blur/Escape 提交；没有 Save/Discard 底栏，写入即时生效；只读时显示 note。
- `src/client/styles/settings.css`：group 标题、行间距、36px 高/18px 圆角 pill、textarea 样式。
- `src/host/config.ts`：所有偏好字段是 schemastery `volatile()` 配置，profile 级，不是 session 级。

### DSH 0.2.2-rc.3 / 0.2.2-rc.5

已核对 `@deepseek-ai/dsh-client-ui-plugin-manager` / `dsh-client-ui-settings` / `dsh-web` 0.2.2-rc.3 源码与类型；
v1.0.1 追加核对 0.2.2-rc.5：上述客户端契约所在包的源码与 rc.3 逐字一致，无需改动设置入口。

- `plugins.bundle.config` 是 keyed slot，key = **bundle 包名**；`PackageDetail` 通过
  `renderSlot('plugins.bundle.config', { view: 'page' }, { entryKey: pkg.name })`
  渲染在 bundle 详情页的 Configuration section。
- `plugins.row.config` 的 key = `<package name>#<row id>`，只用于 row 详情页，且 `RowDetail` 会传 `form` props。
- **bundle config 页面不传 `form` props**；因此页面必须使用 `ConfigForms.get(entryId)` 自己持有表单，并在 `whileServed([entryId])` 内存活。
- `ConfigForms.get(entryId)` 返回 `ConfigForm`：`getSnapshot/subscribe/set/mutate/unset`，带 revision 冲突与热更新语义。
- `ctx.remote.web.listProviders()` 在 0.2.2-rc.3 与 0.2.2-rc.5 的 `WebRuntime` 上可用，返回 `{ search, fetch }`（rc.5 仅新增可选的 `llmProvider` 请求字段）。
- `ctx.locale`、`ctx.slots`、`ctx.inject` 均为 0.2.2-rc.3 / 0.2.2-rc.5 客户端契约。
- `settings.section` 不是本插件应使用的入口；本插件没有全局设置项。

## 决策

1. **入口**：改为 `plugins.bundle.config`，key = `dsh-thin-search`（包名）；仅在 `configForms.whileServed(['thin-search'])` 内注册。
2. **表单状态**：像 dsh-context 一样使用 `configForms.get('thin-search')` 的 store/hooks；不依赖 bundle config owner props 的 `form`（该 props 在 0.2.2-rc.3 bundle config 中不存在）。
3. **移除**：`plugins.row.config` 注册、row key、对 `ConfigPageForm` 的依赖、底部 Save/Discard 栏。
4. **UI**：对齐 dsh-context v0.85.1：
   - 分组标题 + 行布局；标签左、控件右。
   - 选择类用 pill 控件（自定义可访问 popup；不 import 其他 DSH Client 包）。
   - 多行/文本类用 textarea/input，blur/Enter 提交，Escape 清除；即时写入。
   - 只读/不可用显示 note；不提供全局 Save 按钮。
   - 主题 token + 可访问 role/label/键盘；不嵌套交互元素。
5. **全局 provider**：仍在页面 “Search provider” 组内，通过 `ctx.remote.web.listProviders()` 展示，`configForms.get('web').set('searchProvider', id)` 热切换；不硬编码 `deepseek-official`。
6. **会话隔离**：本插件所有设置都是 profile 级 ConfigForms 字段，不读写 session 数据；因此不存在跨会话串用。若未来加入 session 级设置，必须走 session projection/本地 session store，不能放入本表单。
7. **版本**：v1.0.0 尚未 tag/publish，本次作为 v1.0.0 发布前修正；CHANGELOG 的 1.0.0 条目补充入口位置，不升版本号。

## 验收

- 已安装插件列表 → `dsh-thin-search` bundle 详情页 → Configuration 区域可打开设置。
- 全局 Settings 页面没有 Thin Search 设置项。
- 设置修改即时生效；只读/拒绝时显示明确提示。
- 组件测试断言 `plugins.bundle.config` + key `dsh-thin-search`，且没有 `plugins.row.config` / `settings.section`。
- `npm run check` 通过；`npm pack --dry-run` 文件列表不变。
