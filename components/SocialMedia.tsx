import React, { useEffect, useMemo, useState } from 'react';
import { Campaign, Role } from '../types';
import { supabase } from '../lib/supabase';
import { useNotification } from '../contexts/NotificationProvider';

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
  const { showToast } = useNotification();
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'error'>>({});

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
        showToast(e.message || 'Failed to load settings', 'error');
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
      if (Array.isArray(json.errors) && json.errors.length) {
        const msg = json.errors.map((e: any) => `${e.platform}: ${e.error}`).join('; ');
        showToast(`Some feeds failed: ${msg}`, 'error');
      }
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
      showToast(e.message || 'Failed to load feeds', 'error');
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

  const testFacebook = async () => {
    const pageId = settings?.facebook?.pageId?.trim();
    const token = settings?.facebook?.accessToken?.trim();
    if (!pageId || !token) throw new Error('Enter Facebook Page ID and Access Token');
    const res = await fetch(`/api/social-aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, platforms: 'facebook', credentials: { facebook: { pageId, accessToken: token } } }),
    });
    if (!res.ok) throw new Error(`Facebook test failed: ${res.status}`);
    const j = await res.json();
    const count = Array.isArray(j.data) ? j.data.filter((i: any) => i.network === 'Facebook').length : 0;
    showToast(`Facebook OK (${count} item)`, 'success');
  };

  const testTwitter = async () => {
    const username = settings?.twitter?.username?.trim();
    const bearer = settings?.twitter?.bearer?.trim();
    if (!username || !bearer) throw new Error('Enter Twitter username and Bearer token');
    const res = await fetch(`/api/social-aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, platforms: 'twitter', credentials: { twitter: { username, bearer } } }),
    });
    if (!res.ok) throw new Error(`Twitter test failed: ${res.status}`);
    const j = await res.json();
    const count = Array.isArray(j.data) ? j.data.filter((i: any) => i.network === 'Twitter').length : 0;
    showToast(`Twitter OK (${count} item)`, 'success');
  };

  const testInstagram = async () => {
    const userId = settings?.instagram?.userId?.trim();
    const token = settings?.instagram?.accessToken?.trim();
    if (!userId || !token) throw new Error('Enter Instagram User ID and Access Token');
    const res = await fetch(`/api/social-aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, platforms: 'instagram', credentials: { instagram: { userId, accessToken: token } } }),
    });
    if (!res.ok) throw new Error(`Instagram test failed: ${res.status}`);
    const j = await res.json();
    const count = Array.isArray(j.data) ? j.data.filter((i: any) => i.network === 'Instagram').length : 0;
    showToast(`Instagram OK (${count} item)`, 'success');
  };

  const testLinkedIn = async () => {
    const orgId = settings?.linkedin?.orgId?.trim();
    const token = settings?.linkedin?.accessToken?.trim();
    if (!orgId || !token) throw new Error('Enter LinkedIn Organization ID and Access Token');
    const res = await fetch(`/api/social-aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, platforms: 'linkedin', credentials: { linkedin: { orgId, accessToken: token } } }),
    });
    if (!res.ok) throw new Error(`LinkedIn test failed: ${res.status}`);
    const j = await res.json();
    const count = Array.isArray(j.data) ? j.data.filter((i: any) => i.network === 'LinkedIn').length : 0;
    showToast(`LinkedIn OK (${count} item)`, 'success');
  };

  const testYouTube = async () => {
    const channelId = settings?.youtube?.channelId?.trim();
    const apiKey = settings?.youtube?.apiKey?.trim();
    if (!channelId || !apiKey) throw new Error('Enter YouTube Channel ID and API Key');
    const res = await fetch(`/api/social-aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, platforms: 'youtube', credentials: { youtube: { channelId, apiKey } } }),
    });
    if (!res.ok) throw new Error(`YouTube test failed: ${res.status}`);
    const j = await res.json();
    const count = Array.isArray(j.data) ? j.data.filter((i: any) => i.network === 'YouTube').length : 0;
    showToast(`YouTube OK (${count} item)`, 'success');
  };

  const testCustom = async () => {
    const url = settings?.custom?.url?.trim();
    if (!url) throw new Error('Enter Custom Feed URL');
    const res = await fetch(`/api/social-aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, platforms: 'custom', credentials: { custom: { url } } }),
    });
    if (!res.ok) throw new Error(`Custom feed test failed: ${res.status}`);
    const j = await res.json();
    const count = Array.isArray(j.data) ? j.data.filter((i: any) => i.network === 'Other').length : 0;
    showToast(`Custom feed OK (${count} item)`, 'success');
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
          {/* Summary of saved feeds */}
          <div className="mb-4 text-sm text-gray-700 dark:text-navy-200">
            <div className="font-semibold mb-1">Saved social feeds:</div>
            <ul className="list-disc pl-5 space-y-1">
              {(() => {
                const items: string[] = [];
                if (settings?.facebook?.pageId && settings?.facebook?.accessToken) items.push('Facebook Page');
                if (settings?.twitter?.username && settings?.twitter?.bearer) items.push('Twitter / X');
                if (settings?.instagram?.userId && settings?.instagram?.accessToken) items.push('Instagram');
                if (settings?.linkedin?.orgId && settings?.linkedin?.accessToken) items.push('LinkedIn');
                if (settings?.youtube?.channelId && settings?.youtube?.apiKey) items.push('YouTube');
                if (settings?.custom?.url) items.push('Other (Custom feed)');
                return items.length > 0 ? items.map((t) => <li key={t}>{t}</li>) : <li>None configured yet.</li>;
              })()}
            </ul>
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
                <input type="password" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.facebook?.accessToken || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), facebook: { ...(s?.facebook || {}), accessToken: e.target.value } }))} />
              </label>
              <p className="mt-2 text-xs text-gray-600 dark:text-navy-300">
                Use a Page Access Token (not a user token). The token must have read permissions for the page (e.g., pages_read_engagement). Page ID is the numeric ID of your Facebook Page.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => runTest('facebook', testFacebook)}
                  disabled={!!testing.facebook}
                  className="rounded-md px-3 py-1 text-xs font-semibold text-white bg-usace-blue hover:bg-navy-800"
                >
                  {testing.facebook ? 'Testing…' : 'Test connection'}
                </button>
                {testResults.facebook === 'ok' && <span className="ml-2 text-xs text-green-600 dark:text-green-300">✓ OK</span>}
                {testResults.facebook === 'error' && <span className="ml-2 text-xs text-red-600 dark:text-red-300">Error</span>}
              </div>
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
                <input type="password" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.twitter?.bearer || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), twitter: { ...(s?.twitter || {}), bearer: e.target.value } }))} />
              </label>
              <p className="mt-2 text-xs text-gray-600 dark:text-navy-300">
                Requires a v2 Bearer Token from the X Developer Portal with read access. Username should not include @.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => runTest('twitter', testTwitter)}
                  disabled={!!testing.twitter}
                  className="rounded-md px-3 py-1 text-xs font-semibold text-white bg-usace-blue hover:bg-navy-800"
                >
                  {testing.twitter ? 'Testing…' : 'Test connection'}
                </button>
                {testResults.twitter === 'ok' && <span className="ml-2 text-xs text-green-600 dark:text-green-300">✓ OK</span>}
                {testResults.twitter === 'error' && <span className="ml-2 text-xs text-red-600 dark:text-red-300">Error</span>}
              </div>
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
                <input type="password" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.instagram?.accessToken || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), instagram: { ...(s?.instagram || {}), accessToken: e.target.value } }))} />
              </label>
              <p className="mt-2 text-xs text-gray-600 dark:text-navy-300">
                IG Graph API requires a Business/Creator account linked to a Facebook Page. Use the Instagram User ID and a valid access token (e.g., instagram_basic). The user ID is numeric.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => runTest('instagram', testInstagram)}
                  disabled={!!testing.instagram}
                  className="rounded-md px-3 py-1 text-xs font-semibold text-white bg-usace-blue hover:bg-navy-800"
                >
                  {testing.instagram ? 'Testing…' : 'Test connection'}
                </button>
                {testResults.instagram === 'ok' && <span className="ml-2 text-xs text-green-600 dark:text-green-300">✓ OK</span>}
                {testResults.instagram === 'error' && <span className="ml-2 text-xs text-red-600 dark:text-red-300">Error</span>}
              </div>
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
                <input type="password" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.linkedin?.accessToken || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), linkedin: { ...(s?.linkedin || {}), accessToken: e.target.value } }))} />
              </label>
              <p className="mt-2 text-xs text-gray-600 dark:text-navy-300">
                Use an access token with Marketing Developer permissions and scope like r_organization_social. The token must belong to a user who can manage the organization. Org ID is the numeric ID (we add the URN prefix).
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => runTest('linkedin', testLinkedIn)}
                  disabled={!!testing.linkedin}
                  className="rounded-md px-3 py-1 text-xs font-semibold text-white bg-usace-blue hover:bg-navy-800"
                >
                  {testing.linkedin ? 'Testing…' : 'Test connection'}
                </button>
                {testResults.linkedin === 'ok' && <span className="ml-2 text-xs text-green-600 dark:text-green-300">✓ OK</span>}
                {testResults.linkedin === 'error' && <span className="ml-2 text-xs text-red-600 dark:text-red-300">Error</span>}
              </div>
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
                <input type="password" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.youtube?.apiKey || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), youtube: { ...(s?.youtube || {}), apiKey: e.target.value } }))} />
              </label>
              <p className="mt-2 text-xs text-gray-600 dark:text-navy-300">
                Channel ID usually starts with UC… (not a @handle). Create a YouTube Data API v3 key in Google Cloud and enable the API for your project.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => runTest('youtube', testYouTube)}
                  disabled={!!testing.youtube}
                  className="rounded-md px-3 py-1 text-xs font-semibold text-white bg-usace-blue hover:bg-navy-800"
                >
                  {testing.youtube ? 'Testing…' : 'Test connection'}
                </button>
                {testResults.youtube === 'ok' && <span className="ml-2 text-xs text-green-600 dark:text-green-300">✓ OK</span>}
                {testResults.youtube === 'error' && <span className="ml-2 text-xs text-red-600 dark:text-red-300">Error</span>}
              </div>
            </div>
            {/* Custom */}
            <div className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="font-semibold text-navy-900 dark:text-white mb-2">Other (Custom JSON feed)</div>
              <label className="block text-sm">
                <span className="text-navy-900 dark:text-navy-100">Feed URL</span>
                <input className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800 dark:text-white" value={settings?.custom?.url || ''} onChange={(e) => setSettings((s) => ({ ...(s || {}), custom: { ...(s?.custom || {}), url: e.target.value } }))} />
              </label>
              <p className="mt-2 text-xs text-gray-600 dark:text-navy-300">
                Must return JSON with an array of items or a JSON Feed with an items array. Each item should include a URL and a timestamp field when possible.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => runTest('custom', testCustom)}
                  disabled={!!testing.custom}
                  className="rounded-md px-3 py-1 text-xs font-semibold text-white bg-usace-blue hover:bg-navy-800"
                >
                  {testing.custom ? 'Testing…' : 'Test connection'}
                </button>
                {testResults.custom === 'ok' && <span className="ml-2 text-xs text-green-600 dark:text-green-300">✓ OK</span>}
                {testResults.custom === 'error' && <span className="ml-2 text-xs text-red-600 dark:text-red-300">Error</span>}
              </div>
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
