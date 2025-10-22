import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNotification } from '../contexts/NotificationProvider'

type PlatformKey = 'youtube' | 'facebook' | 'instagram' | 'linkedin'

interface SocialMediaCuratorProps {
  teamId: number
}

interface PlatformConfig {
  id: PlatformKey
  label: string
  color: string
  icon: string
  scopes: string
  description: string
}

interface Feed {
  id: number
  platform: PlatformKey
  accountId: string
  displayName: string
  createdAt?: string
}

interface NormalizedPost {
  id: string
  title?: string
  message?: string
  description?: string
  date?: string
  link?: string
  thumbnail?: string
  engagement?: {
    likes?: number
    comments?: number
  }
  raw?: unknown
  isError?: boolean
}

interface PublicPlatformConfig {
  client_id?: string | null
  auth_url?: string | null
  token_url?: string | null
  scopes?: string | null
  redirect_uri?: string | null
}

type ConnectedState = Record<PlatformKey, boolean>
type FeedPostsState = Record<number, NormalizedPost[]>
type FeedLoadingState = Record<number, boolean>

const INITIAL_CONNECTED: ConnectedState = {
  youtube: false,
  facebook: false,
  instagram: false,
  linkedin: false,
}

const createPlatformConfigs = (): PlatformConfig[] => [
  {
    id: 'youtube',
    label: 'YouTube',
    color: 'bg-red-500',
    icon: '▶',
    scopes: 'https://www.googleapis.com/auth/youtube.readonly',
    description: 'Requires a Google Cloud project with YouTube Data API access.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: 'bg-blue-600',
    icon: 'f',
    scopes: 'pages_show_list,pages_read_engagement,pages_read_user_content',
    description: 'Use a Facebook Page access configuration via Meta for Developers.',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    color: 'bg-pink-500',
    icon: '📷',
    scopes: 'instagram_basic,instagram_content_publish',
    description: 'Instagram Business account linked to a Facebook Page is required.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    color: 'bg-sky-600',
    icon: 'in',
    scopes: 'r_liteprofile r_organization_social w_organization_social',
    description: 'Register a LinkedIn Marketing Developer application with the scopes above.',
  },
]

const PLATFORM_MAP = createPlatformConfigs().reduce<Record<PlatformKey, PlatformConfig>>((acc, platform) => {
  acc[platform.id] = platform
  return acc
}, {} as Record<PlatformKey, PlatformConfig>)

const randomState = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

const sanitizeLimit = (value: number | undefined, fallback = 5) => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), 20)
}

const SocialMediaCurator: React.FC<SocialMediaCuratorProps> = ({ teamId }) => {
  const { showToast } = useNotification()
  const [platforms] = useState<PlatformConfig[]>(createPlatformConfigs)
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedState>(INITIAL_CONNECTED)
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [feedPosts, setFeedPosts] = useState<FeedPostsState>({})
  const [feedLoading, setFeedLoading] = useState<FeedLoadingState>({})
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey | ''>('')
  const [newAccountId, setNewAccountId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [isHydrating, setIsHydrating] = useState(false)
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false)
  const [configs, setConfigs] = useState<Record<PlatformKey, PublicPlatformConfig>>({
    youtube: {},
    facebook: {},
    instagram: {},
    linkedin: {},
  })
  const [configForm, setConfigForm] = useState<PublicPlatformConfig & { client_secret?: string }>({})
  const [configPlatform, setConfigPlatform] = useState<PlatformKey>('youtube')
  const [configSaving, setConfigSaving] = useState(false)

  const redirectUri = useMemo(() => {
    if (typeof window === 'undefined') return ''
    // Prefer stored per-team config if available for the selected platform
    const cfg = selectedPlatform ? configs[selectedPlatform as PlatformKey] : undefined
    return (cfg?.redirect_uri as string | undefined) || import.meta.env.VITE_SOCIAL_OAUTH_REDIRECT_URI || window.location.origin
  }, [selectedPlatform, configs])

  const buildAuthUrl = useCallback(
    (platform: PlatformKey, state: string) => {
      if (typeof window === 'undefined') return ''

      const cfg = configs[platform] || {}
      switch (platform) {
        case 'youtube': {
          const clientId = (cfg.client_id as string | undefined) || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)
          if (!clientId) throw new Error('Missing YouTube client_id. Configure in Platform configuration.')
          const authUrl = (cfg.auth_url as string | undefined) || 'https://accounts.google.com/o/oauth2/v2/auth'
          const scopes = (cfg.scopes as string | undefined) || PLATFORM_MAP.youtube.scopes
          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: scopes,
            state,
            access_type: 'offline',
            prompt: 'consent',
          })
          return `${authUrl}?${params.toString()}`
        }
        case 'facebook':
        case 'instagram': {
          const clientId = (cfg.client_id as string | undefined) || (import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined)
          if (!clientId) throw new Error('Missing Facebook App ID. Configure in Platform configuration.')
          const authUrl = (cfg.auth_url as string | undefined) || 'https://www.facebook.com/v18.0/dialog/oauth'
          const scopes = (cfg.scopes as string | undefined) || PLATFORM_MAP[platform].scopes
          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            scope: scopes,
            response_type: 'code',
          })
          return `${authUrl}?${params.toString()}`
        }
        case 'linkedin': {
          const clientId = (cfg.client_id as string | undefined) || (import.meta.env.VITE_LINKEDIN_CLIENT_ID as string | undefined)
          if (!clientId) throw new Error('Missing LinkedIn Client ID. Configure in Platform configuration.')
          const authUrl = (cfg.auth_url as string | undefined) || 'https://www.linkedin.com/oauth/v2/authorization'
          const scopes = (cfg.scopes as string | undefined) || PLATFORM_MAP.linkedin.scopes.replace(/,/g, ' ')
          const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            scope: scopes,
          })
          return `${authUrl}?${params.toString()}`
        }
        default:
          throw new Error(`Unsupported platform: ${platform}`)
      }
    },
    [configs, redirectUri],
  )

  const invokeFunction = useCallback(
    <T,>(
      fn: string,
      options?: {
        body?: unknown
        headers?: Record<string, string>
        method?: 'GET' | 'POST'
      },
    ) => {
      return supabase.auth.getSession().then(({ data: sessionData, error: sessionError }) => {
        if (sessionError) throw sessionError
        const accessToken = sessionData?.session?.access_token
        if (!accessToken) throw new Error('No active session. Please sign in again.')

        const mergedOptions = {
          ...options,
          headers: {
            ...(options?.headers ?? {}),
            Authorization: `Bearer ${accessToken}`,
          },
        }

        return supabase.functions.invoke<T>(fn, mergedOptions)
      })
    },
    [],
  )

  const loadPlatformConfigs = useCallback(async () => {
    try {
      const { data, error } = await invokeFunction<{ success?: boolean; configs?: Record<PlatformKey, PublicPlatformConfig> }>('get-social-config')
      if (error) throw new Error(error.message)
      if (data?.configs) setConfigs(data.configs)
    } catch (err) {
      console.warn('Failed to load platform configs', err)
    }
  }, [invokeFunction])

  const savePlatformConfig = useCallback(async () => {
    try {
      setConfigSaving(true)
      const body: Record<string, any> = { platform: configPlatform, ...configForm }
      const { error } = await invokeFunction('save-social-config', { body })
      if (error) throw new Error(error.message)
      showToast('Platform configuration saved', 'success')
      setConfigForm({})
      await loadPlatformConfigs()
    } catch (err: any) {
      showToast(err?.message || 'Failed to save configuration', 'error')
    } finally {
      setConfigSaving(false)
    }
  }, [configForm, configPlatform, invokeFunction, loadPlatformConfigs, showToast])

  const resetOAuthState = () => {
    localStorage.removeItem('social_oauth_state')
    localStorage.removeItem('social_oauth_platform')
  }

  const loadConnectedAccounts = useCallback(async () => {
    if (!teamId || teamId <= 0) {
      setConnectedAccounts(INITIAL_CONNECTED)
      return
    }

    const { data, error } = await supabase
      .from('social_oauth_tokens')
      .select('platform')
      .eq('team_id', teamId)

    if (error) {
      console.error('Failed to load connected accounts:', error)
      showToast('Unable to load connected accounts. Check Supabase setup.', 'error')
      return
    }

    const next = { ...INITIAL_CONNECTED }
    data?.forEach((row) => {
      const platform = row.platform as PlatformKey
      if (platform && platform in next) {
        next[platform] = true
      }
    })
    setConnectedAccounts(next)
  }, [teamId, showToast])

  const loadFeeds = useCallback(async () => {
    if (!teamId || teamId <= 0) {
      setFeeds([])
      return
    }

    setIsHydrating(true)
    const { data, error } = await supabase
      .from('social_curator_feeds')
      .select('id, platform, account_id, display_name, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load feeds:', error)
      if (error.code === '42P01') {
        showToast('Missing Supabase tables. Run the team social curator SQL migration.', 'error')
      } else {
        showToast('Unable to load existing feeds.', 'error')
      }
      setFeeds([])
    } else {
      const mapped = (data ?? [])
        .map((feed) => ({
          id: feed.id,
          platform: feed.platform as PlatformKey,
          accountId: feed.account_id,
          displayName: feed.display_name || feed.account_id,
          createdAt: feed.created_at ?? undefined,
        }))
        .filter((feed) => platforms.some((p) => p.id === feed.platform))
      setFeeds(mapped)
    }
    setIsHydrating(false)
  }, [teamId, platforms, showToast])

  useEffect(() => {
    void loadPlatformConfigs()
  }, [loadPlatformConfigs])

  const refreshFeed = useCallback(
    async (feed: Feed, limit = 5) => {
      setFeedLoading((prev) => ({ ...prev, [feed.id]: true }))

      try {
        const { data, error } = await invokeFunction<{
          success?: boolean
          posts?: NormalizedPost[]
          error?: string
        }>('fetch-social-posts', {
          body: {
            platform: feed.platform,
            account_id: feed.accountId,
            limit: sanitizeLimit(limit),
          },
        })

        if (error) {
          throw new Error(error.message)
        }

        if (!data?.success || !Array.isArray(data.posts)) {
          throw new Error(data?.error || 'Failed to load posts')
        }

        setFeedPosts((prev) => ({ ...prev, [feed.id]: data.posts ?? [] }))
      } catch (error) {
        console.error('Failed to refresh feed:', error)
        const message = error instanceof Error ? error.message : 'Failed to refresh feed'
        showToast(message, 'error')
        setFeedPosts((prev) => ({
          ...prev,
          [feed.id]: [
            {
              id: 'error',
              title: 'Error fetching posts',
              description: message,
              date: new Date().toISOString(),
              isError: true,
            },
          ],
        }))
      } finally {
        setFeedLoading((prev) => ({ ...prev, [feed.id]: false }))
      }
    },
    [invokeFunction, showToast],
  )

  const disconnectAccount = useCallback(
    async (platform: PlatformKey) => {
      try {
        const { error } = await invokeFunction('disconnect-social-account', {
          body: { platform },
        })

        if (error) {
          throw new Error(error.message)
        }

        showToast(`${PLATFORM_MAP[platform].label} disconnected`, 'success')
        await loadConnectedAccounts()
        await loadFeeds()
      } catch (error) {
        console.error('Failed to disconnect platform:', error)
        const message = error instanceof Error ? error.message : 'Failed to disconnect platform'
        showToast(message, 'error')
      }
    },
    [invokeFunction, loadConnectedAccounts, loadFeeds, showToast],
  )

  const addFeed = useCallback(async () => {
    if (!teamId || teamId <= 0) {
      showToast('A valid team is required before adding feeds.', 'error')
      return
    }
    if (!selectedPlatform) {
      showToast('Pick a platform first.', 'error')
      return
    }
    const trimmedAccountId = newAccountId.trim()
    if (!trimmedAccountId) {
      showToast('Enter a Page ID, Channel ID, or username.', 'error')
      return
    }
    if (!connectedAccounts[selectedPlatform]) {
      showToast(`Connect ${PLATFORM_MAP[selectedPlatform].label} before adding feeds.`, 'error')
      return
    }

    const payload = {
      team_id: teamId,
      platform: selectedPlatform,
      account_id: trimmedAccountId,
      display_name: newDisplayName.trim() || trimmedAccountId,
    }

    const { data, error } = await supabase
      .from('social_curator_feeds')
      .insert(payload)
      .select('id, platform, account_id, display_name, created_at')
      .single()

    if (error) {
      console.error('Failed to create feed:', error)
      showToast(error.message || 'Failed to add feed', 'error')
      return
    }

    const feed: Feed = {
      id: data.id,
      platform: data.platform as PlatformKey,
      accountId: data.account_id,
      displayName: data.display_name || data.account_id,
      createdAt: data.created_at ?? undefined,
    }

    setFeeds((prev) => [feed, ...prev])
    setNewAccountId('')
    setNewDisplayName('')
    setSelectedPlatform('')

    void refreshFeed(feed)
    showToast('Feed added', 'success')
  }, [
    connectedAccounts,
    teamId,
    selectedPlatform,
    newAccountId,
    newDisplayName,
    refreshFeed,
    showToast,
  ])

  const removeFeed = useCallback(
    async (feedId: number) => {
      const feed = feeds.find((f) => f.id === feedId)
      if (!feed) return

      const { error } = await supabase.from('social_curator_feeds').delete().eq('id', feedId)
      if (error) {
        console.error('Failed to remove feed:', error)
        showToast(error.message || 'Failed to remove feed', 'error')
        return
      }

      setFeeds((prev) => prev.filter((f) => f.id !== feedId))
      setFeedPosts((prev) => {
        const next = { ...prev }
        delete next[feedId]
        return next
      })
      showToast('Feed removed', 'success')
    },
    [feeds, showToast],
  )

  const initiateOAuth = useCallback(
    async (platform: PlatformKey) => {
      try {
        const state = randomState()
        localStorage.setItem('social_oauth_state', state)
        localStorage.setItem('social_oauth_platform', platform)

        const url = buildAuthUrl(platform, state)
        if (!url) {
          throw new Error('Unable to construct authorization URL.')
        }

        window.location.href = url
      } catch (error) {
        console.error('Failed to start OAuth flow:', error)
        const message = error instanceof Error ? error.message : 'Failed to start OAuth flow'
        showToast(message, 'error')
        resetOAuthState()
      }
    },
    [buildAuthUrl, showToast],
  )

  const handleOAuthCallback = useCallback(
    async (code: string, state: string) => {
      const expectedState = localStorage.getItem('social_oauth_state')
      const platform = localStorage.getItem('social_oauth_platform') as PlatformKey | null

      if (!platform || !expectedState) {
        throw new Error('OAuth session not found. Please retry the connection flow.')
      }

      if (state !== expectedState) {
        throw new Error('OAuth state mismatch. Please retry the connection flow.')
      }

      setIsProcessingOAuth(true)
      try {
        const exchange = await invokeFunction<{
          access_token?: string
          refresh_token?: string
          expires_in?: number
          expires_at?: number | string
          token_type?: string
          error?: string
        }>('exchange-oauth-token', {
          body: {
            platform,
            code,
            redirect_uri: redirectUri,
          },
        })

        if (exchange.error) {
          throw new Error(exchange.error.message)
        }

        const data = exchange.data
        if (!data?.access_token) {
          throw new Error('OAuth token exchange response missing access_token')
        }

        const expiresAt =
          data.expires_at ??
          (typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : null)

        const save = await invokeFunction('save-social-tokens', {
          body: {
            platform,
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? null,
            expires_at: expiresAt,
            metadata: {
              token_type: data.token_type ?? 'bearer',
            },
          },
        })

        if (save.error) {
          throw new Error(save.error.message)
        }

        showToast(`${PLATFORM_MAP[platform].label} connected`, 'success')
        await loadConnectedAccounts()
      } finally {
        setIsProcessingOAuth(false)
        resetOAuthState()
      }
    },
    [invokeFunction, loadConnectedAccounts, redirectUri, showToast],
  )

  useEffect(() => {
    if (!teamId || teamId <= 0) return
    void loadConnectedAccounts()
    void loadFeeds()
  }, [teamId, loadConnectedAccounts, loadFeeds])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const errorDescription = url.searchParams.get('error_description') || url.searchParams.get('error')

    const clearParams = () => {
      url.searchParams.delete('code')
      url.searchParams.delete('state')
      url.searchParams.delete('error_description')
      url.searchParams.delete('error')
      const cleaned = `${url.pathname}${url.search}${url.hash}`
      window.history.replaceState({}, document.title, cleaned)
    }

    if (errorDescription) {
      showToast(errorDescription, 'error')
      resetOAuthState()
      clearParams()
      return
    }

    if (!code || !state || isProcessingOAuth) {
      return
    }

    handleOAuthCallback(code, state)
      .catch((error) => {
        console.error('OAuth callback failed:', error)
        showToast(error instanceof Error ? error.message : 'OAuth callback failed', 'error')
      })
      .finally(() => {
        clearParams()
      })
  }, [handleOAuthCallback, isProcessingOAuth, showToast])

  if (!teamId || teamId <= 0) {
    return (
      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold text-navy-900 dark:text-white mb-2">Team Social Feeds</h3>
        <p className="text-sm text-gray-600 dark:text-navy-300">
          Team ID is required to manage social feeds. Ensure the signed-in user has `team_id` set in Supabase user
          metadata.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      {/* Platform configuration */}
      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-navy-700">
        <h3 className="text-xl font-semibold text-navy-900 dark:text-white mb-4">Platform configuration</h3>
        <div className="grid gap-3 md:grid-cols-5 mb-3">
          <div className="md:col-span-1">
            <label className="block text-sm text-gray-600 dark:text-navy-300 mb-1">Platform</label>
            <select
              value={configPlatform}
              onChange={(e) => setConfigPlatform(e.target.value as PlatformKey)}
              className="w-full rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white"
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-navy-300 mb-1">Client ID</label>
            <input
              className="w-full rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white"
              placeholder={configs[configPlatform]?.client_id ? 'Saved' : 'e.g., 123.apps.googleusercontent.com'}
              value={configForm.client_id ?? ''}
              onChange={(e) => setConfigForm((f) => ({ ...f, client_id: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-navy-300 mb-1">Client Secret</label>
            <input
              type="password"
              className="w-full rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white"
              placeholder="Not shown for security"
              value={configForm.client_secret ?? ''}
              onChange={(e) => setConfigForm((f) => ({ ...f, client_secret: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-navy-300 mb-1">Auth URL</label>
            <input
              className="w-full rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white"
              placeholder={
                configPlatform === 'linkedin'
                  ? 'https://www.linkedin.com/oauth/v2/authorization'
                  : configPlatform === 'youtube'
                  ? 'https://accounts.google.com/o/oauth2/v2/auth'
                  : 'https://www.facebook.com/v18.0/dialog/oauth'
              }
              value={configForm.auth_url ?? ''}
              onChange={(e) => setConfigForm((f) => ({ ...f, auth_url: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-navy-300 mb-1">Token URL</label>
            <input
              className="w-full rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white"
              placeholder={
                configPlatform === 'linkedin'
                  ? 'https://www.linkedin.com/oauth/v2/accessToken'
                  : 'https://graph.facebook.com/v18.0/oauth/access_token'
              }
              value={configForm.token_url ?? ''}
              onChange={(e) => setConfigForm((f) => ({ ...f, token_url: e.target.value }))}
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm text-gray-600 dark:text-navy-300 mb-1">Scopes (space- or comma-separated)</label>
            <input
              className="w-full rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white"
              placeholder={platforms.find((p) => p.id === configPlatform)?.scopes}
              value={configForm.scopes ?? ''}
              onChange={(e) => setConfigForm((f) => ({ ...f, scopes: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-600 dark:text-navy-300 mb-1">Redirect URI</label>
            <input
              className="w-full rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 px-3 py-2 text-gray-900 dark:text-white"
              placeholder={window?.location?.origin}
              value={configForm.redirect_uri ?? ''}
              onChange={(e) => setConfigForm((f) => ({ ...f, redirect_uri: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={savePlatformConfig}
            disabled={configSaving}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white bg-usace-blue hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue disabled:opacity-50"
          >
            {configSaving ? 'Saving…' : 'Save configuration'}
          </button>
          <p className="text-xs text-gray-500 dark:text-navy-300 mt-2">
            Secrets are never shown back in the UI. Update the secret by re-entering it.
          </p>
        </div>
      </section>
      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-semibold text-navy-900 dark:text-white">Social Media Feed Curator</h3>
            <p className="text-sm text-gray-600 dark:text-navy-300">
              Connect official accounts once per team, then curate feeds for everyone on the team.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSetup((value) => !value)}
            className="rounded-md border border-navy-200 dark:border-navy-700 px-3 py-1.5 text-sm text-navy-700 dark:text-navy-100 hover:bg-navy-50 dark:hover:bg-navy-700 transition"
          >
            {showSetup ? 'Hide setup' : 'Manage connections'}
          </button>
        </div>

        {showSetup && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {platforms.map((platform) => {
                const isConnected = connectedAccounts[platform.id]
                const isLoading = isProcessingOAuth && localStorage.getItem('social_oauth_platform') === platform.id
                return (
                  <div
                    key={platform.id}
                    className={`rounded-lg border p-4 transition ${
                      isConnected
                        ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg ${platform.color} text-white flex items-center justify-center text-lg font-semibold`}
                        >
                          {platform.icon}
                        </div>
                        <div>
                          <div className="font-semibold text-navy-900 dark:text-white">{platform.label}</div>
                          <div className="text-xs text-gray-500 dark:text-navy-300">
                            {isConnected ? 'Connected' : 'Not connected'}
                          </div>
                        </div>
                      </div>
                      {isConnected ? (
                        <button
                          type="button"
                          onClick={() => disconnectAccount(platform.id)}
                          className="text-sm text-red-600 hover:underline disabled:opacity-50"
                          disabled={isProcessingOAuth}
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => initiateOAuth(platform.id)}
                          className="rounded-md bg-usace-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 transition disabled:opacity-50"
                          disabled={isProcessingOAuth || isLoading}
                        >
                          {isLoading ? 'Waiting…' : 'Connect'}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-navy-300">{platform.description}</p>
                  </div>
                )
              })}
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
              Register the redirect URI <code className="font-mono">{redirectUri}</code> for each platform. The edge functions
              expect environment variables for client IDs and secrets as described in <code>team-integration-guide.md</code>.
            </div>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md">
        <h4 className="text-lg font-semibold text-navy-900 dark:text-white mb-4">Add new feed</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            value={selectedPlatform}
            onChange={(event) => setSelectedPlatform(event.target.value as PlatformKey | '')}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-white"
          >
            <option value="">Select platform</option>
            {platforms.map((platform) => (
              <option value={platform.id} key={platform.id} disabled={!connectedAccounts[platform.id]}>
                {platform.label} {connectedAccounts[platform.id] ? '' : '(connect first)'}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Page ID / Channel ID / Username"
            value={newAccountId}
            onChange={(event) => setNewAccountId(event.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-white"
            disabled={!selectedPlatform}
          />

          <input
            type="text"
            placeholder="Display name (optional)"
            value={newDisplayName}
            onChange={(event) => setNewDisplayName(event.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-white"
            disabled={!selectedPlatform}
          />

          <button
            type="button"
            onClick={addFeed}
            className="rounded-md bg-usace-blue px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 transition disabled:bg-gray-300 disabled:text-gray-600"
            disabled={!selectedPlatform || !newAccountId}
          >
            Add feed
          </button>
        </div>
        {Object.values(connectedAccounts).every((value) => !value) && (
          <p className="mt-3 text-sm text-gray-600 dark:text-navy-300">
            Connect at least one platform to start adding feeds for your team.
          </p>
        )}
      </section>

      <section className="space-y-6">
        {isHydrating && feeds.length === 0 ? (
          <div className="bg-white dark:bg-navy-800 p-8 rounded-lg shadow-md text-center text-gray-600 dark:text-navy-300">
            Loading team feeds…
          </div>
        ) : feeds.length === 0 ? (
          <div className="bg-white dark:bg-navy-800 p-8 rounded-lg shadow-md text-center text-gray-600 dark:text-navy-300">
            No feeds have been added yet. Connect a platform and add your first page or channel.
          </div>
        ) : (
          feeds.map((feed) => {
            const platform = PLATFORM_MAP[feed.platform]
            const posts = feedPosts[feed.id] ?? []
            const isLoading = feedLoading[feed.id]
            return (
              <div key={feed.id} className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-navy-700">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg ${platform.color} text-white flex items-center justify-center text-lg font-semibold`}
                    >
                      {platform.icon}
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-navy-900 dark:text-white">{feed.displayName}</div>
                      <div className="text-xs text-gray-500 dark:text-navy-300">
                        {platform.label} · {feed.accountId}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => refreshFeed(feed)}
                      className="rounded-md border border-navy-200 dark:border-navy-700 px-3 py-1.5 text-sm text-navy-700 dark:text-navy-100 hover:bg-navy-50 dark:hover:bg-navy-700 transition disabled:opacity-50"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFeed(feed.id)}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {posts.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {posts.map((post) => (
                      <div
                        key={post.id}
                        className={`rounded-lg border p-4 ${
                          post.isError
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : 'border-gray-200 bg-gray-50 dark:border-navy-700 dark:bg-navy-900/40'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-navy-900 dark:text-white">
                              {post.title || post.message || 'Untitled post'}
                            </div>
                            {post.link && !post.isError && (
                              <a
                                href={post.link}
                                className="text-sm text-usace-blue hover:underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                View
                              </a>
                            )}
                          </div>
                          {post.thumbnail && !post.isError && (
                            <img
                              src={post.thumbnail}
                              alt={post.title ?? post.message ?? 'Post thumbnail'}
                              className="w-full rounded-md object-cover"
                            />
                          )}
                          {post.description && (
                            <p className="text-sm text-gray-600 dark:text-navy-300 whitespace-pre-line">
                              {post.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-navy-300">
                            {post.date && <span>{new Date(post.date).toLocaleString()}</span>}
                            {post.engagement && !post.isError && (
                              <span>
                                ❤️ {post.engagement.likes ?? 0} · 💬 {post.engagement.comments ?? 0}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-300 dark:border-navy-700 p-6 text-center text-sm text-gray-600 dark:text-navy-300">
                    {isLoading ? 'Loading posts…' : 'No posts fetched yet. Refresh the feed to pull the latest posts.'}
                  </div>
                )}
              </div>
            )
          })
        )}
      </section>
    </div>
  )
}

export default SocialMediaCurator
