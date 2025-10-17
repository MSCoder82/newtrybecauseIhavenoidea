

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { KpiDataPoint } from '../types';
import { useTheme } from '../contexts/ThemeProvider';

interface KpiBarChartProps {
    data: KpiDataPoint[];
}

const KpiBarChart: React.FC<KpiBarChartProps> = ({ data }) => {
    const { theme } = useTheme();
    const tickColor = theme === 'dark' ? '#9cb9d1' : '#33455d';
    const gridColor = theme === 'dark' ? '#3a516e' : '#e5e7eb';

    const mediaMentionsData = data
        .filter(d => d.metric === 'Media pickups')
        .reduce((acc, current) => {
            const month = new Date(current.date).toLocaleString('default', { month: 'short', year: '2-digit' });
            if (!acc[month]) {
                acc[month] = 0;
            }
            acc[month] += current.quantity;
            return acc;
        }, {} as Record<string, number>);
    
    const chartData = Object.keys(mediaMentionsData).map(month => ({
        name: month,
        'Pickups': mediaMentionsData[month]
    })).sort((a, b) => new Date(`1 ${a.name}`).getTime() - new Date(`1 ${b.name}`).getTime());
    
    if (chartData.length === 0) {
        return (
            <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center text-gray-500 dark:text-navy-400">
                No media pickup data available.
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <BarChart
                    data={chartData}
                    margin={{
                        top: 5,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="name" tick={{ fill: tickColor }} fontSize={12} />
                    <YAxis tick={{ fill: tickColor }} fontSize={12} />
                    <Tooltip 
                        contentStyle={{ 
                            backgroundColor: theme === 'dark' ? '#2f3d51' : '#ffffff',
                            borderColor: theme === 'dark' ? '#3a516e' : '#e5e7eb'
                        }}
                    />
                    <Legend wrapperStyle={{ color: tickColor }} />
                    <Bar dataKey="Pickups" fill="#003366" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default KpiBarChart;