import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import { formatNumber } from '../../utils/format'
import './admin-ui.css'

const EMPTY_COLOR = '#e9edf5'

function DonutTooltip({ active, payload, formatValue }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (d.__empty) return null
  return (
    <div className="adm-tooltip">
      <div className="adm-tooltip-row">
        <span className="adm-swatch" style={{ background: d.color }} />
        {d.label}
        <b>{formatValue(d.value)}</b>
      </div>
    </div>
  )
}

/**
 * Donut with a centred total and a legend (count + %).
 *
 *   <DonutChart
 *     data={[{ key: 'APPROVED', label: 'Approved', value: 976, color: '#0b2a7a', percentage: 78.2 }]}
 *     total={1248} centerLabel="Total Buses" />
 *
 * `percentage` is optional - computed from the values when missing.
 * `formatValue` formats legend/tooltip values; `centerValue` overrides the
 * centre text (e.g. a currency total). All-zero data renders a grey ring.
 */
export function DonutChart({ data = [], total, centerValue, centerLabel, formatValue = formatNumber, size = 180, thickness = 26 }) {
  const sum = data.reduce((acc, d) => acc + (Number(d.value) || 0), 0)
  const shownTotal = total ?? sum
  const nonZero = data.filter((d) => Number(d.value) > 0)
  const slices = nonZero.length ? nonZero : [{ key: '__empty', label: 'No data', value: 1, color: EMPTY_COLOR, __empty: true }]
  const pct = (d) => (d.percentage != null ? Number(d.percentage) : sum ? (Number(d.value) / sum) * 100 : 0)
  const outer = size / 2 - 2

  return (
    <div className="adm-donut">
      <div className="adm-donut-chart" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius={outer - thickness}
            outerRadius={outer}
            startAngle={90}
            endAngle={-270}
            paddingAngle={nonZero.length > 1 ? 1.5 : 0}
            stroke="none"
            isAnimationActive={Boolean(nonZero.length)}
          >
            {slices.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
          {nonZero.length > 0 && <Tooltip content={<DonutTooltip formatValue={formatValue} />} />}
        </PieChart>
        <div className="adm-donut-center">
          <span className="adm-donut-total">{centerValue ?? formatNumber(shownTotal)}</span>
          {centerLabel && <span className="adm-donut-caption">{centerLabel}</span>}
        </div>
      </div>
      <ul className="adm-legend">
        {data.map((d) => (
          <li key={d.key}>
            <span className="adm-swatch" style={{ background: d.color, width: 11, height: 11 }} />
            <span className="adm-legend-label">{d.label}</span>
            <span className="adm-legend-value">
              {formatValue(Number(d.value) || 0)} <span className="adm-legend-pct">({pct(d).toFixed(1)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default DonutChart
