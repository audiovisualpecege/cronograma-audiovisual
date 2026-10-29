-- Desfaz a migração 0023_series_titulars.sql. Ver docs/publicar-1.1.0.md. Rode antes do 0022_down.sql.
-- A turma fixa volta a ser só a deduzida do histórico; as respostas "virou o titular?" se perdem.
-- Depois de rodar: npx supabase migration repair --status reverted 0023

begin;

drop function public.set_series_titular(text, uuid, uuid[]);
alter table public.series_rules drop column titulars;

commit;
