"use client";

import { useState, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { downloadOportunidadesProgramadasPdf } from "@/lib/proyectados/oportunidades-pdf";
import { downloadOportunidadesProgramadasExcel } from "@/lib/proyectados/oportunidades-excel";
import { ProyectadosImportPanel } from "@/components/modules/proyectados-import-panel";
import {
  Wrench,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCheck,
  Clock,
  Cpu,
  Bell,
  FileText,
  RefreshCw,
  Zap,
  MapPin,
  Filter,
  X,
  Loader2,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KPICard } from "@/components/ui/kpi-card";
import { AppShell } from "@/components/layout/app-shell";
import { useUserStore } from "@/store";
import {
  useTelemetriaEquipos,
  useProyectadosImportHistory,
} from "@/hooks/use-projected-maintenance";
import type { ProyectadosImportLog } from "@/services/projected-maintenance.service";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ReportFiltersBar,
} from "@/components/modules/report-filters-bar";
import {
  sortLocale,
  matchesStringFilter,
  matchesTelemetriaReportFilters,
  PROJECTED_MAINTENANCE_FILTERS_KEY,
} from "@/lib/report-filters";
import { usePersistedReportFilters } from "@/hooks/use-persisted-report-filters";
import {
  mapTelemetriaToOpportunityRows,
  mapTelemetriaToCalendarEvents,
  aggregateMarcasPie,
  aggregateOportunidadesPorSede,
  aggregateOportunidadesPorCliente,
  sedeChartHeight,
  SEDE_CHART_Y_AXIS_WIDTH,
  CLIENT_CHART_Y_AXIS_WIDTH,
  sortOportunidadesProximas,
  hasValidMapCoordinates,
  buildGoogleMapsUrl,
  formatTipoMttoLabel,
  type MaintenanceStatusUi,
  type TelemetriaOpportunityRow,
  type TelemetriaCalendarEvent,
} from "@/lib/proyectados/map-telemetria-ui";
import {
  buildServicesByDepartment,
  buildServicesByDepartmentMunicipality,
  buildSiteLocationAggregates,
  buildGpsMarkersFromEntries,
  filterVistaDetalleEntries,
  mapRowsToMapEntries,
  uniqueSorted,
} from "@/lib/proyectados/map-service-counts";
import { toCanonicalDepartment } from "@/lib/proyectados/department-mapping";
import { ColombiaMap } from "@/components/maps/colombia-map";
import { MultiSelect } from "@/components/ui/multi-select";
import type { TelemetriaEquipo } from "@/types/database";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type MaintenanceStatus = MaintenanceStatusUi;

interface MaintenanceEvent {
  id: string;
  day: number;
  title: string;
  status: MaintenanceStatus;
  serie: string;
  sede: string;
  client: string;
  advisor: string;
  hours: number;
  tipoMtto: number | null;
}

type MaintenanceRow = TelemetriaOpportunityRow;

interface ImportRecord {
  id: string;
  date: string;
  fileName: string;
  records: number;
  status: "Success" | "Failed" | "Processing";
  user: string;
}

interface AutomationStep {
  number: number;
  icon: React.ElementType;
  title: string;
  description: string;
  status: "Planned" | "In Development";
}

// Roadmap de producto (no es data de prueba de negocio)
const AUTOMATION_STEPS: AutomationStep[] = [
  { number: 1, icon: Cpu,        title: "Integración SAP",       description: "Extrae diariamente a las 6 AM los datos de equipos directamente del módulo SAP PM. Sincroniza horómetros, órdenes de trabajo y maestros de equipos automáticamente.", status: "Planned"         },
  { number: 2, icon: RefreshCw,  title: "Análisis de Horómetro",   description: "Compara las lecturas actuales del horómetro con los umbrales de mantenimiento definidos por modelo. Marca los equipos que se acercan a los intervalos de servicio con ventanas de tolerancia configurables.", status: "Planned"         },
  { number: 3, icon: Calendar,   title: "Programación Automática",  description: "Crea órdenes de trabajo en borrador con 30 días de anticipación según las horas de operación proyectadas y los planes de mantenimiento. Asigna automáticamente a los asesores de servicio disponibles.", status: "In Development"  },
  { number: 4, icon: Bell,       title: "Motor de Notificaciones",   description: "Envía alertas automáticas por correo y SMS a los asesores de servicio y clientes finales cuando el mantenimiento está próximo. Recordatorios configurables a 30, 15 y 7 días.", status: "Planned"         },
  { number: 5, icon: FileText,   title: "Generación de PDF",        description: "Genera automáticamente cotizaciones de mantenimiento personalizadas con precios de repuestos actuales, estimaciones de mano de obra e historial de servicio. Se adjuntan a las órdenes de trabajo y se envían por correo.", status: "Planned"         },
  { number: 6, icon: Zap,        title: "Actualización del Panel",      description: "Recálculo de KPIs en tiempo real y actualización del panel después de cada ciclo de flujo de trabajo. Seguimiento de tasas de cumplimiento, tendencias de vencimiento y métricas de desempeño de asesores.", status: "In Development"  },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_CONFIG: Record<
  MaintenanceStatus,
  { label: string; className: string; calClass: string }
> = {
  Scheduled:   { label: "Programado",   className: "bg-blue-100 text-blue-700 border-blue-200",    calClass: "bg-blue-500"   },
  Overdue:     { label: "Vencido",     className: "bg-red-100 text-red-700 border-red-200",       calClass: "bg-[#cf1b22]"  },
  "In Progress":{ label: "En Progreso", className: "bg-amber-100 text-amber-700 border-amber-200", calClass: "bg-amber-500"  },
  Completed:   { label: "Completado",   className: "bg-emerald-100 text-emerald-700 border-emerald-200", calClass: "bg-emerald-500" },
};

function getMonthName(month: number): string {
  return new Date(2025, month, 1).toLocaleString("es-ES", { month: "long" });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** KPI Row — totales sobre Fecha Primer Mtto (proyecciones = todos los registros). */
function KPIRow({ rows }: Readonly<{ rows: TelemetriaOpportunityRow[] }>) {
  const totalProyecciones = rows.length;
  const totalMaquinas = new Set(rows.map((r) => r.serie)).size;
  const totalClientes = new Set(rows.map((r) => r.client)).size;
  const programados = rows.filter((r) => r.status === "Scheduled").length;
  const vencidos = totalProyecciones - programados;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Proyecciones"
        value={totalProyecciones}
        change={0}
        changeType="up"
        icon={Wrench}
        variant="default"
        description={`${totalMaquinas} máquinas únicas · total registros`}
      />
      <KPICard
        title="Clientes"
        value={totalClientes}
        change={0}
        changeType="up"
        icon={Calendar}
        variant="default"
        description="Con oportunidades"
      />
      <KPICard
        title="Programados"
        value={programados}
        change={0}
        changeType="up"
        icon={AlertTriangle}
        variant="danger"
        description="Fecha Primer Mtto vigente (≥ hoy)"
      />
      <KPICard
        title="Vencidos"
        value={vencidos}
        change={0}
        changeType="down"
        icon={CheckCircle2}
        variant="success"
        description="Total − programados (1er mtto)"
      />
    </div>
  );
}

const CHART_COLORS = ["#cf1b22", "#50504f", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

function CollapsibleChartCard({
  title,
  children,
  className,
  contentClassName,
  defaultOpen = false,
}: Readonly<{
  title: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
}>) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn("border-border shadow-sm", className)}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={open}
              aria-label={open ? `Contraer ${title}` : `Expandir ${title}`}
            >
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  open && "rotate-180"
                )}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          {open ? (
            <CardContent className={cn("pt-0", contentClassName)}>{children}</CardContent>
          ) : null}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function KpiChartsSection({ rows }: Readonly<{ rows: TelemetriaOpportunityRow[] }>) {
  const byMes = useMemo(() => {
    const map = new Map<string, { mes: string; total: number; vencidos: number }>();
    for (const r of rows) {
      // Indicador por MesCreado (+ Año) / Creado del Excel de telemetría
      const mesLabel =
        r.mesCreado && r.mesCreado !== "—"
          ? r.anio
            ? `${r.mesCreado} ${r.anio}`
            : r.mesCreado
          : r.createdAt
            ? new Date(r.createdAt).toLocaleDateString("es-CO", {
                month: "short",
                year: "numeric",
              })
            : "Sin mes";
      const prev = map.get(mesLabel) ?? { mes: mesLabel, total: 0, vencidos: 0 };
      prev.total += 1;
      if (r.status === "Overdue") prev.vencidos += 1;
      map.set(mesLabel, prev);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes, "es"));
  }, [rows]);

  const bySede = useMemo(() => aggregateOportunidadesPorSede(rows), [rows]);

  const marcaData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.brand, (map.get(r.brand) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value], i) => ({
        name,
        value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const byCliente = useMemo(() => aggregateOportunidadesPorCliente(rows), [rows]);

  const byStatus = useMemo(() => {
    const labels: Record<MaintenanceStatusUi, string> = {
      Scheduled: "Programado",
      Overdue: "Vencido",
      "In Progress": "En curso",
      Completed: "Completado",
    };
    const map = new Map<MaintenanceStatusUi, number>();
    for (const r of rows) {
      map.set(r.status, (map.get(r.status) ?? 0) + 1);
    }
    return (Object.keys(labels) as MaintenanceStatusUi[]).map((status, i) => ({
      tipo: labels[status],
      total: map.get(status) ?? 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Sin proyecciones para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <CollapsibleChartCard
        title="Oportunidades por Mes (Creado / MesCreado)"
        contentClassName="h-56"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <RechartsTooltip />
            <Bar dataKey="total" name="Total" fill="#cf1b22" radius={[4, 4, 0, 0]} />
            <Bar dataKey="vencidos" name="Vencidos" fill="#d97706" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CollapsibleChartCard>

      <CollapsibleChartCard title="Oportunidades por Sede" contentClassName="overflow-visible">
        <div style={{ height: sedeChartHeight(bySede.length), width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bySede}
              layout="vertical"
              margin={{ left: 12, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="sede"
                width={SEDE_CHART_Y_AXIS_WIDTH}
                interval={0}
                ticks={bySede.map((d) => d.sede)}
                tick={{ fontSize: 11, fill: "currentColor" }}
                tickLine={false}
              />
              <RechartsTooltip />
              <Bar dataKey="total" fill="#50504f" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleChartCard>

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Oportunidades por Marca</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={marcaData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
              >
                {marcaData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Estado de proyecciones</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Bar dataKey="total" name="Total" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <CollapsibleChartCard
        title="Oportunidades por Cliente"
        className="lg:col-span-2"
        contentClassName="overflow-visible"
      >
        <div style={{ height: sedeChartHeight(byCliente.length), width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={byCliente}
              layout="vertical"
              margin={{ left: 12, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="cliente"
                width={CLIENT_CHART_Y_AXIS_WIDTH}
                interval={0}
                ticks={byCliente.map((d) => d.cliente)}
                tick={{ fontSize: 11, fill: "currentColor" }}
                tickLine={false}
              />
              <RechartsTooltip />
              <Bar dataKey="total" name="Oportunidades" fill="#cf1b22" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleChartCard>
    </div>
  );
}

/** Cantidad de proyecciones visibles por día antes de expandir. */
const CALENDAR_DAY_PREVIEW = 2;

function CalendarDayCell({
  day,
  events,
  isToday,
  isExpanded,
  selectedEventId,
  onSelectEvent,
  onToggleExpand,
}: Readonly<{
  day: number;
  events: MaintenanceEvent[];
  isToday: boolean;
  isExpanded: boolean;
  selectedEventId: string | null;
  onSelectEvent: (ev: MaintenanceEvent) => void;
  onToggleExpand: (day: number) => void;
}>) {
  const hasOverflow = events.length > CALENDAR_DAY_PREVIEW;
  const visibleEvents = isExpanded ? events : events.slice(0, CALENDAR_DAY_PREVIEW);
  const hiddenCount = events.length - CALENDAR_DAY_PREVIEW;

  return (
    <div className="bg-background min-h-[52px] p-1 relative">
      <span
        className={`text-xs font-medium leading-none ${
          isToday
            ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#cf1b22] text-white"
            : "text-foreground/70"
        }`}
      >
        {day}
      </span>
      <div
        className={cn(
          "mt-0.5 flex flex-col gap-0.5",
          isExpanded && events.length > 6 && "max-h-40 overflow-y-auto pr-0.5"
        )}
      >
        {visibleEvents.map((ev) => (
          <button
            key={ev.id}
            type="button"
            className={cn(
              "rounded-sm px-0.5 py-px text-[9px] font-medium text-white truncate text-left w-full",
              STATUS_CONFIG[ev.status].calClass,
              selectedEventId === ev.id && "ring-2 ring-offset-1 ring-foreground/40"
            )}
            onClick={() => onSelectEvent(ev)}
            aria-pressed={selectedEventId === ev.id}
            aria-label={`Ver detalle de ${ev.title}`}
          >
            {ev.title.split("–")[0].trim()}
          </button>
        ))}
        {hasOverflow && (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground pl-0.5 text-left hover:text-foreground"
            onClick={() => onToggleExpand(day)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? `Contraer proyecciones del día ${day}`
                : `Expandir ${hiddenCount} proyecciones más del día ${day}`
            }
          >
            <ChevronDown
              className={cn("h-2.5 w-2.5 shrink-0 transition-transform", isExpanded && "rotate-180")}
            />
            {isExpanded ? "Ver menos" : `+${hiddenCount} más`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Monthly Maintenance Calendar — fechas reales de telemetría filtrada */
function MaintenanceCalendar({
  equipos,
}: Readonly<{ equipos: TelemetriaEquipo[] }>) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedEvent, setSelectedEvent] = useState<MaintenanceEvent | null>(null);
  const [expandedDays, setExpandedDays] = useState<ReadonlySet<number>>(() => new Set());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const monthEvents = useMemo(() => {
    return mapTelemetriaToCalendarEvents(equipos).filter(
      (ev) => ev.month === viewMonth && ev.year === viewYear
    );
  }, [equipos, viewMonth, viewYear]);

  const eventsByDay = useMemo(() => {
    const byDay: Record<number, MaintenanceEvent[]> = {};
    for (const ev of monthEvents) {
      if (!byDay[ev.day]) byDay[ev.day] = [];
      byDay[ev.day].push({
        id: ev.id,
        day: ev.day,
        title: ev.title,
        status: ev.status,
        serie: ev.serie,
        sede: ev.sede,
        client: ev.client,
        advisor: ev.advisor,
        hours: ev.hours,
        tipoMtto: ev.tipoMtto,
      });
    }
    return byDay;
  }, [monthEvents]);

  const resetMonthUi = () => {
    setSelectedEvent(null);
    setExpandedDays(new Set());
  };

  const prevMonth = () => {
    resetMonthUi();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    resetMonthUi();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const handleSelectEvent = (ev: MaintenanceEvent) => {
    setSelectedEvent((prev) => (prev?.id === ev.id ? null : ev));
  };

  const toggleDayExpanded = (day: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Calendario de Mantenimiento Mensual</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-32 text-center">
              {getMonthName(viewMonth)} {viewYear}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-7 mb-1">
          {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {cells.map((day, idx) => {
            if (day == null) {
              return <div key={`empty-${idx}`} className="bg-background min-h-[52px] p-1" />;
            }
            const events = eventsByDay[day] ?? [];
            const isToday =
              day === today.getDate() &&
              viewMonth === today.getMonth() &&
              viewYear === today.getFullYear();

            return (
              <CalendarDayCell
                key={`day-${viewYear}-${viewMonth}-${day}`}
                day={day}
                events={events}
                isToday={isToday}
                isExpanded={expandedDays.has(day)}
                selectedEventId={selectedEvent?.id ?? null}
                onSelectEvent={handleSelectEvent}
                onToggleExpand={toggleDayExpanded}
              />
            );
          })}
        </div>

        <AnimatePresence>
          {selectedEvent && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm shadow-md"
              role="status"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{selectedEvent.title}</p>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedEvent(null)}
                  aria-label="Cerrar detalle"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">
                Día {selectedEvent.day} ·{" "}
                <span
                  className={cn(
                    "font-medium",
                    selectedEvent.status === "Overdue" && "text-[#cf1b22]"
                  )}
                >
                  {STATUS_CONFIG[selectedEvent.status].label}
                </span>
              </p>
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="flex gap-1.5 min-w-0">
                  <dt className="text-muted-foreground shrink-0">Serie:</dt>
                  <dd className="font-medium font-mono truncate" title={selectedEvent.serie}>
                    {selectedEvent.serie}
                  </dd>
                </div>
                <div className="flex gap-1.5 min-w-0">
                  <dt className="text-muted-foreground shrink-0">Sede:</dt>
                  <dd className="font-medium truncate" title={selectedEvent.sede}>
                    {selectedEvent.sede}
                  </dd>
                </div>
                <div className="flex gap-1.5 min-w-0">
                  <dt className="text-muted-foreground shrink-0">Cliente:</dt>
                  <dd className="font-medium truncate" title={selectedEvent.client}>
                    {selectedEvent.client}
                  </dd>
                </div>
                <div className="flex gap-1.5 min-w-0">
                  <dt className="text-muted-foreground shrink-0">Asesor:</dt>
                  <dd className="font-medium truncate" title={selectedEvent.advisor}>
                    {selectedEvent.advisor}
                  </dd>
                </div>
                <div className="flex gap-1.5 min-w-0">
                  <dt className="text-muted-foreground shrink-0">Horómetro:</dt>
                  <dd className="font-medium font-mono">
                    {selectedEvent.hours.toLocaleString("es-CO")} h
                  </dd>
                </div>
                <div className="flex gap-1.5 min-w-0 sm:col-span-2">
                  <dt className="text-muted-foreground shrink-0">Tipo Mtto:</dt>
                  <dd className="font-medium" title={formatTipoMttoLabel(selectedEvent.tipoMtto)}>
                    {formatTipoMttoLabel(selectedEvent.tipoMtto)}
                  </dd>
                </div>
              </dl>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3 flex flex-wrap gap-3">
          {(Object.keys(STATUS_CONFIG) as MaintenanceStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${STATUS_CONFIG[s].calClass}`} />
              <span className="text-xs text-muted-foreground">{STATUS_CONFIG[s].label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Status badge */
function StatusBadge({ status }: { status: MaintenanceStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CONFIG[status].className}`}
    >
      {STATUS_CONFIG[status].label}
    </span>
  );
}

/** Opportunities Table */
function OpportunitiesTable({
  rows,
}: Readonly<{ rows: TelemetriaOpportunityRow[] }>) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const rowsPerPage = 10;

  const filtered = useMemo(() => {
    const matched = rows.filter((r) => {
    const matchSearch =
      r.equipment.toLowerCase().includes(search.toLowerCase()) ||
      r.brand.toLowerCase().includes(search.toLowerCase()) ||
        r.advisor.toLowerCase().includes(search.toLowerCase()) ||
        r.client.toLowerCase().includes(search.toLowerCase()) ||
        r.serie.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });
    return sortOportunidadesProximas(matched);
  }, [rows, search, statusFilter]);

  const programadasCount = useMemo(
    () => filtered.filter((r) => r.status === "Scheduled").length,
    [filtered]
  );

  const totalRows = filtered.length;
  const pageRows = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const result = await downloadOportunidadesProgramadasPdf(filtered);
      if (!result.ok) {
        toast.warning("No hay oportunidades programadas para exportar.");
        return;
      }
      toast.success(`PDF descargado (${result.count} programada(s)).`);
    } catch {
      toast.error("No se pudo generar el PDF. Intente de nuevo.");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadExcel = async () => {
    setExcelLoading(true);
    try {
      const result = await downloadOportunidadesProgramadasExcel(filtered);
      if (!result.ok) {
        toast.warning("No hay oportunidades programadas para exportar.");
        return;
      }
      toast.success(`Excel descargado (${result.count} programada(s)).`);
    } catch {
      toast.error("No se pudo generar el Excel. Intente de nuevo.");
    } finally {
      setExcelLoading(false);
    }
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Oportunidades Próximas</CardTitle>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void handleDownloadPdf()}
              disabled={pdfLoading || excelLoading || programadasCount === 0}
              aria-label="Descargar oportunidades programadas en PDF"
            >
              {pdfLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-[#cf1b22]" />
              )}
              PDF programadas
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void handleDownloadExcel()}
              disabled={excelLoading || pdfLoading || programadasCount === 0}
              aria-label="Descargar oportunidades programadas en Excel"
            >
              {excelLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5 text-[#cf1b22]" />
              )}
              Excel programadas
            </Button>
            <div className="relative flex-1 sm:w-52">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar equipo…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-36 text-sm">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="Scheduled">Programado</SelectItem>
                <SelectItem value="Overdue">Vencido</SelectItem>
                <SelectItem value="In Progress">En Progreso</SelectItem>
                <SelectItem value="Completed">Completado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table noScrollWrapper className="w-full table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[9%] text-[11px] font-semibold pl-3">Equipo</TableHead>
              <TableHead className="w-[6%] text-[11px] font-semibold">Marca</TableHead>
              <TableHead className="w-[7%] text-[11px] font-semibold">Modelo</TableHead>
              <TableHead className="w-[7%] text-[11px] font-semibold">Serie</TableHead>
              <TableHead className="w-[5%] text-[11px] font-semibold text-right">Horas</TableHead>
              <TableHead className="w-[10%] text-[11px] font-semibold">Tipo Mtto</TableHead>
              <TableHead className="w-[8%] text-[11px] font-semibold">Descarga telemetría</TableHead>
              <TableHead className="w-[9%] text-[11px] font-semibold">Fecha Estimada de Mtto</TableHead>
              <TableHead className="w-[7%] text-[11px] font-semibold">Estado</TableHead>
              <TableHead className="w-[9%] text-[11px] font-semibold">Asesor</TableHead>
              <TableHead className="w-[11%] text-[11px] font-semibold">Cliente</TableHead>
              <TableHead className="w-[12%] text-[11px] font-semibold pr-3 text-center">Ubicación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {pageRows.length === 0 ? (
                <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground text-sm">
                    No se encontraron resultados
                  </TableCell>
                </TableRow>
              ) : (
              pageRows.map((row, i) => {
                const canOpenMaps = hasValidMapCoordinates(row.latitud, row.longitud);
                return (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                  <TableCell className="text-[11px] font-medium pl-3 py-2 max-w-0 truncate" title={row.equipment}>
                    {row.equipment}
                  </TableCell>
                  <TableCell className="text-[11px] py-2 max-w-0 truncate" title={row.brand}>
                    {row.brand}
                  </TableCell>
                  <TableCell className="text-[11px] py-2 text-muted-foreground max-w-0 truncate" title={row.model}>
                    {row.model}
                  </TableCell>
                  <TableCell className="text-[11px] py-2 font-mono max-w-0 truncate" title={row.serie}>
                    {row.serie}
                  </TableCell>
                  <TableCell className="text-[11px] py-2 text-right font-mono font-semibold">
                    {row.hours.toLocaleString()}
                  </TableCell>
                  <TableCell
                    className="text-[11px] py-2 max-w-0 truncate"
                    title={formatTipoMttoLabel(row.tipoMtto)}
                  >
                    {formatTipoMttoLabel(row.tipoMtto)}
                  </TableCell>
                  <TableCell className="text-[11px] py-2 text-muted-foreground max-w-0 truncate" title={row.lastMaintenance}>
                    {row.lastMaintenance}
                  </TableCell>
                  <TableCell className="text-[11px] py-2 font-medium max-w-0 truncate" title={row.nextDue}>
                    {row.nextDue}
                  </TableCell>
                  <TableCell className="py-2">
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-[11px] py-2 text-muted-foreground max-w-0 truncate" title={row.advisor}>
                    {row.advisor}
                  </TableCell>
                  <TableCell className="text-[11px] py-2 max-w-0 truncate" title={row.client}>
                    {row.client}
                  </TableCell>
                  <TableCell className="py-2 pr-3 text-center">
                    {canOpenMaps && row.latitud != null && row.longitud != null ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[10px]"
                        asChild
                      >
                        <a
                          href={buildGoogleMapsUrl(row.latitud, row.longitud)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Abrir en Google Maps (${row.latitud}, ${row.longitud})`}
                          aria-label={`Abrir ubicación de ${row.serie} en Google Maps`}
                        >
                          <MapPin className="h-3 w-3 text-[#cf1b22]" />
                          Maps
                        </a>
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground" title="Sin latitud/longitud en telemetría">
                        Sin GPS
                      </span>
                    )}
                  </TableCell>
                  </motion.tr>
                );
              })
              )}
            </TableBody>
          </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {totalRows === 0
              ? "Sin resultados"
              : `Mostrando ${(page - 1) * rowsPerPage + 1}–${Math.min(page * rowsPerPage, totalRows)} de ${totalRows} resultados`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {Array.from({ length: Math.max(1, Math.ceil(totalRows / rowsPerPage)) }, (_, i) => i + 1)
              .slice(0, 5)
              .map((p) => (
              <Button
                key={p}
                variant={page === p ? "default" : "outline"}
                size="sm"
                className={`h-7 w-7 text-xs p-0 ${page === p ? "bg-[#cf1b22] hover:bg-[#b01820] border-[#cf1b22]" : ""}`}
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={page >= Math.max(1, Math.ceil(totalRows / rowsPerPage))}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Distribución mapa + filtros (Vista detalle) */
function DistribucionEquiposSection({
  rows,
}: Readonly<{ rows: TelemetriaOpportunityRow[] }>) {
  const [detailFilterZones, setDetailFilterZones] = useState<string[]>([]);
  const [detailFilterSites, setDetailFilterSites] = useState<string[]>([]);
  const [detailFilterTechnicians, setDetailFilterTechnicians] = useState<string[]>([]);

  const entries = useMemo(() => mapRowsToMapEntries(rows), [rows]);

  const zoneOptions = useMemo(
    () =>
      uniqueSorted(
        entries
          .map((e) => toCanonicalDepartment(e.zone))
          .filter((z) => z !== "Sin zona")
      ),
    [entries]
  );

  const siteOptions = useMemo(() => {
    const source =
      detailFilterZones.length === 0
        ? entries
        : entries.filter((e) =>
            detailFilterZones.includes(toCanonicalDepartment(e.zone))
          );
    return uniqueSorted(source.map((e) => e.site || "Sin sitio"));
  }, [entries, detailFilterZones]);

  const technicianOptions = useMemo(
    () => uniqueSorted(entries.map((e) => e.technician)),
    [entries]
  );

  const mapFilterEntries = useMemo(
    () =>
      filterVistaDetalleEntries(
        entries,
        detailFilterZones,
        [],
        detailFilterTechnicians
      ),
    [entries, detailFilterZones, detailFilterTechnicians]
  );

  const displayedEntries = useMemo(
    () =>
      filterVistaDetalleEntries(
        entries,
        detailFilterZones,
        detailFilterSites,
        detailFilterTechnicians
      ),
    [entries, detailFilterZones, detailFilterSites, detailFilterTechnicians]
  );

  const servicesByDepartment = useMemo(
    () => buildServicesByDepartment(mapFilterEntries),
    [mapFilterEntries]
  );

  const servicesByDepartmentMunicipality = useMemo(
    () => buildServicesByDepartmentMunicipality(mapFilterEntries),
    [mapFilterEntries]
  );

  const siteLocations = useMemo(
    () => buildSiteLocationAggregates(mapFilterEntries),
    [mapFilterEntries]
  );

  const gpsMarkers = useMemo(
    () => buildGpsMarkersFromEntries(mapFilterEntries),
    [mapFilterEntries]
  );

  const handleDepartmentsChangeFromMap = (deps: string[]) => {
    setDetailFilterZones(deps.map((d) => toCanonicalDepartment(d)));
  };

  const handleMunicipalityClickFromMap = (
    siteName: string,
    department: string
  ) => {
    const zona = toCanonicalDepartment(department);
    setDetailFilterZones((prev) =>
      prev.includes(zona) ? prev : [...prev, zona]
    );
    setDetailFilterSites((prev) =>
      prev.includes(siteName)
        ? prev.filter((s) => s !== siteName)
        : [...prev, siteName]
    );
  };

  const clearDetailFilters = () => {
    setDetailFilterZones([]);
    setDetailFilterSites([]);
    setDetailFilterTechnicians([]);
  };

  const hasDetailFilters =
    detailFilterZones.length > 0 ||
    detailFilterSites.length > 0 ||
    detailFilterTechnicians.length > 0;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3 space-y-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#cf1b22]" />
          Distribución de Equipos por Ciudad/Sede
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            label="Zona"
            options={zoneOptions}
            value={detailFilterZones}
            onChange={setDetailFilterZones}
          />
          <MultiSelect
            label="Sitio"
            options={siteOptions}
            value={detailFilterSites}
            onChange={setDetailFilterSites}
          />
          <MultiSelect
            label="Asesor"
            options={technicianOptions}
            value={detailFilterTechnicians}
            onChange={setDetailFilterTechnicians}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={clearDetailFilters}
            disabled={!hasDetailFilters}
          >
            Limpiar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ColombiaMap
            servicesByDepartment={servicesByDepartment}
            servicesByDepartmentMunicipality={servicesByDepartmentMunicipality}
            siteLocations={siteLocations}
            gpsMarkers={gpsMarkers}
            selectedDepartments={detailFilterZones}
            onDepartmentsChange={handleDepartmentsChangeFromMap}
            selectedSites={detailFilterSites}
            onMunicipalityClick={handleMunicipalityClickFromMap}
            showZoomControls
          />
          <div className="rounded-md border border-border overflow-hidden flex flex-col min-h-[360px]">
            <div className="px-3 py-2 border-b border-border bg-muted/40 text-xs font-semibold">
              Equipos en mapa ({displayedEntries.length})
            </div>
            <ul className="flex-1 overflow-y-auto max-h-[480px] divide-y divide-border">
              {displayedEntries.length === 0 ? (
                <li className="px-3 py-8 text-sm text-muted-foreground text-center">
                  Sin equipos para los filtros del mapa.
                </li>
              ) : (
                displayedEntries.slice(0, 80).map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
                      onClick={() => {
                        const zona = toCanonicalDepartment(e.zone);
                        setDetailFilterZones((prev) =>
                          prev.includes(zona) ? prev : [...prev, zona]
                        );
                      }}
                    >
                      <p className="text-sm font-medium truncate">{e.equipment}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {e.serie} · {e.site} · {e.zone}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {e.client} · {e.technician}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {formatTipoMttoLabel(e.tipoMtto)} · {e.hours.toLocaleString("es-CO")} h
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** --- TAB 1: Dashboard --- */
function DashboardTab() {
  const role = useUserStore((s) => s.role);
  const isViewer = role === "Viewer";
  const [reportFilters, setReportFilters] = usePersistedReportFilters(
    PROJECTED_MAINTENANCE_FILTERS_KEY
  );
  const { data: equipos = [], isLoading } = useTelemetriaEquipos();
  const opportunityRows = useMemo(
    () => mapTelemetriaToOpportunityRows(equipos),
    [equipos]
  );

  const filteredRows = useMemo(
    () => opportunityRows.filter((r) => matchesTelemetriaReportFilters(r, reportFilters)),
    [opportunityRows, reportFilters]
  );

  const filteredEquipos = useMemo(() => {
    const ids = new Set(filteredRows.map((r) => r.id));
    return equipos.filter((e: TelemetriaEquipo) => ids.has(e.id));
  }, [equipos, filteredRows]);

  const filterOptions = useMemo(() => {
    const usable = (v: string) => Boolean(v?.trim()) && v !== "—";
    const marcas = sortLocale(
      Array.from(new Set(opportunityRows.map((r) => r.brand).filter(usable)))
    );
    const source =
      reportFilters.marca === "all"
        ? opportunityRows
        : opportunityRows.filter((r) => matchesStringFilter(r.brand, reportFilters.marca));
    const modelos = sortLocale(
      Array.from(new Set(source.map((r) => r.model).filter(usable)))
    );
    const clientes = sortLocale(
      Array.from(new Set(opportunityRows.map((r) => r.client).filter(usable)))
    );
    const sedes = sortLocale(
      Array.from(new Set(opportunityRows.map((r) => r.sede).filter(usable)))
    );
    const yearSet = new Set<string>();
    for (const r of opportunityRows) {
      if (r.anio != null && r.anio > 0) yearSet.add(String(r.anio));
      else if (r.fechaIso) {
        const y = new Date(r.fechaIso).getFullYear();
        if (!Number.isNaN(y)) yearSet.add(String(y));
      }
    }
    const periodos = sortLocale(Array.from(yearSet));
    return { marcas, modelos, periodos, clientes, sedes };
  }, [reportFilters.marca, opportunityRows]);

  return (
    <div className="space-y-6">
      {equipos.length === 0 && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No hay registros en telemetría.
          {isViewer ? (
            <> Consulte con un administrador o coordinador para la carga de la plantilla mensual.</>
          ) : (
            <>
              {" "}
              Use la pestaña <strong>Importar</strong> para cargar la plantilla mensual.
            </>
          )}
        </div>
      )}
      <ReportFiltersBar
        value={reportFilters}
        onChange={(next) => setReportFilters(next)}
        options={filterOptions}
      />
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
    <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
          <KPIRow rows={filteredRows} />
          <KpiChartsSection rows={filteredRows} />
          <MaintenanceCalendar equipos={filteredEquipos} />
          <DistribucionEquiposSection rows={filteredRows} />
          <OpportunitiesTable rows={filteredRows} />
    </motion.div>
      )}
    </div>
  );
}

/** --- TAB 2: Import --- */
function ImportTab() {
  const { data: importHistory = [], isLoading } = useProyectadosImportHistory();

  const importStatusConfig: Record<
    ImportRecord["status"],
    { label: string; className: string }
  > = {
    Success:    { label: "Exitoso",    className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    Failed:     { label: "Fallido",     className: "bg-red-100 text-red-700 border-red-200"             },
    Processing: { label: "Procesando", className: "bg-amber-100 text-amber-700 border-amber-200"       },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6 max-w-3xl"
    >
      <ProyectadosImportPanel />

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Historial de Importaciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold pl-4">Fecha</TableHead>
                <TableHead className="text-xs font-semibold">Nombre del Archivo</TableHead>
                <TableHead className="text-xs font-semibold text-right">Registros</TableHead>
                <TableHead className="text-xs font-semibold">Estado</TableHead>
                <TableHead className="text-xs font-semibold pr-4">Usuario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {importHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                      Aún no hay importaciones de telemetría registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  importHistory.map((row: ProyectadosImportLog, i: number) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="text-xs pl-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {row.date}
                  </TableCell>
                  <TableCell className="text-xs py-2.5 font-medium font-mono">{row.fileName}</TableCell>
                  <TableCell className="text-xs py-2.5 text-right font-semibold">{row.records}</TableCell>
                  <TableCell className="py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${importStatusConfig[row.status].className}`}
                    >
                      {importStatusConfig[row.status].label}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs py-2.5 pr-4 text-muted-foreground">{row.user}</TableCell>
                </motion.tr>
                  ))
                )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** --- TAB 3: Automation --- */
function AutomationTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6 max-w-2xl"
    >
      {/* Coming Soon Banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="font-bold text-amber-800 text-sm">Próximamente</p>
            <p className="text-xs text-amber-700 mt-0.5">
              El módulo de automatización se encuentra actualmente en desarrollo. Las
              funcionalidades se habilitarán progresivamente en las próximas versiones.
            </p>
          </div>
        </div>
        {/* Decorative shimmer */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-200/30" />
          <div className="absolute -right-4 bottom-0 h-20 w-20 rounded-full bg-orange-200/20" />
        </div>
      </motion.div>

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Flujo de Trabajo de Mantenimiento Automatizado
        </h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Este módulo automatizará el ciclo de mantenimiento de extremo a extremo — desde la
          ingestión de datos de SAP hasta la programación, notificación al cliente, generación
          de cotizaciones y actualización del panel en tiempo real. La integración planificada
          reduce el esfuerzo manual y garantiza que ningún equipo sea pasado por alto.
        </p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-6 top-8 bottom-8 w-px bg-gradient-to-b from-[#cf1b22]/40 via-border to-border" />

        <div className="space-y-0">
          {AUTOMATION_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isDev = step.status === "In Development";
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
                className="relative flex gap-5 pb-0"
              >
                {/* Numbered circle */}
                <div className="relative z-10 flex-shrink-0">
                  <div
                    className={`h-12 w-12 rounded-full border-2 flex items-center justify-center shadow-sm
                      ${isDev
                        ? "bg-amber-50 border-amber-300"
                        : "bg-white border-border"
                      }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${isDev ? "text-amber-600" : "text-[#cf1b22]"}`}
                    />
                  </div>
                  <span
                    className={`absolute -top-1 -right-1 h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-background shadow-sm
                      ${isDev ? "bg-amber-500 text-white" : "bg-[#cf1b22] text-white"}`}
                  >
                    {step.number}
                  </span>
                </div>

                {/* Content */}
                <div
                  className={`flex-1 rounded-xl border p-4 mb-3 transition-shadow hover:shadow-md
                    ${isDev ? "border-amber-200 bg-amber-50/40" : "border-border bg-card"}`}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm text-foreground">{step.title}</h3>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold flex-shrink-0
                        ${isDev
                          ? "bg-amber-100 text-amber-700 border-amber-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                    >
                      {isDev ? "En Desarrollo" : "Planificado"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ProjectedMaintenancePage() {
  const role = useUserStore((s) => s.role);
  /** Visualizadores: solo Panel. Importar / Automatización para el resto de roles con acceso. */
  const canSeeImportAutomation = role !== "Viewer";

  return (
    <AppShell breadcrumbs={[{ label: "Inicio", href: "/dashboard" }, { label: "Mantenimiento Proyectado" }]}>
    <div className="space-y-6 pt-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[#cf1b22]/10">
              <Wrench className="h-4.5 w-4.5 text-[#cf1b22]" style={{ height: "18px", width: "18px" }} />
            </span>
            Mantenimiento Proyectado
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Programación proactiva de mantenimiento y gestión del ciclo de vida de equipos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            Exportar Reporte
          </Button>
          <Button size="sm" className="gap-1.5 text-xs bg-[#cf1b22] hover:bg-[#b01820] text-white">
            <Calendar className="h-3.5 w-3.5" />
            Programar Mantenimiento
          </Button>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="bg-muted/60 border border-border/50 p-1 gap-1">
          <TabsTrigger
            value="dashboard"
            className="data-[state=active]:bg-[#cf1b22] data-[state=active]:text-white data-[state=active]:shadow-sm text-sm px-5"
          >
            <BarChartIcon className="h-3.5 w-3.5 mr-1.5" />
            Panel
          </TabsTrigger>
          {canSeeImportAutomation && (
            <TabsTrigger
              value="import"
              className="data-[state=active]:bg-[#cf1b22] data-[state=active]:text-white data-[state=active]:shadow-sm text-sm px-5"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Importar
            </TabsTrigger>
          )}
          {canSeeImportAutomation && (
            <TabsTrigger
              value="automation"
              className="data-[state=active]:bg-[#cf1b22] data-[state=active]:text-white data-[state=active]:shadow-sm text-sm px-5"
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Automatización
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="mt-0">
          <DashboardTab />
        </TabsContent>
        {canSeeImportAutomation && (
          <TabsContent value="import" className="mt-0">
            <ImportTab />
          </TabsContent>
        )}
        {canSeeImportAutomation && (
          <TabsContent value="automation" className="mt-0">
            <AutomationTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
    </AppShell>
  );
}

/** Small inline icon to avoid BarChart3 import collision */
function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
    </svg>
  );
}
