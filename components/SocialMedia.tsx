import React, { useEffect, useMemo, useState } from 'react';
import { Campaign, Role } from '../types';
import { supabase } from '../lib/supabase';

type SocialNetwork = 'Facebook' | 'Twitter' | 'Instagram' | 'LinkedIn' | 'YouTube' | 'Other';

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

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

const SocialMedia: React.FC<SocialMediaProps> = ({ role, campaigns, teamId }) => {
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [newAccountId, setNewAccountId] = useState('');
  const [newAccountLabel, setNewAccountLabel] = useState('');
  const [accountSaveError, setAccountSaveError] = useState<string | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);

  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);

  const availableCampaigns = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const active = campaigns.filter((campaign) => campaign.end_date >= today);
    return active.length > 0 ? active : campaigns;
  }, [campaigns]);

  // Load saved accounts for this team
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('social_accounts')
        .select('id, account_id, label, created_at')
        .order('created_at', { ascending: false });
      if (!error && data) setSavedAccounts(data as SavedAccount[]);
    };
    load();
  }, [teamId]);

  const addAccount = async () => {
    setAccountSaveError(null);
    const accountId = newAccountId.trim();
    if (!accountId) {
      setAccountSaveError('Enter a valid account (URL or platform:username).');
      return;
    }

    try {
      setAccountSaving(true);
      const { data, error } = await supabase
        .from('social_accounts')
        .insert([{ account_id: accountId, label: newAccountLabel || null }])
        .select('id, account_id, label, created_at')
        .single();
      if (error) {
        setAccountSaveError(error.message || 'Failed to save account. Check Supabase configuration.');
        return;
      }
      if (data) {
        setSavedAccounts((prev) => [data as SavedAccount, ...prev]);
        setNewAccountId('');
        setNewAccountLabel('');
      }
    } catch (e: any) {
      setAccountSaveError(e?.message || 'Unexpected error while saving account.');
    } finally {
      setAccountSaving(false);
    }
  };

  const removeAccount = async (id: number) => {
    const { error } = await supabase.from('social_accounts').delete().eq('id', id);
    if (!error) setSavedAccounts((prev) => prev.filter((a) => a.id !== id));
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

  const loadFeedPosts = async () => {
    try {
      setFeedLoading(true);
      setFeedError(null);
      const accountsCsv = savedAccounts.map((a) => a.account_id).filter(Boolean).join(',');
      if (!accountsCsv) {
        setFeedError('Add at least one account (URL, platform:username, or YouTube channel_id).');
        return;
      }
      const qs = new URLSearchParams();
      qs.set('accounts', accountsCsv);
      const res = await fetch(`/api/social-feeds?${qs.toString()}`);
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
      {/* Monitored accounts */}
      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Monitored Accounts</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">
              Add account URLs or platform:username identifiers to monitor.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="text-sm font-medium text-navy-900 dark:text-navy-100">Account</span>
            <input
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              placeholder="URL or platform:username or channel_id"
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
            disabled={accountSaving}
            className="w-full sm:w-auto rounded-md px-4 py-2 text-sm font-semibold text-white bg-usace-blue hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 dark:focus:ring-offset-navy-900"
          >
            {accountSaving ? 'Saving…' : 'Add account'}
          </button>
        </div>
        {accountSaveError && <p className="mt-2 text-sm text-red-600 dark:text-red-300">{accountSaveError}</p>}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {savedAccounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-gray-200 p-3 dark:border-navy-700">
              <div>
                <div className="font-semibold text-navy-900 dark:text-white">{a.label || a.account_id}</div>
                {a.label && <div className="text-xs text-gray-500 dark:text-navy-300">{a.account_id}</div>}
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
            <p className="text-sm text-gray-600 dark:text-navy-300">No API keys. Use account URLs or platform:username.</p>
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

