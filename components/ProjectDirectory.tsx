'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { sortProjects, type ProjectSummary } from '@/lib/projects/directory';
import { SignOutButton } from '@/components/SignOutButton';

export function ProjectDirectory() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/v1/projects', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || 'Projects could not be loaded.');
        if (active) setProjects(sortProjects(payload.projects ?? []));
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Projects could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setCreating(true);
    try {
      const response = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Project could not be created.');
      router.push(`/workspace/${payload.project.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Project could not be created.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="projects-page">
      <header className="projects-topbar">
        <a className="brand-lockup" href="/projects" aria-label="RelayOps projects home"><span className="brand-mark">R</span><span>RelayOps <span className="brand-light">/ workspaces</span></span></a>
        <div className="projects-account-actions"><span className="projects-account"><span className="online-dot" /> Private to your team</span><SignOutButton className="projects-signout" /></div>
      </header>
      <div className="projects-content">
        <section className="projects-intro" aria-labelledby="projects-title">
          <p className="projects-eyebrow">PROJECT DIRECTORY <span>·</span> HANDOVER WORKSPACES</p>
          <h1 id="projects-title">Every handover,<br /><span>in one place.</span></h1>
          <p className="projects-description">Open a project to connect its records, reconstruct current work, and prepare a source-backed handover.</p>
        </section>

        <section className="projects-list-section" aria-labelledby="your-projects-title">
          <div className="projects-section-heading"><div><p className="projects-eyebrow">YOUR ACCESS</p><h2 id="your-projects-title">Projects</h2></div><span className="projects-count">{loading ? 'Loading' : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}</span></div>
          {loading ? <div className="projects-state" role="status">Loading your projects…</div> : projects.length ? (
            <div className="projects-grid">
              {projects.map((project, index) => <a className={`project-card ${project.isDemo ? 'project-card-demo' : ''}`} href={`/workspace/${project.id}`} key={project.id}>
                <div className="project-card-top"><span className="project-symbol" aria-hidden="true">{project.isDemo ? '◈' : String(index + 1).padStart(2, '0')}</span><span className="project-open">↗</span></div>
                <div className="project-card-main"><div className="project-title-line"><h3>{project.name}</h3>{project.isDemo && <span className="project-demo-badge">STARTER</span>}</div><p>{project.isDemo ? 'Curated example workspace' : 'Your project workspace'}</p></div>
                <div className="project-card-bottom"><span>{project.role} · clearance {project.clearance}</span><span>Open workspace <span aria-hidden="true">→</span></span></div>
              </a>)}
            </div>
          ) : <div className="projects-state">No projects yet. Create one below to start a handover.</div>}
        </section>

        <section className="new-project-panel" aria-labelledby="new-project-title">
          <div className="new-project-copy"><span className="new-project-mark" aria-hidden="true">+</span><div><p className="projects-eyebrow">START SOMETHING NEW</p><h2 id="new-project-title">Create a project</h2><p>New workspace opens at Connect. Its records stay separate from other projects.</p></div></div>
          <form className="new-project-form" onSubmit={createProject}>
            <label htmlFor="project-name">Project name</label>
            <div className="new-project-controls"><input id="project-name" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} minLength={1} required placeholder="e.g. Atlas platform handover" disabled={creating} /><button type="submit" disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create project'} <span aria-hidden="true">→</span></button></div>
            <span className="project-name-hint">1–120 characters</span>
          </form>
        </section>
        {error && <p className="projects-error" role="alert">{error}</p>}
        <footer className="projects-footer"><span>RelayOps</span><span>Evidence first. Reviewed by humans.</span></footer>
      </div>
    </main>
  );
}
