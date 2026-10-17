import { suggestCatalogFromHistory } from '@cronograma/core';
import { useMemo } from 'react';
import type { JobRoleRow, ServiceTypeRow } from '../data/catalog';
import { historyLabels, SHEET_LABELS_KEY, useHistory, type SheetLabels } from '../data/history';
import { useLocalQuery } from '../sync/SyncProvider';

/**
 * Funções e tipos vistos no histórico ou na última planilha lida que ainda não estão no cadastro
 * (US-004 EC-2, US-005 EC-5).
 */
export function useCatalogSuggestions(roles: readonly JobRoleRow[] | undefined, types: readonly ServiceTypeRow[] | undefined) {
  const history = useHistory();
  const sheet = useLocalQuery((store) => store.getMeta<SheetLabels>(SHEET_LABELS_KEY), []);
  return useMemo(() => {
    if (!roles || !types) return { roles: [], types: [], history };
    const found = suggestCatalogFromHistory(historyLabels(history.rows, sheet), {
      roles: roles.map((r) => r.name),
      types: types.map((t) => t.name),
    });
    return { ...found, history };
  }, [history, sheet, roles, types]);
}
