import { useId } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDate, formatNumber } from '../../utils/format'
import { compactNumber, shortDate } from './adminUtils'
import './admin-ui.css'

const AXIS_TICK = { fontSize: 11, fill: '#6b7591' }

function ChartTooltip({ active, payload, label, series, valueFormat }) {
  if (!active || !payload?.length) return null
  return (
    <div className="adm-tooltip">
      <div className="adm-tooltip-title">{formatDate(label)}</div>
      {series.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key)
        if (!item) return null
        return (
          <div key={s.key} className="adm-tooltip-row">
            <span className="adm-swatch" style={{ background: s.color }} />
            {s.label}
            <b>{(s.format || valueFormat)(item.value)}</b>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Daily line / area chart for the admin `charts[]` / `series[]` arrays
 * ({ date: 'YYYY-MM-DD', buses, bookings, revenue }).
 *
 *   <TimeSeriesChart data={charts} series={[{ key: 'bookings', label: 'Bookings', color: CHART_COLORS.orange, type: 'area' }]} />
 *
 * series[].type: 'line' (default) | 'area' | 'dashed'. `valueFormat` formats
 * tooltip values, `axisFormat` the Y ticks. When every value is 0 the chart
 * still draws a flat baseline and overlays "No activity in this period".
 */
export function TimeSeriesChart({
  data = [],
  series,
  xKey = 'date',
  height = 220,
  valueFormat = formatNumber,
  axisFormat = compactNumber,
  emptyLabel = 'No activity in this period',
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const allZero = !data.length || data.every((d) => series.every((s) => !Number(d[s.key])))
  const showDots = data.length <= 16

  return (
    <div className="adm-chart-box" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="#eef1f7" strokeDasharray="3 3" />
          <XAxis
            dataKey={xKey}
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
            tickMargin={8}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
            tickFormatter={axisFormat}
            domain={[0, (max) => Math.max(Math.ceil(max), 4)]}
          />
          <Tooltip
            cursor={{ stroke: '#cfd7e8', strokeDasharray: '4 4' }}
            content={<ChartTooltip series={series} valueFormat={valueFormat} />}
          />
          {series.map((s) =>
            s.type === 'area' ? (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.5}
                fill={`url(#${uid}-${s.key})`}
                dot={showDots ? { r: 3, fill: '#fff', stroke: s.color, strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: s.color, stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={!allZero}
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={s.type === 'dashed' ? 2 : 2.5}
                strokeDasharray={s.type === 'dashed' ? '5 5' : undefined}
                dot={showDots && s.type !== 'dashed' ? { r: 3, fill: '#fff', stroke: s.color, strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: s.color, stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={!allZero}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {allZero && (
        <div className="adm-chart-empty">
          <span>{emptyLabel}</span>
        </div>
      )}
    </div>
  )
}

export default TimeSeriesChart
