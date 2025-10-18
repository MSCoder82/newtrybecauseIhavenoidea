import type { VercelRequest, VercelResponse } from '@vercel/node';

type PostsRequest = {
  accountIds?: string[];
  limit?: number;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const clientId = process.env.SPRINKLR_CLIENT_ID;
    const clientSecret = process.env.SPRINKLR_CLIENT_SECRET;
    const baseUrl = process.env.SPRINKLR_BASE_URL || 'https://api.sprinklr.com';
    const tokenEndpoint = process.env.SPRINKLR_TOKEN_ENDPOINT || `${baseUrl}/oauth/token`;
    const postsEndpoint = process.env.SPRINKLR_POSTS_ENDPOINT; // e.g., `${baseUrl}/v1/posts` (set per your tenant/API package)
    const defaultAccountsCsv = process.env.SPRINKLR_ALLOWED_ACCOUNT_IDS || '';

    if (!clientId || !clientSecret) {
      throw new Error('Missing SPRINKLR_CLIENT_ID/SPRINKLR_CLIENT_SECRET');
    }
    if (!postsEndpoint) {
      throw new Error('SPRINKLR_POSTS_ENDPOINT is not configured');
    }

    const payload: PostsRequest = req.method === 'POST' ? (req.body ?? {}) : {};
    const limitParam = (req.query.limit as string) || String(payload.limit || 20);
    const inputAccounts = (req.query.accounts as string) || '';
    const provided = (inputAccounts || (payload.accountIds?.join(',') ?? '')).split(',').map(s => s.trim()).filter(Boolean);
    const allowed = defaultAccountsCsv
      ? defaultAccountsCsv.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const effectiveAccounts = allowed.length > 0
      ? provided.filter(a => allowed.includes(a))
      : provided.length > 0
        ? provided
        : allowed;
    const accountsCsv = effectiveAccounts.join(',');
    if (!accountsCsv) {
      throw new Error('No account IDs provided. Pass `accounts` query, `accountIds` in body, or set SPRINKLR_ALLOWED_ACCOUNT_IDS.');
    }

    // Get OAuth token (Client Credentials)
    const tokenResp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokenResp.ok) {
      const errTxt = await tokenResp.text();
      throw new Error(`Token request failed: ${tokenResp.status} ${errTxt}`);
    }
    const tokenJson = (await tokenResp.json()) as { access_token: string };
    const accessToken = tokenJson.access_token;

    // Fetch posts filtered by account IDs
    const url = new URL(postsEndpoint);
    url.searchParams.set('accounts', accountsCsv);
    url.searchParams.set('limit', limitParam);

    const postsResp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!postsResp.ok) {
      const errTxt = await postsResp.text();
      throw new Error(`Posts request failed: ${postsResp.status} ${errTxt}`);
    }

    const raw = await postsResp.json();
    // Return raw for now; UI can map fields per tenant schema
    res.status(200).json({ success: true, data: raw });
  } catch (err: any) {
    console.error('Sprinklr API error:', err);
    res.status(500).json({ success: false, error: err.message || 'Unknown error' });
  }
}
