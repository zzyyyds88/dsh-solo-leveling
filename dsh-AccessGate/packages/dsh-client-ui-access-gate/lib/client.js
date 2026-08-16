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
					proxyEnabled: ready ? snapshot.value?.proxyEnabled === true : false,
					lanHost: ready ? (snapshot.value?.lanHost ?? "") : "",
					httpsPort: ready ? (snapshot.value?.httpsPort ?? "") : ""
				};
			}
			/**
			* Write the editable fields. `password` may be empty to leave the current
			* password untouched. Resolves true only when the store confirms the
			* proxy fields landed.
			* @param fields - { password, proxyEnabled, lanHost, httpsPort }
			*/
			async save(fields) {
				try {
					if (typeof fields.password === "string" && fields.password.length > 0) {
						await this.scope.set("password", fields.password);
					}
					await this.scope.set("proxyEnabled", fields.proxyEnabled === true);
					await this.scope.set("lanHost", fields.lanHost ?? "");
					await this.scope.set("httpsPort", fields.httpsPort ?? "");
				} catch {
					return false;
				}
				const snapshot = this.scope.getSnapshot();
				return snapshot.status === "ready"
					&& snapshot.value?.proxyEnabled === (fields.proxyEnabled === true)
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
			// 反代参数默认空 = 不开启（未配置时插件不启动反代）
			const [lanDraft, setLanDraft] = react.useState("");
			const [portDraft, setPortDraft] = react.useState("");
			const [message, setMessage] = react.useState("");
			const [kind, setKind] = react.useState("ok");
			const [saving, setSaving] = react.useState(false);
			const [restarting, setRestarting] = react.useState(false);
			const [restartHelp, setRestartHelp] = react.useState("");
			const disabled = !state.available || !state.writable;
			const storedLan = state.available ? state.lanHost : void 0;
			const storedPort = state.available ? state.httpsPort : void 0;
			const storedProxyOn = state.available ? state.proxyEnabled : false;
			// 反代独立开关（默认关）；开时才显示/校验 lanHost/httpsPort
			const [proxyOn, setProxyOn] = react.useState(false);
			// Drafts follow the stored values; typing wins until a store update lands.
			react.useEffect(() => {
				setProxyOn(storedProxyOn);
			}, [storedProxyOn]);
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
					|| proxyOn !== storedProxyOn
					|| (proxyOn && (lanDraft.trim() !== String(state.lanHost ?? "")
						|| portDraft.trim() !== String(state.httpsPort ?? ""))));
			if (!state.available) return null;
			/** 反代启用时返回访问地址（https://<lanHost>:<port>/），否则空串。 */
			const accessUrl = () => {
				const lan = lanDraft.trim();
				const port = Number.parseInt(portDraft.trim(), 10);
				return proxyOn && lan.length > 0 && Number.isInteger(port) ? `https://${lan}:${port}/` : "";
			};
			/** 重启后提示：systemd 自动重启说明 + 可复制给 AI 的配置提示词。 */
			const buildRestartHelp = (lan, url) => {
				// 无需 --trusted-host：connection 覆盖已在 profile 固化 trustedHosts（默认 192.168.1.100）
				const cmd = `node /usr/bin/dsh web`;
				return [
					t("restartHelpIntro"),
					"",
					`【请为我的 DeepSeek Harness（DSH）配置 systemd 自动重启】`,
					`- 服务名：dsh-web`,
					`- 启动命令：${cmd}`,
					`- 要求：进程退出（包括被 kill）后自动重启（Restart=always）、开机自启`,
					`- DSH_HOME：/root/.dsh`,
					`请生成 /etc/systemd/system/dsh-web.service 单元文件，并给出 systemctl enable --now 命令。`,
				].join("\n");
			};
			const checkPortInUse = async (port) => {
				try {
					const res = await fetch("/access-gate/check-port", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ port })
					});
					return (await res.json()).inUse === true;
				} catch {
					return false; // 检测不可用 → 放行（后端 ensure 仍会兜底）
				}
			};
			const save = async () => {
				const lanHost = lanDraft.trim();
				const httpsPort = Number.parseInt(portDraft.trim(), 10);
				if (proxyOn) {
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
					if (await checkPortInUse(httpsPort)) {
						setKind("err");
						setMessage(t("portInUse"));
						return;
					}
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
				// 开关关 = 关闭反代（清空参数）；开且参数非空才启用
				const on = proxyOn && lanHost.length > 0;
				const proxyLan = on ? lanHost : "";
				const proxyPort = on ? httpsPort : "";
				setSaving(true);
				const ok = await props.save({ password, proxyEnabled: on, lanHost: proxyLan, httpsPort: proxyPort });
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
			const restart = async () => {
				if (!window.confirm(t("restartConfirm"))) return;
				setRestarting(true);
				try {
					const res = await fetch("/access-gate/restart", { method: "POST" });
					if (res.ok) {
						setKind("ok");
						const url = accessUrl();
						setMessage(url !== "" ? `${t("restartSent")}${t("restartVisit")} ${url}` : t("restartSent"));
						// 提示：配置 systemd 自动重启 / 手动拉起；附可复制给 AI 的提示词
						const lan = lanDraft.trim();
						const port = Number.parseInt(portDraft.trim(), 10);
						setRestartHelp(buildRestartHelp(lan, port, url));
					} else {
						setKind("err");
						setMessage(t("restartFailed"));
						setRestartHelp("");
					}
				} catch {
					setKind("err");
					setMessage(t("restartFailed"));
					setRestartHelp("");
				}
				setRestarting(false);
			};
			const discard = () => {
				setProxyOn(storedProxyOn);
				if (storedLan !== void 0) setLanDraft(storedLan);
				if (storedPort !== void 0) setPortDraft(String(storedPort));
				setPassword("");
				setConfirm("");
				setMessage("");
				setRestartHelp("");
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
			const dangerButtonStyle = { border: "1px solid var(--dsw-alias-label-error, #f87171)", borderRadius: "8px", background: "transparent", color: "var(--dsw-alias-label-error, #f87171)", height: "32px", padding: "0 18px", fontSize: "13px", cursor: "pointer" };
			const messageStyle = { margin: "10px 0 0", fontSize: "12px", lineHeight: "1.6", color: kind === "ok" ? "var(--dsw-alias-label-success, #4ade80)" : "var(--dsw-alias-label-error)" };
			const readOnlyStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", margin: "8px 0 0" };
			// 突出 HTTPS 访问地址（反代启用时常显）
			const accessUrlStyle = { margin: "8px 0 0", fontSize: "13px", fontWeight: 600, lineHeight: "1.6", color: "var(--dsw-alias-label-success, #4ade80)" };
			// 重启后 systemd 提示词块（可选中复制）
			const restartHelpStyle = { margin: "10px 0 0", padding: "10px 12px", background: "var(--dsw-alias-bg-layer-1)", border: "1px dashed var(--dsw-alias-border-l2)", borderRadius: "8px", fontSize: "12px", lineHeight: "1.7", color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-all", userSelect: "text", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
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
									// 反代独立开关（默认关）；关 = 不启用，参数不可编辑
									(0, react_jsx_runtime.jsxs)("div", {
										style: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" },
										children: [
											(0, react_jsx_runtime.jsx)("input", { type: "checkbox", checked: proxyOn, disabled, style: { width: "16px", height: "16px", accentColor: "var(--dsw-alias-brand-primary)" }, onChange: (event) => setProxyOn(event.target.checked) }),
											(0, react_jsx_runtime.jsx)("label", { style: labelStyle, children: t("proxyToggleLabel") })
										]
									}),
									(0, react_jsx_runtime.jsx)("p", { style: hintStyle, children: t("proxyToggleHint") }),
									(0, react_jsx_runtime.jsxs)("div", {
										style: fieldStyle,
										children: [
											(0, react_jsx_runtime.jsx)("label", { style: labelStyle, children: t("lanHostLabel") }),
											(0, react_jsx_runtime.jsx)("input", { type: "text", value: lanDraft, disabled: disabled || !proxyOn, style: inputStyle, placeholder: t("lanHostPlaceholder"), onChange: (event) => setLanDraft(event.target.value) }),
											(0, react_jsx_runtime.jsx)("p", { style: hintStyle, children: t("lanHostHint") })
										]
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										style: fieldStyle,
										children: [
											(0, react_jsx_runtime.jsx)("label", { style: labelStyle, children: t("httpsPortLabel") }),
											(0, react_jsx_runtime.jsx)("input", { type: "number", inputMode: "numeric", min: 1, max: 65535, step: 1, value: portDraft, disabled: disabled || !proxyOn, style: inputStyle, onChange: (event) => setPortDraft(event.target.value) }),
											(0, react_jsx_runtime.jsx)("p", { style: hintStyle, children: t("httpsPortHint") })
										]
									}),
									accessUrl() === "" ? null : (0, react_jsx_runtime.jsx)("p", {
										style: accessUrlStyle,
										children: (0, react_jsx_runtime.jsxs)("span", {
											children: [
												t("accessUrlLabel"),
												" ",
												(0, react_jsx_runtime.jsx)("b", { style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--dsw-alias-label-success, #4ade80)", wordBreak: "break-all" }, children: accessUrl() })
											]
										})
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								style: { display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap" },
								children: [
									(0, react_jsx_runtime.jsx)("button", { type: "button", onClick: save, disabled: disabled || saving, style: buttonStyle, children: t("saveLabel") }),
									(0, react_jsx_runtime.jsx)("button", { type: "button", onClick: discard, disabled: disabled || saving || !dirty, style: ghostButtonStyle, children: t("discard") }),
									(0, react_jsx_runtime.jsx)("button", { type: "button", onClick: restart, disabled: disabled || saving || restarting, style: dangerButtonStyle, children: t("restart") })
								]
							}),
							message === "" ? null : (0, react_jsx_runtime.jsx)("p", { role: "status", style: messageStyle, children: message.split("\n").map((line, i) => (0, react_jsx_runtime.jsxs)("span", { children: [line, i < message.split("\n").length - 1 ? (0, react_jsx_runtime.jsx)("br", {}) : null] }, i)) }),
							restartHelp === "" ? null : (0, react_jsx_runtime.jsx)("pre", { style: restartHelpStyle, children: restartHelp })
						]
					}) : null
				]
			});
		}
		const zh = {
			title: "访问门禁",
			description: "配置 Web 界面登录口令与 HTTPS 反向代理（caddy）。口令保存后旧会话失效；填写反代参数后保存并点「重启」，dsh 与 caddy 会自动退出，由系统拉起后反代自动运行（启动命令不变）。",
			passwordSection: "访问口令",
			passwordLabel: "新访问口令（至少 6 位，留空 = 不修改）",
			passwordPlaceholder: "输入新口令",
			passwordHint: "留空则保持当前口令；设置新口令保存后旧会话全部失效，需重新登录。",
			confirmLabel: "确认新访问口令",
			confirmPlaceholder: "再次输入新口令",
			confirmHint: "两次输入需保持一致。",
			proxySection: "HTTPS 反向代理",
			proxyToggleLabel: "启用 HTTPS 反向代理",
			proxyToggleHint: "默认关闭。开启后填写下方地址与端口，保存并点「重启」，dsh 启动时自动用内置 caddy 提供 HTTPS 反代（无需安装 caddy / 无需手动跑脚本）。",
			lanHostLabel: "局域网地址 / 域名",
			lanHostPlaceholder: "例如 192.168.1.100",
			lanHostHint: "HTTPS 反代（caddy）绑定的地址，也是浏览器访问地址。",
			httpsPortLabel: "HTTPS 端口",
			httpsPortPlaceholder: "例如 5700",
			httpsPortHint: "caddy 对外 HTTPS 端口（1-65535）。改动后保存并点「重启」生效。",
			accessUrlLabel: "🔒 重启生效后请访问：",
			restartVisit: "重启生效后请访问",
			saveLabel: "保存",
			discard: "放弃",
			restart: "重启",
			restartConfirm: "将立即退出 dsh 与本实例 caddy（不做重启），由系统按各自配置拉起；确定继续？",
			restartSent: "已发出重启请求：dsh 与本实例 caddy 正在退出，系统拉起后生效。",
			restartHelpIntro: "提示：本实例已退出，需要有人把它重新拉起来。推荐配置 systemd 自动重启（进程退出自动拉起 + 开机自启）；或将下面整段复制给你的 AI 助手，让它代为配置：",
			restartFailed: "重启请求失败：可能未登录或权限不足。",
			unsaved: "未保存",
			readOnly: "当前设置不可写。",
			tooShort: "口令至少需要 6 位。",
			mismatch: "两次输入的口令不一致。",
			saved: "已保存：反代开关与参数已更新，点「重启」后生效。",
			savedWithPassword: "已保存：口令已更新，旧会话已失效，请重新登录；反代开关与参数点「重启」后生效。",
			saveFailed: "保存失败：可能已被其它修改覆盖或权限不足，请重试。",
			hostEmpty: "启用反代时「局域网地址 / 域名」不能为空。",
			portInvalid: "HTTPS 端口必须是 1-65535 的整数。",
			portInUse: "该 HTTPS 端口已被占用（可能是其它服务或另一实例的反代），请换一个端口。"
		};
		const en = {
			title: "Access Gate",
			description: "Configure the web GUI login password and the HTTPS reverse proxy (caddy). A saved password invalidates all sessions; after filling in proxy parameters, save and press Restart — dsh and caddy exit and the system brings dsh back up with the proxy running automatically (start command unchanged).",
			passwordSection: "Access password",
			passwordLabel: "New access password (6+ chars, leave empty to keep)",
			passwordPlaceholder: "Enter new password",
			passwordHint: "Leave empty to keep the current password; setting a new one invalidates all existing sessions.",
			confirmLabel: "Confirm new access password",
			confirmPlaceholder: "Enter it again",
			confirmHint: "Both entries must match.",
			proxySection: "HTTPS reverse proxy",
			proxyToggleLabel: "Enable HTTPS reverse proxy",
			proxyToggleHint: "Disabled by default. Turn it on, fill in the address and port below, save and press Restart — dsh starts its embedded caddy automatically (no caddy install, no script).",
			lanHostLabel: "LAN host / domain",
			lanHostPlaceholder: "e.g. 192.168.1.100",
			lanHostHint: "The address the HTTPS reverse proxy (caddy) binds and the browser visits.",
			httpsPortLabel: "HTTPS port",
			httpsPortPlaceholder: "e.g. 5700",
			httpsPortHint: "The caddy external HTTPS port (1-65535). Save and press Restart after changing.",
			accessUrlLabel: "🔒 Visit after restart:",
			restartVisit: "after restart visit",
			saveLabel: "Save",
			discard: "Discard",
			restart: "Restart",
			restartConfirm: "This exits dsh and this instance's caddy immediately (no restart orchestration); the system brings dsh back up per its own setup. Continue?",
			restartSent: "Restart requested: dsh and this instance's caddy are exiting; the system will bring dsh back up.",
			restartHelpIntro: "Note: this instance has exited and needs to be brought back up. Recommended: configure a systemd service with automatic restart (Restart=always + enable), or copy the whole block below to your AI assistant to configure it for you:",
			restartFailed: "Restart request failed: maybe not signed in or not permitted.",
			unsaved: "Unsaved",
			readOnly: "Settings are not writable.",
			tooShort: "The password needs at least 6 characters.",
			mismatch: "The two entries do not match.",
			saved: "Saved: proxy toggle and parameters updated; press Restart to apply.",
			savedWithPassword: "Saved: password changed and all old sessions are invalid — please sign in again; proxy toggle and parameters apply after Restart.",
			saveFailed: "Save failed: possibly overwritten concurrently or not permitted. Retry.",
			hostEmpty: "The LAN host must not be empty when the proxy is enabled.",
			portInvalid: "The HTTPS port must be an integer between 1 and 65535.",
			portInUse: "This HTTPS port is already in use (another service or another instance's proxy). Pick a different port."
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
