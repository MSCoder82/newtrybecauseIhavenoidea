import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  platforms?: string[];
};

const DEFAULT_PLATFORMS = ['Facebook', 'Instagram', 'LinkedIn', 'YouTube', 'X/Twitter', 'Other'];
const EMPTY_VALUE = '\u2014';

const dedupePlatforms = (values: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  const next: string[] = [];
  values.forEach((value) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    next.push(trimmed);
  });
  return next;
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
  const { showToast } = useNotification();

  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);

  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [platformInput, setPlatformInput] = useState('');

  const [newPostUrl, setNewPostUrl] = useState('');
  const [newPostPlatform, setNewPostPlatform] = useState('');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostPublishedAt, setNewPostPublishedAt] = useState('');
  const [newPostCampaignId, setNewPostCampaignId] = useState<string>('');
  const [postError, setPostError] = useState<string | null>(null);
  const [addingPost, setAddingPost] = useState(false);

  const availableCampaigns = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const active = campaigns.filter((campaign) => campaign.end_date >= today);
    return active.length > 0 ? active : campaigns;
  }, [campaigns]);

  const storedPlatforms = useMemo(
    () => dedupePlatforms(settings?.platforms ?? []),
    [settings],
  );

  const platformOptions = useMemo(() => {
    const fromPosts = savedPosts
      .map((post) => post.network ?? '')
      .filter(Boolean);
    const combined = dedupePlatforms([...storedPlatforms, ...fromPosts]);
    if (combined.length > 0) {
      return combined;
    }
    return DEFAULT_PLATFORMS;
  }, [savedPosts, storedPlatforms]);

  useEffect(() => {
    if (!newPostPlatform && platformOptions.length > 0) {
      setNewPostPlatform(platformOptions[0]);
    }
  }, [platformOptions, newPostPlatform]);

  const loadSavedPosts = useCallback(async () => {
    const { data } = await supabase
      .from('social_posts')
      .select('id, url, network, title, published_at, campaign_id, created_at')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (data) {
      setSavedPosts(data as SavedPost[]);
    }
  }, []);

  useEffect(() => {
    loadSavedPosts();
  }, [loadSavedPosts, teamId]);

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
          setSettings(null);
        } else {
          setSettings(((data as any)?.settings as SocialSettings) || null);
        }
      } catch (e: any) {
        const message = e?.message || 'Failed to load settings';
        setSettingsError(message);
        showToast(message, 'error');
      } finally {
        setSettingsLoading(false);
      }
    };
    load();
  }, [teamId, showToast]);

  const saveSettings = async () => {
    if (role !== 'chief') {
      return;
    }

    try {
      setSettingsError(null);
      const sanitizedPlatforms = dedupePlatforms(settings?.platforms ?? []);
      const payloadSettings: SocialSettings = { ...(settings || {}), platforms: sanitizedPlatforms };
      const payload = { team_id: teamId, settings: payloadSettings };
      const { error } = await supabase.from('social_settings').upsert(payload).select('team_id').single();
      if (error) throw error;
      setSettings(payloadSettings);
      showToast('Platforms saved', 'success');
    } catch (e: any) {
      const message = e?.message || 'Failed to save platforms';
      setSettingsError(message);
      showToast(message, 'error');
    }
  };

  const handleAddPlatform = () => {
    const value = platformInput.trim();
    if (!value) {
      setSettingsError('Enter a platform name before adding it.');
      return;
    }

    setSettingsError(null);
    setSettings((prev) => {
      const current = prev?.platforms ?? [];
      if (current.some((platform) => platform.toLowerCase() === value.toLowerCase())) {
        showToast('That platform is already listed.', 'info');
        return prev;
      }
      return { ...(prev || {}), platforms: [...current, value] };
    });
    setPlatformInput('');
  };

  const handleRemovePlatform = (platform: string) => {
    setSettings((prev) => {
      const current = prev?.platforms ?? [];
      const next = current.filter((name) => name.toLowerCase() !== platform.toLowerCase());
      return { ...(prev || {}), platforms: next };
    });
  };

  const handleAddPost = async (event: React.FormEvent) => {
    event.preventDefault();
    setPostError(null);

    const url = newPostUrl.trim();
    if (!url) {
      setPostError('Post URL is required.');
      return;
    }
    if (!newPostPlatform) {
      setPostError('Select a platform before saving.');
      return;
    }

    try {
      setAddingPost(true);
      const publishedAtIso = newPostPublishedAt ? new Date(newPostPublishedAt).toISOString() : null;
      const payload = {
        team_id: teamId,
        url,
        network: newPostPlatform,
        title: newPostTitle.trim() || null,
        published_at: publishedAtIso,
        campaign_id: newPostCampaignId ? Number(newPostCampaignId) : null,
      };
      const { data, error } = await supabase
        .from('social_posts')
        .insert([payload])
        .select('id, url, network, title, published_at, campaign_id, created_at')
        .single();
      if (error) throw error;
      if (data) {
        setSavedPosts((prev) => [data as SavedPost, ...prev]);
      }
      setNewPostUrl('');
      setNewPostTitle('');
      setNewPostPublishedAt('');
      setNewPostCampaignId('');
      showToast('Post saved', 'success');
    } catch (e: any) {
      const message = e?.message || 'Failed to save post';
      setPostError(message);
      showToast(message, 'error');
    } finally {
      setAddingPost(false);
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
      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Available platforms</h3>
          <p className="text-sm text-gray-600 dark:text-navy-300">
            Everyone uses this list when logging posts. Keep it short and specific to the outlets your team cares about.
          </p>
        </div>
        {settingsError && (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200">
            {settingsError}
          </p>
        )}
        {settingsLoading ? (
          <p className="text-sm text-gray-600 dark:text-navy-300">Loading saved platforms...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(storedPlatforms.length > 0 ? storedPlatforms : platformOptions).map((platform) => (
                <span
                  key={platform}
                  className="inline-flex items-center rounded-full bg-navy-100 px-3 py-1 text-sm font-medium text-navy-800 dark:bg-navy-700 dark:text-navy-100"
                >
                  {platform}
                  {role === 'chief' && storedPlatforms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePlatform(platform)}
                      className="ml-2 text-xs text-navy-500 hover:text-usace-red dark:text-navy-200"
                      aria-label={`Remove ${platform}`}
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
              {storedPlatforms.length === 0 && (
                <span className="text-sm text-gray-600 dark:text-navy-300">
                  No saved platforms yet. The defaults above will be used until you add your own.
                </span>
              )}
            </div>
            {role === 'chief' && (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={platformInput}
                    onChange={(e) => setPlatformInput(e.target.value)}
                    placeholder="e.g., District Facebook Page"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddPlatform}
                    className="w-full rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 sm:w-auto dark:focus:ring-offset-navy-900"
                  >
                    Add platform
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-navy-300">
                    Changes are local until you click Save.
                  </p>
                  <button
                    type="button"
                    onClick={saveSettings}
                    className="rounded-md bg-usace-blue px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue"
                  >
                    Save platforms
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Log a social post</h3>
          <p className="text-sm text-gray-600 dark:text-navy-300">
            Paste a post URL, choose the platform, and optionally capture the published date or link it to a campaign.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleAddPost}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col text-sm font-medium text-navy-900 dark:text-navy-50">
              Post URL
              <input
                type="url"
                required
                value={newPostUrl}
                onChange={(e) => setNewPostUrl(e.target.value)}
                placeholder="https://social.com/post/123"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-navy-900 dark:text-navy-50">
              Platform
              <select
                value={newPostPlatform}
                onChange={(e) => setNewPostPlatform(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
              >
                {platformOptions.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col text-sm font-medium text-navy-900 dark:text-navy-50">
              Title or description (optional)
              <input
                type="text"
                value={newPostTitle}
                onChange={(e) => setNewPostTitle(e.target.value)}
                placeholder="Flood response video"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-navy-900 dark:text-navy-50">
              Published at (optional)
              <input
                type="datetime-local"
                value={newPostPublishedAt}
                onChange={(e) => setNewPostPublishedAt(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
              />
            </label>
          </div>
          <label className="flex flex-col text-sm font-medium text-navy-900 dark:text-navy-50">
            Campaign (optional)
            <select
              value={newPostCampaignId}
              onChange={(e) => setNewPostCampaignId(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-usace-blue focus:outline-none focus:ring-2 focus:ring-usace-blue dark:border-navy-600 dark:bg-navy-800 dark:text-white"
            >
              <option value="">Not linked</option>
              {availableCampaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          {postError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200">
              {postError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={addingPost}
              className="rounded-md bg-usace-blue px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue disabled:cursor-not-allowed disabled:opacity-75"
            >
              {addingPost ? 'Saving…' : 'Save post'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Logged posts</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">
              This list shows every manual entry captured by your team. Use the selector to tie posts back to a campaign.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-navy-700">
            <thead>
              <tr className="bg-navy-50 dark:bg-navy-900">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">Platform</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">URL</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">Published</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-navy-200">Campaign</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-navy-700">
              {savedPosts.map((post) => (
                <tr key={post.id} className="hover:bg-navy-50/60 dark:hover:bg-navy-900/50">
                  <td className="px-4 py-3 text-sm font-medium text-navy-900 dark:text-white">{post.network || EMPTY_VALUE}</td>
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">{post.title || '(untitled)'}</td>
                  <td className="px-4 py-3 text-sm">
                    <a href={post.url} target="_blank" rel="noreferrer" className="text-usace-blue hover:underline break-words">
                      {post.url}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">
                    {post.published_at ? formatDate(post.published_at) : EMPTY_VALUE}
                  </td>
                  <td className="px-4 py-3 text-sm text-navy-800 dark:text-navy-100">
                    <select
                      value={post.campaign_id ?? ''}
                      onChange={(e) => assignCampaign(post.id, e.target.value ? Number(e.target.value) : null)}
                      className="rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-2 py-1 text-gray-900 dark:text-white focus:border-usace-blue focus:outline-none"
                    >
                      <option value="">Not linked</option>
                      {availableCampaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {savedPosts.length === 0 && (
            <div className="mt-3 text-sm text-gray-600 dark:text-navy-300">No posts logged yet.</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SocialMedia;
