import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

type PlatformKey = 'youtube' | 'facebook' | 'instagram' | 'linkedin'

interface PublicConfig {
  platform: PlatformKey
  client_id?: string | null
  auth_url?: string | null
  token_url?: string | null
  scopes?: string | null
  redirect_uri?: string | null
  extra?: Record<string, unknown> | null
  updated_at?: string | null
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

    const { data, error } = await supabase
      .from('social_platform_configs_public')
      .select('platform, client_id, auth_url, token_url, scopes, redirect_uri, extra, updated_at')
      .eq('team_id', teamId)

    if (error) throw error

    const mapped: Record<PlatformKey, PublicConfig> = {
      youtube: { platform: 'youtube' },
      facebook: { platform: 'facebook' },
      instagram: { platform: 'instagram' },
      linkedin: { platform: 'linkedin' },
    }
    for (const row of data ?? []) {
      const key = row.platform as PlatformKey
      mapped[key] = { platform: key, ...row }
    }

    return new Response(JSON.stringify({ success: true, configs: mapped }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[get-social-config] error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: message === 'Unauthorized' ? 401 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

