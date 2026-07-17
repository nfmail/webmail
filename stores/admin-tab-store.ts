import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const ADMIN_TABS = [
  'dashboard',
  'settings',
  'branding',
  'auth',
  'policy',
  'plugins',
  'themes',
  'marketplace',
  'version',
  'telemetry',
  'logs',
] as const;

export type AdminTabId = typeof ADMIN_TABS[number];

// Human-readable label per tab, shared between the sidebar triggers (layout)
// and the tab panel's accessible name (page). Single source of truth so the
// two ARIA-linked surfaces can't drift apart.
export const ADMIN_TAB_LABELS: Record<AdminTabId, string> = {
  dashboard: 'Dashboard',
  settings: 'Settings',
  branding: 'Branding',
  auth: 'Authentication',
  policy: 'Policy',
  plugins: 'Plugins',
  themes: 'Themes',
  marketplace: 'Marketplace',
  version: 'Version',
  telemetry: 'Telemetry',
  logs: 'Audit Log',
};

// Stable DOM id for the active tab's panel (role="tabpanel", rendered in
// admin/page.tsx). Triggers reference it via aria-controls.
export const adminTabPanelId = (tab: AdminTabId) => `admin-tabpanel-${tab}`;

export function isAdminTab(value: string | null | undefined): value is AdminTabId {
  return typeof value === 'string' && (ADMIN_TABS as readonly string[]).includes(value);
}

interface AdminTabState {
  activeTab: AdminTabId;
  setActiveTab: (tab: AdminTabId) => void;
}

// Tab state lives in client memory + localStorage. Sidebar clicks update
// state (no URL navigation) so React can commit the transition immediately,
// avoiding the dev-mode "Rendering…" hang we saw when each tab was its own
// route or distinguished by ?tab= search param.
export const useAdminTabStore = create<AdminTabState>()(
  persist(
    (set) => ({
      activeTab: 'dashboard',
      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    { name: 'admin_active_tab' },
  ),
);
