import Parser from 'rss-parser';

type FeedItem = {
  network?: string;
  title?: string | null;
  url?: string | null;
  published_at?: string | null;
};

type AccountsInput = string[];

const parser = new Parser();

const RSSHUB_BASE = process.env.RSSHUB_BASE || 'https://rsshub.app';

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalize(str: string): string {
  return (str || '').trim();
}

function toFeedUrl(account: string): { url: string; network: string } | null {
  const raw = normalize(account);
  if (!raw) return null;

  // Allow explicit RSS/Atom feed URLs
  if (isHttpUrl(raw) && /(\.xml|\/rss|\/feed|\.rss)(\?|$)/i.test(raw)) {
    return { url: raw, network: 'RSS' };
  }

  // Support proto:identifier syntax, e.g. "twitter:openai"
  const protoMatch = raw.match(/^([a-z]+):(.+)$/i);
  if (protoMatch) {
    const proto = protoMatch[1].toLowerCase();
    const id = protoMatch[2].replace(/^@/, '').trim();
    switch (proto) {
      case 'twitter':
      case 'x':
        return { url: `${RSSHUB_BASE}/twitter/user/${id}`, network: 'Twitter' };
      case 'instagram':
        return { url: `${RSSHUB_BASE}/instagram/user/${id}`, network: 'Instagram' };
      case 'tiktok':
        return { url: `${RSSHUB_BASE}/tiktok/user/${id}`, network: 'TikTok' };
      case 'facebook':
        return { url: `${RSSHUB_BASE}/facebook/page/${id}`, network: 'Facebook' };
      case 'threads':
        return { url: `${RSSHUB_BASE}/threads/profile/${id}`, network: 'Threads' };
      case 'youtube':
        // Accept channel_id only here
        return { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}` , network: 'YouTube' };
      case 'reddit':
        if (id.startsWith('u/')) return { url: `https://www.reddit.com/${id}/.rss`, network: 'Reddit' };
        if (id.startsWith('r/')) return { url: `https://www.reddit.com/${id}/.rss`, network: 'Reddit' };
        return { url: `https://www.reddit.com/r/${id}/.rss`, network: 'Reddit' };
    }
  }

  if (isHttpUrl(raw)) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      const seg = u.pathname.split('/').filter(Boolean);

      if (host.includes('youtube.com') || host === 'youtu.be') {
        // Prefer channel ID format: /channel/CHANNEL_ID
        const chIdx = seg.indexOf('channel');
        if (chIdx >= 0 && seg[chIdx + 1]) {
          return { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${seg[chIdx + 1]}`, network: 'YouTube' };
        }
        // Handles like /@handle are not resolvable without API; recommend channel id
        return null;
      }

      if (host === 'x.com' || host.includes('twitter.com')) {
        const user = (seg[0] || '').replace(/^@/, '');
        if (user) return { url: `${RSSHUB_BASE}/twitter/user/${user}`, network: 'Twitter' };
      }

      if (host.includes('instagram.com')) {
        const user = (seg[0] || '').replace(/^@/, '');
        if (user) return { url: `${RSSHUB_BASE}/instagram/user/${user}`, network: 'Instagram' };
      }

      if (host.includes('tiktok.com')) {
        let user = seg[0] || '';
        user = user.replace(/^@/, '');
        if (user) return { url: `${RSSHUB_BASE}/tiktok/user/${user}`, network: 'TikTok' };
      }

      if (host.includes('facebook.com')) {
        // Try to use first path segment as page name/id
        const page = seg[0] || '';
        if (page) return { url: `${RSSHUB_BASE}/facebook/page/${page}`, network: 'Facebook' };
      }

      if (host.includes('threads.net')) {
        const user = (seg[0] || '').replace(/^@/, '');
        if (user) return { url: `${RSSHUB_BASE}/threads/profile/${user}`, network: 'Threads' };
      }

      if (host.includes('reddit.com')) {
        // Support /r/sub and /user/username
        if (seg[0] === 'r' && seg[1]) return { url: `https://www.reddit.com/r/${seg[1]}/.rss`, network: 'Reddit' };
        if ((seg[0] === 'u' || seg[0] === 'user') && seg[1]) return { url: `https://www.reddit.com/user/${seg[1]}/.rss`, network: 'Reddit' };
      }
    } catch {
      // fallthrough
    }
  }

  return null;
}

async function fetchLastFive(feedUrl: string): Promise<FeedItem[]> {
  const feed = await parser.parseURL(feedUrl);
  const items = (feed.items || []).slice(0, 5);
  return items.map((it) => ({
    title: it.title ?? null,
    url: (it.link as string) || null,
    published_at: (it.isoDate as string) || (it.pubDate as string) || null,
  }));
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const payload = req.method === 'POST' ? (req.body ?? {}) : {};
    const accountsCsv = (req.query.accounts as string) || '';
    const provided: AccountsInput = (accountsCsv || (payload.accounts?.join(',') ?? ''))
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    if (!provided.length) {
      res.status(400).json({ success: false, error: 'No accounts provided. Pass `accounts` query or JSON body { accounts: [...] }.' });
      return;
    }

    const mappings = provided
      .map((acc) => ({ acc, map: toFeedUrl(acc) }))
      .filter((m) => m.map !== null) as Array<{ acc: string; map: { url: string; network: string } }>;

    const unsupported = provided.filter((acc) => !mappings.find((m) => m.acc === acc));

    const results = await Promise.allSettled(
      mappings.map(async ({ acc, map }) => {
        const items = await fetchLastFive(map.url);
        return items.map((it) => ({ ...it, network: map.network } as FeedItem));
      }),
    );

    const flat: FeedItem[] = [];
    results.forEach((r) => {
      if (r.status === 'fulfilled') flat.push(...r.value);
    });

    res.status(200).json({ success: true, data: flat, unsupported });
  } catch (err: any) {
    console.error('social-feeds error', err);
    res.status(500).json({ success: false, error: err.message || 'Unknown error' });
  }
}

