import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ProjectAccess = {
  projectId: string;
  userId: string;
  role: 'lead' | 'reviewer' | 'contributor';
  clearance: 1 | 2 | 3;
};

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function getProjectAccess(userId: string, projectId: string): Promise<ProjectAccess | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('project_members')
    .select('project_id,user_id,role,clearance')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    projectId: data.project_id,
    userId: data.user_id,
    role: data.role,
    clearance: data.clearance as 1 | 2 | 3,
  };
}

export function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
