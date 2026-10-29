-- Cor própria do evento no Google Agenda (ver docs/publicar-1.1.0.md).
--
-- events.color_id: a cor que alguém deu ao evento no Google (colorId, de "1" a "11"). Vazia, o cartão da Semana usa
-- a cor do tipo, como a equipe pinta a agenda. O serviço de fundo grava a cada releitura, só onde mudou; mudar a
-- cor no Google não conta como mudança do evento (sem aviso e sem "mudou na agenda").
-- A cor das agendas não vem: o Google só a mostra para quem vê a agenda, não para a conta de serviço.
-- Desfazer: supabase/rollback/0024_down.sql.

alter table public.events add column color_id text
  check (color_id is null or color_id ~ '^([1-9]|1[01])$');
