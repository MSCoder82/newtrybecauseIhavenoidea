type FeedItem = {
  network: string
  title: string | null
  url: string | null
  published_at: string | null
}

type Credentials = {
  facebook?: { pageId?: string; accessToken?: string }
  twitter?: { username?: string; bearer?: string }
  instagram?: { userId?: string; accessToken?: string }
  linkedin?: { orgId?: string; accessToken?: string }
  youtube?: { channelId?: string; apiKey?: string }
  custom?: { url?: string }
}
// Helpers that call platform APIs directly to avoid internal HTTP calls
async function fetchFacebook(pageId: string, accessToken: string, limit: number): Promise<FeedItem[]> {
  const fields = ['message', 'created_time', 'permalink_url', 'full_picture'].join(',')
  const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/posts`)
  url.searchParams.set('fields', fields)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('access_token', accessToken)
  const resp = await fetch(url.toString())
  if (!resp.ok) throw new Error(`Facebook ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const items = (data.data || []) as Array<any>
  return items.slice(0, limit).map((p) => ({
    network: 'Facebook',
    title: (p.message as string) || null,
    url: (p.permalink_url as string) || null,
    published_at: (p.created_time as string) || null,
  }))
}

async function fetchTwitter(username: string, bearer: string, limit: number): Promise<FeedItem[]> {
  const userResp = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=profile_image_url,name,username`, {
    headers: { Authorization: `Bearer ${bearer}` },
  })
  if (!userResp.ok) throw new Error(`Twitter user ${userResp.status}: ${await userResp.text()}`)
  const user = (await userResp.json()).data
  if (!user?.id) throw new Error('Twitter user not found')
  const tweetsResp = await fetch(`https://api.twitter.com/2/users/${user.id}/tweets?max_results=${Math.max(5, Math.min(100, limit))}&tweet.fields=created_at`, {
    headers: { Authorization: `Bearer ${bearer}` },
  })
  if (!tweetsResp.ok) throw new Error(`Twitter tweets ${tweetsResp.status}: ${await tweetsResp.text()}`)
  const tweets = (await tweetsResp.json()).data || []
  return tweets.slice(0, limit).map((t: any) => ({
    network: 'Twitter',
    title: (t.text as string) || null,
    url: `https://twitter.com/${user.username}/status/${t.id}`,
    published_at: (t.created_at as string) || null,
  }))
}

async function fetchInstagram(userId: string, accessToken: string, limit: number): Promise<FeedItem[]> {
  const fields = ['id', 'caption', 'permalink', 'timestamp'].join(',')
  const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(userId)}/media`)
  url.searchParams.set('fields', fields)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('access_token', accessToken)
  const resp = await fetch(url.toString())
  if (!resp.ok) throw new Error(`Instagram ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const items = (data.data || []) as Array<any>
  return items.slice(0, limit).map((m) => ({
    network: 'Instagram',
    title: (m.caption as string) || null,
    url: (m.permalink as string) || null,
    published_at: (m.timestamp as string) || null,
  }))
}

async function fetchLinkedIn(orgId: string, accessToken: string, limit: number): Promise<FeedItem[]> {
  const owners = encodeURIComponent(`urn:li:organization:${orgId}`)
  const url = `https://api.linkedin.com/v2/shares?q=owners&owners=${owners}&sharesPerOwner=${limit}&sortBy=LAST_MODIFIED&count=${limit}`
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  })
  if (!resp.ok) throw new Error(`LinkedIn ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const elements = (data.elements || []) as Array<any>
  return elements.slice(0, limit).map((e) => {
    const createdMs = e.created?.time || e.lastModified?.time
    const text = e.text?.text || e.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || null
    return {
      network: 'LinkedIn',
      title: text || null,
      url: null,
      published_at: createdMs ? new Date(createdMs).toISOString() : null,
    }
  })
}

async function fetchYouTube(channelId: string, apiKey: string, limit: number): Promise[FeedItem[]] {
  const params = new URLSearchParams({
    part: 'snippet',
    channelId,
    order: 'date',
    maxResults: String(Math.max(1, Math.min(50, limit))),
    type: 'video',
    key: apiKey,
  })
  const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`YouTube ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const items = (data.items || []) as Array<any>
  return items.slice(0, limit).map((it) => {
    const vid = it.id?.videoId || ''
    const sn = it.snippet
    return {
      network: 'YouTube',
      title: (sn?.title as string) || null,
      url: vid ? `https://www.youtube.com/watch?v=${vid}` : null,
      published_at: (sn?.publishedAt as string) || null,
    }
  })
}

async function fetchCustom(urlStr: string, limit: number): Promise<FeedItem[]> {
  const resp = await fetch(urlStr)
  if (!resp.ok) throw new Error(`Custom ${resp.status}: ${await resp.text()}`)
  const json = await resp.json()
  let items: any[] = []
  if (Array.isArray(json)) items = json
  else if (Array.isArray(json?.items)) items = json.items
  else if (Array.isArray(json?.data)) items = json.data
  return items.slice(0, limit).map((it) => ({
    network: 'Other',
    title: (it.title ?? it.text ?? it.summary ?? null) as string | null,
    url: (it.url ?? it.link ?? null) as string | null,
    published_at: (it.date_published ?? it.timestamp ?? it.date ?? it.published_at ?? null) as string | null,
  }))
}

function cap(name: string) {
  return name.slice(0, 1).toUpperCase() + name.slice(1)
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    const limit = Number((req.query.limit as string) || (req.body?.limit as number) || 5)
    const platformsCsv = (req.query.platforms as string) || (req.body?.platforms as string) || 'facebook,twitter,instagram,linkedin,youtube,custom'
    const platforms = platformsCsv.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    const creds: Credentials | undefined = req.body?.credentials

    const tasks: Array<Promise<{ platform: string; items: FeedItem[] }>> = []
    const unsupported: string[] = []
    const errors: Array<{ platform: string; error: string }> = []

    const addTask = (platform: string, url: string | null, mapItem: (raw: any) => FeedItem) => {
      if (!url) {
        unsupported.push(platform)
        return
      }
      tasks.push(
        (async () => {
          try {
            const r = await fetch(url)
            if (!r.ok) {
              const txt = await r.text().catch(() => '')
              throw new Error(`${platform} endpoint error ${r.status} ${txt}`)
            }
            const j = await r.json()
            const data = Array.isArray(j.data) ? j.data : []
            const items: FeedItem[] = data.slice(0, 5).map(mapItem)
            return { platform, items }
          } catch (e: any) {
            errors.push({ platform, error: e?.message || 'Unknown error' })
            return { platform, items: [] }
          }
        })(),
      )
    }

    const l = String(Math.max(1, Math.min(5, limit)))

    for (const p of platforms) {
      switch (p) {
        case 'facebook': {
          const pageId = (req.query.facebookPageId as string) || creds?.facebook?.pageId || process.env.FACEBOOK_PAGE_ID
          const token = (req.query.facebookAccessToken as string) || creds?.facebook?.accessToken || process.env.FACEBOOK_ACCESS_TOKEN
          if (!pageId || !token) { unsupported.push('facebook'); break }
          tasks.push((async () => {
            try {
              const items = await fetchFacebook(pageId, token, Number(l))
              return { platform: 'facebook', items }
            } catch (e: any) { errors.push({ platform: 'facebook', error: e?.message || 'error' }); return { platform: 'facebook', items: [] } }
          })())
          break
        }
        case 'twitter':
        case 'x': {
          const username = (req.query.twitterUsername as string) || creds?.twitter?.username || process.env.TWITTER_USERNAME
          const bearer = (req.query.twitterBearer as string) || creds?.twitter?.bearer || process.env.TWITTER_BEARER_TOKEN
          if (!username || !bearer) { unsupported.push('twitter'); break }
          tasks.push((async () => {
            try {
              const items = await fetchTwitter(username, bearer, Number(l))
              return { platform: 'twitter', items }
            } catch (e: any) { errors.push({ platform: 'twitter', error: e?.message || 'error' }); return { platform: 'twitter', items: [] } }
          })())
          break
        }
        case 'instagram': {
          const userId = (req.query.instagramUserId as string) || creds?.instagram?.userId || process.env.INSTAGRAM_USER_ID
          const token = (req.query.instagramAccessToken as string) || creds?.instagram?.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN
          if (!userId || !token) { unsupported.push('instagram'); break }
          tasks.push((async () => {
            try {
              const items = await fetchInstagram(userId, token, Number(l))
              return { platform: 'instagram', items }
            } catch (e: any) { errors.push({ platform: 'instagram', error: e?.message || 'error' }); return { platform: 'instagram', items: [] } }
          })())
          break
        }
        case 'linkedin': {
          const orgId = (req.query.linkedinOrgId as string) || creds?.linkedin?.orgId || process.env.LINKEDIN_ORG_ID
          const token = (req.query.linkedinAccessToken as string) || creds?.linkedin?.accessToken || process.env.LINKEDIN_ACCESS_TOKEN
          if (!orgId || !token) { unsupported.push('linkedin'); break }
          tasks.push((async () => {
            try {
              const items = await fetchLinkedIn(orgId, token, Number(l))
              return { platform: 'linkedin', items }
            } catch (e: any) { errors.push({ platform: 'linkedin', error: e?.message || 'error' }); return { platform: 'linkedin', items: [] } }
          })())
          break
        }
        case 'youtube': {
          const channelId = (req.query.youtubeChannelId as string) || creds?.youtube?.channelId || process.env.YOUTUBE_CHANNEL_ID
          const apiKey = (req.query.youtubeApiKey as string) || creds?.youtube?.apiKey || process.env.YOUTUBE_API_KEY
          if (!channelId || !apiKey) { unsupported.push('youtube'); break }
          tasks.push((async () => {
            try {
              const items = await fetchYouTube(channelId, apiKey, Number(l))
              return { platform: 'youtube', items }
            } catch (e: any) { errors.push({ platform: 'youtube', error: e?.message || 'error' }); return { platform: 'youtube', items: [] } }
          })())
          break
        }
        case 'other':
        case 'custom': {
          const feedUrl = (req.query.customUrl as string) || creds?.custom?.url || process.env.CUSTOM_JSON_FEED_URL
          if (!feedUrl) { unsupported.push('custom'); break }
          tasks.push((async () => {
            try {
              const items = await fetchCustom(feedUrl, Number(l))
              return { platform: 'custom', items }
            } catch (e: any) { errors.push({ platform: 'custom', error: e?.message || 'error' }); return { platform: 'custom', items: [] } }
          })())
          break
        }
        default:
          unsupported.push(cap(p))
      }
    }

    const results = await Promise.allSettled(tasks)
    const combined: FeedItem[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') combined.push(...r.value.items)
    }

    combined.sort((a, b) => {
      const at = a.published_at ? Date.parse(a.published_at) : 0
      const bt = b.published_at ? Date.parse(b.published_at) : 0
      return bt - at
    })

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).json({ success: true, data: combined, unsupported, errors })
  } catch (err: any) {
    console.error('social-aggregate error', err)
    res.status(500).json({ success: false, error: err.message || 'Unknown error' })
  }
}
