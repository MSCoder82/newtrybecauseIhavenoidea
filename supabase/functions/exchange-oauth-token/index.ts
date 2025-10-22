import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

type SupportedPlatform = 'youtube' | 'facebook' | 'instagram' | 'linkedin'

interface ExchangeRequest {
  platform?: SupportedPlatform
  code?: string
  redirect_uri?: string
}

const assertEnv = (key: string): string => {
  const value = Deno.env.get(key)
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

const getSupabaseClient = (req: Request) => {
  const supabaseUrl = assertEnv('SUPABASE_URL')
  const anonKey = assertEnv('SUPABASE_ANON_KEY')
  const authorization = req.headers.get('Authorization')

  if (!authorization) {
    throw new Error('Missing Authorization header')
  }

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  })
}

// Service role client for reading client_secret safely
const getServiceClient = () => {
  const supabaseUrl = assertEnv('SUPABASE_URL')
  const serviceKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceKey)
}

const buildTokenRequest = async (
  platform: SupportedPlatform,
  code: string,
  redirectUri: string,
  teamId: number,
) => {
  // Prefer DB-provided config; fall back to envs if necessary
  const svc = getServiceClient()
  const { data: cfg, error } = await svc
    .from('social_platform_configs')
    .select('client_id, client_secret, token_url, scopes, extra')
    .eq('team_id', teamId)
    .eq('platform', platform)
    .maybeSingle()
  if (error) throw error

  const tokenUrlDefaults: Record<SupportedPlatform, string> = {
    youtube: 'https://oauth2.googleapis.com/token',
    facebook: 'https://graph.facebook.com/v18.0/oauth/access_token',
    instagram: 'https://graph.facebook.com/v18.0/oauth/access_token',
    linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
  }

  const clientIdEnv: Record<SupportedPlatform, string | undefined> = {
    youtube: Deno.env.get('GOOGLE_CLIENT_ID'),
    facebook: Deno.env.get('FACEBOOK_APP_ID'),
    instagram: Deno.env.get('FACEBOOK_APP_ID'),
    linkedin: Deno.env.get('LINKEDIN_CLIENT_ID'),
  }
  const clientSecretEnv: Record<SupportedPlatform, string | undefined> = {
    youtube: Deno.env.get('GOOGLE_CLIENT_SECRET'),
    facebook: Deno.env.get('FACEBOOK_APP_SECRET'),
    instagram: Deno.env.get('FACEBOOK_APP_SECRET'),
    linkedin: Deno.env.get('LINKEDIN_CLIENT_SECRET'),
  }
  const tokenUrlEnv: Record<SupportedPlatform, string | undefined> = {
    youtube: Deno.env.get('GOOGLE_TOKEN_URL') ?? undefined,
    facebook: Deno.env.get('FACEBOOK_TOKEN_URL') ?? undefined,
    instagram: Deno.env.get('FACEBOOK_TOKEN_URL') ?? undefined,
    linkedin: Deno.env.get('LINKEDIN_TOKEN_URL') ?? undefined,
  }

  const clientId = (cfg?.client_id as string | undefined) ?? clientIdEnv[platform]
  const clientSecret = (cfg?.client_secret as string | undefined) ?? clientSecretEnv[platform]
  const tokenUrl = (cfg?.token_url as string | undefined) ?? tokenUrlEnv[platform] ?? tokenUrlDefaults[platform]

  if (!clientId || !clientSecret) {
    throw new Error(`Missing client credentials for ${platform}. Configure them in team settings.`)
  }

  switch (platform) {
    case 'youtube': {
      const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        access_type: 'offline',
      })
      return { tokenUrl, body }
    }
    case 'facebook':
    case 'instagram': {
      const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      })
      return { tokenUrl, body }
    }
    case 'linkedin': {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      })
      return { tokenUrl, body }
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = getSupabaseClient(req)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      throw new Error('Unauthorized')
    }

    const payload = (await req.json()) as ExchangeRequest
    const { platform, code, redirect_uri: redirectUri } = payload

    if (!platform || !code || !redirectUri) {
      throw new Error('platform, code, and redirect_uri are required')
    }

    const teamId = userData.user.user_metadata?.team_id
    if (!teamId) throw new Error('User not associated with a team')

    const { tokenUrl, body } = await buildTokenRequest(platform, code, redirectUri, Number(teamId))

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const data = await response.json()

    if (!response.ok) {
      const message =
        data?.error_description ||
        data?.error?.message ||
        data?.error ||
        `Token exchange failed with status ${response.status}`
      throw new Error(message)
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[exchange-oauth-token] error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
