import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/server/access';

export default async function WorkspacePage() {
  const user = await requireUser();
  redirect(user ? '/projects' : '/login');
}
