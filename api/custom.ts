// Generic custom feed endpoint. Designed for simple JSON feeds.
// Accepts either:
// - JSON Feed v1 (https://www.jsonfeed.org/version/1) at `url`, or
// - an array endpoint at `url` where each item includes fields resembling:
//   { id, url, title|text, date_published|timestamp|date }

type SocialPost = {
  id: string
  platform: 'custom'
  text: string | null
  url: string | null
  timestamp: string | null
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    const feedUrl = (req.query.url as string) || process.env.CUSTOM_JSON_FEED_URL
    const limit = Number(req.query.limit || 5)

    if (!feedUrl) throw new Error('Missing url (or CUSTOM_JSON_FEED_URL env).')

    const resp = await fetch(feedUrl)
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Custom feed fetch failed ${resp.status}: ${text}`)
    }
    const json = await resp.json()

    let items: any[] = []
    if (Array.isArray(json)) {
      items = json
    } else if (Array.isArray(json?.items)) {
      items = json.items
    } else if (Array.isArray(json?.data)) {
      items = json.data
    }

    const mapped: SocialPost[] = items.slice(0, Math.max(1, Math.min(50, limit))).map((it) => ({
      id: String(it.id ?? it.guid ?? it.url ?? it.link ?? crypto.randomUUID()),
      platform: 'custom',
      text: (it.title ?? it.text ?? it.summary ?? null) as string | null,
      url: (it.url ?? it.link ?? null) as string | null,
      timestamp: (it.date_published ?? it.timestamp ?? it.date ?? it.published_at ?? null) as string | null,
    }))

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).json({ success: true, platform: 'custom', data: mapped })
  } catch (err: any) {
    console.error('custom feed error', err)
    res.status(500).json({ success: false, error: err.message || 'Unknown error' })
  }
}

