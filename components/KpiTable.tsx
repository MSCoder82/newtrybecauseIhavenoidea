import React, { useState, useMemo } from 'react';
import { KpiDataPoint } from '../types';
import EmptyState from './EmptyState';

interface KpiTableProps {
  data: KpiDataPoint[];
}

type SortConfig = {
    key: keyof KpiDataPoint;
    direction: 'ascending' | 'descending';
} | null;

const KpiTable: React.FC<KpiTableProps> = ({ data }) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const sortedData = useMemo(() => {
    let sortableItems = [...data];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key] ?? '';
        const bValue = b[sortConfig.key] ?? '';
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfig]);

  const requestSort = (key: keyof KpiDataPoint) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIndicator = (key: keyof KpiDataPoint) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === 'ascending' ? '▲' : '▼';
  };

  if (!data || data.length === 0) {
      return (
          <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
             <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-4">KPI Data Explorer</h2>
             <EmptyState title="No KPI Data Found" message="Get started by adding a new KPI entry." />
          </div>
      );
  }

  return (
    <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
      <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-4">KPI Data Explorer</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-navy-700">
          <thead className="bg-gray-50 dark:bg-navy-700/50">
            <tr>
              {['date', 'type', 'metric', 'quantity', 'notes', 'link'].map((key) => (
                <th
                  key={key}
                  scope="col"
                  onClick={() => requestSort(key as keyof KpiDataPoint)}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-navy-300 uppercase tracking-wider cursor-pointer"
                >
                  <span className="flex items-center">
                    {key}
                    <span className="ml-1">{getSortIndicator(key as keyof KpiDataPoint)}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-navy-800 divide-y divide-gray-200 dark:divide-navy-700">
            {sortedData.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-navy-300">{item.date}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-navy-300">{item.type}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.metric}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-navy-300">{item.quantity.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-navy-300">
                    <span className="block max-w-xs truncate" title={item.notes || ''}>
                        {item.notes || 'N/A'}
                    </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-navy-300">
                    {item.link ? (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-usace-blue hover:underline" title={item.link}>
                           <span className="block max-w-xs truncate">{item.link}</span>
                        </a>
                    ) : (
                        'N/A'
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KpiTable;