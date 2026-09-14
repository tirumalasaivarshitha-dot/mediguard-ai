import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

export function DonutChart({
  data,
  colors,
}: {
  data: { name: string; value: number }[]
  colors: string[]
}) {
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="#FBFAF7">
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#FBFAF7', border: '1px solid #E4DFD4', borderRadius: 8, fontSize: 13 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
