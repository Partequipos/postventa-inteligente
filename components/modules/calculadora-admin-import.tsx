'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Database,
  Download,
  Pencil,
  Search,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { ExcelImportPanel } from '@/components/modules/excel-import-panel';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  useTemparioImport,
  useTempariosAdmin,
  useUpdateTempario,
  useDeactivateTempario,
  useCalculadoraMarcas,
  useTemparioModelosFiltro,
  useCalculadoraTipos,
  useUpdateTempariosBulk,
} from '@/hooks/use-calculadora';
import { useUserStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DualScrollContainer } from '@/components/ui/dual-scroll-container';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type {
  TemparioMantenimiento,
  TemparioTipoItem,
  TemparioUpdatePatch,
  MaintenanceFrequencyHours,
} from '@/types/database';
import { modelo2ToTipoCatalogo } from '@/lib/calculadora/tempario-classify';
import {
  TEMPARIO_EXCEL_COLUMNS,
  downloadTemparioExcelTemplate,
  downloadTempariosExcel,
} from '@/lib/calculadora/tempario-template';
import { fetchAllTempariosAdmin } from '@/services/calculadora.service';

const TIPOS_ITEM: TemparioTipoItem[] = [
  'Repuesto',
  'Fluido',
  'Actividad',
  'Observacion',
  'Consumible',
  'Servicio',
];
const FRECUENCIAS: MaintenanceFrequencyHours[] = [250, 1000, 2000, 4000, 5000];
const PAGE_SIZE = 15;
const BULK_KEEP = '__keep__';

type EditForm = {
  marca: string;
  linea: string;
  modelo: string;
  tipo_item: TemparioTipoItem;
  item: string;
  unidad_medida: string;
  cantidad: string;
  frecuencia_horas: string;
  aceite_homologado: string;
  referencia_genuina: string;
  ref_sap_dispel: string;
  ref_sap_original: string;
  referencia_stal: string;
  referencia_fleetguard: string;
  referencia_donaldson: string;
  tiempo_horas: string;
  procedimiento: string;
  avisos_claves: string;
  precio_unitario: string;
  activo: boolean;
};

function toEditForm(row: TemparioMantenimiento): EditForm {
  return {
    marca: row.marca,
    linea: row.linea ?? '',
    modelo: row.modelo,
    tipo_item: row.tipo_item,
    item: row.item,
    unidad_medida: row.unidad_medida,
    cantidad: String(row.cantidad),
    frecuencia_horas: String(row.frecuencia_horas),
    aceite_homologado: row.aceite_homologado ?? '',
    referencia_genuina: row.referencia_genuina ?? '',
    ref_sap_dispel: row.ref_sap_dispel ?? '',
    ref_sap_original: row.ref_sap_original ?? '',
    referencia_stal: row.referencia_stal ?? '',
    referencia_fleetguard: row.referencia_fleetguard ?? '',
    referencia_donaldson: row.referencia_donaldson ?? '',
    tiempo_horas: String(row.tiempo_horas),
    procedimiento: row.procedimiento ?? '',
    avisos_claves: row.avisos_claves ?? '',
    precio_unitario: String(row.precio_unitario ?? 0),
    activo: row.activo,
  };
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

type BulkForm = {
  marca: string;
  linea: string;
  modelo: string;
  tipo_item: string;
  unidad_medida: string;
  cantidad: string;
  frecuencia_horas: string;
  aceite_homologado: string;
  referencia_genuina: string;
  ref_sap_dispel: string;
  ref_sap_original: string;
  referencia_stal: string;
  referencia_fleetguard: string;
  referencia_donaldson: string;
  tiempo_horas: string;
  procedimiento: string;
  avisos_claves: string;
  precio_unitario: string;
};

function emptyBulkForm(): BulkForm {
  return {
    marca: '',
    linea: '',
    modelo: '',
    tipo_item: BULK_KEEP,
    unidad_medida: '',
    cantidad: '',
    frecuencia_horas: BULK_KEEP,
    aceite_homologado: '',
    referencia_genuina: '',
    ref_sap_dispel: '',
    ref_sap_original: '',
    referencia_stal: '',
    referencia_fleetguard: '',
    referencia_donaldson: '',
    tiempo_horas: '',
    procedimiento: '',
    avisos_claves: '',
    precio_unitario: '',
  };
}

function assignText(
  patch: TemparioUpdatePatch,
  key:
    | 'marca'
    | 'linea'
    | 'modelo'
    | 'unidad_medida'
    | 'aceite_homologado'
    | 'referencia_genuina'
    | 'ref_sap_dispel'
    | 'ref_sap_original'
    | 'referencia_stal'
    | 'referencia_fleetguard'
    | 'referencia_donaldson'
    | 'procedimiento'
    | 'avisos_claves',
  value: string
): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  patch[key] = trimmed;
}

function buildBulkPatch(form: BulkForm): TemparioUpdatePatch | 'invalid-freq' | null {
  const patch: TemparioUpdatePatch = {};
  assignText(patch, 'marca', form.marca);
  assignText(patch, 'linea', form.linea);
  assignText(patch, 'modelo', form.modelo);
  assignText(patch, 'unidad_medida', form.unidad_medida);
  assignText(patch, 'aceite_homologado', form.aceite_homologado);
  assignText(patch, 'referencia_genuina', form.referencia_genuina);
  assignText(patch, 'ref_sap_dispel', form.ref_sap_dispel);
  assignText(patch, 'ref_sap_original', form.ref_sap_original);
  assignText(patch, 'referencia_stal', form.referencia_stal);
  assignText(patch, 'referencia_fleetguard', form.referencia_fleetguard);
  assignText(patch, 'referencia_donaldson', form.referencia_donaldson);
  assignText(patch, 'procedimiento', form.procedimiento);
  assignText(patch, 'avisos_claves', form.avisos_claves);

  if (form.tipo_item !== BULK_KEEP) {
    const tipo = form.tipo_item as TemparioTipoItem;
    patch.tipo_item = tipo;
    patch.tipo_catalogo = modelo2ToTipoCatalogo(tipo);
  }
  if (form.cantidad.trim()) {
    patch.cantidad = Number(form.cantidad);
  }
  if (form.tiempo_horas.trim()) {
    patch.tiempo_horas = Number(form.tiempo_horas);
  }
  if (form.precio_unitario.trim()) {
    patch.precio_unitario = Number(form.precio_unitario);
  }
  if (form.frecuencia_horas !== BULK_KEEP) {
    const freq = Number(form.frecuencia_horas) as MaintenanceFrequencyHours;
    if (!FRECUENCIAS.includes(freq)) return 'invalid-freq';
    patch.frecuencia_horas = freq;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function CalculadoraAdminImport() {
  const { currentUser } = useUserStore();
  const updatedBy = currentUser?.email ?? currentUser?.name ?? 'Administrator';

  const [tab, setTab] = useState('registros');
  const [marca, setMarca] = useState('all');
  const [modelo, setModelo] = useState('all');
  const [tipo, setTipo] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TemparioMantenimiento | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkForm>(emptyBulkForm);
  const [exporting, setExporting] = useState(false);

  const importMutation = useTemparioImport();
  const updateMutation = useUpdateTempario();
  const bulkMutation = useUpdateTempariosBulk();
  const deactivateMutation = useDeactivateTempario();
  const { data: marcasData } = useCalculadoraMarcas();
  const marcas: string[] = marcasData ?? [];
  const { data: modelosData } = useTemparioModelosFiltro(marca);
  const modelos: string[] = modelosData ?? [];
  const { data: tiposData } = useCalculadoraTipos();
  const tipos: string[] = tiposData ?? [];

  const adminQuery = useMemo(
    () => ({
      marca,
      modelo,
      tipo,
      search,
      page,
      pageSize: PAGE_SIZE,
      includeInactive: false,
    }),
    [marca, modelo, tipo, search, page]
  );

  const { data, isLoading, isFetching, refetch } = useTempariosAdmin(adminQuery);
  const rows: TemparioMantenimiento[] = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIds = rows.map((row) => row.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const clearSelection = () => setSelectedIds([]);

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((item) => item !== id);
    });
  };

  const togglePage = (checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return Array.from(new Set([...prev, ...pageIds]));
      const drop = new Set(pageIds);
      return prev.filter((id) => !drop.has(id));
    });
  };

  const openEdit = (row: TemparioMantenimiento) => {
    setEditing(row);
    setForm(toEditForm(row));
  };

  const closeEdit = () => {
    setEditing(null);
    setForm(null);
  };

  const setField = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!editing || !form) return;
    if (!form.marca.trim() || !form.modelo.trim() || !form.item.trim()) {
      toast.error('Marca, Modelo e Item son obligatorios');
      return;
    }

    const freq = Number(form.frecuencia_horas) as MaintenanceFrequencyHours;
    if (!FRECUENCIAS.includes(freq)) {
      toast.error('Frecuencia inválida');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        updatedBy,
        patch: {
          marca: form.marca.trim(),
          linea: form.linea.trim() || null,
          modelo: form.modelo.trim(),
          tipo_item: form.tipo_item,
          tipo_catalogo: modelo2ToTipoCatalogo(form.tipo_item),
          item: form.item.trim(),
          unidad_medida: form.unidad_medida.trim() || 'Unidad',
          cantidad: Number(form.cantidad) || 1,
          frecuencia_horas: freq,
          aceite_homologado: form.aceite_homologado.trim() || null,
          referencia_genuina: form.referencia_genuina.trim() || null,
          ref_sap_dispel: form.ref_sap_dispel.trim() || null,
          ref_sap_original: form.ref_sap_original.trim() || null,
          referencia_stal: form.referencia_stal.trim() || null,
          referencia_fleetguard: form.referencia_fleetguard.trim() || null,
          referencia_donaldson: form.referencia_donaldson.trim() || null,
          tiempo_horas: Number(form.tiempo_horas) || 0,
          procedimiento: form.procedimiento.trim() || null,
          avisos_claves: form.avisos_claves.trim() || null,
          precio_unitario: Number(form.precio_unitario) || 0,
          activo: form.activo,
        },
      });
      toast.success('Tempario actualizado');
      closeEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  const handleDeactivate = async (row: TemparioMantenimiento) => {
    const ok = window.confirm(`¿Desactivar el ítem "${row.item}" (${row.marca} ${row.modelo})?`);
    if (!ok) return;
    try {
      await deactivateMutation.mutateAsync({ id: row.id, updatedBy });
      setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      toast.success('Registro desactivado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desactivar');
    }
  };

  const openBulk = () => {
    if (selectedIds.length === 0) {
      toast.error('Seleccione al menos un registro de la tabla');
      return;
    }
    setBulkForm(emptyBulkForm());
    setBulkOpen(true);
  };

  const handleBulkSave = async () => {
    const patch = buildBulkPatch(bulkForm);
    if (patch === 'invalid-freq') {
      toast.error('Frecuencia inválida');
      return;
    }
    if (!patch) {
      toast.error('Complete al menos un campo para aplicar a los registros seleccionados');
      return;
    }
    try {
      const updated = await bulkMutation.mutateAsync({
        ids: selectedIds,
        patch,
        updatedBy,
      });
      toast.success(
        `${updated.toLocaleString('es-CO')} registro(s) actualizados`
      );
      setBulkOpen(false);
      clearSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar la selección');
    }
  };

  const setBulkField = <K extends keyof BulkForm>(key: K, value: BulkForm[K]) => {
    setBulkForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const exported = await fetchAllTempariosAdmin({
        marca,
        modelo,
        tipo,
        search,
        includeInactive: false,
      });
      if (exported.length === 0) {
        toast.error('No hay registros para descargar con los filtros actuales');
        return;
      }
      await downloadTempariosExcel(exported);
      toast.success(
        `${exported.length.toLocaleString('es-CO')} registro(s) descargados en formato de plantilla`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo descargar el Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-[#cf1b22]/10 flex items-center justify-center shrink-0">
          <Database className="h-4 w-4 text-[#cf1b22]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Administración — Temparios de Mantenimiento
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Solo administradores. Carga masiva desde Excel y edición de registros en la base de
            datos que alimenta la calculadora.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="registros" className="text-sm">
            Gestionar registros
          </TabsTrigger>
          <TabsTrigger value="importar" className="text-sm">
            Carga masiva Excel
          </TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-4">
          <ExcelImportPanel
            title="Importar Temparios de Mantenimiento"
            description="1) Descargue la plantilla Excel (columna inicial: Marca). 2) Complete Modelo2 (Actividad | Repuesto | Fluido | Observacion). 3) Suba el archivo para cargar a la BD. tipo_catalogo se deriva de Modelo2 (Repuesto→Filtro, Fluido→Aceite)."
            expectedColumns={TEMPARIO_EXCEL_COLUMNS}
            modulo="calculadora"
            onDownloadTemplate={downloadTemparioExcelTemplate}
            templateButtonLabel="Descargar plantilla TEMPARIOS"
            onImport={async (result) => {
              if (!isSupabaseConfigured()) {
                await importMutation.mutateAsync({
                  fileName: result.fileName,
                  ok: result.recordsOk,
                  error: result.recordsError,
                });
              }

              const totalMsg = result.total
                ? ` de ${result.total} filas del Excel`
                : '';

              if (result.recordsOk > 0) {
                toast.success('Carga de temparios finalizada', {
                  description:
                    `${result.recordsOk} registros cargados OK${totalMsg}` +
                    (result.duplicates ? ` · ${result.duplicates} actualizados` : '') +
                    (result.recordsError ? ` · ${result.recordsError} con error` : ''),
                  duration: 12_000,
                });
              } else {
                toast.error('No se importaron registros', {
                  description:
                    result.errors?.[0]?.message ??
                    `${result.recordsError} errores${totalMsg}`,
                  duration: 12_000,
                });
              }

              // Mantener un momento el resumen en "Carga masiva", luego ir a registros
              setTimeout(() => {
                setTab('registros');
                setPage(1);
                void refetch();
              }, 1500);
            }}
          />
        </TabsContent>

        <TabsContent value="registros" className="mt-4 space-y-3 min-w-0">
          <Card className="border-border min-w-0 overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <CardTitle className="text-sm font-semibold">
                  Registros en base de datos
                  <Badge variant="secondary" className="ml-2 font-normal">
                    {total}
                  </Badge>
                </CardTitle>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Buscar
                    </span>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setSearch(searchInput.trim());
                            setPage(1);
                            clearSelection();
                          }
                        }}
                        placeholder="Ítem, modelo o ref…"
                        className="h-8 pl-8 w-52 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setSearch(searchInput.trim());
                      setPage(1);
                      clearSelection();
                    }}
                  >
                    Buscar
                  </Button>
                  <FilterSelect
                    label="Marca"
                    value={marca}
                    onChange={(v) => {
                      setMarca(v);
                      setModelo('all');
                      setPage(1);
                      clearSelection();
                    }}
                    allLabel="Todas"
                    options={marcas}
                  />
                  <FilterSelect
                    label="Modelo"
                    value={modelo}
                    onChange={(v) => {
                      setModelo(v);
                      setPage(1);
                      clearSelection();
                    }}
                    allLabel="Todos"
                    options={modelos}
                  />
                  <FilterSelect
                    label="Tipo ítem (Modelo2)"
                    value={tipo}
                    onChange={(v) => {
                      setTipo(v);
                      setPage(1);
                      clearSelection();
                    }}
                    allLabel="Todos los tipos"
                    options={tipos}
                    widthClass="w-44"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={exporting}
                    title="Descarga todos los registros, o solo los del filtro aplicado, en la plantilla Excel"
                    onClick={() => void handleExportExcel()}
                  >
                    {exporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Descargar Excel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 bg-[#cf1b22] hover:bg-[#a51519] text-white"
                    disabled={selectedIds.length === 0}
                    onClick={openBulk}
                  >
                    Editar seleccionados ({selectedIds.length})
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => void refetch()}
                    aria-label="Actualizar"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 min-w-0 overflow-hidden">
              <DualScrollContainer
                topScrollClassName="h-3.5 bg-muted/50"
                contentClassName="pb-1"
              >
                <Table noScrollWrapper className="w-max min-w-[1100px]">
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={(value) => togglePage(value === true)}
                          aria-label="Seleccionar página"
                          disabled={rows.length === 0}
                        />
                      </TableHead>
                      <TableHead className="text-xs">ID</TableHead>
                      <TableHead className="text-xs">Marca</TableHead>
                      <TableHead className="text-xs">Línea</TableHead>
                      <TableHead className="text-xs">Modelo</TableHead>
                      <TableHead className="text-xs">Tipo ítem (Modelo2)</TableHead>
                      <TableHead className="text-xs">Catálogo</TableHead>
                      <TableHead className="text-xs">Ítem</TableHead>
                      <TableHead className="text-xs text-right">Cant.</TableHead>
                      <TableHead className="text-xs">Freq.</TableHead>
                      <TableHead className="text-xs">Ref. genuina</TableHead>
                      <TableHead className="text-xs">Modificado</TableHead>
                      <TableHead className="text-xs text-right pr-4">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`sk-${i}`}>
                          <TableCell colSpan={13}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={13}
                          className="text-center text-sm text-muted-foreground py-10"
                        >
                          No hay temparios con los filtros actuales. Importe un Excel o ajuste la
                          búsqueda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row) => (
                        <TableRow key={row.id} data-state={selectedIds.includes(row.id) ? 'selected' : undefined}>
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={selectedIds.includes(row.id)}
                              onCheckedChange={(value) => toggleRow(row.id, value === true)}
                              aria-label={`Seleccionar ${row.item}`}
                            />
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {row.legacy_id ?? row.id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{row.marca}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.linea || '—'}
                          </TableCell>
                          <TableCell className="text-xs">{row.modelo}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {row.tipo_item}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.tipo_catalogo || '—'}
                          </TableCell>
                          <TableCell className="text-xs max-w-[180px] truncate" title={row.item}>
                            {row.item}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {row.cantidad}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {row.frecuencia_horas} h
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {row.referencia_genuina || '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(row.updated_at)}
                          </TableCell>
                          <TableCell className="text-right pr-3">
                            <div className="inline-flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-[#cf1b22]"
                                onClick={() => openEdit(row)}
                                aria-label="Editar"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => void handleDeactivate(row)}
                                disabled={deactivateMutation.isPending}
                                aria-label="Desactivar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </DualScrollContainer>

              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(editing && form)} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar tempario</DialogTitle>
            <DialogDescription>
              Modifique los campos del registro. Los cambios impactan la calculadora de
              mantenimiento.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
              <Field label="Marca *">
                <Input value={form.marca} onChange={(e) => setField('marca', e.target.value)} />
              </Field>
              <Field label="Línea">
                <Input value={form.linea} onChange={(e) => setField('linea', e.target.value)} />
              </Field>
              <Field label="Modelo *">
                <Input value={form.modelo} onChange={(e) => setField('modelo', e.target.value)} />
              </Field>
              <Field label="Tipo ítem (Modelo2)">
                  <Select
                  value={form.tipo_item}
                  onValueChange={(v) => setField('tipo_item', v as TemparioTipoItem)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ITEM.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Ítem *" className="sm:col-span-2">
                <Input value={form.item} onChange={(e) => setField('item', e.target.value)} />
              </Field>
              <Field label="Unidad de medida">
                <Input
                  value={form.unidad_medida}
                  onChange={(e) => setField('unidad_medida', e.target.value)}
                />
              </Field>
              <Field label="Cantidad">
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={form.cantidad}
                  onChange={(e) => setField('cantidad', e.target.value)}
                />
              </Field>
              <Field label="Frecuencia (horas)">
                <Select
                  value={form.frecuencia_horas}
                  onValueChange={(v) => setField('frecuencia_horas', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRECUENCIAS.map((f) => (
                      <SelectItem key={f} value={String(f)}>
                        {f} h
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tiempo (horas)">
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.tiempo_horas}
                  onChange={(e) => setField('tiempo_horas', e.target.value)}
                />
              </Field>
              <Field label="Aceite homologado">
                <Input
                  value={form.aceite_homologado}
                  onChange={(e) => setField('aceite_homologado', e.target.value)}
                />
              </Field>
              <Field label="Referencia genuina">
                <Input
                  value={form.referencia_genuina}
                  onChange={(e) => setField('referencia_genuina', e.target.value)}
                />
              </Field>
              <Field label="REF SAP DISPEL">
                <Input
                  value={form.ref_sap_dispel}
                  onChange={(e) => setField('ref_sap_dispel', e.target.value)}
                />
              </Field>
              <Field label="REF SAP ORIGINAL">
                <Input
                  value={form.ref_sap_original}
                  onChange={(e) => setField('ref_sap_original', e.target.value)}
                />
              </Field>
              <Field label="Referencia Stal">
                <Input
                  value={form.referencia_stal}
                  onChange={(e) => setField('referencia_stal', e.target.value)}
                />
              </Field>
              <Field label="Referencia Fleetguard">
                <Input
                  value={form.referencia_fleetguard}
                  onChange={(e) => setField('referencia_fleetguard', e.target.value)}
                />
              </Field>
              <Field label="Referencia Donaldson">
                <Input
                  value={form.referencia_donaldson}
                  onChange={(e) => setField('referencia_donaldson', e.target.value)}
                />
              </Field>
              <Field label="Precio unitario">
                <Input
                  type="number"
                  min={0}
                  value={form.precio_unitario}
                  onChange={(e) => setField('precio_unitario', e.target.value)}
                />
              </Field>
              <Field label="Procedimiento" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={form.procedimiento}
                  onChange={(e) => setField('procedimiento', e.target.value)}
                />
              </Field>
              <Field label="Avisos claves" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={form.avisos_claves}
                  onChange={(e) => setField('avisos_claves', e.target.value)}
                />
              </Field>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeEdit}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#cf1b22] hover:bg-[#a51519] text-white"
              onClick={() => void handleSave()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar cambios'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar {selectedIds.length} registro(s)</DialogTitle>
            <DialogDescription>
              Solo se actualizan los campos que complete. Los vacíos y “Sin cambio” se conservan en
              cada tempario.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <Field label="Marca">
              <Input value={bulkForm.marca} onChange={(e) => setBulkField('marca', e.target.value)} />
            </Field>
            <Field label="Línea">
              <Input value={bulkForm.linea} onChange={(e) => setBulkField('linea', e.target.value)} />
            </Field>
            <Field label="Modelo">
              <Input value={bulkForm.modelo} onChange={(e) => setBulkField('modelo', e.target.value)} />
            </Field>
            <Field label="Tipo ítem (Modelo2)">
              <Select value={bulkForm.tipo_item} onValueChange={(v) => setBulkField('tipo_item', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BULK_KEEP}>Sin cambio</SelectItem>
                  {TIPOS_ITEM.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Unidad de medida">
              <Input
                value={bulkForm.unidad_medida}
                onChange={(e) => setBulkField('unidad_medida', e.target.value)}
              />
            </Field>
            <Field label="Cantidad">
              <Input
                type="number"
                min={0}
                step="0.001"
                value={bulkForm.cantidad}
                onChange={(e) => setBulkField('cantidad', e.target.value)}
              />
            </Field>
            <Field label="Frecuencia (horas)">
              <Select
                value={bulkForm.frecuencia_horas}
                onValueChange={(v) => setBulkField('frecuencia_horas', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BULK_KEEP}>Sin cambio</SelectItem>
                  {FRECUENCIAS.map((f) => (
                    <SelectItem key={f} value={String(f)}>
                      {f} h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tiempo (horas)">
              <Input
                type="number"
                min={0}
                step="0.1"
                value={bulkForm.tiempo_horas}
                onChange={(e) => setBulkField('tiempo_horas', e.target.value)}
              />
            </Field>
            <Field label="Aceite homologado">
              <Input
                value={bulkForm.aceite_homologado}
                onChange={(e) => setBulkField('aceite_homologado', e.target.value)}
              />
            </Field>
            <Field label="Referencia genuina">
              <Input
                value={bulkForm.referencia_genuina}
                onChange={(e) => setBulkField('referencia_genuina', e.target.value)}
              />
            </Field>
            <Field label="REF SAP DISPEL">
              <Input
                value={bulkForm.ref_sap_dispel}
                onChange={(e) => setBulkField('ref_sap_dispel', e.target.value)}
              />
            </Field>
            <Field label="REF SAP ORIGINAL">
              <Input
                value={bulkForm.ref_sap_original}
                onChange={(e) => setBulkField('ref_sap_original', e.target.value)}
              />
            </Field>
            <Field label="Referencia Stal">
              <Input
                value={bulkForm.referencia_stal}
                onChange={(e) => setBulkField('referencia_stal', e.target.value)}
              />
            </Field>
            <Field label="Referencia Fleetguard">
              <Input
                value={bulkForm.referencia_fleetguard}
                onChange={(e) => setBulkField('referencia_fleetguard', e.target.value)}
              />
            </Field>
            <Field label="Referencia Donaldson">
              <Input
                value={bulkForm.referencia_donaldson}
                onChange={(e) => setBulkField('referencia_donaldson', e.target.value)}
              />
            </Field>
            <Field label="Precio unitario">
              <Input
                type="number"
                min={0}
                value={bulkForm.precio_unitario}
                onChange={(e) => setBulkField('precio_unitario', e.target.value)}
              />
            </Field>
            <Field label="Procedimiento" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={bulkForm.procedimiento}
                onChange={(e) => setBulkField('procedimiento', e.target.value)}
              />
            </Field>
            <Field label="Avisos claves" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={bulkForm.avisos_claves}
                onChange={(e) => setBulkField('avisos_claves', e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#cf1b22] hover:bg-[#a51519] text-white"
              onClick={() => void handleBulkSave()}
              disabled={bulkMutation.isPending}
            >
              {bulkMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Aplicar a seleccionados'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
  widthClass = 'w-36',
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: string[];
  widthClass?: string;
}>) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={`h-8 ${widthClass} text-sm`}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: Readonly<{
  label: string;
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
