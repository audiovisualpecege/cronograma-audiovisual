# Publicar a 1.1.0 (e como desfazer)

Roteiro para quem for publicar a versão 1.1.0, inclusive o Claude numa conversa nova. Siga na ordem e pare no
primeiro passo que não der o resultado esperado.

## Onde as coisas estão (21/10/2026)

- **Código**: branch `ajuste/painel-e-semana`, pull request #2 (`audiovisualpecege/cronograma-audiovisual`).
  Ainda **sem merge**: o app publicado no GitHub Pages continua na 1.0.1.
- **Banco**: duas migrações novas, **ainda não aplicadas** na produção:
  - `supabase/migrations/0012_request_classify.sql`: o app passa a poder pedir o job `classify` (identificar os
    tipos pelo histórico e pelo Gemini), e "Montar semana" numa semana já montada cria as vagas dos eventos
    que o serviço de fundo tipou depois da montagem. Não mexe em dados.
  - `supabase/migrations/0013_type_icon_and_highlight.sql`: coluna `icon` nos tipos, coluna `highlighted`
    (estrela) nos eventos e as funções que gravam as duas. **Mexe em dados da produção**: cria os tipos FERIAS e
    FOLGA, tira "ferias" e "folga" das palavras-chave do NAO ESCALAR, deixa o DISPONIBILIZAR sem equipe (as
    vagas vazias dele somem das semanas montadas) e passa os eventos futuros de férias e folga para os tipos
    novos. Antes de mudar, guarda o que era em `public._backup_0013`.
- **Desfazer**: `supabase/rollback/0013_down.sql` e `supabase/rollback/0012_down.sql` (fora da pasta de
  migrações, para o `db push` não rodá-los).
- **Serviço de fundo (NAS)**: não muda. O job `classify` já existe nele desde a 1.0.0.
- O que muda para quem usa está no topo do `CHANGELOG.md`.

## Antes de começar

1. O Supabase CLI precisa estar logado e ligado ao projeto. Os dois comandos pedem a pessoa, então ela roda
   no prompt do Claude Code com `!`:
   - `! npx supabase login` (abre o navegador);
   - `! npx supabase link --project-ref diqywljvafphbfsqadhk` (pede a senha do banco, em Project Settings >
     Database no painel do Supabase). Nunca grave a senha em arquivo do repositório.
   Para conferir: `npx supabase projects list` lista o projeto sem erro.
2. Código em dia e testes verdes:
   ```
   git checkout ajuste/painel-e-semana
   git pull
   npm test
   npx tsc -p apps/web --noEmit
   ```
3. Avise a pessoa: o passo 2 abaixo grava na produção e a equipe vê o resultado.

## Publicar

1. **Simular** (não grava nada):
   ```
   npx supabase db push --dry-run
   ```
   Deve listar **só** `0012_request_classify.sql` e `0013_type_icon_and_highlight.sql`.
   Se listar também as antigas (0001 a 0011), o histórico de migrações do banco não registrou que elas já
   foram aplicadas. **Não rode o push.** Confira com `npx supabase migration list`. Depois de confirmar que o
   esquema existe (as tabelas `people`, `events`, `weeks` estão lá), marque as antigas como aplicadas com
   `npx supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011`.
   Simule de novo.
2. **Aplicar**:
   ```
   npx supabase db push
   ```
3. **Conferir no banco** (SQL Editor do painel do Supabase, ou `npx supabase db query` se a versão do CLI
   tiver):
   ```sql
   select name, no_team, icon, keywords from public.service_types order by name;   -- FERIAS e FOLGA, sem equipe
   select kind, count(*) from public._backup_0013 group by kind;                  -- a cópia existe
   select column_name from information_schema.columns
    where table_name = 'events' and column_name = 'highlighted';                  -- 1 linha
   ```
4. **CI verde e merge**: `gh pr checks 2` tudo verde; depois `gh pr merge 2 --merge`. O merge publica o app
   no GitHub Pages sozinho. Em poucos minutos o rodapé do menu mostra `v1.1.0`.
5. **Testar no app publicado**, com a conta de administrador:
   - Painel: 3 cartões (semana atual em destaque), avisos com ícone e cor, pendências por último.
   - Semana: troca de semana com animação, "Semana atual" sob o título, cartões por função, Folga e férias.
   - Propor escala na semana atual: o passo 1 identifica os tipos sozinho. Primeiro pelas palavras-chave;
     depois a mensagem "Identificando os outros pelo histórico e pela IA" deve virar "O histórico e a IA
     identificaram mais N eventos". Se aparecer "ainda não foi liberada no servidor", a 0012 não entrou.
   - Estrela: marcar um evento, recarregar a página, a estrela continua.
   - Tipos de serviço: abrir um tipo, escolher um ícone no banco de ícones, salvar, recarregar, o ícone fica.
6. Depois de alguns dias sem problema: `drop table public._backup_0013;` e apague esta seção de pendência
   do `CLAUDE.md`.

## Desfazer

Use se a 1.1.0 der problema sério. O app antigo funciona com o banco novo e o app novo funciona com o banco
antigo (sem estrela, sem ícone escolhido, sem a identificação pelo servidor). Então dá para desfazer só a parte
que deu problema.

1. **App** (volta para a 1.0.1):
   ```
   git checkout main
   git pull
   git revert -m 1 <commit do merge do PR #2>
   ```
   Isso vai num branch e num PR, como qualquer ajuste. O merge publica de novo.
2. **Banco**, nesta ordem. Rode cada arquivo inteiro no SQL Editor do painel; cada um roda numa transação só:
   1. `supabase/rollback/0013_down.sql`: volta os eventos que mudaram de tipo, o NAO ESCALAR e o
      DISPONIBILIZAR (equipe típica e vagas), apaga FERIAS e FOLGA se ninguém os usou e tira as colunas
      novas. Estrelas e ícones escolhidos depois da 1.1.0 se perdem.
   2. `supabase/rollback/0012_down.sql`: volta `request_job` e `build_week_internal`.
   3. Registre no histórico de migrações:
      `npx supabase migration repair --status reverted 0013 0012`.
   4. Confira com `select name, no_team, keywords from public.service_types order by name;`. Depois de
      conferir, apague a cópia: `drop table public._backup_0013;`.
3. Os tipos que a identificação gravou nos eventos (por palavra-chave, histórico ou IA) **não** são desfeitos:
   são tipos certos, e o administrador pode trocar qualquer um na tela.
