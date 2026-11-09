import Link from "next/link";

export function HomePage() {
  return <main className="home-shell">
    <header className="home-nav">
      <Link className="brand-lockup" href="/" aria-label="RelayOps home"><span className="brand-mark">R</span><span>Relay<span className="brand-light">Ops</span></span></Link>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><Link className="home-nav-action" href="/workspace">Open workspace <span aria-hidden="true">↗</span></Link></nav>
    </header>

    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-copy">
        <h1 id="home-title">Leave the work.<br /><em>Keep the context.</em></h1>
        <p className="home-lede">Turn scattered project records into a handover your teammate can trust: sources attached, uncertainty visible, and every decision reviewed by a person.</p>
        <div className="home-actions"><Link className="home-primary" href="/workspace">Open the workspace <span aria-hidden="true">→</span></Link><span className="home-action-note">Start with a local synthetic project</span></div>
        <div className="home-trustline"><span>Local by default</span><span>Source-linked</span><span>Human approved</span></div>
      </div>

      <div className="handover-visual" aria-label="Illustration of two conflicting project records carried into a human-reviewed handover">
        <div className="visual-topline"><span>PROJECT CHRONOS</span><span>HANDOVER PREVIEW <span className="visual-live-dot" /></span></div>
        <div className="visual-records">
          <article className="visual-record visual-record-old"><div className="record-type"><span className="record-glyph">D</span><span>ARCHITECTURE NOTE</span><span className="record-date">02 NOV</span></div><h2>Session storage</h2><p>“Uses Memcached.”</p><small>DOC-ARCH-01 · Platform team</small></article>
          <div className="record-link" aria-hidden="true"><span /><span /><span /></div>
          <article className="visual-record visual-record-new"><div className="record-type"><span className="record-glyph">↗</span><span>MERGED CHANGE</span><span className="record-date">05 NOV</span></div><h2>Session storage</h2><p>“Switched to Redis.”</p><small>PR-142 · Platform team</small></article>
        </div>
        <div className="visual-decision"><span className="decision-stamp">!</span><div><strong>Two sources disagree</strong><span>Both records stay attached for review.</span></div><span className="decision-state">Needs a person</span></div>
        <div className="visual-footer"><span><i />EVIDENCE RETAINED</span><span><i />NO AUTOMATIC WINNER</span></div>
      </div>
    </section>

    <section id="how-it-works" className="home-process" aria-labelledby="process-title">
      <div className="process-intro"><h2 id="process-title">From scattered records<br />to a reviewed next step.</h2><p>RelayOps organizes the material you already have, then leaves the final call with your project lead.</p></div>
      <ol className="process-list">
        <li><span className="process-index">01</span><div><h3>Bring the records together</h3><p>Start with the synthetic Project Chronos sample or add authorised Markdown and RelayOps JSON files.</p></div><span className="process-tag">CONNECT</span></li>
        <li><span className="process-index">02</span><div><h3>See what agrees, and what doesn’t</h3><p>Deterministic grouping keeps each finding tied to its source. Conflicts and evidence gaps stay visible.</p></div><span className="process-tag">RECONSTRUCT · VERIFY</span></li>
        <li><span className="process-index">03</span><div><h3>Approve what moves forward</h3><p>The lead reviews every finding. Only an approved snapshot opens the incoming teammate view.</p></div><span className="process-tag">REVIEW · HANDOVER</span></li>
      </ol>
    </section>

    <section className="home-last-call"><p>Give the next person somewhere solid to start.</p><Link href="/workspace">Open Project Chronos <span aria-hidden="true">→</span></Link></section>
    <footer className="home-footer"><Link className="brand-lockup" href="/" aria-label="RelayOps home"><span className="brand-mark">R</span><span>Relay<span className="brand-light">Ops</span></span></Link><span>Demo workspace · Synthetic Project Chronos records</span><span>Evidence first. Reviewed by humans.</span></footer>
  </main>;
}
