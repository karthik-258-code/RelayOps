import 'server-only';

import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient(signal?: AbortSignal, mutationToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Local Supabase admin settings are missing. Run scripts/setup-local-env.ps1.');
  const global = signal || mutationToken ? {
    ...(mutationToken ? { headers: { 'x-relayops-mutation-token': mutationToken } } : {}),
    ...(signal ? {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
      }),
    } : {}),
  } : undefined;
  return createClient(url, serviceRoleKey, {
    ...(global ? { global } : {}),
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
