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

const buildTokenRequest = (platform: SupportedPlatform, code: string, redirectUri: string) => {
  switch (platform) {
    case 'youtube': {
      const clientId = assertEnv('GOOGLE_CLIENT_ID')
      const clientSecret = assertEnv('GOOGLE_CLIENT_SECRET')
      const tokenUrl = Deno.env.get('GOOGLE_TOKEN_URL') ?? 'https://oauth2.googleapis.com/token'
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
      const appId = assertEnv('FACEBOOK_APP_ID')
      const appSecret = assertEnv('FACEBOOK_APP_SECRET')
      const tokenUrl = Deno.env.get('FACEBOOK_TOKEN_URL') ?? 'https://graph.facebook.com/v18.0/oauth/access_token'
      const body = new URLSearchParams({
        code,
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
      })
      return { tokenUrl, body }
    }
    case 'linkedin': {
      const clientId = assertEnv('LINKEDIN_CLIENT_ID')
      const clientSecret = assertEnv('LINKEDIN_CLIENT_SECRET')
      const tokenUrl = Deno.env.get('LINKEDIN_TOKEN_URL') ?? 'https://www.linkedin.com/oauth/v2/accessToken'
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

    const { tokenUrl, body } = buildTokenRequest(platform, code, redirectUri)

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
