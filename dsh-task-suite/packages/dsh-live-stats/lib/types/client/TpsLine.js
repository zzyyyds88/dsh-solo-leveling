import { jsx as _jsx } from "react/jsx-runtime";
import { memo } from 'react';
/** Format throughput with one decimal below 100 tok/s. */
export function formatTokensPerSecond(value) {
    return String(value < 100 ? Math.round(value * 10) / 10 : Math.round(value));
}
const STYLE = {
    boxSizing: 'border-box',
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: '12px',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: '20px',
    // 注意：不要在这里设置 overflow——合并样式表依赖常规行内盒；截断由
    // 官方统计行自己的 nowrap + ellipsis 承担。
    padding: '4px 0 0',
    whiteSpace: 'nowrap',
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
export const TpsLine = memo(function TpsLine({ useProjection }) {
    const rate = useProjection('liveTokenUsage')?.tokensPerSecond;
    const label = rate === undefined ? '' : `TPS ${formatTokensPerSecond(rate)} tok/s`;
    return _jsx("div", { "data-dsh-live-tps": true, style: STYLE, children: label });
});
/**
 * Composer-dock entry: adapts the session-scoped `conversation.composer.dock`
 * runtime share to the TPS line. The dock is the shipped stats-line seat, and
 * its standard kit supplies `useProjection` (the fifth framework hook seat),
 * which reads the host's `liveTokenUsage` projection. Registering here makes
 * the live TPS row actually mount — previously the TpsLine was only exported
 * and never mounted on rc.6 (issue #56).
 */
export const TpsLineDockEntry = memo(function TpsLineDockEntry(props) {
    return _jsx(TpsLine, { useProjection: props.useProjection });
});
