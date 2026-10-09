import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchMarcas,
  fetchModelos,
  fetchTiposItem,
  fetchPrimerasDisponibles,
  calculatePreventiveMaintenance,
  registerTemparioImport,
  fetchTempariosAdmin,
  updateTempario,
  updateTempariosBulk,
  deactivateTempario,
  type TempariosAdminQuery,
} from '@/services/calculadora.service';
import type {
  PreventiveQuoteInput,
  PreventiveQuoteResult,
  TemparioUpdatePatch,
} from '@/types/database';

export function useCalculadoraMarcas() {
  return useQuery({
    queryKey: ['calculadora', 'marcas'],
    queryFn: fetchMarcas,
    staleTime: 60 * 1000,
  });
}

export function useCalculadoraModelos(marca: string) {
  return useQuery({
    queryKey: ['calculadora', 'modelos', marca],
    queryFn: () => fetchModelos(marca),
    enabled: Boolean(marca) && marca !== 'all',
    staleTime: 60 * 1000,
  });
}

/** Paquetes “Primeras N horas” cargados en temparios para la marca y el modelo. */
export function usePrimerasDisponibles(marca: string, modelo: string) {
  const enabled = Boolean(marca.trim()) && Boolean(modelo.trim());
  return useQuery({
    queryKey: ['calculadora', 'primeras', marca, modelo],
    queryFn: () => fetchPrimerasDisponibles(marca, modelo),
    enabled,
    staleTime: 60 * 1000,
  });
}

/** Modelos del filtro de administración: todos, o solo los de la marca elegida. */
export function useTemparioModelosFiltro(marca: string) {
  const scoped = Boolean(marca) && marca !== 'all';
  return useQuery({
    queryKey: ['calculadora', 'modelos-filtro', scoped ? marca : 'all'],
    queryFn: () => fetchModelos(scoped ? marca : ''),
    staleTime: 60 * 1000,
  });
}

export function useCalculadoraTipos() {
  return useQuery({
    queryKey: ['calculadora', 'tipos'],
    queryFn: fetchTiposItem,
    staleTime: 60 * 1000,
  });
}

export function useCalculatePreventive() {
  return useMutation({
    mutationFn: (input: PreventiveQuoteInput) => calculatePreventiveMaintenance(input),
  });
}

export function useTemparioImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fileName, ok, error }: { fileName: string; ok: number; error: number }) =>
      registerTemparioImport(fileName, ok, error),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calculadora'] });
    },
  });
}

export function useTempariosAdmin(query: TempariosAdminQuery) {
  return useQuery({
    queryKey: ['calculadora', 'temparios-admin', query],
    queryFn: () => fetchTempariosAdmin(query),
    staleTime: 30 * 1000,
  });
}

export function useUpdateTempario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
      updatedBy,
    }: {
      id: string;
      patch: TemparioUpdatePatch;
      updatedBy?: string;
    }) => updateTempario(id, patch, updatedBy),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calculadora'] });
    },
  });
}

export function useUpdateTempariosBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      patch,
      updatedBy,
    }: {
      ids: string[];
      patch: TemparioUpdatePatch;
      updatedBy?: string;
    }) => updateTempariosBulk(ids, patch, updatedBy),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calculadora'] });
    },
  });
}

export function useDeactivateTempario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updatedBy }: { id: string; updatedBy?: string }) =>
      deactivateTempario(id, updatedBy),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calculadora'] });
    },
  });
}

export type { PreventiveQuoteInput, PreventiveQuoteResult };
