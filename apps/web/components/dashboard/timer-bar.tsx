'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api } from '@/lib/api/client';
import { useToast } from '@/../components/ui/toast';
import { Play, Square, X, ChevronDown, ChevronUp } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimerState {
  startedAt: string; // ISO string
  projectId: string;
  taskId: string;
  description: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  name: string;
  projectId: string;
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: { total: number };
}

export interface TimerBarProps {
  /** When true, show the setup form even if no timer is running. */
  showSetup: boolean;
  /** Called when the setup form is dismissed without starting. */
  onSetupDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'hour-tracker-timer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadTimerState(): TimerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TimerState;
  } catch {
    return null;
  }
}

function saveTimerState(state: TimerState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearTimerState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = <T,>(url: string) => api.get<T>(url);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimerBar({ showSetup, onSetupDismiss }: TimerBarProps) {
  const { showToast } = useToast();
  const { mutate: globalMutate } = useSWRConfig();

  // Timer state from localStorage.
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [stopping, setStopping] = useState(false);

  // Setup form state (when starting a new timer).
  const [setupProjectId, setSetupProjectId] = useState('');
  const [setupTaskId, setSetupTaskId] = useState('');
  const [setupDescription, setSetupDescription] = useState('');
  const [expanded, setExpanded] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch projects & tasks when visible.
  const isVisible = showSetup || timer !== null;

  const { data: projectData } = useSWR<PaginatedResponse<ProjectOption>>(
    isVisible ? '/api/projects?pageSize=100' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: taskData } = useSWR<PaginatedResponse<TaskOption>>(
    isVisible ? '/api/tasks?pageSize=100' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const projects = projectData?.items ?? [];
  const allTasks = taskData?.items ?? [];

  const setupFilteredTasks = useMemo(
    () => allTasks.filter((t) => t.projectId === setupProjectId),
    [allTasks, setupProjectId],
  );

  const runningProjectName = useMemo(
    () => projects.find((p) => p.id === timer?.projectId)?.name ?? '',
    [projects, timer?.projectId],
  );

  const runningTaskName = useMemo(
    () => allTasks.find((t) => t.id === timer?.taskId)?.name ?? '',
    [allTasks, timer?.taskId],
  );

  // Load from localStorage on mount.
  useEffect(() => {
    setTimer(loadTimerState());
  }, []);

  // Tick interval.
  useEffect(() => {
    if (timer) {
      const tick = () => {
        const ms = Date.now() - new Date(timer.startedAt).getTime();
        setElapsed(formatElapsed(ms));
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      setElapsed('00:00:00');
    }
  }, [timer]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleStart = useCallback(() => {
    if (!setupProjectId || !setupTaskId) {
      showToast('Select a project and task to start the timer.', 'error');
      return;
    }

    const state: TimerState = {
      startedAt: new Date().toISOString(),
      projectId: setupProjectId,
      taskId: setupTaskId,
      description: setupDescription,
    };

    saveTimerState(state);
    setTimer(state);
    setSetupProjectId('');
    setSetupTaskId('');
    setSetupDescription('');
    onSetupDismiss();
  }, [setupProjectId, setupTaskId, setupDescription, showToast, onSetupDismiss]);

  const handleStop = useCallback(async () => {
    if (!timer) return;
    setStopping(true);

    try {
      const endTime = new Date().toISOString();

      await api.post('/api/time-entries', {
        projectId: timer.projectId,
        taskId: timer.taskId,
        startTime: timer.startedAt,
        endTime,
        description: timer.description || undefined,
      });

      clearTimerState();
      setTimer(null);
      showToast('Time entry saved.', 'success');

      // Revalidate any time-entry SWR caches.
      globalMutate((key: string) =>
        typeof key === 'string' && (key.startsWith('/api/time-entries') || key.startsWith('/api/reports')),
      );
    } catch (err) {
      showToast((err as Error).message || 'Failed to save time entry.', 'error');
    } finally {
      setStopping(false);
    }
  }, [timer, showToast, globalMutate]);

  const handleDiscard = useCallback(() => {
    clearTimerState();
    setTimer(null);
    showToast('Timer discarded.', 'info');
  }, [showToast]);

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!timer) {
        setSetupDescription(e.target.value);
        return;
      }
      const updated = { ...timer, description: e.target.value };
      saveTimerState(updated);
      setTimer(updated);
    },
    [timer],
  );

  const handleDismissSetup = useCallback(() => {
    setSetupProjectId('');
    setSetupTaskId('');
    setSetupDescription('');
    onSetupDismiss();
  }, [onSetupDismiss]);

  // Don't render if nothing to show.
  if (!isVisible) return null;

  // -----------------------------------------------------------------------
  // Render: Setup mode (no timer running, user wants to start one)
  // -----------------------------------------------------------------------

  if (!timer) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-lg lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Project */}
            <select
              value={setupProjectId}
              onChange={(e) => {
                setSetupProjectId(e.target.value);
                setSetupTaskId('');
              }}
              className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {/* Task */}
            <select
              value={setupTaskId}
              onChange={(e) => setSetupTaskId(e.target.value)}
              disabled={!setupProjectId}
              className={[
                'w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
                !setupProjectId ? 'bg-gray-100 opacity-50' : '',
              ].join(' ')}
            >
              <option value="">{setupProjectId ? 'Task...' : 'Select project first'}</option>
              {setupFilteredTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {/* Description */}
            <input
              type="text"
              value={setupDescription}
              onChange={(e) => setSetupDescription(e.target.value)}
              placeholder="What are you working on?"
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            {/* Start */}
            <button
              type="button"
              onClick={handleStart}
              disabled={!setupProjectId || !setupTaskId}
              className={[
                'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white transition-colors',
                setupProjectId && setupTaskId
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'cursor-not-allowed bg-gray-300',
              ].join(' ')}
            >
              <Play className="h-4 w-4" />
              Start
            </button>

            {/* Dismiss */}
            <button
              type="button"
              onClick={handleDismissSetup}
              className="rounded-md p-1.5 text-gray-400 hover:text-gray-600"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Running timer
  // -----------------------------------------------------------------------

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-green-200 bg-green-50 shadow-lg lg:left-64">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        {/* Elapsed time */}
        <div className="font-mono text-xl font-bold tabular-nums text-green-700">
          {elapsed}
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-green-200" aria-hidden="true" />

        {/* Project & Task info */}
        <div className="hidden min-w-0 flex-shrink-0 sm:block">
          <p className="truncate text-sm font-medium text-gray-900">
            {runningProjectName}
          </p>
          <p className="truncate text-xs text-gray-500">{runningTaskName}</p>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md p-1 text-gray-400 hover:text-gray-600 sm:hidden"
          aria-label="Toggle details"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        {/* Description (editable while running) */}
        <input
          type="text"
          value={timer.description}
          onChange={handleDescriptionChange}
          placeholder="What are you working on?"
          className="hidden min-w-0 flex-1 rounded-md border border-green-200 bg-white px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 sm:block"
        />

        {/* Spacer */}
        <div className="flex-1 sm:hidden" />

        {/* Stop */}
        <button
          type="button"
          onClick={handleStop}
          disabled={stopping}
          className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          <Square className="h-4 w-4" />
          {stopping ? 'Saving...' : 'Stop'}
        </button>

        {/* Discard */}
        <button
          type="button"
          onClick={handleDiscard}
          disabled={stopping}
          className="rounded-md p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-50"
          aria-label="Discard timer"
          title="Discard timer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Mobile expanded details */}
      {expanded && (
        <div className="border-t border-green-200 px-4 py-2 sm:hidden">
          <p className="truncate text-sm font-medium text-gray-900">
            {runningProjectName} — {runningTaskName}
          </p>
          <input
            type="text"
            value={timer.description}
            onChange={handleDescriptionChange}
            placeholder="What are you working on?"
            className="mt-2 w-full rounded-md border border-green-200 bg-white px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
      )}
    </div>
  );
}
