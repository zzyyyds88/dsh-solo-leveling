// dsh-client-ui-access-gate — plugin-config card for the access password and
// the HTTPS reverse-proxy parameters (LAN host + port).
// Hand-authored client bundle in the tsdown __ModuleLoader__ format (local
// customization; rebuild with the DSH repo toolchain if the format ever shifts).
//
// Registers one card in the Settings → Plugins → 插件配置 section
// (`settings.plugin.item`), styled after the official web-search card: a
// collapsible card with title/description, the fields, and save/discard.
window.__ModuleLoader__.load({
	id: "dsh-client-ui-access-gate",
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
		* Access-gate card, browser half. Registers one card in the Plugins
		* settings section's 插件配置 area (`settings.plugin.item`) and binds the
		* `access-gate` settings namespace (registered by the dsh-host-access-gate
		* host plugin, exposed by the dsh-host-apiproxy fork). Fields:
		*   - 访问口令（可留空不修改；保存后 host 轮换 HMAC key，旧会话立即失效）；
		*   - 反向代理参数 lanHost / httpsPort（switch-to-https.sh 读取生成 Caddyfile）。
		* @module dsh-client-ui-access-gate
		*/
		/** Locale dictionary namespace owned by this plugin. */
		const NS = "dsh-client-ui-access-gate";
		/** Minimum password length, kept in sync with the host plugin. */
		const MIN_PASSWORD_LENGTH = 6;
		/** Fallback defaults, kept in sync with the host plugin's schema defaults. */
		const DEFAULT_LAN_HOST = "192.168.1.100";
		const DEFAULT_HTTPS_PORT = 5700;
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope"
		];
		/** Bridges the `access-gate` scope onto the card's snapshot store. */
		var AccessGateCardController = class {
			/** @param scope - the bound settings scope for the `access-gate` namespace. */
			constructor(scope) {
				this.scope = scope;
				this.store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(this.projection());
				this.unsub = scope.subscribe(() => {
					this.store.set(this.projection());
				});
			}
			projection() {
				const snapshot = this.scope.getSnapshot();
				const ready = snapshot.status === "ready";
				return {
					available: ready,
					writable: snapshot.writable,
					lanHost: ready ? (snapshot.value?.lanHost ?? DEFAULT_LAN_HOST) : DEFAULT_LAN_HOST,
					httpsPort: ready ? (snapshot.value?.httpsPort ?? DEFAULT_HTTPS_PORT) : DEFAULT_HTTPS_PORT
				};
			}
			/**
			* Write the editable fields. `password` may be empty to leave the current
			* password untouched. Resolves true only when the store confirms the
			* proxy fields landed.
			* @param fields - { password, lanHost, httpsPort }
			*/
			async save(fields) {
				try {
					if (typeof fields.password === "string" && fields.password.length > 0) {
						await this.scope.set("password", fields.password);
					}
					await this.scope.set("lanHost", fields.lanHost);
					await this.scope.set("httpsPort", fields.httpsPort);
				} catch {
					return false;
				}
				const snapshot = this.scope.getSnapshot();
				return snapshot.status === "ready"
					&& snapshot.value?.lanHost === fields.lanHost
					&& snapshot.value?.httpsPort === fields.httpsPort;
			}
			/** Build the face the card's slot registration injects. */
			inject() {
				return {
					hooks: { accessGateCard: this.store },
					save: (fields) => this.save(fields)
				};
			}
		};
		/** The card component: password (optional) + reverse-proxy parameters. */
		function AccessGateCard(props) {
			const { t } = props;
			const state = props.useAccessGateCard((snapshot) => snapshot);
			const [open, setOpen] = react.useState(false);
			const [password, setPassword] = react.useState("");
			const [confirm, setConfirm] = react.useState("");
			const [lanDraft, setLanDraft] = react.useState(DEFAULT_LAN_HOST);
			const [portDraft, setPortDraft] = react.useState(String(DEFAULT_HTTPS_PORT));
			const [message, setMessage] = react.useState("");
			const [kind, setKind] = react.useState("ok");
			const [saving, setSaving] = react.useState(false);
			const disabled = !state.available || !state.writable;
			const storedLan = state.available ? state.lanHost : void 0;
			const storedPort = state.available ? state.httpsPort : void 0;
			// Drafts follow the stored values; typing wins until a store update lands.
			react.useEffect(() => {
				if (storedLan !== void 0) setLanDraft(storedLan);
			}, [storedLan]);
			react.useEffect(() => {
				if (storedPort !== void 0) setPortDraft(String(storedPort));
			}, [storedPort]);
			// The stored password is secret (role("secret")) and never surfaced;
			// any typed password counts as an unsaved draft.
			const dirty = state.available
				&& (password.length > 0 || confirm.length > 0
					|| lanDraft.trim() !== String(state.lanHost ?? "")
					|| portDraft.trim() !== String(state.httpsPort ?? ""));
			if (!state.available) return null;
			const save = async () => {
				const lanHost = lanDraft.trim();
				const httpsPort = Number.parseInt(portDraft.trim(), 10);
				if (lanHost.length === 0) {
					setKind("err");
					setMessage(t("hostEmpty"));
					return;
				}
				if (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535) {
					setKind("err");
					setMessage(t("portInvalid"));
					return;
				}
				if (password.length > 0) {
					if (password.length < MIN_PASSWORD_LENGTH) {
						setKind("err");
						setMessage(t("tooShort"));
						return;
					}
					if (password !== confirm) {
						setKind("err");
						setMessage(t("mismatch"));
						return;
					}
				}
				setSaving(true);
				const ok = await props.save({ password, lanHost, httpsPort });
				setSaving(false);
				if (ok) {
					setKind("ok");
					setMessage(password.length > 0 ? t("savedWithPassword") : t("saved"));
					setPassword("");
					setConfirm("");
				} else {
					setKind("err");
					setMessage(t("saveFailed"));
				}
			};
			const discard = () => {
				if (storedLan !== void 0) setLanDraft(storedLan);
				if (storedPort !== void 0) setPortDraft(String(storedPort));
				setPassword("");
				setConfirm("");
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
			const sectionStyle = { padding: "6px 0 4px", display: "flex", flexDirection: "column", gap: "4px" };
			const sectionTitleStyle = { fontSize: "12px", fontWeight: 600, margin: "8px 0 0", color: "var(--dsw-alias-label-secondary)" };
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
								style: sectionStyle,
								children: [
									(0, react_jsx_runtime.jsx)("p", { style: sectionTitleStyle, children: t("passwordSection") }),
									(0, react_jsx_runtime.jsxs)("div", {
										style: fieldStyle,
										children: [
											(0, react_jsx_runtime.jsx)("label", { style: labelStyle, children: t("passwordLabel") }),
											(0, react_jsx_runtime.jsx)("input", { type: "password", value: password, disabled, style: inputStyle, placeholder: t("passwordPlaceholder"), autoComplete: "new-password", onChange: (event) => setPassword(event.target.value) }),
											(0, react_jsx_runtime.jsx)("p", { style: hintStyle, children: t("passwordHint") })
										]
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										style: fieldStyle,
										children: [
											(0, react_jsx_runtime.jsx)("label", { style: labelStyle, children: t("confirmLabel") }),
											(0, react_jsx_runtime.jsx)("input", { type: "password", value: confirm, disabled, style: inputStyle, placeholder: t("confirmPlaceholder"), autoComplete: "new-password", onChange: (event) => setConfirm(event.target.value) }),
											(0, react_jsx_runtime.jsx)("p", { style: hintStyle, children: t("confirmHint") })
										]
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								style: sectionStyle,
								children: [
									(0, react_jsx_runtime.jsx)("p", { style: sectionTitleStyle, children: t("proxySection") }),
									(0, react_jsx_runtime.jsxs)("div", {
										style: fieldStyle,
										children: [
											(0, react_jsx_runtime.jsx)("label", { style: labelStyle, children: t("lanHostLabel") }),
											(0, react_jsx_runtime.jsx)("input", { type: "text", value: lanDraft, disabled, style: inputStyle, placeholder: t("lanHostPlaceholder"), onChange: (event) => setLanDraft(event.target.value) }),
											(0, react_jsx_runtime.jsx)("p", { style: hintStyle, children: t("lanHostHint") })
										]
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										style: fieldStyle,
										children: [
											(0, react_jsx_runtime.jsx)("label", { style: labelStyle, children: t("httpsPortLabel") }),
											(0, react_jsx_runtime.jsx)("input", { type: "number", inputMode: "numeric", min: 1, max: 65535, step: 1, value: portDraft, disabled, style: inputStyle, onChange: (event) => setPortDraft(event.target.value) }),
											(0, react_jsx_runtime.jsx)("p", { style: hintStyle, children: t("httpsPortHint") })
										]
									})
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
			title: "访问门禁",
			description: "配置 Web 界面登录口令与 HTTPS 反向代理参数（局域网地址 / 端口）。口令保存后旧会话失效；反代参数在重跑切换脚本后生效。",
			passwordSection: "访问口令",
			passwordLabel: "新访问口令（至少 6 位，留空 = 不修改）",
			passwordPlaceholder: "输入新口令",
			passwordHint: "留空则保持当前口令；设置新口令保存后旧会话全部失效，需重新登录。",
			confirmLabel: "确认新访问口令",
			confirmPlaceholder: "再次输入新口令",
			confirmHint: "两次输入需保持一致。",
			proxySection: "HTTPS 反向代理",
			lanHostLabel: "局域网地址 / 域名",
			lanHostPlaceholder: "例如 192.168.1.100",
			lanHostHint: "HTTPS 反代（caddy）绑定的地址，也是浏览器访问地址；切换脚本读取此项生成 Caddyfile 与 --trusted-host。",
			httpsPortLabel: "HTTPS 端口",
			httpsPortPlaceholder: "例如 5700",
			httpsPortHint: "caddy 对外 HTTPS 端口（1-65535），默认 5700；改动后重跑 switch-to-https.sh 并重启 caddy 生效。",
			saveLabel: "保存",
			discard: "放弃",
			unsaved: "未保存",
			readOnly: "当前设置不可写。",
			tooShort: "口令至少需要 6 位。",
			mismatch: "两次输入的口令不一致。",
			saved: "已保存：反向代理参数已更新。",
			savedWithPassword: "已保存：口令已更新，旧会话已失效，请重新登录；反代参数已更新。",
			saveFailed: "保存失败：可能已被其它修改覆盖或权限不足，请重试。",
			portInvalid: "HTTPS 端口必须是 1-65535 的整数。",
			hostEmpty: "局域网地址不能为空。"
		};
		const en = {
			title: "Access Gate",
			description: "Configure the web GUI login password and the HTTPS reverse-proxy parameters (LAN host / port). A saved password invalidates all sessions; proxy parameters take effect after re-running the switch script.",
			passwordSection: "Access password",
			passwordLabel: "New access password (6+ chars, leave empty to keep)",
			passwordPlaceholder: "Enter new password",
			passwordHint: "Leave empty to keep the current password; setting a new one invalidates all existing sessions.",
			confirmLabel: "Confirm new access password",
			confirmPlaceholder: "Enter it again",
			confirmHint: "Both entries must match.",
			proxySection: "HTTPS reverse proxy",
			lanHostLabel: "LAN host / domain",
			lanHostPlaceholder: "e.g. 192.168.1.100",
			lanHostHint: "The address the HTTPS reverse proxy (caddy) binds and the browser visits; the switch script reads this to generate the Caddyfile and --trusted-host.",
			httpsPortLabel: "HTTPS port",
			httpsPortPlaceholder: "e.g. 5700",
			httpsPortHint: "The caddy external HTTPS port (1-65535), default 5700; re-run switch-to-https.sh and restart caddy after changing.",
			saveLabel: "Save",
			discard: "Discard",
			unsaved: "Unsaved",
			readOnly: "Settings are not writable.",
			tooShort: "The password needs at least 6 characters.",
			mismatch: "The two entries do not match.",
			saved: "Saved: reverse-proxy parameters updated.",
			savedWithPassword: "Saved: password changed and all old sessions are invalid — please sign in again; proxy parameters updated.",
			saveFailed: "Save failed: possibly overwritten concurrently or not permitted. Retry.",
			portInvalid: "The HTTPS port must be an integer between 1 and 65535.",
			hostEmpty: "The LAN host must not be empty."
		};
		/**
		* Mount the card into the Plugins settings section's 插件配置 area.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const scope = ctx.settingsScope.bind({ namespace: "access-gate" });
			const controller = new AccessGateCardController(scope);
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-access-gate: card dictionaries");
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					id: "access-gate",
					order: 30,
					locale: NS,
					inject: () => controller.inject()
				}, AccessGateCard);
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
