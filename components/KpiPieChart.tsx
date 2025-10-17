

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { KpiDataPoint, EntryType } from '../types';
import { useTheme } from '../contexts/ThemeProvider';

interface KpiPieChartProps {
  data: KpiDataPoint[];
}

const COLORS: Record<EntryType, string> = {
    [EntryType.OUTPUT]: '#003366', // usace-blue
    [EntryType.OUTTAKE]: '#D42127', // usace-red
    [EntryType.OUTCOME]: '#7195b9', // navy-400
};

const KpiPieChart: React.FC<KpiPieChartProps> = ({ data }) => {
  const { theme } = useTheme();
  const tickColor = theme === 'dark' ? '#9cb9d1' : '#33455d';

  const typeCounts = data.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {} as Record<EntryType, number>);

  const chartData = Object.entries(typeCounts).map(([name, value]) => ({
    name,
    value,
  }));

  if (chartData.length === 0) {
      return (
          <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center text-gray-500 dark:text-navy-400">
              No entry data available.
          </div>
      );
  }

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const percentage = (percent * 100).toFixed(0);

    // Don't render label if slice is too small
    // Fix: Cast percentage string to a number for comparison to resolve TypeScript error.
    if (Number(percentage) < 5) return null;

    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold">
        {`${percentage}%`}
      </text>
    );
  };

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
            nameKey="name"
            label={renderCustomLabel}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.name as EntryType]} stroke={theme === 'dark' ? '#2f3d51' : '#fff'} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ 
                backgroundColor: theme === 'dark' ? '#2f3d51' : '#ffffff',
                borderColor: theme === 'dark' ? '#3a516e' : '#e5e7eb'
            }}
          />
          <Legend wrapperStyle={{ color: tickColor, fontSize: '14px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default KpiPieChart;