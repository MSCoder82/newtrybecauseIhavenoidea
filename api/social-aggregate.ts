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

function baseUrlFromReq(req: any): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string)
  return `${proto}://${host}`
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

    const base = baseUrlFromReq(req)
    const tasks: Array<Promise<{ platform: string; items: FeedItem[] }>> = []
    const unsupported: string[] = []

    const addTask = (platform: string, url: string | null, mapItem: (raw: any) => FeedItem) => {
      if (!url) {
        unsupported.push(platform)
        return
      }
      tasks.push(
        (async () => {
          const r = await fetch(url)
          if (!r.ok) {
            throw new Error(`${platform} endpoint error ${r.status}`)
          }
          const j = await r.json()
          const data = Array.isArray(j.data) ? j.data : []
          const items: FeedItem[] = data.slice(0, 5).map(mapItem)
          return { platform, items }
        })(),
      )
    }

    const l = String(Math.max(1, Math.min(5, limit)))

    for (const p of platforms) {
      switch (p) {
        case 'facebook': {
          const pageId = (req.query.facebookPageId as string) || creds?.facebook?.pageId || process.env.FACEBOOK_PAGE_ID
          const token = (req.query.facebookAccessToken as string) || creds?.facebook?.accessToken || process.env.FACEBOOK_ACCESS_TOKEN
          const u = pageId && token ? `${base}/api/facebook?limit=${l}&pageId=${encodeURIComponent(pageId)}&accessToken=${encodeURIComponent(token)}` : null
          addTask('facebook', u, (raw) => ({
            network: 'Facebook',
            title: (raw.text as string) || null,
            url: (raw.url as string) || null,
            published_at: (raw.timestamp as string) || null,
          }))
          break
        }
        case 'twitter':
        case 'x': {
          const username = (req.query.twitterUsername as string) || creds?.twitter?.username || process.env.TWITTER_USERNAME
          const bearer = (req.query.twitterBearer as string) || creds?.twitter?.bearer || process.env.TWITTER_BEARER_TOKEN
          const u = username && bearer ? `${base}/api/twitter?limit=${l}&username=${encodeURIComponent(username)}&bearer=${encodeURIComponent(bearer)}` : null
          addTask('twitter', u, (raw) => ({
            network: 'Twitter',
            title: (raw.text as string) || null,
            url: (raw.url as string) || null,
            published_at: (raw.timestamp as string) || null,
          }))
          break
        }
        case 'instagram': {
          const userId = (req.query.instagramUserId as string) || creds?.instagram?.userId || process.env.INSTAGRAM_USER_ID
          const token = (req.query.instagramAccessToken as string) || creds?.instagram?.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN
          const u = userId && token ? `${base}/api/instagram?limit=${l}&userId=${encodeURIComponent(userId)}&accessToken=${encodeURIComponent(token)}` : null
          addTask('instagram', u, (raw) => ({
            network: 'Instagram',
            title: (raw.text as string) || null,
            url: (raw.url as string) || null,
            published_at: (raw.timestamp as string) || null,
          }))
          break
        }
        case 'linkedin': {
          const orgId = (req.query.linkedinOrgId as string) || creds?.linkedin?.orgId || process.env.LINKEDIN_ORG_ID
          const token = (req.query.linkedinAccessToken as string) || creds?.linkedin?.accessToken || process.env.LINKEDIN_ACCESS_TOKEN
          const u = orgId && token ? `${base}/api/linkedin?limit=${l}&orgId=${encodeURIComponent(orgId)}&accessToken=${encodeURIComponent(token)}` : null
          addTask('linkedin', u, (raw) => ({
            network: 'LinkedIn',
            title: (raw.text as string) || null,
            url: (raw.url as string) || null,
            published_at: (raw.timestamp as string) || null,
          }))
          break
        }
        case 'youtube': {
          const channelId = (req.query.youtubeChannelId as string) || creds?.youtube?.channelId || process.env.YOUTUBE_CHANNEL_ID
          const apiKey = (req.query.youtubeApiKey as string) || creds?.youtube?.apiKey || process.env.YOUTUBE_API_KEY
          const u = channelId && apiKey ? `${base}/api/youtube?limit=${l}&channelId=${encodeURIComponent(channelId)}&apiKey=${encodeURIComponent(apiKey)}` : null
          addTask('youtube', u, (raw) => ({
            network: 'YouTube',
            title: (raw.text as string) || null,
            url: (raw.url as string) || null,
            published_at: (raw.timestamp as string) || null,
          }))
          break
        }
        case 'other':
        case 'custom': {
          const feedUrl = (req.query.customUrl as string) || creds?.custom?.url || process.env.CUSTOM_JSON_FEED_URL
          const u = feedUrl ? `${base}/api/custom?limit=${l}&url=${encodeURIComponent(feedUrl)}` : null
          addTask('custom', u, (raw) => ({
            network: 'Other',
            title: (raw.text as string) || null,
            url: (raw.url as string) || null,
            published_at: (raw.timestamp as string) || null,
          }))
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
    res.status(200).json({ success: true, data: combined, unsupported })
  } catch (err: any) {
    console.error('social-aggregate error', err)
    res.status(500).json({ success: false, error: err.message || 'Unknown error' })
  }
}
