import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

interface SaveTokensRequest {
  platform?: string
  access_token?: string
  refresh_token?: string | null
  expires_at?: string | number | null
  metadata?: Record<string, unknown>
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
    global: { headers: { Authorization: authorization } },
  })
}

const toIsoString = (expiresAt?: string | number | null) => {
  if (!expiresAt) return null
  if (typeof expiresAt === 'string') {
    const parsed = Number(expiresAt)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed * 1000).toISOString()
    }
    const date = new Date(expiresAt)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (typeof expiresAt === 'number') {
    const millis = expiresAt < 10_000_000_000 ? expiresAt * 1000 : expiresAt
    return new Date(millis).toISOString()
  }
  return null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = getSupabaseClient(req)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      throw new Error('Unauthorized')
    }

    const body = await req.json() as SaveTokensRequest
    const { platform, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, metadata = {} } = body

    if (!platform || !accessToken) {
      throw new Error('platform and access_token are required')
    }

    const teamId = userData.user.user_metadata?.team_id
    if (!teamId) {
      throw new Error('User not associated with a team')
    }

    const expiresAtIso = toIsoString(expiresAt)

    const { data, error } = await supabase
      .from('social_oauth_tokens')
      .upsert(
        {
          team_id: teamId,
          platform,
          access_token: accessToken,
          refresh_token: refreshToken ?? null,
          expires_at: expiresAtIso,
          metadata,
          connected_by_user_id: userData.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'team_id,platform' },
      )
      .select()

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[save-social-tokens] error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: message === 'Unauthorized' ? 401 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
