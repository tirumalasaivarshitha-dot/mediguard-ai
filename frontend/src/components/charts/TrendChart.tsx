import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const tooltip = { background: '#FBFAF7', border: '1px solid #E4DFD4', borderRadius: 8, fontSize: 13 }

export function TrendChart({
  data,
  lines,
}: {
  data: Record<string, string | number>[]
  lines: { key: string; color: string; label: string }[]
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#E4DFD4" strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fill: '#5C6B7A', fontSize: 12 }} />
          <YAxis tick={{ fill: '#5C6B7A', fontSize: 12 }} />
          <Tooltip contentStyle={tooltip} />
          <Legend />
          {lines.map((l) => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BarMetricChart({
  data,
  xKey,
  yKey,
  color = '#168B8B',
}: {
  data: Record<string, string | number>[]
  xKey: string
  yKey: string
  color?: string
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#E4DFD4" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={{ fill: '#5C6B7A', fontSize: 12 }} />
          <YAxis tick={{ fill: '#5C6B7A', fontSize: 12 }} />
          <Tooltip contentStyle={tooltip} />
          <Bar dataKey={yKey} fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Sparkline({ data, color = '#168B8B' }: { data: { t: string; v: number }[]; color?: string }) {
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#E4DFD4" strokeDasharray="3 3" />
          <XAxis dataKey="t" hide />
          <YAxis tick={{ fill: '#5C6B7A', fontSize: 11 }} width={36} />
          <Tooltip contentStyle={tooltip} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
