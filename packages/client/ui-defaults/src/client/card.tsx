/**
 * The defaults card: the directory picker's default working directory and the
 * default retry count, rendered with the shared plugin-card chrome and the
 * staged value fields (mirrors the official plugin-config card).
 */

import { PluginSettingsCard, ValueField } from './PluginSettingsCard.tsx'
import type { DefaultsCardProps } from './index.ts'

/**
 * Render the defaults card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card, or nothing when the namespace is unavailable.
 */
export function DefaultsCard(props: DefaultsCardProps) {
  const { t } = props
  const state = props.useDefaultsCard(snapshot => snapshot)
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
      <ValueField
        id="settings-defaults-dir"
        label={t('settings.dirLabel')}
        hint={t('settings.dirHint')}
        placeholder={t('settings.dirPlaceholder')}
        {...fieldProps}
        {...state.defaultWorkingDirectory}
        onEdit={(text) => { props.edit('defaultWorkingDirectory', text) }}
        onReset={() => { props.resetField('defaultWorkingDirectory') }}
      />
      <ValueField
        id="settings-defaults-retry"
        label={t('settings.retryLabel')}
        hint={t('settings.retryHint')}
        numeric
        {...fieldProps}
        {...state.defaultRetryCount}
        onEdit={(text) => { props.edit('defaultRetryCount', text) }}
        onReset={() => { props.resetField('defaultRetryCount') }}
      />
    </PluginSettingsCard>
  )
}
