type SprinklrFetchBody = {
  filters?: Record<string, any>
  limit?: number
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}

type SprinklrRequest = SprinklrFetchBody & {
  profileIds?: string[] | string
  accountIds?: string[] | string
  profileId?: string
  accountId?: string
  includeRaw?: boolean | string
}

type SprinklrFeedItem = {
  id: string
  network: string | null
  title: string | null
  url: string | null
  published_at: string | null
  raw?: unknown
}

const DEFAULT_LIMIT = 5

const asArray = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean)
  return [String(value)].filter(Boolean)
}

const toIsoString = (input: unknown): string | null => {
  if (!input) return null
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return null
    const date = new Date(trimmed)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (typeof input === 'number') {
    const ms = input < 10_000_000_000 ? input * 1000 : input
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

const extractMessages = (payload: any): any[] => {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data?.messages)) return payload.data.messages
  if (Array.isArray(payload?.data?.items)) return payload.data.items
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.messages)) return payload.messages
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

const normalizePost = (entry: any, idx: number, includeRaw: boolean): SprinklrFeedItem => {
  const idSource = entry?.id ?? entry?.messageId ?? entry?.postId ?? entry?.activityId ?? `sprinklr-${idx}`
  const title =
    entry?.subject ??
    entry?.message ??
    entry?.text ??
    entry?.content ??
    entry?.headline ??
    entry?.caption ??
    null

  const url = entry?.permalink ?? entry?.permaLink ?? entry?.postUrl ?? entry?.url ?? null
  const published =
    toIsoString(entry?.createdTime) ??
    toIsoString(entry?.created_at) ??
    toIsoString(entry?.publishedAt) ??
    toIsoString(entry?.publishTime) ??
    toIsoString(entry?.timestamp) ??
    null

  const normalized: SprinklrFeedItem = {
    id: String(idSource),
    network: entry?.channel ?? entry?.channelType ?? entry?.network ?? entry?.source ?? 'Sprinklr',
    title: typeof title === 'string' && title.trim().length > 0 ? title : null,
    url: typeof url === 'string' && url.trim().length > 0 ? url : null,
    published_at: published,
  }

  if (includeRaw) {
    normalized.raw = entry
  }

  return normalized
}

const sanitizeLimit = (value: unknown): number => {
  const parsed =
    typeof value === 'string'
      ? parseInt(value, 10)
      : typeof value === 'number'
        ? value
        : DEFAULT_LIMIT
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(Math.max(parsed, 1), 50)
}

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)))

export default async function handler(req: any, res: any) {
  const debug: Record<string, any> = {}
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    const {
      profileIds: bodyProfileIds,
      profileId: bodyProfileId,
      accountIds: bodyAccountIds,
      accountId: bodyAccountId,
      limit: bodyLimit,
      filters: bodyFilters,
      sortBy: bodySortBy,
      sortOrder: bodySortOrder,
      includeRaw: bodyIncludeRaw,
    } = (req.method === 'POST' ? req.body ?? {} : {}) as SprinklrRequest

    const queryProfileIds = asArray(req.query?.profileIds || req.query?.profileId)
    const queryAccountIds = asArray(req.query?.accountIds || req.query?.accountId)

    const requestedProfiles = unique([
      ...queryProfileIds,
      ...asArray(bodyProfileIds),
      ...asArray(bodyProfileId),
      ...queryAccountIds,
      ...asArray(bodyAccountIds),
      ...asArray(bodyAccountId),
    ])

    const clientId = process.env.SPRINKLR_CLIENT_ID
    const clientSecret = process.env.SPRINKLR_CLIENT_SECRET
    const baseEnv =
      process.env.SPRINKLR_ENVIRONMENT ||
      process.env.SPRINKLR_BASE_URL ||
      process.env.SPRINKLR_TENANT_URL ||
      ''

    if (!clientId || !clientSecret) {
      throw new Error('Missing SPRINKLR_CLIENT_ID or SPRINKLR_CLIENT_SECRET environment variables.')
    }
    const baseUrl = baseEnv.replace(/\/+$/, '')
    const tokenUrl =
      process.env.SPRINKLR_TOKEN_URL ||
      process.env.SPRINKLR_TOKEN_ENDPOINT ||
      (baseUrl ? `${baseUrl}/oauth/token` : '')
    const bulkFetchUrl =
      process.env.SPRINKLR_BULK_FETCH_URL ||
      process.env.SPRINKLR_POSTS_URL ||
      process.env.SPRINKLR_POSTS_ENDPOINT ||
      (baseUrl ? `${baseUrl}/api/v2/message/bulk-fetch` : '')
    if (!tokenUrl) {
      throw new Error(
        'Missing Sprinklr token URL. Provide SPRINKLR_TOKEN_URL (or SPRINKLR_TOKEN_ENDPOINT) or set SPRINKLR_ENVIRONMENT.'
      )
    }
    if (!bulkFetchUrl) {
      throw new Error(
        'Missing Sprinklr posts endpoint. Set SPRINKLR_BULK_FETCH_URL (preferred) or SPRINKLR_POSTS_ENDPOINT, or provide SPRINKLR_ENVIRONMENT so the default bulk-fetch path can be constructed.'
      )
    }

    const allowedCsv =
      process.env.SPRINKLR_ALLOWED_PROFILE_IDS ||
      process.env.SPRINKLR_ALLOWED_ACCOUNT_IDS ||
      process.env.SPRINKLR_DEFAULT_PROFILE_IDS ||
      ''
    const allowedProfiles = asArray(allowedCsv)

    const accountParam =
      process.env.SPRINKLR_ACCOUNTS_PARAM ||
      process.env.SPRINKLR_PROFILE_PARAM ||
      process.env.SPRINKLR_PROFILE_IDS_FIELD ||
      'profileIds'

    const effectiveProfiles =
      allowedProfiles.length > 0
        ? requestedProfiles.filter((p) => allowedProfiles.includes(p))
        : requestedProfiles.length > 0
          ? requestedProfiles
          : allowedProfiles

    if (effectiveProfiles.length === 0) {
      throw new Error(
        'No Sprinklr profile IDs provided. Pass `profileIds`/`accountIds` in the request body, query parameters, or configure SPRINKLR_ALLOWED_PROFILE_IDS.'
      )
    }

    const limit = sanitizeLimit(req.query?.limit ?? bodyLimit)
    const filters: Record<string, any> =
      bodyFilters && typeof bodyFilters === 'object' ? { ...bodyFilters } : {}

    filters[accountParam] = effectiveProfiles
    const network = process.env.SPRINKLR_NETWORK
    if (network && !filters.network) {
      filters.network = network
    }

    const sortBy = typeof bodySortBy === 'string' && bodySortBy.length > 0 ? bodySortBy : 'createdTime'
    const sortOrder = bodySortOrder === 'ASC' || bodySortOrder === 'DESC' ? bodySortOrder : 'DESC'
    const includeRaw =
      bodyIncludeRaw === true ||
      bodyIncludeRaw === 'true' ||
      req.query?.includeRaw === 'true' ||
      req.query?.includeRaw === true

    debug.baseEnv = baseEnv
    debug.baseUrl = baseUrl
    debug.tokenUrl = tokenUrl
    debug.bulkFetchUrl = bulkFetchUrl

    const authStyle = (process.env.SPRINKLR_OAUTH_AUTH_STYLE || 'body').toLowerCase()
    const oauthScope = process.env.SPRINKLR_OAUTH_SCOPE
    const tokenHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    }
    if (authStyle === 'basic' || authStyle === 'both') {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      tokenHeaders.Authorization = `Basic ${basic}`
    }

    const tokenParams = new URLSearchParams()
    tokenParams.set('grant_type', 'client_credentials')
    if (authStyle !== 'basic') {
      tokenParams.set('client_id', clientId)
      tokenParams.set('client_secret', clientSecret)
    }
    if (oauthScope) {
      tokenParams.set('scope', oauthScope)
    }

    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: tokenHeaders,
      body: tokenParams,
    })
    if (!tokenResp.ok) {
      const errTxt = await tokenResp.text()
      throw new Error(`Sprinklr token request failed: ${tokenResp.status} ${errTxt}`)
    }

    // Ensure token response is JSON; many misconfigured hosts return HTML with 200 OK
    const tokenCt = tokenResp.headers.get('content-type') || ''
    const tokenTxt = await tokenResp.text()
    if (!/application\/json/i.test(tokenCt)) {
      const snippet = tokenTxt.slice(0, 200).replace(/\s+/g, ' ')
      throw new Error(
        `Sprinklr token endpoint did not return JSON (status ${tokenResp.status}, content-type: ${tokenCt}). Verify SPRINKLR_TOKEN_URL/SPRINKLR_ENVIRONMENT. Body starts with: ${snippet}`,
      )
    }
    let tokenJson: { access_token?: string }
    try {
      tokenJson = JSON.parse(tokenTxt)
    } catch (e) {
      throw new Error(`Failed to parse token JSON. Body starts with: ${tokenTxt.slice(0, 200)}`)
    }
    if (!tokenJson?.access_token) {
      throw new Error('Sprinklr token response missing `access_token`')
    }

    const fetchBody: SprinklrFetchBody = {
      filters,
      limit,
      sortBy,
      sortOrder,
    }

    debug.accountParam = accountParam
    debug.requestedProfiles = requestedProfiles.length
    debug.effectiveProfiles = effectiveProfiles.length
    const postsResp = await fetch(bulkFetchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(fetchBody),
    })
    if (!postsResp.ok) {
      const errTxt = await postsResp.text()
      throw new Error(`Sprinklr posts request failed: ${postsResp.status} ${errTxt}`)
    }

    // Validate JSON response for posts
    const postsCt = postsResp.headers.get('content-type') || ''
    const postsTxt = await postsResp.text()
    if (!/application\/json/i.test(postsCt)) {
      const snippet = postsTxt.slice(0, 200).replace(/\s+/g, ' ')
      throw new Error(
        `Sprinklr posts endpoint did not return JSON (status ${postsResp.status}, content-type: ${postsCt}). Verify SPRINKLR_BULK_FETCH_URL/SPRINKLR_POSTS_ENDPOINT and host. Body starts with: ${snippet}`,
      )
    }
    let postsJson: any
    try {
      postsJson = JSON.parse(postsTxt)
    } catch (e) {
      throw new Error(`Failed to parse posts JSON. Body starts with: ${postsTxt.slice(0, 200)}`)
    }
    const messages = extractMessages(postsJson)
    const posts = messages.slice(0, limit).map((entry, idx) => normalizePost(entry, idx, includeRaw))

    const responseBody: {
      success: true
      posts: SprinklrFeedItem[]
      meta: Record<string, any>
      raw?: unknown
    } = {
      success: true,
      posts,
      meta: {
        limit,
        count: posts.length,
        profileIds: effectiveProfiles,
        sortBy,
        sortOrder,
      },
    }

    if (includeRaw) {
      responseBody.raw = postsJson
    }

    res.status(200).json(responseBody)
  } catch (err: any) {
    try {
      console.error('Sprinklr API error:', { message: err?.message, ...debug })
    } catch {
      console.error('Sprinklr API error:', err)
    }
    res.status(500).json({ success: false, error: err?.message || 'Unknown error' })
  }
}
