-- Cores do Google Agenda nos cartões da Semana (ver docs/publicar-1.1.0.md).
--
-- events.color_id: a cor do próprio evento no Google (colorId, de "1" a "11"); vazia, o evento segue a cor da agenda.
-- calendar_sources.color: a cor da agenda (#rrggbb), como aparece na lista de agendas da conta de serviço.
-- O serviço de fundo grava as duas a cada releitura, só onde mudou; mudar a cor no Google não conta como mudança
-- do evento (sem aviso e sem "mudou na agenda"). Desfazer: supabase/rollback/0024_down.sql.

alter table public.events add column color_id text
  check (color_id is null or color_id ~ '^([1-9]|1[01])$');

alter table public.calendar_sources add column color text
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
