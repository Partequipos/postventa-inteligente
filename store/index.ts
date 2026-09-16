/**
 * PARTEQUIPOS SAS — Global Zustand Stores
 *
 * All stores are exported from this single entry point for clean imports:
 *   import { useUserStore, useCartStore, ... } from "@/store"
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User, UserRole } from "@/lib/mock-data";
import { signOut as supabaseSignOut } from "@/lib/supabase/auth";
import { clearLastActivity, touchLastActivity } from "@/lib/session-inactivity";

/** Rol placeholder solo interno; la UI no debe mostrarlo sin sesión. */
const ANONYMOUS_ROLE: UserRole = "Viewer";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: string;
  isRead: boolean;
  entityId?: string;
  entityType?: string;
  link?: string;
}

export interface FilterState {
  [key: string]: string | string[] | number | boolean | undefined;
}

export interface CartItem {
  partId: string;
  sapCode: string;
  description: string;
  brand: string;
  quantity: number;
  unitPrice: number;
  imageUrl?: string;
}

const LOGGED_OUT_STATE = {
  currentUser: null as User | null,
  role: ANONYMOUS_ROLE,
  isAuthenticated: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. User Store
// ─────────────────────────────────────────────────────────────────────────────

interface UserState {
  /** Usuario autenticado; null si no hay sesión. */
  currentUser: User | null;
  role: UserRole;
  isAuthenticated: boolean;
  /** true cuando ya se validó la sesión contra Supabase (o modo mock). */
  authReady: boolean;

  /** Establece el usuario tras login / hidratación de sesión Supabase. */
  setUser: (user: User) => void;
  /** Limpia el store local (sin llamar a Supabase). */
  clearSession: () => void;
  setAuthReady: (ready: boolean) => void;
  /** Cierra sesión en Supabase y limpia el store. */
  logout: () => Promise<void>;
}

/**
 * La sesión NO se persiste en Zustand: solo Supabase Auth (localStorage JWT).
 * Evita “Usuario Visualizador” fantasma tras días sin entrar.
 */
export const useUserStore = create<UserState>()((set) => ({
  ...LOGGED_OUT_STATE,
  authReady: false,

  setUser: (user) => {
    touchLastActivity();
    set({
      currentUser: user,
      role: user.role,
      isAuthenticated: true,
      authReady: true,
    });
  },

  clearSession: () => set({ ...LOGGED_OUT_STATE, authReady: true }),

  setAuthReady: (ready) => set({ authReady: ready }),

  logout: async () => {
    try {
      clearLastActivity();
      await supabaseSignOut();
    } finally {
      clearLastActivity();
      set({ ...LOGGED_OUT_STATE, authReady: true });
    }
  },
}));

/** Limpia restos de versiones anteriores que guardaban sesión en sessionStorage. */
export function purgeStaleUserPersistence(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem("partequipos-user");
    window.localStorage.removeItem("partequipos-user");
    // Migración: la actividad de sesión ahora vive en localStorage
    window.sessionStorage.removeItem("partequipos-last-activity");
  } catch {
    // ignore quota / private mode
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Notification Store
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;

  /** Push a new notification (auto-generates id if not provided). */
  addNotification: (notification: Omit<Notification, "id" | "isRead" | "timestamp">) => void;
  /** Mark every notification as read and reset the badge counter. */
  markAllRead: () => void;
  /** Mark a single notification as read. */
  markRead: (id: string) => void;
  /** Delete a notification by id. */
  removeNotification: (id: string) => void;
  /** Delete all notifications. */
  clearAll: () => void;
}

const SEED_NOTIFICATIONS: Notification[] = [
  {
    id: "notif-001",
    title: "Equipo en Estado Crítico",
    message: "Hitachi ZX350LC-6 (Mineros S.A.) requiere atención inmediata. Fuga hidráulica detectada.",
    type: "error",
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    entityId: "maq-006",
    entityType: "Equipo",
    link: "/equipos/maq-006",
  },
  {
    id: "notif-002",
    title: "Mantenimiento Vencido",
    message: "OT-2024-00834 para Hitachi ZX350 venció el 2024-11-20. Priorizar reprogramación.",
    type: "warning",
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    entityId: "sched-003",
    entityType: "Mantenimiento",
    link: "/mantenimiento/sched-003",
  },
  {
    id: "notif-003",
    title: "Stock Bajo: Sello Hidráulico Hitachi",
    message: "CPP-1006-SA tiene solo 3 unidades en stock (mínimo: 5). Generar orden de compra.",
    type: "warning",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    entityId: "part-006",
    entityType: "Repuesto",
    link: "/repuestos/part-006",
  },
  {
    id: "notif-004",
    title: "OT Completada",
    message: "OT-2024-00821 completada: PM 250H Volvo EC480E. Duración: 3.5 horas.",
    type: "success",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    isRead: true,
    entityId: "sched-005",
    entityType: "Mantenimiento",
    link: "/mantenimiento/sched-005",
  },
  {
    id: "notif-005",
    title: "Cotización Enviada",
    message: "CPP-Q-2024-0892 enviada a Mineros S.A. por $18.640.000.",
    type: "info",
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    isRead: true,
    entityId: "CPP-Q-2024-0892",
    entityType: "Cotización",
  },
];

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: SEED_NOTIFICATIONS,
  unreadCount: SEED_NOTIFICATIONS.filter((n) => !n.isRead).length,

  addNotification: (notification) => {
    const newNotif: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      isRead: false,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      notifications: [newNotif, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),

  markRead: (id) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      );
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.isRead).length,
      };
    }),

  removeNotification: (id) =>
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.isRead).length,
      };
    }),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// 3. Theme Store
// ─────────────────────────────────────────────────────────────────────────────

interface ThemeState {
  /** Whether the dark theme is active. Default: false (light mode). */
  isDark: boolean;
  toggleTheme: () => void;
  setDark: (isDark: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: false,

      toggleTheme: () =>
        set((state) => ({ isDark: !state.isDark })),

      setDark: (isDark) => set({ isDark }),
    }),
    {
      name: "partequipos-theme",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Filter Store
// ─────────────────────────────────────────────────────────────────────────────

interface FilterStoreState {
  /** Generic key-value filter map, namespaced by module if needed. */
  filters: FilterState;
  /** Set (or update) a single filter key. */
  setFilter: (key: string, value: FilterState[string]) => void;
  /** Remove a single filter key. */
  removeFilter: (key: string) => void;
  /** Reset all filters to an empty object. */
  clearFilters: () => void;
  /** Convenience: get filters for a specific module prefix (e.g. "machines.") */
  getModuleFilters: (prefix: string) => FilterState;
}

export const useFilterStore = create<FilterStoreState>()((set, get) => ({
  filters: {},

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),

  removeFilter: (key) =>
    set((state) => {
      const next = { ...state.filters };
      delete next[key];
      return { filters: next };
    }),

  clearFilters: () => set({ filters: {} }),

  getModuleFilters: (prefix) => {
    const { filters } = get();
    return Object.fromEntries(
      Object.entries(filters)
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => [k.slice(prefix.length), v])
    );
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cart Store  (spare-parts order / quote builder)
// ─────────────────────────────────────────────────────────────────────────────

interface CartState {
  items: CartItem[];
  /** Add a part to the cart, or increment quantity if it already exists. */
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  /** Remove a part from the cart entirely. */
  removeItem: (partId: string) => void;
  /** Update the quantity of a cart item (removes it if quantity ≤ 0). */
  updateQuantity: (partId: string, quantity: number) => void;
  /** Empty the entire cart. */
  clearCart: () => void;
  /** Computed total price (sum of unitPrice × quantity). */
  total: () => number;
  /** Number of distinct line items. */
  itemCount: () => number;
  /** Total units across all line items. */
  totalUnits: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) =>
        set((state) => {
          const qty = item.quantity ?? 1;
          const existing = state.items.find((i) => i.partId === item.partId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.partId === item.partId ? { ...i, quantity: i.quantity + qty } : i
              ),
            };
          }
          return {
            items: [...state.items, { ...item, quantity: qty }],
          };
        }),

      removeItem: (partId) =>
        set((state) => ({
          items: state.items.filter((i) => i.partId !== partId),
        })),

      updateQuantity: (partId, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((i) => i.partId !== partId) };
          }
          return {
            items: state.items.map((i) =>
              i.partId === partId ? { ...i, quantity } : i
            ),
          };
        }),

      clearCart: () => set({ items: [] }),

      total: () =>
        get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),

      itemCount: () => get().items.length,

      totalUnits: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: "partequipos-cart",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
