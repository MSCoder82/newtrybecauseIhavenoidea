import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

interface DisconnectRequest {
  platform?: string
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

    const platform = (await req.json() as DisconnectRequest)?.platform
    if (!platform) {
      throw new Error('platform is required')
    }

    const teamId = userData.user.user_metadata?.team_id
    if (!teamId) {
      throw new Error('User not associated with a team')
    }

    const { error } = await supabase
      .from('social_oauth_tokens')
      .delete()
      .eq('team_id', teamId)
      .eq('platform', platform)

    if (error) {
      throw error
    }

    const { error: feedsError } = await supabase
      .from('social_curator_feeds')
      .delete()
      .eq('team_id', teamId)
      .eq('platform', platform)

    if (feedsError) {
      throw feedsError
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[disconnect-social-account] error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: message === 'Unauthorized' ? 401 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
