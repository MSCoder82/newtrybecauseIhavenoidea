type FbPost = {
  id: string
  message?: string
  created_time: string
  permalink_url?: string
  full_picture?: string
}

type SocialPost = {
  id: string
  platform: 'facebook'
  text: string | null
  url: string | null
  timestamp: string | null
  mediaUrl?: string | null
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    const pageId = (req.query.pageId as string) || process.env.FACEBOOK_PAGE_ID
    const accessToken = (req.query.accessToken as string) || process.env.FACEBOOK_ACCESS_TOKEN
    const limit = Number(req.query.limit || 5)

    if (!pageId) throw new Error('Missing pageId (or FACEBOOK_PAGE_ID env).')
    if (!accessToken) throw new Error('Missing accessToken (or FACEBOOK_ACCESS_TOKEN env).')

    const fields = [
      'message',
      'created_time',
      'permalink_url',
      'full_picture',
    ].join(',')

    const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/posts`)
    url.searchParams.set('fields', fields)
    url.searchParams.set('limit', String(Math.max(1, Math.min(25, limit))))
    url.searchParams.set('access_token', accessToken)

    const resp = await fetch(url.toString())
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Facebook API error ${resp.status}: ${text}`)
    }
    const data = await resp.json()
    const posts: FbPost[] = data.data || []

    const mapped: SocialPost[] = posts.slice(0, 5).map((p) => ({
      id: p.id,
      platform: 'facebook',
      text: p.message ?? null,
      url: p.permalink_url ?? null,
      timestamp: p.created_time ?? null,
      mediaUrl: p.full_picture ?? null,
    }))

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).json({ success: true, platform: 'facebook', data: mapped })
  } catch (err: any) {
    console.error('facebook api error', err)
    res.status(500).json({ success: false, error: err.message || 'Unknown error' })
  }
}

