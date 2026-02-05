'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventResizeDoneArg,
  DatesSetArg,
} from '@fullcalendar/core';
import type { EventInput } from '@fullcalendar/core';
import useSWR from 'swr';
import { api } from '@/lib/api/client';
import { getProjectColor } from '@/lib/utils/colors';
import { useToast } from '@/../components/ui/toast';
import TimeEntryModal, { type TimeEntryForModal } from '@/../components/calendar/time-entry-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimeEntryDetailed {
  id: string;
  projectId: string;
  taskId: string;
  projectName: string;
  taskName: string;
  startTime: string;
  endTime: string;
  description: string | null;
}

interface PaginatedEntries {
  items: TimeEntryDetailed[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = (url: string) => api.get<PaginatedEntries>(url);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);
  const { showToast } = useToast();

  // Date range tracked from FullCalendar's view.
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  // Modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntryForModal | null>(null);
  const [initialDate, setInitialDate] = useState<Date | undefined>();

  // Build the SWR key from the current view's date range.
  const swrKey = dateRange
    ? `/api/time-entries?startDate=${dateRange.start}&endDate=${dateRange.end}&pageSize=100`
    : null;

  const { data, isLoading, mutate } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
  });

  // -----------------------------------------------------------------------
  // Transform API entries → FullCalendar events
  // -----------------------------------------------------------------------

  const events: EventInput[] = useMemo(() => {
    if (!data?.items) return [];

    return data.items.map((entry) => {
      const color = getProjectColor(entry.projectId);
      return {
        id: entry.id,
        title: `${entry.projectName} — ${entry.taskName}`,
        start: entry.startTime,
        end: entry.endTime,
        backgroundColor: color.bg,
        borderColor: color.border,
        textColor: '#ffffff',
        extendedProps: {
          projectId: entry.projectId,
          taskId: entry.taskId,
          projectName: entry.projectName,
          taskName: entry.taskName,
          description: entry.description,
        },
      };
    });
  }, [data]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  /** Called whenever the visible date range changes (navigation / view switch). */
  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({
      start: arg.startStr,
      end: arg.endStr,
    });
  }, []);

  /** Click on an empty slot → create. */
  const handleSelect = useCallback((arg: DateSelectArg) => {
    setEditEntry(null);
    setInitialDate(arg.start);
    setModalOpen(true);
    // Unselect the highlight.
    const calApi = calendarRef.current?.getApi();
    calApi?.unselect();
  }, []);

  /** Click on existing event → edit. */
  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const ev = arg.event;
      const item = data?.items.find((e) => e.id === ev.id);
      if (!item) return;

      setEditEntry({
        id: item.id,
        projectId: item.projectId,
        taskId: item.taskId,
        startTime: item.startTime,
        endTime: item.endTime,
        description: item.description,
      });
      setInitialDate(undefined);
      setModalOpen(true);
    },
    [data],
  );

  /** Drag event to a different time slot. */
  const handleEventDrop = useCallback(
    async (arg: EventDropArg) => {
      try {
        await api.put(`/api/time-entries/${arg.event.id}`, {
          startTime: arg.event.startStr,
          endTime: arg.event.endStr,
        });
        showToast('Entry moved.', 'success');
        mutate();
      } catch (err) {
        showToast((err as Error).message || 'Failed to move entry.', 'error');
        arg.revert();
      }
    },
    [mutate, showToast],
  );

  /** Resize event → update duration. */
  const handleEventResize = useCallback(
    async (arg: EventResizeDoneArg) => {
      try {
        await api.put(`/api/time-entries/${arg.event.id}`, {
          startTime: arg.event.startStr,
          endTime: arg.event.endStr,
        });
        showToast('Duration updated.', 'success');
        mutate();
      } catch (err) {
        showToast((err as Error).message || 'Failed to resize entry.', 'error');
        arg.revert();
      }
    },
    [mutate, showToast],
  );

  /** After modal save — refetch. */
  const handleSaved = useCallback(() => {
    mutate();
  }, [mutate]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
      </div>

      {/* Loading skeleton */}
      {isLoading && !data && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
      )}

      {/* Calendar */}
      <div className={isLoading && !data ? 'hidden' : ''}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,today,next',
            center: 'title',
            right: 'timeGridDay,timeGridWeek,dayGridMonth',
          }}
          height="auto"
          nowIndicator
          allDaySlot={false}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          scrollTime="08:00:00"
          // Interaction.
          selectable
          editable
          eventResizableFromStart
          selectMirror
          // Events.
          events={events}
          // Callbacks.
          datesSet={handleDatesSet}
          select={handleSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          // Styling.
          eventDisplay="block"
          dayMaxEvents={3}
        />
      </div>

      {/* Create / edit modal */}
      <TimeEntryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        entry={editEntry}
        initialDate={initialDate}
      />
    </>
  );
}
