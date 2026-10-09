/** Frecuencias de mantenimiento preventivo (horas). Las “Primeras” no se mezclan con la fórmula. */
export type MaintenanceFrequencyHours = 50 | 100 | 250 | 500 | 1000 | 2000 | 2500 | 4000 | 5000;

/** Primeras horas: paquete único, independiente de 250/1000/2000/4000/5000. */
export type PrimerasHoras = 50 | 100 | 250 | 500 | 2500;

/** Valores válidos de tipo_item (= Excel Modelo2) */
export type TemparioTipoItem =
  | 'Repuesto'
  | 'Consumible'
  | 'Fluido'
  | 'Actividad'
  | 'Servicio'
  | 'Observacion';

/** Alias: valor Excel Modelo2 */
export type Modelo2Clasificacion = TemparioTipoItem;

export interface TemparioMantenimiento {
  id: string;
  legacy_id?: number | null;
  marca: string;
  linea?: string | null;
  modelo: string;
  /** Valor Excel columna Modelo2 */
  tipo_item: TemparioTipoItem;
  item: string;
  unidad_medida: string;
  cantidad: number;
  frecuencia_horas: MaintenanceFrequencyHours;
  /** 'primeras' = Primeras N horas. 'intervalo' = fórmula 250/1000/2000/4000/5000. */
  frecuencia_grupo?: 'intervalo' | 'primeras' | null;
  aceite_homologado?: string | null;
  referencia_genuina?: string | null;
  ref_sap_dispel?: string | null;
  ref_sap_original?: string | null;
  referencia_stal?: string | null;
  referencia_fleetguard?: string | null;
  referencia_donaldson?: string | null;
  tiempo_horas: number;
  procedimiento?: string | null;
  avisos_claves?: string | null;
  /** Subtipo Excel columna TipoItem (ej. Filtro) */
  tipo_catalogo?: string | null;
  precio_unitario: number;
  tarifa_mano_obra_h: number;
  activo: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  /** UUID de importaciones.id de la carga masiva. */
  import_batch_id?: string | null;
}

export type TemparioWritable = Omit<
  TemparioMantenimiento,
  'id' | 'created_at' | 'updated_at'
>;

export type TemparioUpdatePatch = Partial<TemparioWritable>;

export interface TarifaDesplazamiento {
  costo_por_km: number;
  costo_por_hora_viaje: number;
  factor_ida_vuelta: number;
  iva_porcentaje: number;
}

export interface PreventiveQuoteInput {
  marca: string;
  modelo: string;
  horometro: number;
  kmTrayecto: number;
  horasTrayecto: number;
  /** Si viene informado, la cotización usa solo ese paquete y no la fórmula del horómetro. */
  frecuenciaPrimeras?: PrimerasHoras | null;
}

export interface PreventiveActivityLine {
  id: string;
  activity: string;
  description: string;
  laborHours: number;
  parts: number;
  consumables: number;
  subtotal: number;
  frecuenciaHoras?: MaintenanceFrequencyHours;
  marca?: string;
  modelo?: string;
  /** Código SAMM / referencia de catálogo */
  codigoSamm?: string;
  /** Excel Observaciones → avisos_claves */
  observaciones?: string;
}

export interface PreventiveConsumableLine {
  item: string;
  quantity: number;
  unit: string;
  /** Sin SAP: siempre 0 hasta integración de precios */
  unitPrice: number;
  total: number;
  tipoItem?: TemparioTipoItem | string;
  tipoCatalogo?: string | null;
  referencia?: string | null;
  frecuenciaHoras?: MaintenanceFrequencyHours;
  marca?: string;
  modelo?: string;
  referenciaGenuina?: string;
  refSapDispel?: string;
  refSapOriginal?: string;
  referenciaStal?: string;
  referenciaDonaldson?: string;
  referenciaFleetguard?: string;
  /** Aceite homologado (relevante en Fluidos) */
  aceiteHomologado?: string;
}

/** Línea de Fluido (Modelo2 = Fluido) — mismo shape que consumible */
export type PreventiveFluidLine = PreventiveConsumableLine;

export interface PreventivePartLine {
  sapCode: string;
  description: string;
  quantity: number;
  /** Sin SAP: siempre 0 hasta integración de precios */
  unitPrice: number;
  total: number;
  unit?: string;
  frecuenciaHoras?: MaintenanceFrequencyHours;
  referenciaGenuina?: string;
  refSapDispel?: string;
  refSapOriginal?: string;
  referenciaStal?: string;
  referenciaDonaldson?: string;
  referenciaFleetguard?: string;
}

export interface PreventiveQuoteResult {
  brand: string;
  model: string;
  serialNumber: string;
  year: number;
  hours: number;
  kilometers: number;
  status: 'active' | 'maintenance';
  frecuenciasAplicadas: MaintenanceFrequencyHours[];
  /** Sum(Tiempo horas) de actividades — fórmula Power Apps */
  laborHoursTotal: number;
  /** Tarifa COP/h usada (110000) */
  laborRate: number;
  activities: PreventiveActivityLine[];
  /** Modelo2 = Fluido */
  fluids: PreventiveFluidLine[];
  /** Modelo2 = Consumible */
  consumables: PreventiveConsumableLine[];
  /** Modelo2 = Repuesto */
  parts: PreventivePartLine[];
  /** Diagnóstico de cruce tempario ↔ filtros (UI vacía) */
  matchMeta?: {
    tempariosEquipo: number;
    tempariosFrecuencia: number;
    tiposEnEquipo: string[];
  };
  costs: {
    labor: number;
    fluids: number;
    consumables: number;
    parts: number;
    travel: number;
    subtotal: number;
    vat: number;
    total: number;
  };
}

export interface TelemetriaEquipo {
  id: string;
  titulo?: string | null;
  nit?: string | null;
  telefono?: string | null;
  serie: string;
  modelo: string;
  horometro: number;
  promedio_h?: number | null;
  ciudad?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  /** Fecha de descarga desde el aplicativo de telemetría. */
  ultima_fecha_comunicacion?: string | null;
  fecha_primer_mtto?: string | null;
  fecha_segundo_mtto?: string | null;
  fecha_tercer_mtto?: string | null;
  sede?: string | null;
  asesor_email?: string | null;
  marca: string;
  tipo_mtto?: number | null;
  estado?: string | null;
  tipo_maquina?: string | null;
  /** Periodo de la proyección (Power Apps MesCreado). */
  mes_creado?: string | null;
  anio?: number | null;
  /** Columna Excel Creado. */
  created_at?: string | null;
}

export interface CppCatalogItem {
  id: string;
  legacy_no?: number | null;
  ref_sap: string;
  marca: string;
  nombre: string;
  cantidad: number;
  frecuencia?: string | null;
  medida?: string | null;
  comentario?: string | null;
  modelo: string;
  componente: string;
  subtipo_componente: string;
  imagen_url?: string | null;
  recomendacion?: string | null;
  adjuntos?: Array<{ title: string; url: string }>;
  equivalencia1?: string | null;
  equivalencia2?: string | null;
  equivalencia3?: string | null;
  referencia_catalogo_original?: string | null;
  precio_lista: number;
  stock_disponible: number;
  bodega?: string | null;
  precio_sap?: number | null;
  stock_sap?: number | null;
  bodega_sap?: string | null;
}

export interface CppFilters {
  marca?: string;
  modelo?: string;
  componente?: string;
  subtipo?: string;
  frecuencia?: string;
  search?: string;
}

export interface ImportacionRecord {
  id: string;
  modulo: 'calculadora' | 'proyectados' | 'cpp';
  nombre_archivo: string;
  registros_total: number;
  registros_ok: number;
  registros_error: number;
  duplicados: number;
  estado: 'procesando' | 'completado' | 'fallido' | 'parcial';
  created_at: string;
}

export interface SapItemAvailability {
  refSap: string;
  price: number;
  stock: number;
  warehouse: string;
  currency: string;
  available: boolean;
}

export interface ProjectedMaintenanceKpis {
  totalMaquinas: number;
  totalClientes: number;
  oportunidadesMes: number;
  oportunidadesPorSede: Array<{ sede: string; total: number }>;
  oportunidadesPorMarca: Array<{ marca: string; total: number }>;
  oportunidadesPorCliente: Array<{ cliente: string; total: number }>;
  oportunidadesPorMes: Array<{ mes: string; total: number; enviadas: number; pendientes: number }>;
  insumosProyectadosTotal: number;
  insumosPorTipo: Array<{ tipo: string; total: number; cantidad: number }>;
}
