import React, { useEffect, useMemo, useState } from 'react';
import { Campaign, Role } from '../types';
import { supabase } from '../lib/supabase';
import { useNotification } from '../contexts/NotificationProvider';
import SocialMediaCurator from './SocialMediaCurator';

interface SocialMediaProps {
  role: Role;
  campaigns: Campaign[];
  teamId: number;
}

interface SavedPost {
  id: number;
  url: string;
  network?: string | null;
  title?: string | null;
  published_at?: string | null;
  campaign_id?: number | null;
  created_at: string;
}

type SocialSettings = {
  integrations?: any[];
  notes?: string;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

const SocialMedia: React.FC<SocialMediaProps> = ({ role, campaigns, teamId }) => {
  // Sprinklr feed UI removed

  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);

  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const { showToast } = useNotification();
  // No external connection testing from client

  const availableCampaigns = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const active = campaigns.filter((campaign) => campaign.end_date >= today);
    return active.length > 0 ? active : campaigns;
  }, [campaigns]);

  // No Sprinklr profile IDs; teams define integrations below.

  const loadSavedPosts = async () => {
    const { data } = await supabase
      .from('social_posts')
      .select('id, url, network, title, published_at, campaign_id, created_at')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (data) setSavedPosts(data as SavedPost[]);
  };

  useEffect(() => {
    loadSavedPosts();
  }, [teamId]);

  // Load team social settings
  useEffect(() => {
    const load = async () => {
      try {
        setSettingsLoading(true);
        setSettingsError(null);
        const { data, error } = await supabase
          .from('social_settings')
          .select('settings')
          .eq('team_id', teamId)
          .single();
        if (error) {
          // If table missing or row not found, ignore quietly for now
          setSettings(null);
        } else {
          setSettings((data as any)?.settings || null);
        }
      } catch (e: any) {
        setSettingsError(e.message || 'Failed to load settings');
        showToast(e.message || 'Failed to load settings', 'error');
      } finally {
        setSettingsLoading(false);
      }
    };
    load();
  }, [teamId]);

  // Sprinklr feed loader removed.

  const saveSettings = async () => {
    try {
      setSettingsError(null);
      const payload = { team_id: teamId, settings };
      const { error } = await supabase.from('social_settings').upsert(payload).select('team_id').single();
      if (error) throw error;
      showToast('Settings saved', 'success');
    } catch (e: any) {
      setSettingsError(e.message || 'Failed to save settings');
      showToast(e.message || 'Failed to save settings', 'error');
    }
  };

  // Test helpers
  const runTest = async (platform: string, tester: () => Promise<void>) => {
    try {
      setTesting((t) => ({ ...t, [platform]: true }));
      await tester();
      setTestResults((r) => ({ ...r, [platform]: 'ok' }));
    } catch (e: any) {
      setTestResults((r) => ({ ...r, [platform]: 'error' }));
      showToast(e?.message || 'Test failed', 'error');
    } finally {
      setTesting((t) => ({ ...t, [platform]: false }));
    }
  };

  // Test function removed with Sprinklr integration.

  const assignCampaign = async (postId: number, campaignId: number | null) => {
    const { error } = await supabase
      .from('social_posts')
      .update({ campaign_id: campaignId })
      .eq('id', postId);
    if (!error) {
      setSavedPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, campaign_id: campaignId } : p)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Monitored Accounts section removed (API-based aggregator now supplies feeds). */}

      {/* Settings (Chief only) */}
      {role === 'chief' && (
        <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
          <div className="mb-4">
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Team Social Integrations</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">Define API configurations for your team here. These settings are saved in Supabase and scoped to your team.</p>
          </div>
          {settingsError && <p className="mb-3 text-sm text-red-600 dark:text-red-300">{settingsError}</p>}
          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="font-semibold text-navy-900 dark:text-white mb-2">Integrations JSON</div>
              <p className="text-xs text-gray-600 dark:text-navy-300 mb-3">Store one or more API configurations. Example: [{"name":"My API","baseUrl":"https://api.example.com"}].</p>
              <textarea
                className="w-full h-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white font-mono"
                value={JSON.stringify(settings?.integrations ?? [], null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    if (!Array.isArray(parsed)) throw new Error('Must be a JSON array');
                    setSettings((s) => ({ ...(s || {}), integrations: parsed }));
                    setSettingsError(null);
                  } catch (err: any) {
                    setSettingsError(err.message || 'Invalid JSON');
                  }
                }}
              />
            </div>
            <div className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="font-semibold text-navy-900 dark:text-white mb-2">Internal notes</div>
              <p className="text-xs text-gray-600 dark:text-navy-300 mb-3">Optional notes for your team (e.g., ownership, usage tips).</p>
              <textarea
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white"
                rows={3}
                value={settings?.notes || ''}
                onChange={(e) => setSettings((s) => ({ ...(s || {}), notes: e.target.value }))}
                placeholder="Owner: Public Affairs | Contacts: ..."
              />
            </div>
          </div>
          <div className="mt-4">
            <button onClick={saveSettings} className="rounded-md px-4 py-2 text-sm font-semibold text-white bg-usace-blue hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue">Save settings</button>
            {settingsLoading && <span className="ml-3 text-sm text-gray-500 dark:text-navy-300">Loadingâ€¦</span>}
          </div>
        </section>
      )}

      {/* Team social curator */}
      <SocialMediaCurator teamId={teamId} />

      {/* Saved posts table */}
      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Saved posts</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">Auto-saved from feeds. Only URLs and basic metadata are stored.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-navy-700">
            <thead>
              <tr className="bg-navy-50 dark:bg-navy-900">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">Network</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">URL</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">Published</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">Campaign</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-navy-700">
              {savedPosts.map((post) => (
                <tr key={post.id} className="hover:bg-navy-50/60 dark:hover:bg-navy-900/50">
                  <td className="px-4 py-3 text-sm font-medium text-navy-900 dark:text-white">{post.network || 'â€”'}</td>
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">{post.title || '(untitled)'}</td>
                  <td className="px-4 py-3 text-sm">
                    <a href={post.url} target="_blank" rel="noreferrer" className="text-usace-blue hover:underline">
                      {post.url}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">
                    {post.published_at ? formatDate(post.published_at) : 'â€”'}
                  </td>
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">
                    <select
                      value={post.campaign_id ?? ''}
                      onChange={(e) => assignCampaign(post.id, e.target.value ? Number(e.target.value) : null)}
                      className="rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-2 py-1 text-gray-900 dark:text-white focus:border-usace-blue focus:outline-none"
                    >
                      <option value="">Not linked</option>
                      {availableCampaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {savedPosts.length === 0 && (
            <div className="text-sm text-gray-600 dark:text-navy-300 mt-3">No saved posts yet. Use "Load feeds" above.</div>
          )}
        </div>
      </section>

      {/* Feed loader */}
      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Latest posts (Feeds)</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">Powered by the Sprinklr bulk-fetch API (set SPRINKLR_* environment variables on the server).</p>
          </div>
          <button
            type="button"
            onClick={loadFeedPosts}
            disabled={feedLoading}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white bg-usace-blue hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue"
          >
            {feedLoading ? 'Loadingâ€¦' : 'Load feeds'}
          </button>
        </div>
        {feedError && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{feedError}</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {feedPosts.map((p: any, idx: number) => (
            <div key={p.url || idx} className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="text-sm text-gray-500 dark:text-navy-300 mb-1">{p.network || 'Feed'}</div>
              <div className="font-semibold text-navy-900 dark:text-white mb-1">{p.title || '(untitled)'}</div>
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" className="text-usace-blue text-sm hover:underline">
                  View post
                </a>
              )}
              <div className="text-xs text-gray-500 dark:text-navy-300 mt-2">{p.published_at || ''}</div>
            </div>
          ))}
          {feedPosts.length === 0 && (
            <div className="text-sm text-gray-600 dark:text-navy-300">No feed posts loaded.</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SocialMedia;
