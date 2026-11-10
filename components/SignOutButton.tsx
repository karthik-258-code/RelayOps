'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function SignOutButton({ className = 'workspace-home-link' }: { className?: string } = {}) {
  const router = useRouter();
  return <button className={className} type="button" onClick={async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }}>Sign out</button>;
}
