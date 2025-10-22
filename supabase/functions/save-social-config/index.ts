import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

type PlatformKey = 'youtube' | 'facebook' | 'instagram' | 'linkedin'

interface SaveConfigRequest {
  platform?: PlatformKey
  client_id?: string
  client_secret?: string
  auth_url?: string
  token_url?: string
  scopes?: string
  redirect_uri?: string
  extra?: Record<string, unknown>
}

const assertEnv = (key: string): string => {
  const value = Deno.env.get(key)
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

const getSupabaseClient = (req: Request) => {
  const supabaseUrl = assertEnv('SUPABASE_URL')
  const anonKey = assertEnv('SUPABASE_ANON_KEY')
  const authorization = req.headers.get('Authorization')
  if (!authorization) throw new Error('Missing Authorization header')
  return createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
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
    if (userError || !userData?.user) throw new Error('Unauthorized')

    const teamId = userData.user.user_metadata?.team_id
    if (!teamId) throw new Error('User not associated with a team')

    const body = (await req.json()) as SaveConfigRequest
    const { platform, client_id, client_secret, auth_url, token_url, scopes, redirect_uri, extra = {} } = body
    if (!platform) throw new Error('platform is required')

    const payload: Record<string, unknown> = {
      team_id: teamId,
      platform,
      client_id: client_id ?? null,
      auth_url: auth_url ?? null,
      token_url: token_url ?? null,
      scopes: scopes ?? null,
      redirect_uri: redirect_uri ?? null,
      extra,
      created_by: userData.user.id,
      updated_at: new Date().toISOString(),
    }
    // Only set client_secret if provided (never echo it back)
    if (typeof client_secret === 'string' && client_secret.length > 0) {
      payload.client_secret = client_secret
    }

    const { error } = await supabase
      .from('social_platform_configs')
      .upsert(payload, { onConflict: 'team_id,platform' })

    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[save-social-config] error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: message === 'Unauthorized' ? 401 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

