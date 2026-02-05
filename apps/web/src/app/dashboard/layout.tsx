import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { getTenantById } from '@hour-tracker/database';
import DashboardShell from '@/../components/dashboard/shell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const { user } = session;

  // Fetch tenant name for display in the top bar.
  const tenant = await getTenantById(user.tenantId);

  return (
    <DashboardShell
      email={user.email}
      role={user.role}
      tenantName={tenant?.name}
    >
      {children}
    </DashboardShell>
  );
}
