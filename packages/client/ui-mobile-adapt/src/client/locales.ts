/**
 * The `dsh-client-ui-mobile-adapt` namespace dictionaries: copy for the
 * plugin settings card (the `settings.plugin.item` seat) that edits the
 * mobile-adaptation parameters (breakpoint / drawer width / pet scale).
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'settings.title': '移动端适配',
  'settings.description': '配置窄屏断点、抽屉宽度与桌宠缩放。保存后立即生效，无需重启。',
  'settings.breakpoint': '窄屏断点 (px)',
  'settings.breakpointHint': '视口宽度 ≤ 此值时启用移动端布局（侧栏/详情/右侧面板变抽屉）。支持 320–1280。',
  'settings.drawerWidth': '抽屉宽度 (px)',
  'settings.drawerWidthHint': '右侧面板（文件树/预览）抽屉的宽度上限。支持 240–640。',
  'settings.petScale': '桌宠缩放',
  'settings.petScaleHint': '移动端桌宠的缩放比例（0.75 = 桌面版 75% 大小）。支持 0.1–2。',
  'settings.overridden': '已覆盖',
  'settings.reset': '恢复默认',
  'settings.notExposed': '当前 DSH 版本未向设置页暴露本插件的配置命名空间，表单不可用。可编辑 ~/.dsh/settings.yaml 直接配置。',
  'settings.readOnly': '当前部署的设置只读。',
  'settings.expand': '展开设置',
  'settings.collapse': '收起设置',
  'settings.save': '保存',
  'settings.saving': '保存中…',
  'settings.discard': '放弃',
  'settings.unsaved': '未保存',
  'settings.saveFailed': '部署未接受这些值，已保留供你修改。',
  'settings.invalidNumber': '请输入数字，留空则使用默认值。',
} satisfies Record<string, string>

/** The mobile-adapt card key union. */
export type SettingsCardKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'settings.title': 'Mobile adaptation',
  'settings.description': 'Configure the narrow-screen breakpoint, drawer width, and pet scale. Saving takes effect immediately — no restart needed.',
  'settings.breakpoint': 'Narrow-screen breakpoint (px)',
  'settings.breakpointHint': 'The mobile layout (side bar / details / right panel as drawers) activates at a viewport width at or below this value. 320–1280.',
  'settings.drawerWidth': 'Drawer width (px)',
  'settings.drawerWidthHint': 'Width cap of the right-panel (file tree / preview) drawer. 240–640.',
  'settings.petScale': 'Pet scale',
  'settings.petScaleHint': 'Scale of the desktop pet on narrow screens (0.75 = 75% of the desktop size). 0.1–2.',
  'settings.overridden': 'Overridden',
  'settings.reset': 'Reset to default',
  'settings.notExposed': "This DSH version does not expose this plugin's settings namespace to the configuration page, so the form is unavailable. Edit ~/.dsh/settings.yaml directly.",
  'settings.readOnly': 'This deployment stores settings read-only.',
  'settings.expand': 'Show settings',
  'settings.collapse': 'Hide settings',
  'settings.save': 'Save',
  'settings.saving': 'Saving…',
  'settings.discard': 'Discard',
  'settings.unsaved': 'Unsaved',
  'settings.saveFailed': 'The deployment did not accept these values; they were left for you to correct.',
  'settings.invalidNumber': 'Enter a number, or leave blank to use the default.',
} satisfies Record<SettingsCardKey, string>
