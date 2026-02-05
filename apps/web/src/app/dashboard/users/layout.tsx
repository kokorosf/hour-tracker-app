import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';

export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session || session.user.role !== 'admin') {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
