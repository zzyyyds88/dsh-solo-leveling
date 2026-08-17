window.__ModuleLoader__.load({
	id: "@zzyyyds88/dsh-live-stats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region \0dsh-css:packages/dsh-live-stats/src/client/settings-card.module.css.mjs
		const css = ".jmhvDG_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}.jmhvDG_card:hover{border-color:var(--dsw-alias-label-dimmed)}.jmhvDG_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.jmhvDG_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.jmhvDG_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.jmhvDG_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.jmhvDG_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.jmhvDG_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.jmhvDG_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.jmhvDG_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.jmhvDG_chevronOpen{transform:rotate(180deg)}.jmhvDG_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.jmhvDG_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.jmhvDG_notExposed{color:var(--dsw-alias-state-warn-primary);margin:12px 0 0;font-size:12px;line-height:1.5}.jmhvDG_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.jmhvDG_failed{min-width:0;color:var(--dsw-alias-label-error);text-overflow:ellipsis;white-space:nowrap;flex:1;margin:0;font-size:12px;line-height:1.5;overflow:hidden}.jmhvDG_discard,.jmhvDG_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.jmhvDG_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.jmhvDG_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.jmhvDG_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.jmhvDG_discard:disabled,.jmhvDG_save:disabled{opacity:.4;cursor:default}.jmhvDG_discard:focus-visible,.jmhvDG_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.jmhvDG_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.jmhvDG_field+.jmhvDG_field{border-top:1px solid var(--dsw-alias-border-l2)}.jmhvDG_head{align-items:center;gap:8px;display:flex}.jmhvDG_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.jmhvDG_badges{align-items:center;gap:8px;display:inline-flex}.jmhvDG_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.jmhvDG_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}.jmhvDG_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.jmhvDG_reset:disabled{cursor:default}.jmhvDG_reset:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.jmhvDG_input,.jmhvDG_select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.jmhvDG_input:focus-visible,.jmhvDG_select:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.jmhvDG_input:disabled,.jmhvDG_select:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.jmhvDG_inputInvalid{border:1px solid var(--dsw-alias-label-error);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.jmhvDG_inputInvalid:focus-visible{outline:2px solid var(--dsw-alias-label-error);outline-offset:1px;border-color:var(--dsw-alias-label-error)}.jmhvDG_invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}.jmhvDG_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}@media (prefers-reduced-motion:reduce){.jmhvDG_card,.jmhvDG_header,.jmhvDG_chevron,.jmhvDG_chevronOpen,.jmhvDG_discard,.jmhvDG_save{transition:none}}";
		const tagId = "@zzyyyds88/dsh-live-stats/settings-card.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@zzyyyds88/dsh-live-stats";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var settings_card_module_css_default = {
			"badge": "jmhvDG_badge",
			"badges": "jmhvDG_badges",
			"body": "jmhvDG_body",
			"card": "jmhvDG_card",
			"cardOpen": "jmhvDG_cardOpen",
			"chevron": "jmhvDG_chevron",
			"chevronOpen": "jmhvDG_chevronOpen",
			"description": "jmhvDG_description",
			"discard": "jmhvDG_discard",
			"failed": "jmhvDG_failed",
			"field": "jmhvDG_field",
			"footer": "jmhvDG_footer",
			"head": "jmhvDG_head",
			"headText": "jmhvDG_headText",
			"header": "jmhvDG_header",
			"hint": "jmhvDG_hint",
			"input": "jmhvDG_input",
			"inputInvalid": "jmhvDG_inputInvalid",
			"invalid": "jmhvDG_invalid",
			"label": "jmhvDG_label",
			"name": "jmhvDG_name",
			"notExposed": "jmhvDG_notExposed",
			"pending": "jmhvDG_pending",
			"readOnly": "jmhvDG_readOnly",
			"reset": "jmhvDG_reset",
			"save": "jmhvDG_save",
			"select": "jmhvDG_select"
		};
		//#endregion
		//#region src/client/PluginSettingsCard.tsx
		/**
		* Family-shared chrome for plugin settings cards: a disclosure header naming
		* the plugin and what its settings govern, the controls inside, and the save
		* that writes them. Renders nothing while the namespace is unavailable — a
		* deployment that does not compose the owning plugin should show no trace of
		* it. Inlined into each consumer's client bundle; mirrors the official
		* ui-plugin-config PluginCard in a self-contained slice.
		*/
		/**
		* Render one plugin settings card.
		* @param props - the plugin's copy keys, its form state, and its controls.
		* @returns the card, or nothing while the namespace is still loading.
		*/
		function PluginSettingsCard(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const { state } = props;
			if (!state.available) return null;
			const title = props.t(props.titleKey);
			const description = props.t(props.descriptionKey);
			const blocked = !state.dirty || state.invalid || state.saving;
			const cardClass = open ? `${settings_card_module_css_default.cardOpen} ${settings_card_module_css_default.card}` : settings_card_module_css_default.card;
			if (!state.exposed) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: cardClass,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: settings_card_module_css_default.header,
					"aria-expanded": open,
					"aria-label": `${props.t(open ? "settings.collapse" : "settings.expand")}: ${title}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: settings_card_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.name,
							title,
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.description,
							title: description,
							children: description
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "14",
						height: "14",
						viewBox: "0 0 14 14",
						fill: "none",
						xmlns: "http://www.w3.org/2000/svg",
						className: open ? `${settings_card_module_css_default.chevron} ${settings_card_module_css_default.chevronOpen}` : settings_card_module_css_default.chevron,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
							fill: "currentColor"
						})
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: settings_card_module_css_default.body,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.notExposed,
						role: "status",
						children: props.t("settings.notExposed")
					})
				}) : null]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: cardClass,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: settings_card_module_css_default.header,
					"aria-expanded": open,
					"aria-label": `${props.t(open ? "settings.collapse" : "settings.expand")}: ${title}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: settings_card_module_css_default.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.name,
								title,
								children: title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.description,
								title: description,
								children: description
							})]
						}),
						state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.pending,
							title: props.t("settings.unsaved"),
							children: props.t("settings.unsaved")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 14 14",
							fill: "none",
							xmlns: "http://www.w3.org/2000/svg",
							className: open ? `${settings_card_module_css_default.chevron} ${settings_card_module_css_default.chevronOpen}` : settings_card_module_css_default.chevron,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
								d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
								fill: "currentColor"
							})
						})
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.body,
					children: [
						!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.readOnly,
							role: "status",
							children: props.t("settings.readOnly")
						}) : null,
						props.children,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_css_default.footer,
							children: [
								state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: settings_card_module_css_default.failed,
									role: "status",
									children: [props.t("settings.saveFailed"), state.failedReason ? " - " + state.failedReason : ""]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.discard,
									disabled: !state.dirty || state.saving,
									onClick: props.onDiscard,
									children: props.t("settings.discard")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.save,
									disabled: blocked,
									onClick: props.onSave,
									children: props.t(!state.saving ? "settings.save" : "settings.saving")
								})
							]
						})
					]
				}) : null]
			});
		}
		/** A staged value field. `numeric` only hints the keypad: which drafts a field accepts is decided by its spec. */
		function ValueField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: settings_card_module_css_default.label,
							htmlFor: props.id,
							children: props.label
						}), props.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: settings_card_module_css_default.badges,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.badge,
								children: props.overriddenLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_css_default.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: props.resetLabel
							})]
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: props.invalid ? settings_card_module_css_default.inputInvalid : settings_card_module_css_default.input,
						type: "text",
						...props.numeric === true ? { inputMode: "numeric" } : {},
						...props.invalid ? { "aria-invalid": true } : {},
						value: props.text,
						placeholder: props.placeholder ?? "",
						disabled: props.disabled,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: props.invalid ? settings_card_module_css_default.invalid : settings_card_module_css_default.hint,
						children: props.invalid ? props.invalidLabel : props.hint
					})
				]
			});
		}
		/** A staged boolean field: 继承 / 开 / 关. */
		function BooleanField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: settings_card_module_css_default.label,
							htmlFor: props.id,
							children: props.label
						}), props.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: settings_card_module_css_default.badges,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.badge,
								children: props.overriddenLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_css_default.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: props.resetLabel
							})]
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						id: props.id,
						className: settings_card_module_css_default.select,
						value: props.text,
						disabled: props.disabled,
						onChange: (event) => {
							props.onEdit(event.target.value);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: props.inheritLabel
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "true",
								children: props.onLabel
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "false",
								children: props.offLabel
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		//#endregion
		//#region src/client/settings-form.ts
		/** A whole- or decimal-number field. An empty draft clears the field; any other draft that is not a finite number within the constraints blocks the save. */
		function numberField(field, constraints = {}) {
			const { integer = false, min } = constraints;
			return {
				field,
				format: (value) => typeof value === "number" ? String(value) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					const parsed = Number(trimmed);
					if (!Number.isFinite(parsed)) return void 0;
					if (integer && !Number.isInteger(parsed)) return void 0;
					if (min !== void 0 && parsed < min) return void 0;
					return {
						kind: "set",
						value: parsed
					};
				}
			};
		}
		/** A boolean field, edited through true/false draft text. */
		function booleanField(field) {
			return {
				field,
				format: (value) => typeof value === "boolean" ? String(value) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					if (trimmed === "true") return {
						kind: "set",
						value: true
					};
					if (trimmed === "false") return {
						kind: "set",
						value: false
					};
				}
			};
		}
		/**
		* Stages one card's edits over one settings namespace and writes them on save.
		*
		* The Host is the only authority on whether a value was accepted — its
		* validators own the constraints no schema can express — so the outcome is
		* read back from the section rather than predicted here. A save that did not
		* land keeps its drafts, so the user can correct them instead of retyping.
		*/
		var CardForm = class {
			scope;
			specs;
			staged = /* @__PURE__ */ new Map();
			listeners = /* @__PURE__ */ new Set();
			saving = false;
			failed = false;
			failedReason;
			/** @param scope - the bound settings scope for this card's namespace. */
			constructor(scope, specs) {
				this.scope = scope;
				this.specs = new Map(specs.map((spec) => [spec.field, spec]));
				scope.subscribe(() => {
					this.publish();
				});
			}
			/** Publish a projection of this form, rebuilt whenever the scope or a draft changes. */
			bind(project) {
				const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(project());
				this.listeners.add(() => {
					store.set(project());
				});
				return store;
			}
			/** Read the card-level state: what the Host serves, and what a save would do. */
			shell() {
				const snapshot = this.scope.getSnapshot();
				const plan = this.plan();
				return {
					available: snapshot.status !== "loading",
					exposed: snapshot.status === "ready",
					writable: snapshot.writable,
					dirty: plan.length > 0,
					invalid: plan.some((item) => item.run === void 0),
					saving: this.saving,
					failed: this.failed,
					...this.failedReason === void 0 ? {} : { failedReason: this.failedReason }
				};
			}
			/** Read one field's state from the effective section and its staged draft. */
			field(field) {
				const spec = this.specOf(field);
				const staged = this.staged.get(field);
				if (staged === void 0) return {
					text: spec.format(this.sectionValue(field)),
					overridden: this.stored(field),
					invalid: false
				};
				const write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
				return {
					text: staged.text,
					overridden: write?.kind === "set",
					invalid: write === void 0
				};
			}
			/** The actions the card's slot registration injects. */
			actions() {
				return {
					edit: (field, text) => {
						this.stage(field, {
							text,
							clear: false
						});
					},
					resetField: (field) => {
						this.stage(field, {
							text: this.specOf(field).format(this.baseValue(field)),
							clear: true
						});
					},
					save: () => {
						this.save();
					},
					discard: () => {
						if (this.staged.size === 0 && !this.failed) return;
						this.staged.clear();
						this.failed = false;
						this.failedReason = void 0;
						this.publish();
					}
				};
			}
			/**
			* Write every staged edit, then re-seed from what the Host accepted.
			*
			* When the scope carries the optional batch surface (the dsh-web-ui
			* bridge scope), every planned write rides one mutation so cross-field
			* validate hooks (baseURL+model) judge the batch as a unit instead of
			* deadlocking on per-field writes. Otherwise the per-field loop runs.
			* A field lands only when the Host reports it held the staged value; a
			* landed field's draft is dropped, a failed one stays staged for the user.
			* @returns settlement after every write and the read-back.
			*/
			async save() {
				const plan = this.plan();
				const valid = plan.filter((item) => item.run !== void 0);
				if (plan.length === 0 || this.saving || valid.length !== plan.length) return;
				const plannedWrites = valid.map((item) => item.op);
				const fields = new Set(plan.map((item) => item.field));
				this.saving = true;
				this.failed = false;
				this.failedReason = void 0;
				this.publish();
				const landed = /* @__PURE__ */ new Set();
				const batch = this.batchedScope();
				if (batch !== void 0) {
					const result = await batch.mutate(plannedWrites);
					if (result.ok) {
						for (const field of result.fields) if (field.landed) landed.add(field.field);
					} else this.failedReason = result.message;
				} else for (const item of valid) if (await item.run()) landed.add(item.field);
				for (const field of fields) if (landed.has(field)) this.staged.delete(field);
				this.saving = false;
				this.failed = landed.size !== fields.size;
				this.publish();
			}
			/** The scope's batch surface when it supports one; undefined conservatively otherwise. */
			batchedScope() {
				const candidate = this.scope;
				return typeof candidate?.mutate === "function" ? candidate : void 0;
			}
			/**
			* Every staged edit a save would write. An entry whose draft is not a value
			* its field accepts carries no write: the form is still dirty, and the save
			* refuses rather than dropping the edit. A staged edit that matches the
			* effective section is not a write at all.
			* @returns the planned writes, in the order the fields were staged.
			*/
			plan() {
				const plan = [];
				for (const [field, staged] of this.staged) {
					const spec = this.specOf(field);
					if (staged.clear) {
						if (this.stored(field)) plan.push({
							field,
							op: {
								field,
								op: "unset"
							},
							run: () => this.clear(field)
						});
						continue;
					}
					if (staged.text === spec.format(this.sectionValue(field))) continue;
					const write = spec.parse(staged.text);
					if (write === void 0) plan.push({
						field,
						op: {
							field,
							op: "unset"
						},
						run: void 0
					});
					else if (write.kind === "clear") plan.push({
						field,
						op: {
							field,
							op: "unset"
						},
						run: () => this.clear(field)
					});
					else plan.push({
						field,
						op: {
							field,
							op: "set",
							value: write.value
						},
						run: () => this.store(field, write.value)
					});
				}
				return plan;
			}
			async clear(field) {
				await this.scope.unset(field);
				return !this.stored(field);
			}
			async store(field, value) {
				await this.scope.set(field, value);
				if (this.specOf(field).secret) return true;
				return this.userLayer()?.[field] === value;
			}
			stage(field, edit) {
				this.staged.set(field, edit);
				this.failed = false;
				this.failedReason = void 0;
				this.publish();
			}
			specOf(field) {
				const spec = this.specs.get(field);
				if (spec === void 0) throw new Error(`settings card has no field ${field}`);
				return spec;
			}
			snapshotOf() {
				return this.scope.getSnapshot();
			}
			sectionValue(field) {
				return this.snapshotOf().value?.[field];
			}
			baseValue(field) {
				return this.snapshotOf().base?.[field];
			}
			userLayer() {
				return this.snapshotOf().user;
			}
			stored(field) {
				const user = this.userLayer();
				return user !== void 0 && Object.hasOwn(user, field);
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/LiveStatsSettingsCard.tsx
		/** Bridges the `live-stats` scope onto the card's staged form. */
		var LiveStatsSettingsCardController = class {
			form;
			store;
			/** @param scope - the bound settings scope for the `live-stats` namespace. */
			constructor(scope) {
				this.form = new CardForm(scope, [
					booleanField("enabled"),
					numberField("charsPerToken", { min: .01 }),
					numberField("blockOverhead", {
						integer: true,
						min: 0
					}),
					numberField("roleOverhead", {
						integer: true,
						min: 0
					})
				]);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				return {
					...this.form.shell(),
					enabled: this.form.field("enabled"),
					charsPerToken: this.form.field("charsPerToken"),
					blockOverhead: this.form.field("blockOverhead"),
					roleOverhead: this.form.field("roleOverhead")
				};
			}
			/**
			* Build the face the card's slot registration injects.
			* @returns the card's snapshot and its form actions.
			*/
			inject() {
				return {
					hooks: { liveStatsSettingsCard: this.store },
					...this.form.actions()
				};
			}
		};
		/**
		* Render the live-stats card.
		* @param props - locale copy, the card snapshot, and its form actions.
		* @returns the card.
		*/
		function LiveStatsSettingsCard(props) {
			const { t } = props;
			const state = props.useLiveStatsSettingsCard((snapshot) => snapshot);
			const disabled = !state.writable;
			const fieldProps = {
				overriddenLabel: t("settings.overridden"),
				resetLabel: t("settings.reset"),
				invalidLabel: t("settings.invalidNumber"),
				disabled
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(PluginSettingsCard, {
				t,
				titleKey: "settings.title",
				descriptionKey: "settings.description",
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BooleanField, {
						id: "settings-live-stats-enabled",
						label: t("settings.enabled"),
						hint: t("settings.enabledHint"),
						inheritLabel: t("settings.inherit"),
						onLabel: t("settings.on"),
						offLabel: t("settings.off"),
						...fieldProps,
						...state.enabled,
						onEdit: (text) => {
							props.edit("enabled", text);
						},
						onReset: () => {
							props.resetField("enabled");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "settings-live-stats-chars",
						label: t("settings.charsPerToken"),
						hint: t("settings.charsPerTokenHint"),
						numeric: true,
						...fieldProps,
						...state.charsPerToken,
						onEdit: (text) => {
							props.edit("charsPerToken", text);
						},
						onReset: () => {
							props.resetField("charsPerToken");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "settings-live-stats-block",
						label: t("settings.blockOverhead"),
						hint: t("settings.blockOverheadHint"),
						numeric: true,
						...fieldProps,
						...state.blockOverhead,
						onEdit: (text) => {
							props.edit("blockOverhead", text);
						},
						onReset: () => {
							props.resetField("blockOverhead");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "settings-live-stats-role",
						label: t("settings.roleOverhead"),
						hint: t("settings.roleOverheadHint"),
						numeric: true,
						...fieldProps,
						...state.roleOverhead,
						onEdit: (text) => {
							props.edit("roleOverhead", text);
						},
						onReset: () => {
							props.resetField("roleOverhead");
						}
					})
				]
			});
		}
		//#endregion
		//#region src/client/merge-css.ts
		/**
		* Stylesheet that merges the live TPS slot into the official StatsLine row —
		* always on ONE line, no wrapping at any width.
		*
		* The composer dock (`conversation.composer.dock`) is a list slot: every
		* registered entry renders, and the renderer emits them inside a wrapper —
		* `<div data-slot="conversation.composer.dock" style="display: contents">`.
		* While the TPS slot is mounted the merge turns that wrapper into a
		* horizontal flex row (the inline `display: contents` is overridden with
		* `!important`, which only affects layout — the wrapper still carries no
		* visual box), so the official StatsLine and the TPS sit side by side as one
		* compact, centered unit:
		*
		* - the official row shrinks to its content width (capped at 620px so the
		*   merged line stays compact even on very wide docks; its own
		*   `white-space: nowrap` + ellipsis handle the rest — the row can never
		*   wrap);
		* - the TPS slot is a fixed-width item right after it, separated by a `·`
		*   in the official separator style (hidden while the slot has no content).
		*
		* The TPS slot stays mounted even when no rate sample exists yet (it renders
		* empty instead of unmounting), so the merged layout — and the official
		* row's width — never flips between content width and full width when a
		* stream starts or ends.
		*
		* Selector notes (all verified against the real rendered DOM):
		* - the slot renderer wraps entries in `div[data-slot="conversation.composer.dock"]`,
		*   so the entries are its direct children — selectors must anchor on the
		*   wrapper;
		* - nested `:has()` (a `:has()` whose argument contains another `:has()`
		*   with a combinator) fails to parse and the whole rule is silently dropped
		*   by the engine, so the merge uses flat selectors only: `:has(> ...)` on
		*   the wrapper (scoping the merge to the moment the TPS slot is mounted)
		*   and the plain sibling combinator `* + [data-dsh-live-tps]` for the slot.
		*
		* When the plugin is inactive the slot does not exist and no merge rule
		* matches: the dock keeps its original full-width look. While the slot is
		* mounted but the official row is absent, the TPS alone stays visible and
		* centered.
		*/
		const MERGE_CSS = `
/* 官方行缺席时的兜底：TPS 独立成行、居中 */
[data-dsh-live-tps] {
  align-self: center;
}

/* ── 合并：官方统计行 + 实时 TPS 恒为一行 ──
   仅当 TPS 槽位存在（插件激活）时，把渲染器的槽位包装层（内联
   display: contents）覆盖为横向 flex 行：两个条目并排、整体居中、
   永不换行。插件未激活时此规则不匹配，官方行保持原样。 */

div[data-slot="conversation.composer.dock"]:has(> [data-dsh-live-tps]) {
  display: flex !important;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
}

/* 官方行：收缩为内容宽度（上限 620px）；清掉官方 margin/padding 的横向
   占位，保留 4px 上内边距与文字行高对齐。极窄容器下由 flex 收缩
   （0 1 auto + min-width: 0 + 省略号）让位给 TPS 槽位，无需负值
   max-width 兜底。
   hover/focus 时官方 Tooltip 会把气泡 span 插到统计行与 TPS 之间
   （DOM: [统计行, span[role=tooltip], TPS]），所以同时匹配两种相邻形态：
   「下一兄弟是 TPS」或「下一兄弟是气泡、再下一兄弟是 TPS」，
   否则气泡一出现统计行就回退官方样式、变宽把 TPS 挤走。 */
div[data-slot="conversation.composer.dock"] > *:not([role="tooltip"]):has(+ [data-dsh-live-tps], + [role="tooltip"] + [data-dsh-live-tps]) {
  width: auto;
  max-width: 620px;
  min-width: 0;
  margin: 0;
  padding: 4px 0 0;
  flex: 0 1 auto;
}

/* TPS 槽位：固定宽度条目，紧跟官方行 */
div[data-slot="conversation.composer.dock"] > * + [data-dsh-live-tps] {
  flex: 0 0 auto;
}

/* 与官方行同风格的分隔符（仅合并态、且槽位有内容时显示） */
div[data-slot="conversation.composer.dock"] > * + [data-dsh-live-tps]::before {
  content: '\\B7';
  color: var(--dsw-alias-separator-primary);
  margin: 0 10px;
}

/* 无速率样本时槽位为空：隐藏分隔符，保持布局稳定 */
div[data-slot="conversation.composer.dock"] > * + [data-dsh-live-tps]:empty::before {
  content: none;
}

/* 官方行 hover 的 Tooltip 气泡：按内容宽度单行显示（官方默认最大
   半视口宽，长统计文本会折行）；窄屏时受视口限制自动回退换行 */
div[data-slot="conversation.composer.dock"] > [role="tooltip"] {
  width: max-content;
  max-width: calc(100vw - 32px);
}
`.trim();
		/** Injected-once guard for the merge stylesheet (one tag per page load). */
		let mergeCssInjected = false;
		/** Inject the merge stylesheet once; no-op outside the browser or when already present. */
		function ensureMergeCss() {
			if (mergeCssInjected || typeof document === "undefined") return;
			mergeCssInjected = true;
			if (document.querySelector("style[data-dsh-live-stats-merge]") !== null) return;
			const style = document.createElement("style");
			style.dataset.dshLiveStatsMerge = "";
			style.textContent = MERGE_CSS;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/TpsLine.tsx
		/** Format throughput with one decimal below 100 tok/s. */
		function formatTokensPerSecond(value) {
			return String(value < 100 ? Math.round(value * 10) / 10 : Math.round(value));
		}
		const STYLE = {
			boxSizing: "border-box",
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: "12px",
			fontVariantNumeric: "tabular-nums",
			lineHeight: "20px",
			padding: "4px 0 0",
			whiteSpace: "nowrap"
		};
		/**
		* Second composer-status line for active or latest response throughput.
		* The root carries `data-dsh-live-tps`: the merge stylesheet (merge-css.ts)
		* anchors on it to pull this row onto the same line as the official
		* StatsLine, which renders right before it in the composer dock.
		*
		* The slot stays mounted even while no rate sample exists (renders empty):
		* the merge layout keys on the slot's presence, so unmounting it on idle
		* would flip the official stats row between content width and full width on
		* every stream start or end.
		*/
		const TpsLine = (0, react.memo)(function TpsLine({ useProjection }) {
			const rate = useProjection("liveTokenUsage")?.tokensPerSecond;
			const label = rate === void 0 ? "" : `TPS ${formatTokensPerSecond(rate)} tok/s`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-dsh-live-tps": true,
				style: STYLE,
				children: label
			});
		});
		/**
		* Composer-dock entry: adapts the session-scoped `conversation.composer.dock`
		* runtime share to the TPS line. The dock is the shipped stats-line seat, and
		* its standard kit supplies `useProjection` (the fifth framework hook seat),
		* which reads the host's `liveTokenUsage` projection. Registering here makes
		* the live TPS row actually mount — previously the TpsLine was only exported
		* and never mounted on rc.6 (issue #56).
		*/
		const TpsLineDockEntry = (0, react.memo)(function TpsLineDockEntry(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TpsLine, { useProjection: props.useProjection });
		});
		//#endregion
		//#region src/client/locales.ts
		/**
		* The `live-stats` namespace dictionaries: copy for the plugin settings card
		* (the `settings.plugin.item` seat) that edits the token-estimator parameters.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"settings.title": "实时令牌估算",
			"settings.description": "生成吞吐量与令牌估算参数。",
			"settings.enabled": "启用实时统计",
			"settings.enabledHint": "关闭后停止统计令牌估算与生成吞吐。",
			"settings.charsPerToken": "每令牌字符数",
			"settings.charsPerTokenHint": "约多少个文本字符折算为 1 个令牌；支持小数。",
			"settings.blockOverhead": "内容块开销（令牌）",
			"settings.blockOverheadHint": "每个内容块固定的框架令牌数。",
			"settings.roleOverhead": "消息角色开销（令牌）",
			"settings.roleOverheadHint": "每条消息或助手响应固定的框架令牌数。",
			"settings.overridden": "已覆盖",
			"settings.reset": "恢复默认",
			"settings.notExposed": "当前 DSH 版本未向设置页暴露本插件的配置命名空间，表单不可用。可编辑 ~/.dsh/settings.yaml 直接配置，或为 dsh-host-apiproxy 的 WEB_SETTINGS_NAMESPACES 白名单补充本命名空间后重启。",
			"settings.readOnly": "当前部署的设置只读。",
			"settings.inherit": "继承",
			"settings.on": "开",
			"settings.off": "关",
			"settings.expand": "展开设置",
			"settings.collapse": "收起设置",
			"settings.save": "保存",
			"settings.saving": "保存中…",
			"settings.discard": "放弃",
			"settings.unsaved": "未保存",
			"settings.saveFailed": "部署未接受这些值，已保留供你修改。",
			"settings.invalidNumber": "请输入数字，留空则使用默认值。"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"settings.title": "Live token estimation",
			"settings.description": "Generation throughput and token estimation parameters.",
			"settings.enabled": "Enable live stats",
			"settings.enabledHint": "When off, token estimation and throughput tracking stop.",
			"settings.charsPerToken": "Characters per token",
			"settings.charsPerTokenHint": "Roughly how many text characters one token represents; a decimal is allowed.",
			"settings.blockOverhead": "Block overhead (tokens)",
			"settings.blockOverheadHint": "Fixed framing tokens assigned to each content block.",
			"settings.roleOverhead": "Role overhead (tokens)",
			"settings.roleOverheadHint": "Fixed framing tokens assigned to each message or assistant response.",
			"settings.overridden": "Overridden",
			"settings.reset": "Reset to default",
			"settings.notExposed": "This DSH version does not expose this plugin's settings namespace to the configuration page, so the form is unavailable. Edit ~/.dsh/settings.yaml directly, or add the namespace to dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES allowlist and restart.",
			"settings.readOnly": "This deployment stores settings read-only.",
			"settings.inherit": "Inherit",
			"settings.on": "On",
			"settings.off": "Off",
			"settings.expand": "Show settings",
			"settings.collapse": "Hide settings",
			"settings.save": "Save",
			"settings.saving": "Saving…",
			"settings.discard": "Discard",
			"settings.unsaved": "Unsaved",
			"settings.saveFailed": "The deployment did not accept these values; they were left for you to correct.",
			"settings.invalidNumber": "Enter a number, or leave blank to use the default."
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "live-stats";
		/** Settings namespace the live-stats card edits (the Host plugin registers it). */
		const LIVE_STATS_NS = "live-stats";
		/** Services required by this plugin. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"settingsScope",
			"remote"
		];
		/**
		* Register the live-stats surface: the generation-throughput TPS group lives
		* in the ui-conversation stats line (read directly from the `liveTokenUsage`
		* projection), and this build of the browser half mounts the plugin settings
		* card over the `live-stats` namespace.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "live-stats: dictionaries");
			ensureMergeCss();
			const liveStatsSettings = new LiveStatsSettingsCardController((ctx.get("webUiSettings") ?? ctx.settingsScope).bind({ namespace: LIVE_STATS_NS }));
			ctx.slots.inject("web-ui.plugin.item", () => ctx.slots.register({
				name: "web-ui.plugin.item",
				id: "live-stats",
				order: 110,
				locale: NS,
				inject: () => liveStatsSettings.inject()
			}, LiveStatsSettingsCard));
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "live-stats",
				order: 100,
				inject: () => ({})
			}, TpsLineDockEntry));
		}
		//#endregion
		exports.TpsLine = TpsLine;
		exports.apply = apply;
		exports.formatTokensPerSecond = formatTokensPerSecond;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map