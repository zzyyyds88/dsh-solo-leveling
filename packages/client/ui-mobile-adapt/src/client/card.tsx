/**
 * The mobile-adapt card: narrow-screen breakpoint, drawer width, and pet
 * scale, rendered with the shared plugin-card chrome and staged value fields
 * (mirrors the official plugin-config card).
 */

import { PluginSettingsCard, ValueField } from './PluginSettingsCard.tsx'
import type { MobileAdaptCardProps } from './index.ts'

/**
 * Render the mobile-adapt card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card, or nothing when the namespace is unavailable.
 */
export function MobileAdaptCard(props: MobileAdaptCardProps) {
  const { t } = props
  const state = props.useMobileAdaptCard(snapshot => snapshot)
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
        id="settings-mobile-breakpoint"
        label={t('settings.breakpoint')}
        hint={t('settings.breakpointHint')}
        numeric
        {...fieldProps}
        {...state.breakpoint}
        onEdit={(text) => { props.edit('breakpoint', text) }}
        onReset={() => { props.resetField('breakpoint') }}
      />
      <ValueField
        id="settings-mobile-drawer-width"
        label={t('settings.drawerWidth')}
        hint={t('settings.drawerWidthHint')}
        numeric
        {...fieldProps}
        {...state.drawerWidth}
        onEdit={(text) => { props.edit('drawerWidth', text) }}
        onReset={() => { props.resetField('drawerWidth') }}
      />
      <ValueField
        id="settings-mobile-pet-scale"
        label={t('settings.petScale')}
        hint={t('settings.petScaleHint')}
        numeric
        {...fieldProps}
        {...state.petScale}
        onEdit={(text) => { props.edit('petScale', text) }}
        onReset={() => { props.resetField('petScale') }}
      />
    </PluginSettingsCard>
  )
}
