// dsh-client-ui-defaults — plugin-config card for the default working directory
// and the default retry count. Hand-authored client bundle in the tsdown
// __ModuleLoader__ format (local customization; rebuild with the DSH repo
// toolchain if the format ever shifts).
//
// Registers one card in the Settings → Plugins → 插件配置 section
// (`settings.plugin.item`), styled after the official web-search card: a
// collapsible card with title/description, the fields, and save/discard.
window.__ModuleLoader__.load({
	id: "dsh-client-ui-defaults",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let _deepseek_ai_dsh_client_locale = require("@deepseek-ai/dsh-client-locale");
		//#region lib/types/client/index.js
		/**
		* Defaults card, browser half. Registers one card in the Plugins settings
		* section's 插件配置 area (`settings.plugin.item`) and binds the
		* `dsh-defaults` settings namespace (registered by the dsh-defaults host
		* plugin, exposed by the dsh-host-apiproxy fork). The directory-picker
		* fork, the pi-ai fork, and the dsh-llm fork read the namespace at use
		* time, so a save takes effect immediately — no restart.
		* @module dsh-client-ui-defaults
		*/
		/** Locale dictionary namespace owned by this plugin. */
		const NS = "dsh-client-ui-defaults";
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope"
		];
		/** Bridges the `dsh-defaults` scope onto the card's snapshot store. */
		var DefaultsCardController = class {
			/** @param scope - the bound settings scope for the `dsh-defaults` namespace. */
			constructor(scope) {
				this.scope = scope;
				this.store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(this.projection());
				this.unsub = scope.subscribe(() => {
					this.store.set(this.projection());
				});
			}
			projection() {
				const snapshot = this.scope.getSnapshot();
				return {
					available: snapshot.status === "ready",
					writable: snapshot.writable,
					defaultWorkingDirectory: snapshot.status === "ready"
						? (snapshot.value?.defaultWorkingDirectory ?? "")
						: "",
					defaultRetryCount: snapshot.status === "ready"
						? (snapshot.value?.defaultRetryCount ?? 10)
						: 10
				};
			}
			/** Write both fields; resolves true only when the store confirms the values landed. */
			async save(fields) {
				try {
					await this.scope.set("defaultWorkingDirectory", fields.defaultWorkingDirectory);
					await this.scope.set("defaultRetryCount", fields.defaultRetryCount);
				} catch {
					return false;
				}
				const snapshot = this.scope.getSnapshot();
				return snapshot.status === "ready"
					&& snapshot.value?.defaultWorkingDirectory === fields.defaultWorkingDirectory
					&& snapshot.value?.defaultRetryCount === fields.defaultRetryCount;
			}
			/** Build the face the card's slot registration injects. */
			inject() {
				return {
					hooks: { dshDefaultsCard: this.store },
					save: (fields) => this.save(fields)
				};
			}
		};
		/** The card component: default working directory + default retry count. */
		function DefaultsCard(props) {
			const { t } = props;
			const state = props.useDshDefaultsCard((snapshot) => snapshot);
			const [open, setOpen] = react.useState(false);
			const [dirDraft, setDirDraft] = react.useState("");
			const [retryDraft, setRetryDraft] = react.useState("10");
			const [message, setMessage] = react.useState("");
			const [kind, setKind] = react.useState("ok");
			const [saving, setSaving] = react.useState(false);
			const disabled = !state.available || !state.writable;
			const storedDir = state.available ? state.defaultWorkingDirectory : void 0;
			const storedRetry = state.available ? state.defaultRetryCount : void 0;
			// Drafts follow the stored values; typing wins until a store update lands.
			react.useEffect(() => {
				if (storedDir !== void 0) setDirDraft(storedDir);
			}, [storedDir]);
			react.useEffect(() => {
				if (storedRetry !== void 0) setRetryDraft(String(storedRetry));
			}, [storedRetry]);
			const dirty = state.available
				&& (dirDraft.trim() !== String(state.defaultWorkingDirectory ?? "")
					|| retryDraft.trim() !== String(state.defaultRetryCount ?? ""));
			if (!state.available) return null;
			const save = async () => {
				const dir = dirDraft.trim();
				const retry = Number.parseInt(retryDraft.trim(), 10);
				if (!Number.isInteger(retry) || retry < 0) {
					setKind("err");
					setMessage(t("retryInvalid"));
					return;
				}
				setSaving(true);
				const ok = await props.save({ defaultWorkingDirectory: dir, defaultRetryCount: retry });
				setSaving(false);
				if (ok) {
					setKind("ok");
					setMessage(t("saved"));
				} else {
					setKind("err");
					setMessage(t("saveFailed"));
				}
			};
			const discard = () => {
				if (storedDir !== void 0) setDirDraft(storedDir);
				if (storedRetry !== void 0) setRetryDraft(String(storedRetry));
				setMessage("");
			};
			// Card chrome: collapsible header + body + footer (styled after the
			// official web-search PluginCard, inline styles + theme variables).
			const cardStyle = { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", borderRadius: "10px", overflow: "hidden" };
			const headerStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 14px", width: "100%", border: 0, background: "transparent", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" };
			const titleStyle = { fontSize: "14px", fontWeight: 600, margin: 0, color: "var(--dsw-alias-label-primary)" };
			const descStyle = { fontSize: "12px", lineHeight: "1.6", margin: "2px 0 0", color: "var(--dsw-alias-label-tertiary)" };
			const pendingStyle = { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-bg-layer-1)", borderRadius: "5px", padding: "1px 6px", whiteSpace: "nowrap" };
			const bodyStyle = { borderTop: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-module-platform)", padding: "10px 14px 12px" };
			const fieldStyle = { display: "flex", flexDirection: "column", gap: "6px", padding: "8px 0" };
			const labelStyle = { fontSize: "13px", fontWeight: 500, color: "var(--dsw-alias-label-primary)" };
			const inputStyle = { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-1)", height: "34px", font: "inherit", color: "var(--dsw-alias-label-primary)", borderRadius: "8px", padding: "0 12px", fontSize: "13px", lineHeight: "1.5", width: "100%", boxSizing: "border-box" };
			const hintStyle = { color: "var(--dsw-alias-label-tertiary)", margin: 0, fontSize: "12px", lineHeight: "1.6" };
			const buttonStyle = { border: 0, borderRadius: "8px", background: "var(--dsw-alias-brand-primary)", color: "#fff", height: "32px", padding: "0 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
			const ghostButtonStyle = { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "8px", background: "transparent", color: "var(--dsw-alias-label-primary)", height: "32px", padding: "0 18px", fontSize: "13px", cursor: "pointer" };
			const messageStyle = { margin: "10px 0 0", fontSize: "12px", lineHeight: "1.6", color: kind === "ok" ? "var(--dsw-alias-label-success, #4ade80)" : "var(--dsw-alias-label-error)" };
			const readOnlyStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", margin: "8px 0 0" };
			return (0, react_jsx_runtime.jsxs)("li", {
				style: cardStyle,
				children: [
					(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						style: headerStyle,
						"aria-expanded": open,
						onClick: () => {
							setOpen(!open);
						},
						children: [
							(0, react_jsx_runtime.jsxs)("span", {
								style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" },
								children: [
									(0, react_jsx_runtime.jsx)("h3", { style: titleStyle, children: t("title") }),
									(0, react_jsx_runtime.jsx)("p", { style: descStyle, children: t("description") })
								]
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								style: { display: "flex", alignItems: "center", gap: "8px", flex: "none" },
								children: [
									dirty ? (0, react_jsx_runtime.jsx)("span", { style: pendingStyle, children: t("unsaved") }) : null,
									(0, react_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" }, children: open ? "▾" : "▸" })
								]
							})
						]
					}),
					open ? (0, react_jsx_runtime.jsxs)("div", {
						style: bodyStyle,
						children: [
							!state.writable ? (0, react_jsx_runtime.jsx)("p", { role: "status", style: readOnlyStyle, children: t("readOnly") }) : null,
							(0, react_jsx_runtime.jsxs)("div", {
								style: fieldStyle,
								children: [
									(0, react_jsx_runtime.jsx)("label", { style: labelStyle, children: t("dirLabel") }),
									(0, react_jsx_runtime.jsx)("input", { type: "text", value: dirDraft, disabled, style: inputStyle, placeholder: t("dirPlaceholder"), onChange: (event) => setDirDraft(event.target.value) }),
									(0, react_jsx_runtime.jsx)("p", { style: hintStyle, children: t("dirHint") })
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								style: fieldStyle,
								children: [
									(0, react_jsx_runtime.jsx)("label", { style: labelStyle, children: t("retryLabel") }),
									(0, react_jsx_runtime.jsx)("input", { type: "number", inputMode: "numeric", min: 0, step: 1, value: retryDraft, disabled, style: inputStyle, onChange: (event) => setRetryDraft(event.target.value) }),
									(0, react_jsx_runtime.jsx)("p", { style: hintStyle, children: t("retryHint") })
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								style: { display: "flex", gap: "10px", marginTop: "8px" },
								children: [
									(0, react_jsx_runtime.jsx)("button", { type: "button", onClick: save, disabled: disabled || saving, style: buttonStyle, children: t("saveLabel") }),
									(0, react_jsx_runtime.jsx)("button", { type: "button", onClick: discard, disabled: disabled || saving || !dirty, style: ghostButtonStyle, children: t("discard") })
								]
							}),
							message === "" ? null : (0, react_jsx_runtime.jsx)("p", { role: "status", style: messageStyle, children: message })
						]
					}) : null
				]
			});
		}
		const zh = {
			title: "默认值",
			description: "配置目录选择器的默认工作目录与模型失败后的默认重试次数（对所有供应商生效）。保存后立即生效，无需重启。",
			dirLabel: "默认工作目录",
			dirPlaceholder: "例如 /home/user/Projects（留空 = 打开主目录）",
			dirHint: "「添加工作区 → 选择工作目录」时，选择器默认打开此目录。留空则使用官方行为（打开服务主目录）。",
			retryLabel: "默认重试次数",
			retryHint: "未单独声明重试策略的供应商（包括内置 DeepSeek 供应商），模型失败后的重试次数。0 = 不重试。",
			saveLabel: "保存",
			discard: "放弃",
			unsaved: "未保存",
			readOnly: "当前设置不可写。",
			saved: "已保存：目录选择器与重试默认值已更新。",
			retryInvalid: "重试次数必须是大于等于 0 的整数。",
			saveFailed: "保存失败：可能已被其它修改覆盖或权限不足，请重试。"
		};
		const en = {
			title: "Defaults",
			description: "Configure the directory picker's default working directory and the default retry count (applies to every provider). Saving takes effect immediately — no restart needed.",
			dirLabel: "Default working directory",
			dirPlaceholder: "e.g. /home/user/Projects (empty = home directory)",
			dirHint: "The directory picker opens at this path when adding a workspace. Leave empty for the official behavior (the host home directory).",
			retryLabel: "Default retry count",
			retryHint: "Retries after a failed model call for providers without their own retry policy, including the built-in DeepSeek provider. 0 = no retry.",
			saveLabel: "Save",
			discard: "Discard",
			unsaved: "Unsaved",
			readOnly: "Settings are not writable.",
			saved: "Saved: the directory picker and retry defaults are updated.",
			retryInvalid: "The retry count must be a non-negative integer.",
			saveFailed: "Save failed: possibly overwritten concurrently or not permitted. Retry."
		};
		/**
		* Mount the card into the Plugins settings section's 插件配置 area.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const scope = ctx.settingsScope.bind({ namespace: "dsh-defaults" });
			const controller = new DefaultsCardController(scope);
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-defaults: card dictionaries");
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					key: "dsh-defaults",
					order: 30,
					locale: NS,
					inject: () => controller.inject()
				}, DefaultsCard);
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
