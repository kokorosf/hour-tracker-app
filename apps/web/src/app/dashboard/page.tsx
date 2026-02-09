'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { api } from '@/lib/api/client';
import { Clock, DollarSign, FolderOpen, FileQuestion, Calendar } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryData {
  totalMinutes: number;
  billableMinutes: number;
  activeProjects: number;
  pendingEntries: number;
  billableBreakdown: {
    billable: number;
    nonBillable: number;
  };
  topProjects: {
    projectId: string;
    projectName: string;
    totalMinutes: number;
  }[];
  dailyHours: {
    date: string;
    totalMinutes: number;
  }[];
}

type DateRangePreset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDateRange(preset: DateRangePreset, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { start, end };
    }
    case 'last_week': {
      const dayOfWeek = today.getDay();
      const thisWeekStart = new Date(today);
      thisWeekStart.setDate(today.getDate() - dayOfWeek);
      const start = new Date(thisWeekStart);
      start.setDate(thisWeekStart.getDate() - 7);
      const end = new Date(thisWeekStart);
      return { start, end };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { start, end };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start, end };
    }
    case 'custom': {
      if (customStart && customEnd) {
        return { start: customStart, end: customEnd };
      }
      // Default to this week if custom dates not provided
      const dayOfWeek = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { start, end };
    }
  }
}

function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

const PIE_COLORS = ['#3b82f6', '#94a3b8']; // blue-500, slate-400
const BAR_COLOR = '#8b5cf6'; // violet-500
const LINE_COLOR = '#10b981'; // emerald-500

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  // Date range state
  const [preset, setPreset] = useState<DateRangePreset>('this_week');
  const [customStart, setCustomStart] = useState<Date>(new Date());
  const [customEnd, setCustomEnd] = useState<Date>(new Date());

  const { start, end } = useMemo(
    () => getDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  // Build SWR key
  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set('startDate', start.toISOString());
    params.set('endDate', end.toISOString());
    return `/api/reports/summary?${params.toString()}`;
  }, [start, end]);

  const { data, isLoading } = useSWR<SummaryData>(swrKey, fetcher, {
    revalidateOnFocus: false,
  });

  // Handlers
  const handlePresetChange = useCallback((newPreset: DateRangePreset) => {
    setPreset(newPreset);
  }, []);

  const handleCustomStartChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomStart(new Date(e.target.value));
  }, []);

  const handleCustomEndChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomEnd(new Date(e.target.value));
  }, []);

  // Prepare chart data
  const pieData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Billable', value: data.billableBreakdown.billable },
      { name: 'Non-billable', value: data.billableBreakdown.nonBillable },
    ].filter((d) => d.value > 0);
  }, [data]);

  const barData = useMemo(() => {
    if (!data) return [];
    return data.topProjects.map((p) => ({
      name: p.projectName.length > 15 ? p.projectName.slice(0, 15) + '...' : p.projectName,
      fullName: p.projectName,
      hours: Number((p.totalMinutes / 60).toFixed(1)),
    }));
  }, [data]);

  const lineData = useMemo(() => {
    if (!data) return [];
    return data.dailyHours.map((d) => ({
      date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      hours: Number((d.totalMinutes / 60).toFixed(1)),
    }));
  }, [data]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

        {/* Date range selector */}
        <div className="flex flex-wrap items-center gap-2">
          {(['this_week', 'last_week', 'this_month', 'last_month'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handlePresetChange(p)}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                preset === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              ].join(' ')}
            >
              {p === 'this_week' && 'This Week'}
              {p === 'last_week' && 'Last Week'}
              {p === 'this_month' && 'This Month'}
              {p === 'last_month' && 'Last Month'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handlePresetChange('custom')}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              preset === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ].join(' ')}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Custom date inputs */}
      {preset === 'custom' && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <label htmlFor="start-date" className="text-sm font-medium text-gray-700">
              Start
            </label>
            <input
              id="start-date"
              type="date"
              value={formatDateForInput(customStart)}
              onChange={handleCustomStartChange}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="end-date" className="text-sm font-medium text-gray-700">
              End
            </label>
            <input
              id="end-date"
              type="date"
              value={formatDateForInput(customEnd)}
              onChange={handleCustomEndChange}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !data && (
        <div className="space-y-6">
          {/* Cards skeleton */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
          {/* Charts skeleton */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-80 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-80 animate-pulse rounded-lg bg-gray-200" />
          </div>
          <div className="h-80 animate-pulse rounded-lg bg-gray-200" />
        </div>
      )}

      {/* Dashboard content */}
      {data && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total hours */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2.5">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-500">Total Hours</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMinutesToHours(data.totalMinutes)}
                  </p>
                </div>
              </div>
            </div>

            {/* Billable hours */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2.5">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-500">Billable Hours</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMinutesToHours(data.billableMinutes)}
                  </p>
                </div>
              </div>
            </div>

            {/* Active projects */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-violet-100 p-2.5">
                  <FolderOpen className="h-5 w-5 text-violet-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-500">Active Projects</p>
                  <p className="text-2xl font-bold text-gray-900">{data.activeProjects}</p>
                </div>
              </div>
            </div>

            {/* Pending entries */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-100 p-2.5">
                  <FileQuestion className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-500">Pending Entries</p>
                  <p className="text-2xl font-bold text-gray-900">{data.pendingEntries}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Pie chart: Billable vs Non-billable */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Billable vs Non-billable
              </h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatMinutesToHours(value)}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-gray-500">
                  No data for this period
                </div>
              )}
            </div>

            {/* Bar chart: Top 10 projects */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Projects by Hours</h2>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                    <XAxis type="number" tickFormatter={(v) => `${v}h`} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number, name: string, props: { payload: { fullName: string } }) => [
                        `${value}h`,
                        props.payload.fullName,
                      ]}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                      }}
                    />
                    <Bar dataKey="hours" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-gray-500">
                  No data for this period
                </div>
              )}
            </div>
          </div>

          {/* Line chart: Hours per day */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Hours per Day</h2>
            {lineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={lineData} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${v}h`} />
                  <Tooltip
                    formatter={(value: number) => [`${value}h`, 'Hours']}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="hours"
                    name="Hours"
                    stroke={LINE_COLOR}
                    strokeWidth={2}
                    dot={{ fill: LINE_COLOR, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[320px] items-center justify-center text-gray-500">
                No data for this period
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
