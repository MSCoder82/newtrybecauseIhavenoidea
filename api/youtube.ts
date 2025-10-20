type YtSearchResp = {
  items?: Array<{
    id?: { videoId?: string }
    snippet?: {
      title?: string
      description?: string
      publishedAt?: string
      thumbnails?: { [k: string]: { url?: string } }
      channelTitle?: string
    }
  }>
}

type SocialPost = {
  id: string
  platform: 'youtube'
  text: string | null
  url: string | null
  timestamp: string | null
  thumbUrl?: string | null
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    const channelId = (req.query.channelId as string) || process.env.YOUTUBE_CHANNEL_ID
    const apiKey = (req.query.apiKey as string) || process.env.YOUTUBE_API_KEY
    const limit = Number(req.query.limit || 5)

    if (!channelId) throw new Error('Missing channelId (or YOUTUBE_CHANNEL_ID env).')
    if (!apiKey) throw new Error('Missing apiKey (or YOUTUBE_API_KEY env).')

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
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`YouTube API error ${resp.status}: ${text}`)
    }
    const data: YtSearchResp = await resp.json()
    const items = data.items || []

    const mapped: SocialPost[] = items.slice(0, 5).map((it) => {
      const vid = it.id?.videoId || ''
      const sn = it.snippet
      const thumb = sn?.thumbnails?.high?.url || sn?.thumbnails?.medium?.url || sn?.thumbnails?.default?.url || null
      return {
        id: vid,
        platform: 'youtube',
        text: sn?.title || null,
        url: vid ? `https://www.youtube.com/watch?v=${vid}` : null,
        timestamp: sn?.publishedAt || null,
        thumbUrl: thumb,
      }
    })

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).json({ success: true, platform: 'youtube', data: mapped })
  } catch (err: any) {
    console.error('youtube api error', err)
    res.status(500).json({ success: false, error: err.message || 'Unknown error' })
  }
}

