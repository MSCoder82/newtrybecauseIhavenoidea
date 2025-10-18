import React, { useMemo, useState, useEffect } from 'react';
import { Campaign, Role } from '../types';
import { supabase } from '../lib/supabase';

const SOCIAL_NETWORKS = ['Facebook', 'Twitter', 'Instagram', 'LinkedIn', 'YouTube', 'Other'] as const;

type SocialNetwork = typeof SOCIAL_NETWORKS[number];

interface MockFeedItem {
  title: string;
  url: string;
  placement: string;
  notes: string;
  hoursAgo: number;
}

interface SocialMediaEntry {
  id: number;
  network: SocialNetwork;
  title: string;
  url: string;
  placement: string;
  campaignId?: number;
  notes?: string;
  createdAt: string;
}

const MOCK_FEED_LIBRARY: Record<SocialNetwork, MockFeedItem[]> = {
  Facebook: [
    {
      title: 'Lake shoreline restoration update',
      url: 'https://facebook.com/usace/posts/shoreline-restoration',
      placement: 'Regional operations',
      notes: 'Highlights before/after photos and upcoming milestones.',
      hoursAgo: 5,
    },
    {
      title: 'STEM outreach day recap',
      url: 'https://facebook.com/usace/posts/stem-outreach',
      placement: 'Community engagement',
      notes: 'Includes partner shout-outs and photo gallery link.',
      hoursAgo: 20,
    },
  ],
  Twitter: [
    {
      title: 'River levels trending downward across the district',
      url: 'https://twitter.com/usace/status/river-levels-update',
      placement: 'Water management',
      notes: 'Thread with charts for stakeholders.',
      hoursAgo: 2,
    },
    {
      title: 'ICYMI: Public meeting recording now available',
      url: 'https://twitter.com/usace/status/public-meeting-recap',
      placement: 'Public affairs',
      notes: 'Links to the YouTube replay with transcript.',
      hoursAgo: 16,
    },
  ],
  Instagram: [
    {
      title: 'Highlight reel – levee inspection flyover',
      url: 'https://instagram.com/p/levee-inspection-reel',
      placement: 'Field operations',
      notes: 'Short-form reel showcasing the helicopter tour.',
      hoursAgo: 8,
    },
    {
      title: 'Water safety spotlight: life jacket fit tips',
      url: 'https://instagram.com/p/water-safety-spotlight',
      placement: 'Seasonal safety',
      notes: 'Carousel post with captions for each slide.',
      hoursAgo: 26,
    },
  ],
  LinkedIn: [
    {
      title: 'Hiring surge for coastal resilience engineers',
      url: 'https://linkedin.com/company/usace/posts/coastal-resilience-hiring',
      placement: 'Talent acquisition',
      notes: 'Mentions USAJobs listing and recruiting event.',
      hoursAgo: 6,
    },
    {
      title: 'Employee spotlight: innovation in lock maintenance',
      url: 'https://linkedin.com/company/usace/posts/employee-spotlight-lock-maintenance',
      placement: 'Internal recognition',
      notes: 'Features quotes from maintenance lead.',
      hoursAgo: 30,
    },
  ],
  YouTube: [
    {
      title: 'Debris removal mission overview',
      url: 'https://youtube.com/watch?v=usace-debris-removal',
      placement: 'Emergency operations',
      notes: '5-minute briefing with captions enabled.',
      hoursAgo: 12,
    },
    {
      title: 'Virtual tour: visitor center renovations',
      url: 'https://youtube.com/watch?v=usace-visitor-center-tour',
      placement: 'Visitor services',
      notes: 'Includes chapter markers for each gallery.',
      hoursAgo: 40,
    },
  ],
  Other: [
    {
      title: 'Podcast episode: Flood risk management insights',
      url: 'https://podcasts.example.com/usace/flood-risk-management',
      placement: 'Thought leadership',
      notes: 'Cross-posted to multiple podcast platforms.',
      hoursAgo: 18,
    },
  ],
};

const dynamicFeedFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const createDynamicFeedItem = (network: SocialNetwork): MockFeedItem => ({
  title: `${network} activity update (${dynamicFeedFormatter.format(new Date())})`,
  url: `https://social.example.com/${network.toLowerCase()}/${Date.now()}`,
  placement: 'Automated feed import',
  notes: 'Imported via API key.',
  hoursAgo: 0,
});

interface FeedConnection {
  network: SocialNetwork;
  connected: boolean;
  autoSync: 'Manual' | 'Daily' | 'Weekly';
  lastSynced?: string;
  apiKey: string;
  status: 'idle' | 'error' | 'success';
  message?: string;
}

interface SocialMediaProps {
  role: Role;
  campaigns: Campaign[];
  teamId: number;
}

interface SavedAccount {
  id: number;
  account_id: string;
  label?: string;
  created_at: string;
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

type SocialMediaFormState = {
  network: SocialNetwork;
  title: string;
  url: string;
  placement: string;
  notes: string;
  campaignId: string;
};

const INITIAL_CONNECTIONS: FeedConnection[] = SOCIAL_NETWORKS.map((network) => ({
  network,
  connected: false,
  autoSync: 'Manual',
  apiKey: '',
  status: 'idle',
}));

const formatDate = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value));

const SocialMedia: React.FC<SocialMediaProps> = ({ role, campaigns, teamId }) => {
  const [entries, setEntries] = useState<SocialMediaEntry[]>([]);
  const [sprinklrPosts, setSprinklrPosts] = useState<any[]>([]);
  const [sprinklrLoading, setSprinklrLoading] = useState(false);
  const [sprinklrError, setSprinklrError] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [newAccountId, setNewAccountId] = useState('');
  const [newAccountLabel, setNewAccountLabel] = useState('');
  const [connections, setConnections] = useState<FeedConnection[]>(INITIAL_CONNECTIONS);
  const [formState, setFormState] = useState<SocialMediaFormState>({
    network: SOCIAL_NETWORKS[0],
    title: '',
    url: '',
    placement: '',
    notes: '',
    campaignId: '',
  });

  const hasEntries = entries.length > 0;
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);

  const availableCampaigns = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const active = campaigns.filter((campaign) => campaign.end_date >= today);
    return active.length > 0 ? active : campaigns;
  }, [campaigns]);

  const campaignLookup = useMemo(() => {
    return new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  }, [campaigns]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [entries],
  );

  const handleFormChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormState({
      network: SOCIAL_NETWORKS[0],
      title: '',
      url: '',
      placement: '',
      notes: '',
      campaignId: '',
    });
  };

  const handleAddEntry = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formState.title.trim() || !formState.url.trim()) {
      return;
    }

    const newEntry: SocialMediaEntry = {
      ...formState,
      id: Date.now(),
      createdAt: new Date().toISOString(),
      campaignId: formState.campaignId ? Number(formState.campaignId) : undefined,
    };

    setEntries((prev) => [newEntry, ...prev]);
    resetForm();
  };

  const handleDeleteEntry = (id: number) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  // Load saved Sprinklr accounts for this team
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('social_accounts')
        .select('id, account_id, label, created_at')
        .order('created_at', { ascending: false });
      if (data) setSavedAccounts(data as SavedAccount[]);
    };
    load();
  }, [teamId]);

  const addAccount = async () => {
    if (!newAccountId.trim()) return;
    const { data, error } = await supabase
      .from('social_accounts')
      .insert([{ account_id: newAccountId.trim(), label: newAccountLabel || null }])
      .select('id, account_id, label, created_at')
      .single();
    if (!error && data) {
      setSavedAccounts((prev) => [data as SavedAccount, ...prev]);
      setNewAccountId('');
      setNewAccountLabel('');
    }
  };

  const removeAccount = async (id: number) => {
    const { error } = await supabase.from('social_accounts').delete().eq('id', id);
    if (!error) setSavedAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const loadSprinklrPosts = async () => {
    try {
      setSprinklrLoading(true);
      setSprinklrError(null);
      const qs = new URLSearchParams();
      const accountsCsv = savedAccounts.map(a => a.account_id).filter(Boolean).join(',');
      if (!accountsCsv) {
        setSprinklrError('Add at least one account to monitor.');
        setSprinklrLoading(false);
        return;
      }
      qs.set('accounts', accountsCsv);
      qs.set('limit', '20');
      const res = await fetch(`/api/sprinklr?${qs.toString()}`);
      if (!res.ok) throw new Error(`Sprinklr fetch failed: ${res.status}`);
      const json = await res.json();
      const fetched = Array.isArray(json.data) ? json.data : (json.data?.items ?? []);
      setSprinklrPosts(fetched);

      // Persist minimal info (URL + metadata) to Supabase
      const minimal = fetched
        .map((p: any) => ({
          url: p.url || p.link || '',
          network: p.network || p.channel || null,
          title: p.title || p.text || p.message || null,
          published_at: p.published_at || p.created_at || null,
        }))
        .filter((p: any) => p.url);

      if (minimal.length > 0) {
        await supabase
          .from('social_posts')
          .upsert(minimal, { onConflict: 'team_id,url', ignoreDuplicates: true });
        await loadSavedPosts();
      }
    } catch (e: any) {
      setSprinklrError(e.message || 'Failed to load Sprinklr posts');
    } finally {
      setSprinklrLoading(false);
    }
  };

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

  const assignCampaign = async (postId: number, campaignId: number | null) => {
    const { error } = await supabase
      .from('social_posts')
      .update({ campaign_id: campaignId })
      .eq('id', postId);
    if (!error) {
      setSavedPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, campaign_id: campaignId } : p)),
      );
    }
  };

  const importFeedEntries = (network: SocialNetwork, options?: { generateNew?: boolean }) => {
    const baseFeed = options?.generateNew ? [createDynamicFeedItem(network)] : MOCK_FEED_LIBRARY[network] ?? [];

    if (baseFeed.length === 0) {
      return 0;
    }

    let importedCount = 0;

    setEntries((prevEntries) => {
      const existingUrls = new Set(prevEntries.map((entry) => entry.url));
      const itemsToAdd = baseFeed
        .filter((item) => !existingUrls.has(item.url))
        .map((item, index) => ({
          id: Date.now() + index,
          network,
          title: item.title,
          url: item.url,
          placement: item.placement,
          notes: item.notes,
          createdAt: new Date(Date.now() - (item.hoursAgo ?? 0) * 60 * 60 * 1000).toISOString(),
        }));

      importedCount = itemsToAdd.length;

      if (itemsToAdd.length === 0) {
        return prevEntries;
      }

      return [...itemsToAdd, ...prevEntries];
    });

    return importedCount;
  };

  const handleApiKeyChange = (network: SocialNetwork, value: string) => {
    setConnections((prev) =>
      prev.map((connection) =>
        connection.network === network
          ? {
              ...connection,
              apiKey: value,
              status: 'idle',
              message: undefined,
            }
          : connection,
      ),
    );
  };

  const handleConnection = (network: SocialNetwork) => {
    setConnections((prevConnections) => {
      const target = prevConnections.find((connection) => connection.network === network);

      if (!target) {
        return prevConnections;
      }

      if (!target.connected) {
        if (!target.apiKey.trim()) {
          return prevConnections.map((connection) =>
            connection.network === network
              ? {
                  ...connection,
                  status: 'error',
                  message: 'Enter an API key to connect this feed.',
                }
              : connection,
          );
        }

        const importedCount = importFeedEntries(network);
        const timestamp = new Date().toISOString();

        return prevConnections.map((connection) =>
          connection.network === network
            ? {
                ...connection,
                connected: true,
                lastSynced: timestamp,
                status: 'success',
                message:
                  importedCount > 0
                    ? `Connected successfully. Imported ${importedCount} ${importedCount === 1 ? 'post' : 'posts'}.`
                    : 'Connected successfully. No new posts available.',
              }
            : connection,
        );
      }

      return prevConnections.map((connection) =>
        connection.network === network
          ? {
              ...connection,
              connected: false,
              lastSynced: undefined,
              status: 'idle',
              message: undefined,
            }
          : connection,
      );
    });
  };

  const handleManualSync = (network: SocialNetwork) => {
    setConnections((prevConnections) => {
      const target = prevConnections.find((connection) => connection.network === network);

      if (!target) {
        return prevConnections;
      }

      if (!target.connected) {
        return prevConnections.map((connection) =>
          connection.network === network
            ? {
                ...connection,
                status: 'error',
                message: 'Connect the account before syncing.',
              }
            : connection,
        );
      }

      const importedCount = importFeedEntries(network, { generateNew: true });
      const timestamp = new Date().toISOString();

      return prevConnections.map((connection) =>
        connection.network === network
          ? {
              ...connection,
              lastSynced: timestamp,
              status: 'success',
              message:
                importedCount > 0
                  ? `Synced ${importedCount} new ${importedCount === 1 ? 'post' : 'posts'}.`
                  : 'Sync complete. No new posts found.',
            }
          : connection,
      );
    });
  };

  const updateAutoSync = (network: SocialNetwork, value: FeedConnection['autoSync']) => {
    setConnections((prev) =>
      prev.map((connection) =>
        connection.network === network
          ? {
              ...connection,
              autoSync: value,
            }
          : connection,
      ),
    );
  };

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Monitored Sprinklr Accounts</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">Add the account IDs you want to monitor for your unit.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="text-sm font-medium text-navy-900 dark:text-navy-100">Account ID</span>
            <input
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              placeholder="acc_123"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
            />
          </label>
          <label className="flex-1">
            <span className="text-sm font-medium text-navy-900 dark:text-navy-100">Label (optional)</span>
            <input
              value={newAccountLabel}
              onChange={(e) => setNewAccountLabel(e.target.value)}
              placeholder="District Facebook"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
            />
          </label>
          <button
            type="button"
            onClick={addAccount}
            className="w-full sm:w-auto rounded-md px-4 py-2 text-sm font-semibold text-white bg-usace-blue hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 dark:focus:ring-offset-navy-900"
          >
            Add account
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {savedAccounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-gray-200 p-3 dark:border-navy-700">
              <div>
                <div className="font-semibold text-navy-900 dark:text-white">{a.label || a.account_id}</div>
                {a.label && (
                  <div className="text-xs text-gray-500 dark:text-navy-300">{a.account_id}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeAccount(a.id)}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/40 dark:bg-red-900/30 dark:text-red-200"
              >
                Remove
              </button>
            </div>
          ))}
          {savedAccounts.length === 0 && (
            <div className="text-sm text-gray-600 dark:text-navy-300">No accounts added yet.</div>
          )}
        </div>
      </section>

      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Saved posts</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">Auto-saved from Sprinklr. Only URLs and basic metadata are stored.</p>
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
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">{post.published_at ? formatDate(post.published_at) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">
                    <select
                      value={post.campaign_id ?? ''}
                      onChange={(e) => assignCampaign(post.id, e.target.value ? Number(e.target.value) : null)}
                      className="rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-2 py-1 text-gray-900 dark:text-white focus:border-usace-blue focus:outline-none"
                    >
                      <option value="">Not linked</option>
                      {availableCampaigns.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {savedPosts.length === 0 && (
            <div className="text-sm text-gray-600 dark:text-navy-300 mt-3">No saved posts yet. Use "Load posts" above.</div>
          )}
        </div>
      </section>

      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Latest posts (Sprinklr)</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">Fetch recent posts from your monitored accounts via Sprinklr.</p>
          </div>
          <button
            type="button"
            onClick={loadSprinklrPosts}
            disabled={sprinklrLoading}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white bg-usace-blue hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue"
          >
            {sprinklrLoading ? 'Loading…' : 'Load posts'}
          </button>
        </div>
        {sprinklrError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-300">{sprinklrError}</p>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {sprinklrPosts.map((p: any, idx: number) => (
            <div key={p.id || idx} className="rounded-md border border-gray-200 p-4 dark:border-navy-700">
              <div className="text-sm text-gray-500 dark:text-navy-300 mb-1">{p.network || p.channel || 'Post'}</div>
              <div className="font-semibold text-navy-900 dark:text-white mb-1">{p.title || p.text || p.message || '(untitled)'}</div>
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" className="text-usace-blue text-sm hover:underline">
                  View post
                </a>
              )}
              <div className="text-xs text-gray-500 dark:text-navy-300 mt-2">
                {p.published_at || p.created_at || ''}
              </div>
            </div>
          ))}
          {sprinklrPosts.length === 0 && (
            <div className="text-sm text-gray-600 dark:text-navy-300">No posts loaded.</div>
          )}
        </div>
      </section>
      
      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-4">Social Content Library</h2>
        <p className="text-gray-600 dark:text-navy-300 mb-6">
          Capture the links and placements for the social media content you create across platforms. These entries are private to
          your team and make it easier to reference successful posts later.
        </p>

        <form onSubmit={handleAddEntry} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col text-sm font-medium text-navy-800 dark:text-navy-100">
              Social network
              <select
                name="network"
                value={formState.network}
                onChange={handleFormChange}
                className="mt-1 rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue"
              >
                {SOCIAL_NETWORKS.map((network) => (
                  <option key={network} value={network}>
                    {network}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-sm font-medium text-navy-800 dark:text-navy-100">
              Content title
              <input
                type="text"
                name="title"
                value={formState.title}
                onChange={handleFormChange}
                placeholder="Spring flood preparedness video"
                className="mt-1 rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue"
                required
              />
            </label>

            <label className="flex flex-col text-sm font-medium text-navy-800 dark:text-navy-100">
              Link URL
              <input
                type="url"
                name="url"
                value={formState.url}
                onChange={handleFormChange}
                placeholder="https://"
                className="mt-1 rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue"
                required
              />
            </label>

            <label className="flex flex-col text-sm font-medium text-navy-800 dark:text-navy-100">
              Placement or campaign tie-in
              <input
                type="text"
                name="placement"
                value={formState.placement}
                onChange={handleFormChange}
                placeholder="Great Lakes Water Safety"
                className="mt-1 rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue"
              />
            </label>

            <label className="flex flex-col text-sm font-medium text-navy-800 dark:text-navy-100">
              Campaign
              <select
                name="campaignId"
                value={formState.campaignId}
                onChange={handleFormChange}
                className="mt-1 rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue"
              >
                <option value="">Not linked</option>
                {availableCampaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
            {campaigns.length === 0 && (
              <p className="md:col-span-2 text-xs text-gray-500 dark:text-navy-300">
                No campaigns yet—create one from the Campaigns screen to link activity.
              </p>
            )}
          </div>

          <label className="flex flex-col text-sm font-medium text-navy-800 dark:text-navy-100">
            Notes
            <textarea
              name="notes"
              value={formState.notes}
              onChange={handleFormChange}
              placeholder="Key talking points, imagery cues, or results."
              className="mt-1 h-24 rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue"
            />
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-transparent bg-usace-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 dark:focus:ring-offset-navy-800"
            >
              Add social link
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Saved links & placements</h3>
          <span className="text-sm text-gray-500 dark:text-navy-300">{entries.length} item{entries.length === 1 ? '' : 's'}</span>
        </div>

        {hasEntries ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-navy-700">
              <thead>
                <tr className="bg-navy-50 dark:bg-navy-900">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">
                    Network
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">
                    Placement
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">
                    Campaign
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">
                    Added
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-navy-700">
                {sortedEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-navy-50/60 dark:hover:bg-navy-900/50">
                    <td className="px-4 py-3 text-sm font-medium text-navy-900 dark:text-white">{entry.network}</td>
                    <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">
                      <div className="flex flex-col">
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-usace-blue hover:underline"
                        >
                          {entry.title}
                        </a>
                        {entry.notes && <span className="text-xs text-gray-500 dark:text-navy-300 mt-1">{entry.notes}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">{entry.placement || '—'}</td>
                    <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">
                      {entry.campaignId ? campaignLookup.get(entry.campaignId) ?? '—' : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">{formatDate(entry.createdAt)}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="rounded-md border border-transparent bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50 dark:focus:ring-offset-navy-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 dark:border-navy-600 p-8 text-center">
            <h4 className="text-lg font-semibold text-navy-900 dark:text-white mb-2">No social links yet</h4>
            <p className="text-sm text-gray-600 dark:text-navy-300">
              Start building your library by logging the posts your team has published. You can store links, placements, and notes
              for future reporting.
            </p>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Automated feeds</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">
              Connect official accounts to automatically pull recent activity into the dashboard.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-navy-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-usace-blue dark:bg-navy-900 dark:text-navy-200">
            Chief access
          </span>
        </div>

        {role === 'chief' ? (
          <div className="grid gap-4 md:grid-cols-2">
            {connections.map((connection) => (
              <div
                key={connection.network}
                className="rounded-lg border border-gray-200 bg-navy-50/50 p-4 dark:border-navy-700 dark:bg-navy-900/40"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-navy-900 dark:text-white">{connection.network}</h4>
                    <p className="text-sm text-gray-600 dark:text-navy-300">
                      Securely authenticate the official page to mirror posts in the metrics hub.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      connection.connected
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                        : 'bg-gray-200 text-gray-700 dark:bg-navy-800 dark:text-navy-200'
                    }`}
                  >
                    {connection.connected ? 'Connected' : 'Offline'}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-navy-300">
                    Auto-sync frequency
                    <select
                      value={connection.autoSync}
                      onChange={(event) => updateAutoSync(connection.network, event.target.value as FeedConnection['autoSync'])}
                      className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
                    >
                      <option value="Manual">Manual import</option>
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                    </select>
                  </label>

                  <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-navy-300">
                    API key
                    <input
                      type="password"
                      value={connection.apiKey}
                      onChange={(event) => handleApiKeyChange(connection.network, event.target.value)}
                      placeholder="Paste API key"
                      className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
                    />
                    <span className="mt-1 text-[11px] font-normal normal-case text-gray-500 dark:text-navy-300">
                      Stored locally to simulate feed authentication for this demo environment.
                    </span>
                  </label>

                  {connection.message && (
                    <div
                      className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                        connection.status === 'error'
                          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-200'
                          : 'border-green-200 bg-green-50 text-green-700 dark:border-green-800/40 dark:bg-green-950/40 dark:text-green-200'
                      }`}
                    >
                      {connection.message}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => handleConnection(connection.network)}
                      className={`w-full rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-navy-900 ${
                        connection.connected
                          ? 'bg-red-100 text-red-700 hover:bg-red-200 focus:ring-red-500'
                          : 'bg-usace-blue text-white hover:bg-navy-800 focus:ring-usace-blue'
                      }`}
                    >
                      {connection.connected ? 'Disconnect feed' : 'Connect account'}
                    </button>

                    <button
                      type="button"
                      disabled={!connection.connected}
                      onClick={() => handleManualSync(connection.network)}
                      className={`w-full rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-navy-900 ${
                        connection.connected
                          ? 'border border-usace-blue text-usace-blue hover:bg-usace-blue hover:text-white focus:ring-usace-blue dark:border-navy-400 dark:text-navy-200 dark:hover:bg-navy-800'
                          : 'border border-gray-300 text-gray-400 focus:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60'
                      }`}
                    >
                      Sync now
                    </button>
                  </div>

                  {connection.connected && connection.lastSynced && (
                    <p className="text-xs text-gray-500 dark:text-navy-300">
                      Last synced {formatDate(connection.lastSynced)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 p-6 text-center dark:border-navy-600">
            <h4 className="text-lg font-semibold text-navy-900 dark:text-white mb-2">Chief tools required</h4>
            <p className="text-sm text-gray-600 dark:text-navy-300">
              Only chief-level users can authorize automated feeds. Coordinate with your public affairs chief if you would like to
              enable API-based imports for your team.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default SocialMedia;
