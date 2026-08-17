import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PluginSettingsCard, ValueField, BooleanField } from "./PluginSettingsCard.js";
import { CardForm, booleanField, numberField } from "./settings-form.js";
/** Bridges the `live-stats` scope onto the card's staged form. */
export class LiveStatsSettingsCardController {
    form;
    store;
    /** @param scope - the bound settings scope for the `live-stats` namespace. */
    constructor(scope) {
        this.form = new CardForm(scope, [
            booleanField('enabled'),
            numberField('charsPerToken', { min: 0.01 }),
            numberField('blockOverhead', { integer: true, min: 0 }),
            numberField('roleOverhead', { integer: true, min: 0 }),
        ]);
        this.store = this.form.bind(() => this.projection());
    }
    projection() {
        return {
            ...this.form.shell(),
            enabled: this.form.field('enabled'),
            charsPerToken: this.form.field('charsPerToken'),
            blockOverhead: this.form.field('blockOverhead'),
            roleOverhead: this.form.field('roleOverhead'),
        };
    }
    /**
     * Build the face the card's slot registration injects.
     * @returns the card's snapshot and its form actions.
     */
    inject() {
        return { hooks: { liveStatsSettingsCard: this.store }, ...this.form.actions() };
    }
}
/**
 * Render the live-stats card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function LiveStatsSettingsCard(props) {
    const { t } = props;
    const state = props.useLiveStatsSettingsCard(snapshot => snapshot);
    const disabled = !state.writable;
    const fieldProps = {
        overriddenLabel: t('settings.overridden'),
        resetLabel: t('settings.reset'),
        invalidLabel: t('settings.invalidNumber'),
        disabled,
    };
    return (_jsxs(PluginSettingsCard, { t: t, titleKey: "settings.title", descriptionKey: "settings.description", state: state, onSave: props.save, onDiscard: props.discard, children: [_jsx(BooleanField, { id: "settings-live-stats-enabled", label: t('settings.enabled'), hint: t('settings.enabledHint'), inheritLabel: t('settings.inherit'), onLabel: t('settings.on'), offLabel: t('settings.off'), ...fieldProps, ...state.enabled, onEdit: (text) => { props.edit('enabled', text); }, onReset: () => { props.resetField('enabled'); } }), _jsx(ValueField, { id: "settings-live-stats-chars", label: t('settings.charsPerToken'), hint: t('settings.charsPerTokenHint'), numeric: true, ...fieldProps, ...state.charsPerToken, onEdit: (text) => { props.edit('charsPerToken', text); }, onReset: () => { props.resetField('charsPerToken'); } }), _jsx(ValueField, { id: "settings-live-stats-block", label: t('settings.blockOverhead'), hint: t('settings.blockOverheadHint'), numeric: true, ...fieldProps, ...state.blockOverhead, onEdit: (text) => { props.edit('blockOverhead', text); }, onReset: () => { props.resetField('blockOverhead'); } }), _jsx(ValueField, { id: "settings-live-stats-role", label: t('settings.roleOverhead'), hint: t('settings.roleOverheadHint'), numeric: true, ...fieldProps, ...state.roleOverhead, onEdit: (text) => { props.edit('roleOverhead', text); }, onReset: () => { props.resetField('roleOverhead'); } })] }));
}
