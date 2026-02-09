'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import { useToast } from '@/../components/ui/toast';
import Button from '@/../components/ui/button';
import {
  Calendar,
  Download,
  FileText,
  Mail,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimeEntryRow {
  id: string;
  userId: string;
  projectId: string;
  taskId: string;
  startTime: string;
  endTime: string;
  duration: number; // minutes
  description: string | null;
  projectName: string;
  taskName: string;
  userEmail: string;
}

interface PaginatedResponse {
  items: TimeEntryRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface ClientItem {
  id: string;
  name: string;
}

interface ProjectItem {
  id: string;
  name: string;
  clientId: string;
}

interface UserItem {
  id: string;
  email: string;
}

interface ReportsClientProps {
  userRole: 'admin' | 'user';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getDefaultStartDate(): Date {
  const d = new Date();
  d.setDate(1); // first day of current month
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDefaultEndDate(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportsClient({ userRole }: ReportsClientProps) {
  const { showToast } = useToast();
  const isAdmin = userRole === 'admin';

  // --- Filter state ---
  const [startDate, setStartDate] = useState(formatDateForInput(getDefaultStartDate()));
  const [endDate, setEndDate] = useState(formatDateForInput(getDefaultEndDate()));
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedUser, setSelectedUser] = useState('');

  // --- Applied filters (only update on "Apply Filters") ---
  const [appliedFilters, setAppliedFilters] = useState({
    startDate: formatDateForInput(getDefaultStartDate()),
    endDate: formatDateForInput(getDefaultEndDate()),
    projectId: '',
    userId: '',
  });

  // --- Pagination ---
  const [page, setPage] = useState(1);

  // --- Export loading states ---
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // --- Fetch filter dropdown data ---
  const { data: clientsData } = useSWR<{ items: ClientItem[] }>(
    '/api/clients?pageSize=100',
    fetcher,
    { revalidateOnFocus: false },
  );

  const projectsSwrKey = useMemo(() => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (selectedClient) params.set('clientId', selectedClient);
    return `/api/projects?${params.toString()}`;
  }, [selectedClient]);

  const { data: projectsData } = useSWR<{ items: ProjectItem[] }>(
    projectsSwrKey,
    fetcher,
    { revalidateOnFocus: false },
  );

  const { data: usersData } = useSWR<{ items: UserItem[] }>(
    isAdmin ? '/api/users?pageSize=100' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  // --- Fetch time entries ---
  const entriesSwrKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    if (appliedFilters.startDate) {
      params.set('startDate', new Date(appliedFilters.startDate).toISOString());
    }
    if (appliedFilters.endDate) {
      const end = new Date(appliedFilters.endDate);
      end.setHours(23, 59, 59, 999);
      params.set('endDate', end.toISOString());
    }
    if (appliedFilters.projectId) {
      params.set('projectId', appliedFilters.projectId);
    }
    if (isAdmin && appliedFilters.userId) {
      params.set('userId', appliedFilters.userId);
    }
    return `/api/time-entries?${params.toString()}`;
  }, [page, appliedFilters, isAdmin]);

  const { data: entriesData, isLoading } = useSWR<PaginatedResponse>(
    entriesSwrKey,
    fetcher,
    { revalidateOnFocus: false },
  );

  // --- Computed ---
  const entries = entriesData?.items ?? [];
  const pagination = entriesData?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const totalEntries = pagination?.total ?? 0;

  const totalDuration = useMemo(() => {
    return entries.reduce((sum, e) => sum + e.duration, 0);
  }, [entries]);

  const clients = clientsData?.items ?? [];
  const projects = projectsData?.items ?? [];
  const users = usersData?.items ?? [];

  // --- Handlers ---
  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({
      startDate,
      endDate,
      projectId: selectedProject,
      userId: selectedUser,
    });
    setPage(1);
  }, [startDate, endDate, selectedProject, selectedUser]);

  const handleClientChange = useCallback((value: string) => {
    setSelectedClient(value);
    setSelectedProject(''); // reset project when client changes
  }, []);

  const buildExportBody = useCallback(() => {
    const body: Record<string, string | undefined> = {};
    if (appliedFilters.startDate) {
      body.startDate = new Date(appliedFilters.startDate).toISOString();
    }
    if (appliedFilters.endDate) {
      const end = new Date(appliedFilters.endDate);
      end.setHours(23, 59, 59, 999);
      body.endDate = end.toISOString();
    }
    if (appliedFilters.projectId) body.projectId = appliedFilters.projectId;
    if (isAdmin && appliedFilters.userId) body.userId = appliedFilters.userId;
    return body;
  }, [appliedFilters, isAdmin]);

  const handleExportCsv = useCallback(async () => {
    setExportingCsv(true);
    try {
      const response = await fetch('/api/reports/csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        },
        body: JSON.stringify(buildExportBody()),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${appliedFilters.startDate}-to-${appliedFilters.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      showToast('CSV exported successfully', 'success');
    } catch {
      showToast('Failed to export CSV', 'error');
    } finally {
      setExportingCsv(false);
    }
  }, [appliedFilters, buildExportBody, showToast]);

  const handleExportPdf = useCallback(async () => {
    setExportingPdf(true);
    try {
      const response = await fetch('/api/reports/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        },
        body: JSON.stringify(buildExportBody()),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${appliedFilters.startDate}-to-${appliedFilters.endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      showToast('PDF exported successfully', 'success');
    } catch {
      showToast('Failed to export PDF', 'error');
    } finally {
      setExportingPdf(false);
    }
  }, [appliedFilters, buildExportBody, showToast]);

  const handleEmailReport = useCallback(async () => {
    setSendingEmail(true);
    try {
      await api.post('/api/reports/email', {
        startDate: appliedFilters.startDate
          ? new Date(appliedFilters.startDate).toISOString()
          : undefined,
        endDate: appliedFilters.endDate
          ? (() => {
              const end = new Date(appliedFilters.endDate);
              end.setHours(23, 59, 59, 999);
              return end.toISOString();
            })()
          : undefined,
        projectId: appliedFilters.projectId || undefined,
        userId: appliedFilters.userId || undefined,
      });
      showToast('Report email sent successfully', 'success');
    } catch {
      showToast('Failed to send email report', 'error');
    } finally {
      setSendingEmail(false);
    }
  }, [appliedFilters, showToast]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

        {/* Export buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            loading={exportingCsv}
            disabled={entries.length === 0}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportPdf}
            loading={exportingPdf}
            disabled={entries.length === 0}
          >
            <FileText className="mr-1.5 h-4 w-4" />
            Export PDF
          </Button>
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleEmailReport}
              loading={sendingEmail}
              disabled={entries.length === 0}
            >
              <Mail className="mr-1.5 h-4 w-4" />
              Email Report
            </Button>
          )}
        </div>
      </div>

      {/* Filters panel */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Filter className="h-4 w-4" />
          Filters
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Start date */}
          <div>
            <label htmlFor="report-start" className="mb-1 block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="report-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* End date */}
          <div>
            <label htmlFor="report-end" className="mb-1 block text-sm font-medium text-gray-700">
              End Date
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="report-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Client filter */}
          <div>
            <label htmlFor="report-client" className="mb-1 block text-sm font-medium text-gray-700">
              Client
            </label>
            <select
              id="report-client"
              value={selectedClient}
              onChange={(e) => handleClientChange(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Project filter */}
          <div>
            <label htmlFor="report-project" className="mb-1 block text-sm font-medium text-gray-700">
              Project
            </label>
            <select
              id="report-project"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* User filter (admin only) */}
          {isAdmin ? (
            <div>
              <label htmlFor="report-user" className="mb-1 block text-sm font-medium text-gray-700">
                User
              </label>
              <select
                id="report-user"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All Users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div /> /* spacer */
          )}
        </div>

        <div className="mt-4">
          <Button variant="primary" size="sm" onClick={handleApplyFilters}>
            <Filter className="mr-1.5 h-4 w-4" />
            Apply Filters
          </Button>
        </div>
      </div>

      {/* Results info */}
      {!isLoading && pagination && (
        <div className="mb-4 text-sm text-gray-600">
          Showing {entries.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}
          &ndash;
          {Math.min(page * PAGE_SIZE, totalEntries)} of {totalEntries} entries
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
      )}

      {/* Table */}
      {!isLoading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Project
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Task
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                    No time entries found for the selected filters.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {formatDate(entry.startTime)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {entry.userEmail}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {entry.projectName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {entry.taskName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {formatDuration(entry.duration)}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-500">
                      {entry.description || '\u2014'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Totals row */}
            {entries.length > 0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900" colSpan={4}>
                    Page Total
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-gray-900">
                    {formatDuration(totalDuration)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
