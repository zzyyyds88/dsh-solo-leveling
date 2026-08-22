/**
 * The mobile-adapt settings card: the narrow-screen adaptation parameters
 * (master switch / breakpoint / drawer widths / pet scale). Registers into
 * the `settings.plugin.item` slot the plugin-configuration section renders,
 * bound to the `mobile-adapt` settings namespace.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: declares the keyed `settings.plugin.item` slot (plugin-config section).
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { Config } from '../shared.ts'
import { PluginSettingsCard, ValueField, BooleanField } from './PluginSettingsCard.tsx'
import { CardForm, booleanField, numberField, type CardActions, type CardShell, type FieldState as CardFieldState } from './settings-form.ts'

/** What the mobile-adapt card edits (the namespace's full schema). */
export type MobileAdaptSettings = Config

/** What the mobile-adapt card renders. */
export interface MobileAdaptCardState extends CardShell {
  /** Master switch. */
  enabled: CardFieldState
  /** Narrow-screen breakpoint in px. */
  breakpoint: CardFieldState
  /** Sidebar drawer width cap in px. */
  sidebarWidth: CardFieldState
  /** Details drawer width cap in px. */
  detailsWidth: CardFieldState
  /** Aionui panel drawer width cap in px. */
  drawerWidth: CardFieldState
  /** Pet scale on narrow screens. */
  petScale: CardFieldState
}

/** The registration-side face the card's slot entry injects. */
export interface MobileAdaptCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useMobileAdaptCard. */
    mobileAdaptCard: SnapshotStore<MobileAdaptCardState>
  }
}

/** Bridges the `mobile-adapt` scope onto the card's staged form. */
export class MobileAdaptCardController {
  private readonly form: CardForm<MobileAdaptSettings>
  private readonly store: SnapshotStore<MobileAdaptCardState>

  /** @param scope - the bound settings scope for the `mobile-adapt` namespace. */
  constructor(scope: SettingsScope<MobileAdaptSettings>) {
    this.form = new CardForm(scope, [
      booleanField('enabled'),
      numberField('breakpoint', { integer: true, min: 320, max: 1280 }),
      numberField('sidebarWidth', { integer: true, min: 200, max: 500 }),
      numberField('detailsWidth', { integer: true, min: 280, max: 640 }),
      numberField('drawerWidth', { integer: true, min: 240, max: 640 }),
      numberField('petScale', { min: 0.1, max: 2 }),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): MobileAdaptCardState {
    return {
      ...this.form.shell(),
      enabled: this.form.field('enabled'),
      breakpoint: this.form.field('breakpoint'),
      sidebarWidth: this.form.field('sidebarWidth'),
      detailsWidth: this.form.field('detailsWidth'),
      drawerWidth: this.form.field('drawerWidth'),
      petScale: this.form.field('petScale'),
    }
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): MobileAdaptCardFace {
    return { hooks: { mobileAdaptCard: this.store }, ...this.form.actions() }
  }
}

/** Props the renderer binds for the mobile-adapt card. */
export type MobileAdaptCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'mobile-adapt'>
  & InjectFace<MobileAdaptCardFace>

/**
 * Render the mobile-adapt card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
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
      <BooleanField
        id="settings-mobile-adapt-enabled"
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
      <ValueField
        id="settings-mobile-adapt-breakpoint"
        label={t('settings.breakpoint')}
        hint={t('settings.breakpointHint')}
        numeric
        {...fieldProps}
        {...state.breakpoint}
        onEdit={(text) => { props.edit('breakpoint', text) }}
        onReset={() => { props.resetField('breakpoint') }}
      />
      <ValueField
        id="settings-mobile-adapt-sidebar-width"
        label={t('settings.sidebarWidth')}
        hint={t('settings.sidebarWidthHint')}
        numeric
        {...fieldProps}
        {...state.sidebarWidth}
        onEdit={(text) => { props.edit('sidebarWidth', text) }}
        onReset={() => { props.resetField('sidebarWidth') }}
      />
      <ValueField
        id="settings-mobile-adapt-details-width"
        label={t('settings.detailsWidth')}
        hint={t('settings.detailsWidthHint')}
        numeric
        {...fieldProps}
        {...state.detailsWidth}
        onEdit={(text) => { props.edit('detailsWidth', text) }}
        onReset={() => { props.resetField('detailsWidth') }}
      />
      <ValueField
        id="settings-mobile-adapt-drawer-width"
        label={t('settings.drawerWidth')}
        hint={t('settings.drawerWidthHint')}
        numeric
        {...fieldProps}
        {...state.drawerWidth}
        onEdit={(text) => { props.edit('drawerWidth', text) }}
        onReset={() => { props.resetField('drawerWidth') }}
      />
      <ValueField
        id="settings-mobile-adapt-pet-scale"
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
