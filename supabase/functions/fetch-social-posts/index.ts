import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

type SupportedPlatform = 'youtube' | 'facebook' | 'instagram' | 'linkedin'

interface FetchPostsRequest {
  platform?: SupportedPlatform
  account_id?: string
  limit?: number
  options?: Record<string, unknown>
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
}

const assertEnv = (key: string): string => {
  const value = Deno.env.get(key)
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

const getSupabaseClient = (req: Request) => {
  const supabaseUrl = assertEnv('SUPABASE_URL')
  const anonKey = assertEnv('SUPABASE_ANON_KEY')
  const authorization = req.headers.get('Authorization')

  if (!authorization) {
    throw new Error('Missing Authorization header')
  }

  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
}

const fetchYouTubePosts = async (accessToken: string, channelId: string, limit: number): Promise<NormalizedPost[]> => {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=${limit}&order=date&type=video`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )

  const data = await response.json()

  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || 'Failed to fetch YouTube posts'
    throw new Error(message)
  }

  return (data.items ?? []).map((item: any) => ({
    id: item?.id?.videoId ?? item?.id,
    title: item?.snippet?.title ?? 'Untitled video',
    description: item?.snippet?.description ?? '',
    date: item?.snippet?.publishedAt ? new Date(item.snippet.publishedAt).toISOString() : undefined,
    link: item?.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : undefined,
    thumbnail: item?.snippet?.thumbnails?.medium?.url ?? item?.snippet?.thumbnails?.default?.url,
    raw: item,
  }))
}

const fetchFacebookPosts = async (accessToken: string, pageId: string, limit: number): Promise<NormalizedPost[]> => {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${pageId}/posts?fields=message,created_time,permalink_url,full_picture,likes.summary(true),comments.summary(true)&limit=${limit}&access_token=${accessToken}`,
  )
  const data = await response.json()

  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || 'Failed to fetch Facebook posts'
    throw new Error(message)
  }

  return (data.data ?? []).map((post: any) => ({
    id: post?.id,
    message: post?.message ?? 'No caption',
    date: post?.created_time ? new Date(post.created_time).toISOString() : undefined,
    link: post?.permalink_url,
    thumbnail: post?.full_picture,
    engagement: {
      likes: post?.likes?.summary?.total_count ?? 0,
      comments: post?.comments?.summary?.total_count ?? 0,
    },
    raw: post,
  }))
}

const fetchInstagramPosts = async (accessToken: string, accountId: string, limit: number): Promise<NormalizedPost[]> => {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${accountId}/media?fields=caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count&limit=${limit}&access_token=${accessToken}`,
  )
  const data = await response.json()

  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || 'Failed to fetch Instagram posts'
    throw new Error(message)
  }

  return (data.data ?? []).map((post: any) => ({
    id: post?.id,
    title: post?.caption ?? 'No caption',
    date: post?.timestamp ? new Date(post.timestamp).toISOString() : undefined,
    link: post?.permalink,
    thumbnail: post?.thumbnail_url ?? post?.media_url,
    engagement: {
      likes: post?.like_count ?? 0,
      comments: post?.comments_count ?? 0,
    },
    raw: post,
  }))
}

const fetchLinkedInPosts = async (accessToken: string, organizationId: string, limit: number): Promise<NormalizedPost[]> => {
  const response = await fetch(
    `https://api.linkedin.com/v2/shares?q=owners&owners=urn:li:organization:${organizationId}&count=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    },
  )
  const data = await response.json()

  if (!response.ok) {
    const message = data?.message || data?.error_description || 'Failed to fetch LinkedIn posts'
    throw new Error(message)
  }

  return (data.elements ?? []).map((post: any) => ({
    id: post?.id,
    title: post?.text?.text ?? 'No text',
    date: post?.created?.time ? new Date(post.created.time).toISOString() : undefined,
    link: post?.id ? `https://www.linkedin.com/feed/update/${post.id}` : undefined,
    engagement: {
      likes: post?.statistics?.numLikes ?? 0,
      comments: post?.statistics?.numComments ?? 0,
    },
    raw: post,
  }))
}

const normalizeLimit = (limit?: number): number => {
  if (typeof limit !== 'number' || Number.isNaN(limit) || limit <= 0) {
    return 5
  }
  return Math.min(Math.max(Math.floor(limit), 1), 20)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = getSupabaseClient(req)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      throw new Error('Unauthorized')
    }

    const payload = await req.json() as FetchPostsRequest
    const { platform, account_id: accountId, limit } = payload

    if (!platform || !accountId) {
      throw new Error('platform and account_id are required')
    }

    const teamId = userData.user.user_metadata?.team_id
    if (!teamId) {
      throw new Error('User not associated with a team')
    }

    const { data: tokenRecord, error: tokenError } = await supabase
      .from('social_oauth_tokens')
      .select('access_token, refresh_token, expires_at, metadata')
      .eq('team_id', teamId)
      .eq('platform', platform)
      .maybeSingle()

    if (tokenError) {
      throw tokenError
    }
    if (!tokenRecord?.access_token) {
      throw new Error('Platform not connected')
    }

    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
      throw new Error('Stored OAuth token has expired. Refresh the connection.')
    }

    const actualLimit = normalizeLimit(limit)
    let posts: NormalizedPost[] = []

    switch (platform) {
      case 'youtube':
        posts = await fetchYouTubePosts(tokenRecord.access_token, accountId, actualLimit)
        break
      case 'facebook':
        posts = await fetchFacebookPosts(tokenRecord.access_token, accountId, actualLimit)
        break
      case 'instagram':
        posts = await fetchInstagramPosts(tokenRecord.access_token, accountId, actualLimit)
        break
      case 'linkedin':
        posts = await fetchLinkedInPosts(tokenRecord.access_token, accountId, actualLimit)
        break
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }

    try {
      if (posts.length > 0) {
        const payload = posts.map((post) => ({
          team_id: teamId,
          platform,
          account_id: accountId,
          post_id: post.id,
          payload: post,
          fetched_at: new Date().toISOString(),
        }))

        await supabase.from('social_curator_posts').upsert(payload, {
          onConflict: 'team_id,platform,account_id,post_id',
        })
      }
    } catch (cacheError) {
      console.warn('[fetch-social-posts] cache upsert skipped:', cacheError)
    }

    return new Response(JSON.stringify({ success: true, posts }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[fetch-social-posts] error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 400
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
