/**
 * Configurable Host plugins contributed to the shared Plugins section.
 *
 * The tab enumerates settings namespaces but never interprets one — a card
 * arrives through `settings.plugin.item` keyed by the namespace it edits, so a
 * plugin that ships a browser half owns its own card and this tab only decides
 * which keys to dispatch.
 */

import { Fragment } from 'react'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './slot-contract.ts'
import type { ConfigurablePluginsTabFace } from './tab-store.ts'
import css from './PluginsSettingsSection.module.css'

/** Props the renderer binds for the configurable tab. */
export type ConfigurablePluginsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.plugins'>
  & PropsRenderSlots<'settings.plugin.item'>
  & InjectFace<ConfigurablePluginsTabFace>

/**
 * Render cards registered by plugins that expose editable settings.
 * @param props - locale copy, slot rendering, the namespaces to dispatch, and
 *   the directory read's failure face.
 * @returns the card list; while the Host has not answered once, a loading,
 *   failure (with retry), or empty line — never silence.
 */
export function ConfigurablePluginsTab(props: ConfigurablePluginsTabProps) {
  const { t, renderSlot } = props
  const { loaded, namespaces, error } = props.useConfigurablePlugins(snapshot => snapshot)
  if (namespaces.length > 0) {
    return (
      <ul className={css.cards}>
        {namespaces.map(ns => (
          // One dispatch per namespace, so the list identity is the namespace
          // rather than a position that shifts as cards arrive.
          <Fragment key={ns}>{renderSlot('settings.plugin.item', {}, { entryKey: ns })}</Fragment>
        ))}
      </ul>
    )
  }
  if (error !== null) {
    return (
      <div className={css.failure} role="alert">
        <p>{t('loadFailed')}{error !== '' ? ` ${error}` : ''}</p>
        <button type="button" onClick={() => props.retry()}>{t('retry')}</button>
      </div>
    )
  }
  return <p className={css.empty}>{loaded ? t('empty') : t('loading')}</p>
}
