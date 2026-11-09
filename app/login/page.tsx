import Link from 'next/link';
import { SignInPanel } from '@/components/SignInPanel';

export default function LoginPage() {
  return <main className="auth-shell">
    <header className="home-nav">
      <Link className="brand-lockup" href="/" aria-label="RelayOps home"><span className="brand-mark">R</span><span>Relay<span className="brand-light">Ops</span></span></Link>
      <Link className="auth-back-link" href="/">Back to overview <span aria-hidden="true">↗</span></Link>
    </header>
    <section className="auth-content" aria-labelledby="login-title">
      <div className="auth-aside">
        <span className="auth-kicker"><span className="online-dot" /> LOCAL DEMO WORKSPACE</span>
        <h1 id="login-title">Context that stays<br /><em>with the project.</em></h1>
        <p>Use one of the seeded roles to explore the same evidence trail with different access levels.</p>
        <div className="auth-proof"><span>01</span><p>Sources remain linked to every finding.</p></div>
        <div className="auth-proof"><span>02</span><p>Restricted material stays on the server.</p></div>
      </div>
      <SignInPanel />
    </section>
    <footer className="auth-footer"><span>RelayOps · Project Chronos</span><span>Local sample data only</span></footer>
  </main>;
}
