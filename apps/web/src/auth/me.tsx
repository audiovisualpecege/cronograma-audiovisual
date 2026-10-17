import { createContext, useContext, type ReactNode } from 'react';
import type { Me } from '../supabase';

// Pessoa logada para as telas de dentro do app (Minha semana, avisos, preferências).
const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe fora do MeProvider');
  return me;
}
