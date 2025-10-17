import React, { useState, useMemo, useEffect } from 'react';
import { KpiDataPoint, EntryType, Campaign } from '../types';
import { ENTRY_TYPES, METRIC_OPTIONS } from '../constants';
import { useNotification } from '../contexts/NotificationProvider';

interface DataEntryProps {
  onSubmit: (dataPoint: Omit<KpiDataPoint, 'id'>) => void;
  campaigns: Campaign[];
}

const DataEntry: React.FC<DataEntryProps> = ({ onSubmit, campaigns }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<EntryType>(EntryType.OUTPUT);
  const [metric, setMetric] = useState('');
  const [customMetric, setCustomMetric] = useState('');
  const [quantity, setQuantity] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [campaignId, setCampaignId] = useState<string>('');
  const { showToast } = useNotification();
  
  const availableMetrics = useMemo(() => METRIC_OPTIONS[type] || [], [type]);

  useEffect(() => {
    if (availableMetrics.length > 0) {
      setMetric(availableMetrics[0]);
    } else {
      setMetric('');
    }
  }, [type, availableMetrics]);


  const activeCampaigns = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]; // Get current date in "YYYY-MM-DD" format
    return campaigns.filter(campaign => campaign.end_date >= today);
  }, [campaigns]);
  
  const handleMetricChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMetric = e.target.value;
    setMetric(newMetric);
    if (newMetric !== 'Other') {
        setCustomMetric('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalMetric = metric === 'Other' ? customMetric : metric;
    if (!date || !type || !finalMetric || !quantity) {
        showToast('Please fill all required fields', 'error');
        return;
    }
    onSubmit({
      date,
      type,
      metric: finalMetric,
      quantity: parseFloat(quantity),
      notes,
      campaign_id: campaignId ? parseInt(campaignId, 10) : undefined,
      link: link || undefined,
    });
    // Reset form
    setType(EntryType.OUTPUT);
    setMetric(METRIC_OPTIONS[EntryType.OUTPUT][0]);
    setCustomMetric('');
    setQuantity('');
    setLink('');
    setNotes('');
    setCampaignId('');
  };

  return (
    <div className="bg-white dark:bg-navy-800 p-6 md:p-8 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-6">Add New KPI Entry</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Date</label>
                <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
            </div>
             <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Type</label>
                <select id="type" value={type} onChange={e => setType(e.target.value as EntryType)} required className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm">
                    {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label htmlFor="metric" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Metric</label>
                <select id="metric" value={metric} onChange={handleMetricChange} required className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm">
                    {availableMetrics.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Quantity</label>
                <input type="number" step="any" id="quantity" value={quantity} onChange={e => setQuantity(e.target.value)} required placeholder="e.g., 152" className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
            </div>
        </div>

        {metric === 'Other' && (
             <div>
                <label htmlFor="custom-metric" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Custom Metric</label>
                <input type="text" id="custom-metric" value={customMetric} onChange={e => setCustomMetric(e.target.value)} required placeholder="Specify your metric" className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
            </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div>
                <label htmlFor="campaign" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Campaign (Optional)</label>
                <select id="campaign" value={campaignId} onChange={e => setCampaignId(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm">
                    <option value="">None</option>
                    {activeCampaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
            </div>
             <div>
                <label htmlFor="link" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Link (Optional)</label>
                <input type="url" id="link" value={link} onChange={e => setLink(e.target.value)} placeholder="https://example.com" className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
            </div>
        </div>

        <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Notes (Optional)</label>
            <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
        </div>

        <div className="flex justify-end">
            <button type="submit" className="inline-flex justify-center rounded-md border border-transparent bg-usace-blue py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 dark:focus:ring-offset-navy-800 transition-colors">
                Save Entry
            </button>
        </div>
      </form>
    </div>
  );
};

export default DataEntry;