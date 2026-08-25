/**
 * The mobile-remote card: the phone-remote total switch and the request-body
 * cap, rendered with the shared plugin-card chrome and the staged value
 * fields (mirrors the official plugin-config card).
 */

import { PluginSettingsCard, BooleanField, ValueField } from './PluginSettingsCard.tsx'
import type { MobileRemoteCardProps } from './index.ts'

/**
 * Render the mobile-remote card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card, or nothing when the namespace is unavailable.
 */
export function MobileRemoteCard(props: MobileRemoteCardProps) {
  const { t } = props
  const state = props.useMobileRemoteCard(snapshot => snapshot)
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
        id="settings-mobile-remote-enabled"
        label={t('settings.enabledLabel')}
        hint={t('settings.enabledHint')}
        inheritLabel={t('settings.inherit')}
        onLabel={t('settings.on')}
        offLabel={t('settings.off')}
        {...fieldProps}
        {...state.enabled}
        onEdit={(text) => { props.edit('enabled', text) }}
        onReset={() => { props.resetField('enabled') }}
      />
      <ValueField
        id="settings-mobile-remote-max-body"
        label={t('settings.maxBodyLabel')}
        hint={t('settings.maxBodyHint')}
        numeric
        {...fieldProps}
        {...state.maxRequestBytes}
        onEdit={(text) => { props.edit('maxRequestBytes', text) }}
        onReset={() => { props.resetField('maxRequestBytes') }}
      />
    </PluginSettingsCard>
  )
}
