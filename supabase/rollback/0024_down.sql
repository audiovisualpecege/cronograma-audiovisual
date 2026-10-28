-- Desfaz a migração 0024_google_colors.sql. Ver docs/publicar-1.1.0.md. Rode antes do 0023_down.sql.
-- Os cartões voltam à cor da família; as cores lidas do Google se perdem (voltam na próxima releitura, se a
-- migração entrar de novo). Antes, volte o serviço de fundo para a versão sem cores: a nova lê events.color_id.
-- Depois de rodar: npx supabase migration repair --status reverted 0024

begin;

alter table public.events drop column color_id;
alter table public.calendar_sources drop column color;

commit;
