'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const demoAccounts = [
  { label: 'Project lead', email: 'lead@relayops.local', note: 'Full review access' },
  { label: 'Incoming contributor', email: 'contributor@relayops.local', note: 'Clearance level 1' },
];

export function SignInPanel() {
  const router = useRouter();
  const [email, setEmail] = useState('lead@relayops.local');
  const [password, setPassword] = useState('RelayOpsDemo!2026');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      router.replace('/projects');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in. Check the local Supabase service.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="auth-card" aria-label="Sign in to RelayOps">
    <div className="auth-card-heading"><span className="auth-card-mark">↗</span><div><h2>Enter the workspace</h2><p>Pick a seeded role or sign in with its demo credentials.</p></div></div>
    <form onSubmit={signIn} className="auth-form">
      <label htmlFor="relayops-email">Email address</label>
      <input id="relayops-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <label htmlFor="relayops-password">Password</label>
      <input id="relayops-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" className="home-primary auth-submit" disabled={busy}>{busy ? 'Opening workspace…' : 'Continue securely'} <span aria-hidden="true">→</span></button>
    </form>
    <div className="demo-accounts"><span className="demo-accounts-label">SAMPLE ACCOUNTS</span>{demoAccounts.map((account) => <button className="demo-account" type="button" key={account.email} onClick={() => setEmail(account.email)}><span><strong>{account.label}</strong><small>{account.note}</small></span><span className="demo-account-arrow" aria-hidden="true">↗</span></button>)}</div>
    <p className="auth-local-note"><span className="auth-lock" aria-hidden="true">⌑</span> Demo credentials work only with the local database.</p>
  </section>;
}

