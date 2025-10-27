import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const PLACEHOLDER_URL = 'https://ardtcuqisossmgmmvpnc.supabase.co';
const PLACEHOLDER_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyZHRjdXFpc29zc21nbW12cG5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NDI1OTgsImV4cCI6MjA3NTExODU5OH0.JGJQsV7Ab3oYPYtTd0v2PqMlKiSAjCJt24Dm_wgJ6QE';
export const SOCIAL_OAUTH_RESULT_KEY = 'social_oauth_result';

const stashPendingSocialOAuthParams = () => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        const { localStorage, sessionStorage } = window;
        if (!localStorage || !sessionStorage) {
            return;
        }

        const pendingState = localStorage.getItem('social_oauth_state');
        if (!pendingState) {
            return;
        }

        const url = new URL(window.location.href);
        const code = url.searchParams.get('code') ?? undefined;
        const state = url.searchParams.get('state') ?? undefined;
        const error =
            url.searchParams.get('error_description') ??
            url.searchParams.get('error') ??
            undefined;

        if (!code && !error) {
            return;
        }

        if (state && state !== pendingState) {
            return;
        }

        const payload = JSON.stringify({
            code,
            state: state ?? pendingState,
            error,
        });

        sessionStorage.setItem(SOCIAL_OAUTH_RESULT_KEY, payload);

        ['code', 'state', 'error', 'error_description'].forEach((param) => {
            url.searchParams.delete(param);
        });

        const cleaned = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, document.title, cleaned);
    } catch (error) {
        console.error('Failed to stash social OAuth params before Supabase init:', error);
    }
};

stashPendingSocialOAuthParams();

const readEnvValue = (key: string): string | undefined => {
    if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
        const value = process.env[key];
        if (value) {
            return value;
        }
    }

    if (typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined') {
        const env = import.meta.env as Record<string, string | undefined>;
        const value = env[key];
        if (value) {
            return value;
        }
    }

    return undefined;
};

const sanitizeEnvValue = (value: string | undefined): string | undefined => {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
        return undefined;
    }

    return trimmed;
};

const providedUrl =
    sanitizeEnvValue(readEnvValue('SUPABASE_URL') ?? readEnvValue('VITE_SUPABASE_URL')) ?? undefined;
const providedAnonKey =
    sanitizeEnvValue(readEnvValue('SUPABASE_ANON_KEY') ?? readEnvValue('VITE_SUPABASE_ANON_KEY')) ?? undefined;

let supabaseUrl = providedUrl ?? PLACEHOLDER_URL;
let supabaseAnonKey = providedAnonKey ?? PLACEHOLDER_ANON_KEY;

let supabaseClient: SupabaseClient;
let configurationError: Error | null = null;
let usingCustomCredentials = Boolean(providedUrl && providedAnonKey);

const createSupabaseInstance = (url: string, key: string) =>
    createClient(url, key, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false, // Avoid hijacking third-party OAuth query params used by the social integrations.
        },
    });

try {
    supabaseClient = createSupabaseInstance(supabaseUrl, supabaseAnonKey);
} catch (error) {
    configurationError = error as Error;
    console.error(
        'Failed to initialize Supabase client with the provided credentials. Falling back to placeholder credentials.',
        error,
    );
    supabaseUrl = PLACEHOLDER_URL;
    supabaseAnonKey = PLACEHOLDER_ANON_KEY;
    usingCustomCredentials = false;
    supabaseClient = createSupabaseInstance(supabaseUrl, supabaseAnonKey);
}

if (!usingCustomCredentials) {
    console.warn(
        'WARNING: Supabase is using placeholder credentials. Please replace them in the environment or `lib/supabase.ts` with your actual Supabase project URL and anon key for the application to work correctly.',
    );
}

export const isSupabaseConfigured = usingCustomCredentials && configurationError === null;
export const supabaseConfigurationError = configurationError;
export const supabase = supabaseClient;


if (typeof window !== 'undefined') {
  (window as any).__supabase = supabase;
}
