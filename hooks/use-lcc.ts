import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteLccImportBatch,
  fetchLccCatalog,
  fetchLccDashboard,
  type LccDashboardData,
} from '@/services/lcc.service';
import type { LccComponente } from '@/types/database';

export function useLccDashboard() {
  return useQuery<LccDashboardData>({
    queryKey: ['lcc', 'dashboard'],
    queryFn: fetchLccDashboard,
    staleTime: 60 * 1000,
  });
}

export function useLccCatalog(includeInactive = false) {
  return useQuery<LccComponente[]>({
    queryKey: ['lcc', 'catalog', includeInactive],
    queryFn: () => fetchLccCatalog(includeInactive),
    staleTime: 60 * 1000,
  });
}

export function useDeleteLccImportBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => deleteLccImportBatch(batchId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['lcc'] });
      await qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}
