'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cog,
  Filter,
  Gauge,
  Layers,
  Search,
  Tractor,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '@/components/layout/app-shell';
import { useLccDashboard } from '@/hooks/use-lcc';
import { LCC_NEAR_THRESHOLD_HOURS } from '@/lib/lcc/lcc-match';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import type { LccAlertaComponente, LccComponente } from '@/types/database';

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}

function EstadoBadge({ estado }: { estado: LccAlertaComponente['estado'] }) {
  if (estado === 'vencido') {
    return (
      <Badge className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-50">
        Vencido
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-50">
      Próximo
    </Badge>
  );
}

function ChartCard({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: Array<{ name: string; total: number }>;
}) {
  const chartData = data.map((item) => ({
    ...item,
    label: item.name.length > 28 ? `${item.name.slice(0, 28)}…` : item.name,
  }));

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Sin datos para graficar
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={140}
                tick={{ fontSize: 10 }}
                interval={0}
              />
              <Tooltip
                formatter={(value: number) => [value, 'Componentes']}
                labelFormatter={(_, payload) => String(payload?.[0]?.payload?.name ?? '')}
              />
              <Bar dataKey="total" fill="#cf1b22" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function LccPage() {
  const { data, isLoading, isError, error } = useLccDashboard();

  const [alertaTipo, setAlertaTipo] = useState('all');
  const [alertaModelo, setAlertaModelo] = useState('all');
  const [alertaComponente, setAlertaComponente] = useState('all');
  const [alertaHorometro, setAlertaHorometro] = useState('all');
  const [alertaSearch, setAlertaSearch] = useState('');

  const [catTipo, setCatTipo] = useState('all');
  const [catComponente, setCatComponente] = useState('all');
  const [catGrupo, setCatGrupo] = useState('all');
  const [catHorometro, setCatHorometro] = useState('all');
  const [catSearch, setCatSearch] = useState('');

  const alertas: LccAlertaComponente[] = data?.alertas ?? [];
  const catalogo: LccComponente[] = data?.catalogo ?? [];

  const alertaTipos = useMemo(() => uniqueSorted(alertas.map((a) => a.tipo_maquina)), [alertas]);
  const alertaModelos = useMemo(() => {
    const source =
      alertaTipo === 'all' ? alertas : alertas.filter((a) => a.tipo_maquina === alertaTipo);
    return uniqueSorted(source.map((a) => a.modelo));
  }, [alertas, alertaTipo]);
  const alertaComponentes = useMemo(
    () => uniqueSorted(alertas.map((a) => a.componente)),
    [alertas]
  );
  const alertaHorometros = useMemo(() => {
    const values = Array.from(new Set(alertas.map((a) => a.intervalo_horas)));
    values.sort((a, b) => a - b);
    return values.map(String);
  }, [alertas]);

  const filteredAlertas = useMemo(() => {
    const q = alertaSearch.trim().toLowerCase();
    return alertas.filter((a) => {
      if (alertaTipo !== 'all' && a.tipo_maquina !== alertaTipo) return false;
      if (alertaModelo !== 'all' && a.modelo !== alertaModelo) return false;
      if (alertaComponente !== 'all' && a.componente !== alertaComponente) return false;
      if (alertaHorometro !== 'all' && String(a.intervalo_horas) !== alertaHorometro) return false;
      if (!q) return true;
      return [a.serie, a.modelo, a.componente, a.grupo, a.n_parte, a.titulo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [alertas, alertaTipo, alertaModelo, alertaComponente, alertaHorometro, alertaSearch]);

  const catTipos = useMemo(() => uniqueSorted(catalogo.map((c) => c.tipo_maquina)), [catalogo]);
  const catComponentes = useMemo(
    () => uniqueSorted(catalogo.map((c) => c.componente)),
    [catalogo]
  );
  const catGrupos = useMemo(() => uniqueSorted(catalogo.map((c) => c.grupo)), [catalogo]);
  const catHorometros = useMemo(() => {
    const values = Array.from(new Set(catalogo.map((c) => c.horometro_horas)));
    values.sort((a, b) => a - b);
    return values.map(String);
  }, [catalogo]);

  const filteredCatalogo = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    return catalogo.filter((c: LccComponente) => {
      if (catTipo !== 'all' && c.tipo_maquina !== catTipo) return false;
      if (catComponente !== 'all' && c.componente !== catComponente) return false;
      if (catGrupo !== 'all' && (c.grupo ?? '') !== catGrupo) return false;
      if (catHorometro !== 'all' && String(c.horometro_horas) !== catHorometro) return false;
      if (!q) return true;
      return [c.tipo_maquina, c.modelo, c.componente, c.grupo, c.n_parte, c.descripcion]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [catalogo, catTipo, catComponente, catGrupo, catHorometro, catSearch]);

  const vencidos = filteredAlertas.filter((a) => a.estado === 'vencido').length;
  const proximos = filteredAlertas.filter((a) => a.estado === 'proximo').length;

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Inicio', href: '/dashboard' },
        { label: 'LCC' },
      ]}
    >
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">LCC — Ciclo de vida de componentes</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Cruza la flota activa de telemetría con el catálogo LCC del fabricante. Muestra qué
              componentes deben verificarse o cambiarse según el horómetro actual (±
              {LCC_NEAR_THRESHOLD_HOURS} h).
            </p>
          </div>
        </div>

        {isError ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">
              {error instanceof Error
                ? error.message
                : 'No se pudo cargar LCC. Verifique que el esquema SQL esté aplicado.'}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Máquinas activas',
              value: data?.maquinasActivas ?? 0,
              icon: Tractor,
            },
            {
              label: 'Componentes en alerta',
              value: filteredAlertas.length,
              icon: AlertTriangle,
            },
            {
              label: 'Vencidos',
              value: vencidos,
              icon: Gauge,
            },
            {
              label: 'Catálogo LCC',
              value: catalogo.length,
              icon: Layers,
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label} className="shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-[#cf1b22]/10 text-[#cf1b22] flex items-center justify-center">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {kpi.label}
                    </p>
                    {isLoading ? (
                      <Skeleton className="h-6 w-16 mt-1" />
                    ) : (
                      <p className="text-lg font-semibold tabular-nums">
                        {kpi.value.toLocaleString('es-CO')}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard
            title="Máquinas con más componentes por verificar"
            subtitle="Prioridad por cantidad de alertas LCC"
            data={data?.topMaquinas ?? []}
          />
          <ChartCard
            title="Grupos / tipos de componente más frecuentes"
            subtitle="Qué familias de piezas concentran el reemplazo"
            data={data?.topGrupos?.length ? data.topGrupos : data?.topComponentes ?? []}
          />
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[#cf1b22]" />
              <CardTitle className="text-sm">Máquinas y componentes a verificar / cambiar</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {proximos} próximos · {vencidos} vencidos
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={alertaSearch}
                  onChange={(e) => setAlertaSearch(e.target.value)}
                  placeholder="Serie, modelo, componente…"
                  className="h-8 w-52 pl-8 text-xs"
                />
              </div>
              <Select
                value={alertaTipo}
                onValueChange={(v) => {
                  setAlertaTipo(v);
                  setAlertaModelo('all');
                }}
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Tipo máquina" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {alertaTipos.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={alertaModelo} onValueChange={setAlertaModelo}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Modelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los modelos</SelectItem>
                  {alertaModelos.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={alertaComponente} onValueChange={setAlertaComponente}>
                <SelectTrigger className="h-8 w-52 text-xs">
                  <SelectValue placeholder="Componente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los componentes</SelectItem>
                  {alertaComponentes.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={alertaHorometro} onValueChange={setAlertaHorometro}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Horómetro LCC" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo horómetro</SelectItem>
                  {alertaHorometros.map((h) => (
                    <SelectItem key={h} value={h}>
                      {Number(h).toLocaleString('es-CO')} h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DualScrollContainer topScrollClassName="h-3.5 bg-muted/50" contentClassName="pb-1">
              <Table noScrollWrapper className="w-max min-w-[1200px]">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs">Serie</TableHead>
                    <TableHead className="text-xs">Tipo / Modelo</TableHead>
                    <TableHead className="text-xs text-right">Horóm. máquina</TableHead>
                    <TableHead className="text-xs">Componente</TableHead>
                    <TableHead className="text-xs">Grupo</TableHead>
                    <TableHead className="text-xs">N° parte</TableHead>
                    <TableHead className="text-xs text-right">Intervalo LCC</TableHead>
                    <TableHead className="text-xs text-right">Restan</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={`a-sk-${i}`}>
                        <TableCell colSpan={9}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredAlertas.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center text-sm text-muted-foreground py-10"
                      >
                        No hay componentes próximos o vencidos con los filtros actuales. Importe el
                        catálogo LCC y verifique modelos en telemetría.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAlertas.slice(0, 300).map((row) => (
                      <TableRow key={`${row.serie}-${row.componente}-${row.intervalo_horas}-${row.n_parte}`}>
                        <TableCell className="text-xs font-mono">{row.serie}</TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{row.modelo}</div>
                          <div className="text-muted-foreground">{row.tipo_maquina}</div>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.horometro_maquina.toLocaleString('es-CO')} h
                        </TableCell>
                        <TableCell className="text-xs max-w-[220px] truncate" title={row.componente}>
                          {row.componente}
                        </TableCell>
                        <TableCell className="text-xs">{row.grupo}</TableCell>
                        <TableCell className="text-xs font-mono">{row.n_parte}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.intervalo_horas.toLocaleString('es-CO')} h
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.horas_restantes.toLocaleString('es-CO')} h
                        </TableCell>
                        <TableCell className="text-xs">
                          <EstadoBadge estado={row.estado} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </DualScrollContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex items-center gap-2">
              <Cog className="h-4 w-4 text-[#cf1b22]" />
              <CardTitle className="text-sm">Catálogo LCC</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {filteredCatalogo.length.toLocaleString('es-CO')} ítems
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  placeholder="Buscar en catálogo…"
                  className="h-8 w-52 pl-8 text-xs"
                />
              </div>
              <Select value={catTipo} onValueChange={setCatTipo}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Tipo máquina" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {catTipos.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={catComponente} onValueChange={setCatComponente}>
                <SelectTrigger className="h-8 w-52 text-xs">
                  <SelectValue placeholder="Componente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los componentes</SelectItem>
                  {catComponentes.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={catGrupo} onValueChange={setCatGrupo}>
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue placeholder="Grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los grupos</SelectItem>
                  {catGrupos.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={catHorometro} onValueChange={setCatHorometro}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Horómetro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo horómetro</SelectItem>
                  {catHorometros.map((h) => (
                    <SelectItem key={h} value={h}>
                      {Number(h).toLocaleString('es-CO')} h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DualScrollContainer topScrollClassName="h-3.5 bg-muted/50" contentClassName="pb-1">
              <Table noScrollWrapper className="w-max min-w-[1100px]">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Modelo</TableHead>
                    <TableHead className="text-xs">Componente</TableHead>
                    <TableHead className="text-xs text-right">Horómetro</TableHead>
                    <TableHead className="text-xs">N° parte</TableHead>
                    <TableHead className="text-xs">Descripción</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs">Grupo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`c-sk-${i}`}>
                        <TableCell colSpan={8}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredCatalogo.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-sm text-muted-foreground py-10"
                      >
                        Catálogo vacío. Cargue el Excel LCC en Administración → Importaciones.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCatalogo.slice(0, 300).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs">{row.tipo_maquina}</TableCell>
                        <TableCell className="text-xs font-medium">{row.modelo}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={row.componente}>
                          {row.componente}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.horometro_horas.toLocaleString('es-CO')} h
                        </TableCell>
                        <TableCell className="text-xs font-mono">{row.n_parte || '—'}</TableCell>
                        <TableCell
                          className="text-xs max-w-[220px] truncate text-muted-foreground"
                          title={row.descripcion ?? undefined}
                        >
                          {row.descripcion || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.cantidad ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">{row.grupo || '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </DualScrollContainer>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
