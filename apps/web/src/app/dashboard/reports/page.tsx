import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import ReportsClient from './reports-client';

export default async function ReportsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  return <ReportsClient userRole={session.user.role} />;
}
