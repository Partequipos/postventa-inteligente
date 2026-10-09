'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Wrench,
  RotateCcw,
  FileText,
  Save,
  Truck,
  AlertCircle,
  CheckCircle2,
  Clock,
  Gauge,
  MapPin,
  Hash,
  List,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  useCalculadoraMarcas,
  useCalculadoraModelos,
  usePrimerasDisponibles,
  useCalculatePreventive,
} from '@/hooks/use-calculadora';
import { useTelemetriaEquipos } from '@/hooks/use-projected-maintenance';
import { pickLatestTelemetriaPerSerie } from '@/services/projected-maintenance.service';
import {
  getFrecuenciasPorHorometro,
  FRECUENCIA_LABELS,
  PRIMERAS_LABELS,
  getHorometroOptions,
  HOROMETRO_MAX,
  HOROMETRO_MIN,
  normalizeHorometro,
} from '@/lib/maintenance-frequency';
import { SectionFrame } from '@/components/ui/section-frame';
import { downloadPreventiveQuotePdf } from '@/lib/calculadora/quote-pdf';
import { normalizeEquipKey } from '@/lib/calculadora/build-quote';
import type { TelemetriaEquipo, PreventiveQuoteResult, PrimerasHoras } from '@/types/database';

const HOROMETRO_OPTIONS = getHorometroOptions();

/** Maps — direcciones para consultar km y tiempo de un trayecto */
const GOOGLE_MAPS_TRAVEL_URL =
  'https://www.google.com/maps/dir///@6.5870014,-77.8974512,7z?entry=ttu';

const INACTIVE_ESTADOS = new Set(['inactivo', 'inactiva', 'baja', 'cancelado', 'cancelada']);

interface FilterFormValues {
  brand: string;
  model: string;
  hourMeter: number;
  kilometers: number;
  travelTime: number;
}

const filterSchema = z.object({
  brand: z.string().min(1, 'Selecciona una marca'),
  model: z.string().min(1, 'Selecciona un modelo'),
  hourMeter: z.coerce.number().min(HOROMETRO_MIN).max(HOROMETRO_MAX),
  kilometers: z.coerce.number().min(0).max(500000),
  travelTime: z.coerce.number().min(0).max(24),
});

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function nearestHorometro(hours: number): number {
  return normalizeHorometro(hours);
}

function refCell(value?: string): string {
  const v = (value ?? '').trim();
  return !v || v === '—' ? '—' : v;
}

function isActiveTelemetria(m: TelemetriaEquipo): boolean {
  const estado = (m.estado ?? '').toLowerCase().trim();
  return !(estado && INACTIVE_ESTADOS.has(estado));
}

/** Resuelve valor de telemetría contra catálogo de temparios (case/espacios). */
function resolveCatalogValue(value: string, options: string[]): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const key = normalizeEquipKey(raw);
  const found = options.find((o) => normalizeEquipKey(o) === key);
  return found ?? raw;
}

function matchesEquipField(actual: string | null | undefined, filter: string): boolean {
  if (!filter.trim()) return true;
  return normalizeEquipKey(actual ?? '') === normalizeEquipKey(filter);
}

function filterTelemetriaByCalculator(
  machines: TelemetriaEquipo[],
  brand: string,
  model: string,
  hourMeter: number
): TelemetriaEquipo[] {
  const hasBrand = Boolean(brand.trim());
  const hasModel = Boolean(model.trim());
  const applyHorometro = hasBrand || hasModel;

  return machines.filter((m) => {
    if (!matchesEquipField(m.marca, brand)) return false;
    if (!matchesEquipField(m.modelo, model)) return false;
    if (applyHorometro && nearestHorometro(Number(m.horometro) || 0) !== hourMeter) {
      return false;
    }
    return true;
  });
}

function telemetriaSheetDescription(params: {
  brand: string;
  model: string;
  hourMeter: number;
  filteredCount: number;
  totalActive: number;
}): string {
  const { brand, model, hourMeter, filteredCount, totalActive } = params;
  if (!brand.trim() && !model.trim()) {
    return `Telemetría activa (${totalActive}). Al seleccionar una, se cargan marca, modelo y horómetro en la calculadora.`;
  }
  const brandPart = brand.trim() ? ` · ${brand}` : '';
  const modelPart = model.trim() ? ` / ${model}` : '';
  return `Filtradas por calculadora: ${filteredCount} de ${totalActive} activas${brandPart}${modelPart} · ${hourMeter.toLocaleString('es-CO')} h`;
}

export default function CalculatorPage() {
  const { data: marcas = [] } = useCalculadoraMarcas();
  const { data: telemetriaData } = useTelemetriaEquipos();
  const telemetria: TelemetriaEquipo[] = useMemo(
    () => pickLatestTelemetriaPerSerie(telemetriaData ?? []),
    [telemetriaData]
  );
  const calculateMutation = useCalculatePreventive();

  const [result, setResult] = useState<PreventiveQuoteResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<TelemetriaEquipo | null>(null);
  const [machineSheetOpen, setMachineSheetOpen] = useState(false);
  const [primerasHoras, setPrimerasHoras] = useState<PrimerasHoras | 'horometro'>('horometro');

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FilterFormValues>({
    resolver: zodResolver(filterSchema),
    defaultValues: {
      brand: '',
      model: '',
      hourMeter: 250,
      kilometers: 0,
      travelTime: 0,
    },
  });

  const selectedBrand = watch('brand');
  const selectedModel = watch('model');
  const hourMeter = watch('hourMeter');
  const travelTime = watch('travelTime');
  const { data: modelos = [] } = useCalculadoraModelos(selectedBrand);
  const { data: primerasData, isFetched: primerasFetched } = usePrimerasDisponibles(
    selectedBrand,
    selectedModel
  );
  const primerasDisponibles: PrimerasHoras[] = primerasData ?? [];
  const soloPrimeras = primerasHoras !== 'horometro';
  const frecuenciasPreview = soloPrimeras ? [] : getFrecuenciasPorHorometro(hourMeter);

  const activeTelemetria = useMemo(
    () => telemetria.filter(isActiveTelemetria),
    [telemetria]
  );

  const filteredTelemetria = useMemo(
    () =>
      filterTelemetriaByCalculator(
        activeTelemetria,
        selectedBrand,
        selectedModel,
        hourMeter
      ),
    [activeTelemetria, selectedBrand, selectedModel, hourMeter]
  );

  /** Si el usuario eligió máquina primero, alinear modelo al catálogo cuando cargue. */
  useEffect(() => {
    if (!selectedMachine || !modelos.length) return;
    const resolvedModel = resolveCatalogValue(selectedMachine.modelo, modelos);
    if (!resolvedModel || resolvedModel === selectedModel) return;
    setValue('model', resolvedModel, { shouldValidate: true });
  }, [selectedMachine, modelos, selectedModel, setValue]);

  useEffect(() => {
    if (!primerasFetched || primerasHoras === 'horometro') return;
    if (!primerasDisponibles.includes(primerasHoras)) {
      setPrimerasHoras('horometro');
    }
  }, [primerasDisponibles, primerasFetched, primerasHoras]);

  const onSubmit = async (values: FilterFormValues) => {
    setIsCalculating(true);
    setResult(null);
    try {
      const quote = await calculateMutation.mutateAsync({
        marca: values.brand,
        modelo: values.model,
        horometro: values.hourMeter,
        kmTrayecto: values.kilometers,
        horasTrayecto: values.travelTime,
        frecuenciaPrimeras: primerasHoras === 'horometro' ? null : primerasHoras,
      });
      setResult(quote);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo calcular el mantenimiento');
    } finally {
    setIsCalculating(false);
    }
  };

  const handleReset = () => {
    reset();
    setResult(null);
    setSelectedMachine(null);
    setPrimerasHoras('horometro');
  };

  const handleSelectMachine = (machine: TelemetriaEquipo) => {
    setSelectedMachine(machine);
    const brand = resolveCatalogValue(machine.marca, marcas);
    setValue('brand', brand, { shouldValidate: true, shouldDirty: true });
    const modelOptions = brand === selectedBrand ? modelos : [];
    const model = resolveCatalogValue(machine.modelo, modelOptions);
    setValue('model', model || machine.modelo.trim(), {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue('hourMeter', nearestHorometro(Number(machine.horometro) || 250), {
      shouldValidate: true,
      shouldDirty: true,
    });
    setPrimerasHoras('horometro');
    setMachineSheetOpen(false);
    toast.success(
      `Equipo ${machine.serie}: ${machine.marca} ${machine.modelo} · ${Number(machine.horometro).toLocaleString('es-CO')} h`
    );
  };

  const handleGeneratePdf = async () => {
    if (!result || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await downloadPreventiveQuotePdf({
        quote: result,
        travelTimeHours: travelTime,
        selectedMachine,
      });
      toast.success('PDF generado correctamente');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar el PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 -mx-6 -mb-6 min-h-[calc(100vh-8rem)] p-4 md:p-5 pt-6">
      {/* ── TOP FILTERS (sticky) ── */}
      <div className="sticky top-0 z-30 -mx-1 px-1 pb-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <SectionFrame
          as="form"
          variant="filters"
          chipLabel="Filtros"
          onSubmit={handleSubmit(onSubmit)}
          className="px-5 py-4 space-y-4 shadow-sm"
        >
        <div className="flex items-center gap-2 mb-1 pr-24">
          <div className="w-8 h-8 rounded-lg bg-[#cf1b22] flex items-center justify-center">
            <Wrench className="w-4 h-4 text-white" />
            </div>
            <div>
            <h2 className="text-sm font-semibold text-foreground">
              Calculadora de Mantenimiento Preventivo
              </h2>
            <p className="text-xs text-muted-foreground">
              Seleccione marca, modelo y horómetro para calcular el servicio
            </p>
            </div>
          </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Marca
              </Label>
              <Controller
                name="brand"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                    setValue('model', '');
                    setSelectedMachine(null);
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Marca…" />
                    </SelectTrigger>
                    <SelectContent>
                    {marcas.map((b: string) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.brand && (
                <p className="text-xs text-destructive">{errors.brand.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Modelo
              </Label>
              <Controller
                name="model"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setSelectedMachine(null);
                  }}
                    disabled={!selectedBrand}
                  >
                    <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={selectedBrand ? 'Modelo…' : 'Marca primero'} />
                    </SelectTrigger>
                    <SelectContent>
                    {modelos.map((m: string) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.model && (
                <p className="text-xs text-destructive">{errors.model.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 min-h-4 flex-wrap">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Horómetro (h)
              </Label>
              {frecuenciasPreview.map((f) => (
                <Badge
                  key={f}
                  variant="outline"
                  title={FRECUENCIA_LABELS[f]}
                  className="h-4 px-1.5 text-[9px] font-medium leading-none border-[#cf1b22]/30 text-[#cf1b22]"
                >
                  {FRECUENCIA_LABELS[f].replace('Mantenimiento ', '')}
                </Badge>
              ))}
              </div>
            <Controller
              name="hourMeter"
              control={control}
              render={({ field }) => (
                <Select
                  value={soloPrimeras ? `p:${primerasHoras}` : String(field.value)}
                  onValueChange={(value) => {
                    if (value.startsWith('p:')) {
                      setPrimerasHoras(Number(value.slice(2)) as PrimerasHoras);
                      return;
                    }
                    setPrimerasHoras('horometro');
                    field.onChange(Number(value));
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Seleccione…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {HOROMETRO_OPTIONS.map((h) => (
                      <SelectItem key={`h-${h}`} value={String(h)}>
                        {h.toLocaleString('es-CO')} h
                      </SelectItem>
                    ))}
                    {primerasDisponibles.map((horas) => (
                      <SelectItem key={`p-${horas}`} value={`p:${horas}`}>
                        {PRIMERAS_LABELS[horas]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            </div>

            <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 min-h-4 flex-wrap">
              <Label
                htmlFor="km-trayecto"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Km trayecto
              </Label>
              <span id="km-trayecto-hint" className="text-[10px] text-muted-foreground normal-case">
                Un trayecto (ida)
              </span>
            </div>
              <div className="relative">
                <Gauge className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                id="km-trayecto"
                  type="number"
                  min={0}
                  className="h-9 text-sm pl-8"
                aria-describedby="km-trayecto-hint"
                {...register('kilometers')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 min-h-4 flex-wrap">
              <Label
                htmlFor="tiempo-viaje"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Tiempo viaje (h)
              </Label>
              <span id="tiempo-viaje-hint" className="text-[10px] text-muted-foreground normal-case">
                Un trayecto (ida)
              </span>
            </div>
              <div className="relative">
              <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                id="tiempo-viaje"
                  type="number"
                  min={0}
                  step={0.5}
                  className="h-9 text-sm pl-8"
                aria-describedby="tiempo-viaje-hint"
                {...register('travelTime')}
                />
              </div>
            </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 min-h-4 flex-wrap">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ruta
              </Label>
              <span className="text-[10px] text-muted-foreground normal-case">
                Calcular km y tiempo
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full text-sm border-[#cf1b22]/30 text-[#cf1b22] hover:bg-[#cf1b22]/5"
              asChild
            >
              <a
                href={GOOGLE_MAPS_TRAVEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir Google Maps para calcular kilómetros y tiempo de viaje"
              >
                <MapPin className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                Google Maps
                <ExternalLink className="w-3 h-3 ml-1.5 shrink-0 opacity-70" />
              </a>
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Acción
            </Label>
            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1 h-9 text-sm font-semibold bg-[#cf1b22] hover:bg-[#a51519] text-white"
                disabled={isCalculating}
              >
                <Wrench className="w-4 h-4 mr-1.5" />
                {isCalculating ? 'Calculando…' : 'Calcular'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                onClick={handleReset}
                disabled={isCalculating}
                aria-label="Reiniciar"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
            </div>
          </div>
      </SectionFrame>
        </div>

      {/* ── MAIN + SUMMARY ── */}
      <div className="flex flex-1 gap-4 min-h-0">
        <main className="flex-1 overflow-y-auto space-y-4 min-w-0">
          {/* Selected equipment card */}
          <SectionFrame variant="equipment" chipLabel="Equipo" className="overflow-hidden">
                    <div className="flex flex-col sm:flex-row">
                <div className="w-full sm:w-44 h-32 sm:h-auto bg-[#2563eb]/5 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-r border-[#2563eb]/20 gap-2">
                  <Truck className="w-10 h-10 text-[#2563eb]/50" />
                  <span className="text-[10px] text-[#1d4ed8]/70 uppercase tracking-wide">
                    {selectedMachine?.marca ?? 'Equipo'}
                        </span>
                      </div>
                <div className="flex-1 p-5 pr-24">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                          <div>
                            <h3 className="text-lg font-bold text-foreground">
                        {selectedMachine
                          ? `${selectedMachine.marca} ${selectedMachine.modelo}`
                          : 'Sin equipo seleccionado'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                        {selectedMachine
                          ? 'Equipo seleccionado de telemetría'
                          : 'Seleccione una máquina de telemetría o calcule por marca/modelo'}
                            </p>
                          </div>
                    <Button
                      type="button"
                            variant="outline"
                      size="sm"
                      className="border-[#2563eb]/30 text-[#1d4ed8] hover:bg-[#2563eb]/5"
                      onClick={() => setMachineSheetOpen(true)}
                    >
                      <List className="w-4 h-4 mr-1.5" />
                      Ver máquinas telemetría
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {filteredTelemetria.length}
                        {filteredTelemetria.length !== activeTelemetria.length
                          ? ` / ${activeTelemetria.length}`
                          : ''}
                          </Badge>
                    </Button>
                        </div>

                  {selectedMachine ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {[
                        { icon: Hash, label: 'Serie', value: selectedMachine.serie },
                        {
                          icon: Clock,
                          label: 'Horómetro',
                          value: `${Number(selectedMachine.horometro).toLocaleString('es-CO')} h`,
                        },
                        {
                          icon: Truck,
                          label: 'Cliente',
                          value: selectedMachine.titulo ?? 'N/A',
                        },
                        {
                          icon: MapPin,
                          label: 'Sede / Ciudad',
                          value: selectedMachine.sede ?? selectedMachine.ciudad ?? 'N/A',
                        },
                        {
                          icon: Gauge,
                          label: 'Estado',
                          value: selectedMachine.estado ?? 'N/A',
                        },
                        {
                          icon: CheckCircle2,
                          label: 'Próximo mtto',
                          value: selectedMachine.fecha_primer_mtto ?? 'N/A',
                        },
                          ].map(({ icon: Icon, label, value }) => (
                            <div key={label} className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                            <Icon className="w-3 h-3 text-[#2563eb]" />
                                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                  {label}
                                </span>
                              </div>
                          <p className="text-sm font-semibold text-foreground pl-4 truncate">
                                {value}
                              </p>
                            </div>
                          ))}
                        </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-[#2563eb]/5 rounded-lg px-3 py-3 border border-[#2563eb]/15">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#2563eb]" />
                      Use el botón para listar las máquinas de telemetría y seleccionar una.
                      </div>
                  )}
                    </div>
              </div>
          </SectionFrame>

          {/* Results tabs */}
          <AnimatePresence mode="wait">
            {isCalculating && (
              <SectionFrame variant="catalog" chipLabel="Detalle" className="p-5 space-y-3">
                <Skeleton className="h-8 w-48" />
                {['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'].map((id) => (
                  <Skeleton key={id} className="h-4 w-full" />
                ))}
              </SectionFrame>
            )}
            {!isCalculating && result && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <SectionFrame
                  variant="catalog"
                  chipLabel="Actividades · Fluidos · Repuestos"
                  className="p-4 pt-5"
                >
                  <Tabs defaultValue="activities">
                      <TabsList className="mb-4 h-auto flex-wrap gap-1 bg-[#16a34a]/10 border border-[#16a34a]/20">
                        <TabsTrigger
                          value="activities"
                          className="text-sm data-[state=active]:bg-[#16a34a] data-[state=active]:text-white"
                        >
                          Actividades
                          <Badge variant="secondary" className="ml-1.5 text-xs font-normal">
                            {result.activities.length}
                      </Badge>
                        </TabsTrigger>
                        <TabsTrigger
                          value="fluids"
                          className="text-sm data-[state=active]:bg-[#16a34a] data-[state=active]:text-white"
                        >
                          Fluidos
                          <Badge variant="secondary" className="ml-1.5 text-xs font-normal">
                            {result.fluids.length}
                          </Badge>
                        </TabsTrigger>
                        <TabsTrigger
                          value="parts"
                          className="text-sm data-[state=active]:bg-[#16a34a] data-[state=active]:text-white"
                        >
                          Repuestos
                          <Badge variant="secondary" className="ml-1.5 text-xs font-normal">
                            {result.parts.length}
                          </Badge>
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="activities" className="mt-0">
                    <div className="overflow-x-auto">
                          {result.activities.length === 0 ? (
                            <div className="py-6 text-center space-y-1">
                              <p className="text-sm text-muted-foreground">
                                No hay filas con tipo{' '}
                                <span className="font-medium text-foreground">Actividad</span> para
                                esta marca, modelo y frecuencias (
                                {result.frecuenciasAplicadas.join(', ')} h).
                              </p>
                              {result.matchMeta && (
                                <p className="text-xs text-muted-foreground">
                                  Temparios equipo: {result.matchMeta.tempariosEquipo} · En
                                  frecuencia: {result.matchMeta.tempariosFrecuencia}
                                  {result.matchMeta.tiposEnEquipo.length > 0
                                    ? ` · Tipos en BD: ${result.matchMeta.tiposEnEquipo.join(', ')}`
                                    : ' · Sin registros en temparios para esta marca/modelo'}
                                </p>
                              )}
                            </div>
                          ) : (
                      <Table>
                        <TableHeader>
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                  <TableHead className="text-right">Frecuencia</TableHead>
                                  <TableHead>Marca</TableHead>
                                  <TableHead>Modelo</TableHead>
                                  <TableHead>Actividad</TableHead>
                                  <TableHead>Observaciones</TableHead>
                                  <TableHead>Código SAMM</TableHead>
                                  <TableHead className="text-right">Tiempo (h)</TableHead>
                                  <TableHead className="text-right">Mano de obra</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                                {result.activities.map((act) => (
                                  <TableRow key={act.id}>
                                    <TableCell className="text-sm text-right tabular-nums">
                                      {act.frecuenciaHoras ?? '—'}
                              </TableCell>
                                    <TableCell className="text-sm whitespace-nowrap">
                                      {act.marca ?? result.brand}
                              </TableCell>
                                    <TableCell className="text-sm whitespace-nowrap">
                                      {act.modelo ?? result.model}
                              </TableCell>
                                    <TableCell className="font-medium text-sm">
                                      {act.activity}
                              </TableCell>
                                    <TableCell className="text-sm max-w-[16rem] whitespace-normal">
                                      {act.observaciones?.trim() || '—'}
                                    </TableCell>
                                    <TableCell>
                                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                        {act.codigoSamm || '—'}
                                      </code>
                              </TableCell>
                                    <TableCell className="text-sm text-right tabular-nums">
                                      {act.laborHours.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-sm text-right font-semibold tabular-nums">
                                {formatCOP(act.subtotal)}
                              </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/30">
                                  <TableCell colSpan={6} className="font-semibold text-sm">
                                    Total mano de obra
                                    <span className="ml-2 font-normal text-muted-foreground">
                                      (Sum tiempo × {formatCOP(result.laborRate)}/h)
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right font-semibold tabular-nums">
                                    {result.laborHoursTotal.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right font-bold tabular-nums">
                                    {formatCOP(result.costs.labor)}
                                  </TableCell>
                                </TableRow>
                        </TableBody>
                      </Table>
                          )}
                    </div>
                      </TabsContent>

                      <TabsContent value="fluids" className="mt-0">
                        <div className="overflow-x-auto">
                          {result.fluids.length === 0 ? (
                            <div className="py-6 text-center space-y-1">
                              <p className="text-sm text-muted-foreground">
                                No hay filas con tipo{' '}
                                <span className="font-medium text-foreground">Fluido</span> para
                                frecuencias {result.frecuenciasAplicadas.join(', ')} h.
                              </p>
                              {result.matchMeta && (
                                <p className="text-xs text-muted-foreground">
                                  Temparios en frecuencia: {result.matchMeta.tempariosFrecuencia}
                                  {result.matchMeta.tiposEnEquipo.length > 0
                                    ? ` · Tipos: ${result.matchMeta.tiposEnEquipo.join(', ')}`
                                    : ''}
                                </p>
                              )}
                            </div>
                          ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                  <TableHead className="text-right">Freq. (h)</TableHead>
                                  <TableHead>Fluido</TableHead>
                                <TableHead className="text-right">Cant.</TableHead>
                                <TableHead>Unidad</TableHead>
                                  <TableHead>Aceite homologado</TableHead>
                                  <TableHead>Ref. genuina</TableHead>
                                  <TableHead>REF SAP DISPEL</TableHead>
                                  <TableHead>REF SAP original</TableHead>
                                  <TableHead>Ref. Stal</TableHead>
                                  <TableHead>Ref. Donaldson</TableHead>
                                  <TableHead>Ref. Fleetguard</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.fluids.map((f, i) => (
                                  <TableRow key={`fluid-${f.item}-${i}`}>
                                    <TableCell className="text-right tabular-nums text-sm">
                                      {f.frecuenciaHoras ?? '—'}
                                </TableCell>
                                    <TableCell className="font-medium text-sm min-w-[12rem]">
                                      <span className="block">{f.item}</span>
                                      <span className="text-[11px] text-muted-foreground">
                                        Modelo2: {f.tipoItem ?? 'Fluido'}
                                        {f.tipoCatalogo
                                          ? ` · Catálogo: ${f.tipoCatalogo}`
                                          : ''}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {f.quantity}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                      {f.unit}
                                    </TableCell>
                                    <TableCell className="text-xs whitespace-nowrap">
                                      {refCell(f.aceiteHomologado)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono whitespace-nowrap">
                                      {refCell(f.referenciaGenuina)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono whitespace-nowrap">
                                      {refCell(f.refSapDispel)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono whitespace-nowrap">
                                      {refCell(f.refSapOriginal)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono whitespace-nowrap">
                                      {refCell(f.referenciaStal)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono whitespace-nowrap">
                                      {refCell(f.referenciaDonaldson)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono whitespace-nowrap">
                                      {refCell(f.referenciaFleetguard)}
                                </TableCell>
                              </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                          )}
                          <p className="text-xs text-muted-foreground mt-3">
                            Fluidos (Modelo2 = Fluido / catálogo Aceite) según marca, modelo y
                            frecuencias del horómetro. Sin precios (SAP no conectado).
                          </p>
                        </div>
                      </TabsContent>

                      <TabsContent value="parts" className="mt-0">
                        <div className="overflow-x-auto">
                          {result.parts.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">
                              No hay repuestos en temparios para esta selección. Los precios SAP
                              no están disponibles aún.
                            </p>
                          ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                  <TableHead className="text-right">Freq. (h)</TableHead>
                                  <TableHead>Código / Ref.</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead className="text-right">Cant.</TableHead>
                                  <TableHead>Unidad</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.parts.map((p, i) => (
                                  <TableRow key={`${p.sapCode}-${i}`}>
                                    <TableCell className="text-right tabular-nums text-sm">
                                      {p.frecuenciaHoras ?? '—'}
                                    </TableCell>
                                  <TableCell>
                                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                      {p.sapCode}
                                    </code>
                                  </TableCell>
                                    <TableCell className="font-medium text-sm">
                                      {p.description}
                                </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {p.quantity}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {p.unit || 'Unidad'}
                                </TableCell>
                              </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                          )}
                          <p className="text-xs text-muted-foreground mt-3">
                            Listado desde temparios (Repuesto). Valores monetarios omitidos: sin
                            integración SAP.
                          </p>
                        </div>
                      </TabsContent>
                    </Tabs>
                </SectionFrame>
              </motion.div>
            )}
            {!isCalculating && !result && (
              <SectionFrame variant="muted" chipLabel="Pendiente" className="py-16 px-5">
                <div className="flex flex-col items-center justify-center text-center">
                  <Wrench className="w-10 h-10 text-[#475569]/60 mb-3" />
                  <h3 className="font-semibold text-foreground mb-1">Sin cálculo aún</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Complete marca, modelo y horómetro en la barra superior, o seleccione una
                    máquina de telemetría y pulse Calcular.
                  </p>
                </div>
              </SectionFrame>
            )}
          </AnimatePresence>
      </main>

        {/* Right summary */}
        <aside className="w-[300px] flex-shrink-0 hidden lg:block">
          <SectionFrame
            as="aside"
            variant="costs"
            chipLabel="Resumen"
            className="sticky top-0 overflow-y-auto max-h-[calc(100vh-10rem)]"
          >
          <div className="p-5 pt-10">
            {result ? (
              <div>
                <div className="pb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <FileText className="w-4 h-4 text-[#d97706]" />
                      Resumen de Costos
                  </h3>
                </div>
                <div>
                    <div className="space-y-2.5 mb-4">
                      {[
                      {
                        label: 'Mano de Obra',
                        value: result.costs.labor,
                        hint: `${result.laborHoursTotal.toFixed(2)} h × ${formatCOP(result.laborRate)}`,
                      },
                      { label: 'Viaje', value: result.costs.travel },
                    ].map(({ label, value, hint }) => (
                      <div key={label} className="space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{label}</span>
                          <span className="text-sm tabular-nums font-medium">{formatCOP(value)}</span>
                        </div>
                        {hint ? (
                          <p className="text-[11px] text-muted-foreground text-right">{hint}</p>
                        ) : null}
                        </div>
                      ))}
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Fluidos y repuestos: solo listado (sin precio SAP).
                    </p>
                    </div>
                    <Separator className="my-3" />
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between">
                        <span className="text-sm font-medium">Subtotal</span>
                      <span className="text-sm font-semibold tabular-nums">
                          {formatCOP(result.costs.subtotal)}
                        </span>
                      </div>
                    <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">IVA (19%)</span>
                      <span className="text-sm font-semibold tabular-nums">
                          {formatCOP(result.costs.vat)}
                        </span>
                      </div>
                    </div>
                  <div className="flex justify-between py-2 px-3 rounded-lg bg-[#d97706]/10 border border-[#d97706]/30 mb-5">
                    <span className="text-sm font-bold text-[#b45309]">TOTAL</span>
                    <span className="text-base font-extrabold text-[#b45309] tabular-nums">
                        {formatCOP(result.costs.total)}
                      </span>
                  </div>
                    <div className="space-y-2">
                      <Button
                      type="button"
                      className="w-full h-9 bg-[#cf1b22] hover:bg-[#a51519] text-white"
                      disabled={isGeneratingPdf}
                      onClick={handleGeneratePdf}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                      {isGeneratingPdf ? 'Generando PDF…' : 'Generar PDF'}
                      </Button>
                      <Button
                        variant="outline"
                      className="w-full h-9 border-[#d97706]/40 text-[#b45309] hover:bg-[#d97706]/5"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Guardar Cotización
                      </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[240px] text-center px-4">
                <FileText className="w-8 h-8 text-[#d97706]/70 mb-2" />
                <p className="text-sm font-medium text-foreground">Resumen de Costos</p>
                <p className="text-xs text-muted-foreground mt-1">Aparecerá después del cálculo</p>
              </div>
            )}
          </div>
          </SectionFrame>
        </aside>
                    </div>

      {/* Telemetry machines sheet */}
      <Sheet open={machineSheetOpen} onOpenChange={setMachineSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Máquinas de telemetría</SheetTitle>
            <SheetDescription>
              {telemetriaSheetDescription({
                brand: selectedBrand,
                model: selectedModel,
                hourMeter,
                filteredCount: filteredTelemetria.length,
                totalActive: activeTelemetria.length,
              })}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {filteredTelemetria.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No hay máquinas con los filtros actuales.
                {selectedBrand || selectedModel
                  ? ' Ajuste marca, modelo u horómetro, o limpie los filtros.'
                  : ''}
              </p>
            ) : (
              filteredTelemetria.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectMachine(m)}
                  className="w-full text-left rounded-lg border border-border p-3 hover:border-[#cf1b22]/40 hover:bg-[#cf1b22]/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {m.marca} {m.modelo}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{m.serie}</p>
                <p className="text-xs text-muted-foreground mt-1">
                        {m.titulo ?? 'Sin cliente'} · {m.sede ?? m.ciudad ?? '—'}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {Number(m.horometro).toLocaleString('es-CO')} h
                    </Badge>
                  </div>
                </button>
              ))
            )}
        </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
