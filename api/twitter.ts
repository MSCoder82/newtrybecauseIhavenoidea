type XTweet = {
  id: string
  text: string
  created_at?: string
}

type XUser = {
  id: string
  name: string
  username: string
  profile_image_url?: string
}

type SocialPost = {
  id: string
  platform: 'twitter'
  text: string | null
  url: string | null
  timestamp: string | null
  author?: { id: string; name: string; username: string; avatarUrl?: string }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    const username = (req.query.username as string) || process.env.TWITTER_USERNAME
    const bearer = (req.query.bearer as string) || process.env.TWITTER_BEARER_TOKEN
    const limit = Number(req.query.limit || 5)

    if (!username) throw new Error('Missing username (or TWITTER_USERNAME env).')
    if (!bearer) throw new Error('Missing bearer token (or TWITTER_BEARER_TOKEN env).')

    const userResp = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=profile_image_url,name,username`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
    if (!userResp.ok) {
      const text = await userResp.text()
      throw new Error(`Twitter user lookup failed ${userResp.status}: ${text}`)
    }
    const userJson = await userResp.json()
    const user: XUser = userJson.data
    if (!user?.id) throw new Error('Twitter user not found.')

    const tweetsResp = await fetch(`https://api.twitter.com/2/users/${user.id}/tweets?max_results=${Math.max(5, Math.min(100, limit))}&tweet.fields=created_at`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
    if (!tweetsResp.ok) {
      const text = await tweetsResp.text()
      throw new Error(`Twitter tweets fetch failed ${tweetsResp.status}: ${text}`)
    }
    const tweetsJson = await tweetsResp.json()
    const tweets: XTweet[] = tweetsJson.data || []

    const mapped: SocialPost[] = tweets.slice(0, 5).map((t) => ({
      id: t.id,
      platform: 'twitter',
      text: t.text ?? null,
      url: `https://twitter.com/${user.username}/status/${t.id}`,
      timestamp: t.created_at ?? null,
      author: { id: user.id, name: user.name, username: user.username, avatarUrl: user.profile_image_url },
    }))

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).json({ success: true, platform: 'twitter', data: mapped })
  } catch (err: any) {
    console.error('twitter api error', err)
    res.status(500).json({ success: false, error: err.message || 'Unknown error' })
  }
}

