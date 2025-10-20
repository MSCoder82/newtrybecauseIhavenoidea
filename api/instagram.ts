type IgMedia = {
  id: string
  caption?: string
  permalink?: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  timestamp?: string
}

type SocialPost = {
  id: string
  platform: 'instagram'
  text: string | null
  url: string | null
  timestamp: string | null
  mediaUrl?: string | null
  mediaType?: string | null
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    const igUserId = (req.query.userId as string) || process.env.INSTAGRAM_USER_ID
    const accessToken = (req.query.accessToken as string) || process.env.INSTAGRAM_ACCESS_TOKEN
    const limit = Number(req.query.limit || 5)

    if (!igUserId) throw new Error('Missing userId (or INSTAGRAM_USER_ID env).')
    if (!accessToken) throw new Error('Missing accessToken (or INSTAGRAM_ACCESS_TOKEN env).')

    const fields = [
      'id',
      'caption',
      'permalink',
      'media_type',
      'media_url',
      'thumbnail_url',
      'timestamp',
    ].join(',')

    const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}/media`)
    url.searchParams.set('fields', fields)
    url.searchParams.set('limit', String(Math.max(1, Math.min(25, limit))))
    url.searchParams.set('access_token', accessToken)

    const resp = await fetch(url.toString())
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Instagram API error ${resp.status}: ${text}`)
    }
    const data = await resp.json()
    const items: IgMedia[] = data.data || []

    const mapped: SocialPost[] = items.slice(0, 5).map((m) => ({
      id: m.id,
      platform: 'instagram',
      text: m.caption ?? null,
      url: m.permalink ?? null,
      timestamp: m.timestamp ?? null,
      mediaUrl: m.media_url || m.thumbnail_url || null,
      mediaType: m.media_type ?? null,
    }))

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).json({ success: true, platform: 'instagram', data: mapped })
  } catch (err: any) {
    console.error('instagram api error', err)
    res.status(500).json({ success: false, error: err.message || 'Unknown error' })
  }
}

