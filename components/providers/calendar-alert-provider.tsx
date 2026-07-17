"use client";

import { useCalendarAlerts } from '@/hooks/use-calendar-alerts';
import { Toaster } from '@/components/ui/sonner';

export function CalendarAlertProvider({ children }: { children: React.ReactNode }) {
  useCalendarAlerts();

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
