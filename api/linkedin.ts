type LiShareText = { text?: string }
type LiContentEntity = { entityLocation?: string; thumbnails?: Array<{ resolvedUrl?: string }> }
type LiSpecificContent = {
  'com.linkedin.ugc.ShareContent'?: {
    shareCommentary?: LiShareText
    shareMediaCategory?: string
    media?: Array<{ status?: string; description?: LiShareText; originalUrl?: string; title?: LiShareText; thumbnails?: Array<{ resolvedUrl?: string }> }>
  }
}
type LiElement = {
  id: string
  created?: { time?: number }
  lastModified?: { time?: number }
  text?: LiShareText
  content?: { contentEntities?: LiContentEntity[]; title?: string }
  specificContent?: LiSpecificContent
}

type SocialPost = {
  id: string
  platform: 'linkedin'
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

    const orgId = (req.query.orgId as string) || process.env.LINKEDIN_ORG_ID
    const accessToken = (req.query.accessToken as string) || process.env.LINKEDIN_ACCESS_TOKEN
    const limit = Number(req.query.limit || 5)

    if (!orgId) throw new Error('Missing orgId (or LINKEDIN_ORG_ID env).')
    if (!accessToken) throw new Error('Missing accessToken (or LINKEDIN_ACCESS_TOKEN env).')

    const owners = encodeURIComponent(`urn:li:organization:${orgId}`)
    const url = `https://api.linkedin.com/v2/shares?q=owners&owners=${owners}&sharesPerOwner=${Math.max(1, Math.min(5, limit))}&sortBy=LAST_MODIFIED&count=${Math.max(1, Math.min(5, limit))}`

    const doFetchShares = async () => fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })

    const doFetchUgc = async () => {
      const authors = encodeURIComponent(`urn:li:organization:${orgId}`)
      const u = `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${authors})&count=${Math.max(1, Math.min(5, limit))}&sortBy=LAST_MODIFIED`;
      return fetch(u, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      })
    }

    let resp = await doFetchShares()
    if (!resp.ok && (resp.status === 401 || resp.status === 403)) {
      // Fallback to ugcPosts for org content
      resp = await doFetchUgc()
    }
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`LinkedIn API error ${resp.status}: ${text}`)
    }
    const data = await resp.json()
    const elements: LiElement[] = (data.elements || data.items || []) || []

    const mapped: SocialPost[] = elements.slice(0, 5).map((e) => {
      const createdMs = e.created?.time || e.lastModified?.time
      const entity = e.content?.contentEntities?.[0]
      const mediaThumb = entity?.thumbnails?.[0]?.resolvedUrl
      const specificMedia = e.specificContent?.['com.linkedin.ugc.ShareContent']?.media?.[0]
      const mediaUrl = specificMedia?.originalUrl || specificMedia?.thumbnails?.[0]?.resolvedUrl || mediaThumb || null
      const text = e.text?.text || e.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || null
      // LinkedIn does not return a canonical public URL in this endpoint; leaving null
      return {
        id: e.id,
        platform: 'linkedin',
        text,
        url: null,
        timestamp: createdMs ? new Date(createdMs).toISOString() : null,
        mediaUrl,
      }
    })

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).json({ success: true, platform: 'linkedin', data: mapped })
  } catch (err: any) {
    console.error('linkedin api error', err)
    res.status(500).json({ success: false, error: err.message || 'Unknown error' })
  }
}
