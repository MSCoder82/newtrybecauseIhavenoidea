import React, { useEffect, useMemo, useState } from 'react';
import { Campaign, Role } from '../types';
import { supabase } from '../lib/supabase';

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
  facebook?: { pageId?: string; accessToken?: string };
  twitter?: { username?: string; bearer?: string };
  instagram?: { userId?: string; accessToken?: string };
  linkedin?: { orgId?: string; accessToken?: string };
  youtube?: { channelId?: string; apiKey?: string };
  custom?: { url?: string };
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
  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);

  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const availableCampaigns = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const active = campaigns.filter((campaign) => campaign.end_date >= today);
    return active.length > 0 ? active : campaigns;
  }, [campaigns]);

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
      } finally {
        setSettingsLoading(false);
      }
    };
    load();
  }, [teamId]);

  const loadFeedPosts = async () => {
    try {
      setFeedLoading(true);
      setFeedError(null);
      if (!settings || JSON.stringify(settings) === '{}') {
        throw new Error('Add API credentials in Social API Settings first.');
      }
      // Use unified API-based aggregator (env-configured credentials)
      const res = await fetch(`/api/social-aggregate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5, credentials: settings || {} }),
      });
      if (!res.ok) throw new Error(`Feeds fetch failed: ${res.status}`);
      const json = await res.json();
      const fetched = Array.isArray(json.data) ? json.data : [];
      setFeedPosts(fetched);

      // Persist minimal info (URL + metadata) to Supabase
      const minimal = fetched
        .map((p: any) => ({
          url: p.url || '',
          network: p.network || null,
          title: p.title || null,
          published_at: p.published_at || null,
          team_id: teamId,
        }))
        .filter((p: any) => p.url);

      if (minimal.length > 0) {
        await supabase
          .from('social_posts')
          .upsert(minimal, { onConflict: 'team_id,url', ignoreDuplicates: true });
        await loadSavedPosts();
      }
    } catch (e: any) {
      setFeedError(e.message || 'Failed to load feeds');
    } finally {
      setFeedLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSettingsError(null);
      const payload = { team_id: teamId, settings };
      const { error } = await supabase.from('social_settings').upsert(payload).select('team_id').single();
      if (error) throw error;
    } catch (e: any) {
      setSettingsError(e.message || 'Failed to save settings');
    }
  };

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
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Social API Settings</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">These credentials are stored in Supabase and used by your team.</p>
          </div>
          {settingsError && <p className="mb-3 text-sm text-red-600 dark:text-red-300">{settingsError}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Facebook */}
            <div className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="font-semibold text-navy-900 dark:text-white mb-2">Facebook Page</div>
              <label className="block mb-2 text-sm">
                <span className="text-navy-900 dark:text-navy-100">Page ID</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.facebook?.pageId || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), facebook: { ...(s?.facebook || {}), pageId: e.target.value } }))} />
              </label>
              <label className="block text-sm">
                <span className="text-navy-900 dark:text-navy-100">Access Token</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.facebook?.accessToken || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), facebook: { ...(s?.facebook || {}), accessToken: e.target.value } }))} />
              </label>
            </div>
            {/* Twitter */}
            <div className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="font-semibold text-navy-900 dark:text-white mb-2">Twitter / X</div>
              <label className="block mb-2 text-sm">
                <span className="text-navy-900 dark:text-navy-100">Username</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.twitter?.username || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), twitter: { ...(s?.twitter || {}), username: e.target.value } }))} />
              </label>
              <label className="block text-sm">
                <span className="text-navy-900 dark:text-navy-100">Bearer Token</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.twitter?.bearer || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), twitter: { ...(s?.twitter || {}), bearer: e.target.value } }))} />
              </label>
            </div>
            {/* Instagram */}
            <div className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="font-semibold text-navy-900 dark:text-white mb-2">Instagram</div>
              <label className="block mb-2 text-sm">
                <span className="text-navy-900 dark:text-navy-100">User ID</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.instagram?.userId || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), instagram: { ...(s?.instagram || {}), userId: e.target.value } }))} />
              </label>
              <label className="block text-sm">
                <span className="text-navy-900 dark:text-navy-100">Access Token</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.instagram?.accessToken || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), instagram: { ...(s?.instagram || {}), accessToken: e.target.value } }))} />
              </label>
            </div>
            {/* LinkedIn */}
            <div className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="font-semibold text-navy-900 dark:text-white mb-2">LinkedIn</div>
              <label className="block mb-2 text-sm">
                <span className="text-navy-900 dark:text-navy-100">Organization ID</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.linkedin?.orgId || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), linkedin: { ...(s?.linkedin || {}), orgId: e.target.value } }))} />
              </label>
              <label className="block text-sm">
                <span className="text-navy-900 dark:text-navy-100">Access Token</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.linkedin?.accessToken || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), linkedin: { ...(s?.linkedin || {}), accessToken: e.target.value } }))} />
              </label>
            </div>
            {/* YouTube */}
            <div className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="font-semibold text-navy-900 dark:text-white mb-2">YouTube</div>
              <label className="block mb-2 text-sm">
                <span className="text-navy-900 dark:text-navy-100">Channel ID</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.youtube?.channelId || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), youtube: { ...(s?.youtube || {}), channelId: e.target.value } }))} />
              </label>
              <label className="block text-sm">
                <span className="text-navy-900 dark:text-navy-100">API Key</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.youtube?.apiKey || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), youtube: { ...(s?.youtube || {}), apiKey: e.target.value } }))} />
              </label>
            </div>
            {/* Custom */}
            <div className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="font-semibold text-navy-900 dark:text-white mb-2">Other (Custom JSON feed)</div>
              <label className="block text-sm">
                <span className="text-navy-900 dark:text-navy-100">Feed URL</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.custom?.url || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), custom: { ...(s?.custom || {}), url: e.target.value } }))} />
              </label>
            </div>
          </div>
          <div className="mt-4">
            <button onClick={saveSettings} className="rounded-md px-4 py-2 text-sm font-semibold text-white bg-usace-blue hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue">Save settings</button>
            {settingsLoading && <span className="ml-3 text-sm text-gray-500 dark:text-navy-300">Loading…</span>}
          </div>
        </section>
      )}

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
                  <td className="px-4 py-3 text-sm font-medium text-navy-900 dark:text-white">{post.network || '—'}</td>
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">{post.title || '(untitled)'}</td>
                  <td className="px-4 py-3 text-sm">
                    <a href={post.url} target="_blank" rel="noreferrer" className="text-usace-blue hover:underline">
                      {post.url}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">
                    {post.published_at ? formatDate(post.published_at) : '—'}
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
            <p className="text-sm text-gray-600 dark:text-navy-300">Uses server API keys (configure in environment variables).</p>
          </div>
          <button
            type="button"
            onClick={loadFeedPosts}
            disabled={feedLoading}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white bg-usace-blue hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue"
          >
            {feedLoading ? 'Loading…' : 'Load feeds'}
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
