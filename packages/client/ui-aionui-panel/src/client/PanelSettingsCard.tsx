/**
 * The aionui-panel settings card: a single master switch that toggles the
 * whole right-side panel system. Registers into the `settings.plugin.item`
 * slot, bound to the `aionui-panel` settings namespace.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { PluginSettingsCard, BooleanField } from './PluginSettingsCard.tsx'
import { CardForm, booleanField, type CardActions, type CardShell, type FieldState as CardFieldState } from './settings-form.ts'

/** The `aionui-panel` fields this card edits (the namespace's schema). */
export interface AionUiPanelSettings {
  /** Master switch for the whole panel system. */
  enabled?: boolean
}

/** What the card renders, projected from the staged form. */
export interface AionUiPanelSettingsCardState extends CardShell {
  enabled: CardFieldState
}

/** The registration-side face the card's slot entry injects. */
export interface AionUiPanelSettingsCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as `useAionUiPanelSettingsCard`. */
    aionUiPanelSettingsCard: SnapshotStore<AionUiPanelSettingsCardState>
  }
}

/** Bridges the `aionui-panel` scope onto the card's staged form. */
export class AionUiPanelSettingsCardController {
  private readonly form: CardForm<AionUiPanelSettings>
  private readonly store: SnapshotStore<AionUiPanelSettingsCardState>

  /** @param scope - the bound settings scope for the `aionui-panel` namespace. */
  constructor(scope: SettingsScope<AionUiPanelSettings>) {
    this.form = new CardForm(scope, [booleanField('enabled')])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): AionUiPanelSettingsCardState {
    return {
      ...this.form.shell(),
      enabled: this.form.field('enabled'),
    }
  }

  /** Build the face the card's slot registration injects. */
  inject(): AionUiPanelSettingsCardFace {
    return { hooks: { aionUiPanelSettingsCard: this.store }, ...this.form.actions() }
  }
}

/** Props the renderer binds for the panel settings card. */
export type AionUiPanelSettingsCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'aionui-panel'>
  & InjectFace<AionUiPanelSettingsCardFace>

/**
 * Render the panel settings card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function AionUiPanelSettingsCard(props: AionUiPanelSettingsCardProps) {
  const { t } = props
  const state = props.useAionUiPanelSettingsCard(snapshot => snapshot)
  const disabled = !state.writable
  const fieldProps = {
    overriddenLabel: t('settings.overridden'),
    resetLabel: t('settings.reset'),
    invalidLabel: t('settings.invalidNumber'),
    disabled,
  }
  return (
    <PluginSettingsCard
      t={t}
      titleKey="settings.title"
      descriptionKey="settings.description"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <BooleanField
        id="settings-aionui-panel-enabled"
        label={t('settings.enabled')}
        hint={t('settings.enabledHint')}
        inheritLabel={t('settings.inherit')}
        onLabel={t('settings.on')}
        offLabel={t('settings.off')}
        {...fieldProps}
        {...state.enabled}
        onEdit={(text) => { props.edit('enabled', text) }}
        onReset={() => { props.resetField('enabled') }}
      />
    </PluginSettingsCard>
  )
}
