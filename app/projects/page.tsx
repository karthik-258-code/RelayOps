import { redirect } from 'next/navigation';
import { ProjectDirectory } from '@/components/ProjectDirectory';
import { requireUser } from '@/lib/server/access';

export default async function ProjectsPage() {
  const user = await requireUser();
  if (!user) redirect('/login');
  return <ProjectDirectory />;
}
