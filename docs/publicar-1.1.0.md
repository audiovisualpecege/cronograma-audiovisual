# Publicar a 1.1.0 (e como desfazer)

Roteiro para quem for publicar a versão 1.1.0, inclusive o Claude numa conversa nova. Siga na ordem e pare no
primeiro passo que não der o resultado esperado.

## Onde as coisas estão (21/10/2026)

- **Código**: branch `ajuste/painel-e-semana`, pull request #2 (`audiovisualpecege/cronograma-audiovisual`).
  Ainda **sem merge**: o app publicado no GitHub Pages continua na 1.0.1.
- **Banco**: oito migrações novas, **ainda não aplicadas** na produção:
  - `supabase/migrations/0012_request_classify.sql`: o app passa a poder pedir o job `classify` (identificar os
    tipos pelo histórico e pelo Gemini), e "Montar semana" numa semana já montada cria as vagas dos eventos
    que o serviço de fundo tipou depois da montagem. Não mexe em dados.
  - `supabase/migrations/0013_type_icon_and_highlight.sql`: coluna `icon` nos tipos, coluna `highlighted`
    (estrela) nos eventos e as funções que gravam as duas. **Mexe em dados da produção**: cria os tipos FERIAS e
    FOLGA, tira "ferias" e "folga" das palavras-chave do NAO ESCALAR, deixa o DISPONIBILIZAR sem equipe (as
    vagas vazias dele somem das semanas montadas) e passa os eventos futuros de férias e folga para os tipos
    novos. Antes de mudar, guarda o que era em `public._backup_0013`.
  - `supabase/migrations/0014_local_ai.sql`: colunas `ai_local_url` e `ai_local_model` na configuração, e
    `op_settings_update` aceitando o fornecedor `local` (IA na rede da empresa, como o MiniCPM5; ver
    `docs/ia-local.md`). Não mexe em dados.
  - `supabase/migrations/0015_meetings_by_sector.sql`: reuniões por setor. **Mexe em dados da produção**:
    - cria REUNIAO EDICAO, PRODUCAO e PLANEJAMENTO;
    - a equipe típica das reuniões de setor (incluindo TECNICA AULAS e MEDIADORES) passa a ter uma vaga por
      pessoa ativa do setor;
    - a REUNIAO INTERNA deixa de pedir equipe;
    - as reuniões futuras são reclassificadas pelo título e as vagas das semanas montadas são refeitas.
    Antes de mudar, guarda o que era em `public._backup_0015`. Motivo: a REUNIAO INTERNA pedia 47 vagas por
    reunião (329 das 685 vagas da semana de 19/10) e a proposta da IA falhava no primeiro lote.
  - `supabase/migrations/0016_role_priority_level.sql`: ordem e nível das funções de cada pessoa
    (`person_roles.priority` e `level`: Apoio, Titular, Referência) e trabalho complexo nos tipos
    (`service_types.complex`), mais as funções de gravação aceitando os dois. Não mexe em dados.
  - `supabase/migrations/0017_event_size.sql`: porte do evento (Simples, Médio, Grande). Colunas
    `service_types.sized` e `default_size`, `service_type_crew.size` (a chave única da equipe passa a incluir o
    porte) e `events.size`; as vagas nascem pela equipe do porte do evento (sem porte escolhido, o padrão do
    tipo). **Mexe em dados da produção**:
    - EVENTO, GRAVACAO e PODCAST ganham porte, com a equipe combinada em 26/10/2026 (EVENTO: Simples 1 Operador
      Evento; Médio Operador Evento, Cinegrafista e Fotografia; Grande a equipe cheia de 8). Padrão: Simples no
      EVENTO, Médio na GRAVACAO e no PODCAST (o que mais aconteceu nas últimas 12 semanas);
    - a TRANSMISSAO deixa de pedir Suporte;
    - as vagas desses tipos nas semanas montadas são refeitas onde ninguém foi escalado ("equipe típica mudou"
      onde já tem gente).
    Antes de mudar, guarda o que era em `public._backup_0017`. Motivo: no histórico de um ano, metade dos
    EVENTOS teve 1 pessoa, mas o tipo pedia 8 vagas em todos.
  - `supabase/migrations/0018_disponibilizador.sql`: coluna `job_roles.no_hours` (função que não ocupa horário:
    sem horas na carga e sem "horário sobreposto"), `check_eligibility` e `op_job_role_upsert` com ela. **Mexe em
    dados da produção**:
    - cria a função Disponibilizador (no setor do Operador Aula), que não ocupa horário;
    - o DISPONIBILIZAR volta a exigir equipe (a 0013 tinha tirado), com 1 Disponibilizador, e ganha a
      palavra-chave "*disponibilizar" (título que começa com "*DISPONIBILIZAR" recebe o tipo);
    - os eventos de agora em diante com esse começo passam para o tipo, e as vagas das semanas montadas são
      refeitas onde ninguém foi escalado.
    - quem está ativo com Operador Aula ganha Disponibilizador, por último na lista de funções (o histórico não
      diz quem disponibiliza hoje; escolha do Raoni em 26/10/2026). Quem não faz, tire em Dados > Pessoas.
    Antes de mudar, guarda o que era em `public._backup_0018`.
  - `supabase/migrations/0019_meeting_sectors.sql`: reuniões sem escala, ligadas aos setores. Coluna
    `service_types.sector_ids`; a equipe passa a ler os tipos e os eventos de tipo sem equipe ligado ao setor
    dela (política `team_read` de `events` refeita); `op_service_type_upsert` vira `op_service_type_upsert_base`
    e a nova grava os setores. **Mexe em dados da produção**: REUNIAO EDICAO, PRODUCAO, PLANEJAMENTO, TECNICA
    AULAS e MEDIADORES deixam de pedir equipe (as vagas vazias somem) e ficam ligadas ao setor de cada uma.
    REUNIAO INTERNA fica ligada a todos os setores ativos (toda a equipe vê). Antes de mudar, guarda o que era em `public._backup_0019`.
  - `supabase/migrations/0020_type_rules.sql`: tipo pelo começo do título e pela série. Palavra-chave de começo
    (`^reuniao`) vale só no começo do título e vem antes das outras e do histórico; funções `name_tokens`,
    `event_series` (espelho do `eventSeries` do core) e `prefix_type`; tabela `series_rules` (o que cada série
    aprendeu; a troca de tipo à mão grava o tipo da série e muda os eventos futuros da série com tipo automático);
    `type_source` aceita `series`. **Mexe em dados da produção**:
    - os tipos ganham as regras de começo claras do histórico (Reunião, Reunião Mediadores, Reunião Técnica, MBA,
      Faculdade, Poli, Especialização, Minicurso, Curso, English, Webinar, Evento, Tratamento);
    - os eventos de agora em diante com tipo automático mudam para o tipo da regra (as vagas são refeitas onde
      ninguém foi escalado);
    - o histórico importado passa a ter o tipo da regra (49 reuniões estavam como AULA MBA).
    Antes de mudar, guarda o que era em `public._backup_0020`. Motivo: "Reunião Mediadores POLI USP PRO" virou
    AULA MBA pelo histórico (pedido do Raoni em 27/10/2026).
  - `supabase/migrations/0021_series_crew.sql`: vagas e porte aprendidos pela série. Colunas `crew`,
    `crew_type_id` e `size` em `series_rules`; `slot.add` e `slot.remove` gravam as vagas do evento como as da
    série, e a troca de porte grava o porte da série; `create_event_slots` cria as vagas aprendidas (mesmo tipo),
    senão a equipe do porte (o do evento, senão o da série, senão o padrão); `week.build` aceita `sizes` (o porte
    sugerido pelo app para os eventos sem porte). Não mexe em dados.
  - `supabase/migrations/0022_base_work_hours.sql`: sede e horário de trabalho. Colunas `people.base`
    (Piracicaba ou São Paulo) e `people.work_hours`, `service_types.external`; `check_eligibility` ganha os alertas
    "fora do horário de trabalho" e "outra sede" (pessoa de São Paulo em tipo externo); `op_person_upsert` e
    `op_service_type_upsert` viram `_base` e `_sectors`, e as novas gravam sede, horário e externo. **Mexe em
    dados da produção**: EVENTO, FOTOS e GRAVACAO EXTERNA ficam externos (cópia em `public._backup_0022`).
    Depois de aplicar, cadastre a sede e o horário de cada pessoa em Dados > Pessoas.
- **Dados iniciais da 0016** (fora do repositório, porque trata da equipe pelo e-mail):
  `..\dados-iniciais\aplicar-prioridades.mjs`. Ele grava a ordem das funções de cada pessoa a partir da
  planilha `..\Analise da escala.xlsx`, aba "Prioridade por pessoa": vale a coluna "Sua ordem" quando
  preenchida, senão a sugerida pelo histórico do último ano. Também acrescenta Cinegrafista e Operador Evento
  a Pedro, Fernanda, Tiphany e Juliana.
- **Desfazer**: `supabase/rollback/0022_down.sql`, `0021_down.sql`, `0020_down.sql`, `0019_down.sql`, `0018_down.sql`, `0017_down.sql`, `0016_down.sql`, `0015_down.sql`, `0014_down.sql`, `0013_down.sql` e
  `0012_down.sql` (fora da pasta de migrações, para o `db push` não rodá-los).
- **Serviço de fundo (NAS)**: **muda**. Ganhou o fornecedor de IA local (`apps/worker/src/ai/local.ts`), lotes
  de 25 vagas (eram 60), resposta da IA aproveitada item por item e o motivo exato da falha guardado no pedido. Depois
  do merge, o NAS precisa de `docker compose pull && docker compose up -d` na pasta
  `docker/cronograma-audiovisual`. O worker novo funciona com o banco antigo e o antigo com o banco novo; só a
  IA local precisa dos dois atualizados.
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
   Deve listar **só** `0012_request_classify.sql`, `0013_type_icon_and_highlight.sql`, `0014_local_ai.sql`,
   `0015_meetings_by_sector.sql`, `0016_role_priority_level.sql`, `0017_event_size.sql`,
   `0018_disponibilizador.sql`, `0019_meeting_sectors.sql`, `0020_type_rules.sql`, `0021_series_crew.sql` e `0022_base_work_hours.sql`.
   Se listar também as antigas (0001 a 0011), o histórico de migrações do banco não registrou que elas já
   foram aplicadas. **Não rode o push.** Confira com `npx supabase migration list`. Depois de confirmar que o
   esquema existe (as tabelas `people`, `events`, `weeks` estão lá), marque as antigas como aplicadas com
   `npx supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011`.
   Simule de novo.
2. **Aplicar**:
   ```
   npx supabase db push
   ```
   Depois, os dados iniciais de prioridade (pedem `..\login-admin.txt` com o e-mail e a senha de um
   administrador; apague o arquivo no fim). Primeiro veja o que vai mudar, depois grave:
   ```
   node ..\dados-iniciais\aplicar-prioridades.mjs
   node ..\dados-iniciais\aplicar-prioridades.mjs --gravar
   ```
3. **Conferir no banco** (SQL Editor do painel do Supabase, ou `npx supabase db query` se a versão do CLI
   tiver):
   ```sql
   select name, no_team, icon, keywords from public.service_types order by name;   -- FERIAS e FOLGA, sem equipe
   select kind, count(*) from public._backup_0013 group by kind;                  -- a cópia existe
   select column_name from information_schema.columns
    where table_name = 'events' and column_name = 'highlighted';                  -- 1 linha
   select ai_provider, ai_local_url, ai_local_model from public.settings;         -- minicpm5 de padrão
   select t.name, t.no_team, sum(c.quantity) as vagas from public.service_types t
     left join public.service_type_crew c on c.service_type_id = t.id and c.archived_at is null
    where t.name like 'REUNIAO%' group by t.name, t.no_team order by t.name;   -- interna sem equipe, setores com vagas
   select t.name, c.size, sum(c.quantity) as vagas from public.service_types t
     join public.service_type_crew c on c.service_type_id = t.id and c.archived_at is null
    where t.sized group by t.name, c.size order by t.name, c.size;            -- EVENTO 1/3/8, GRAVACAO 1/2/4, PODCAST 1/3/4
   select name, no_hours from public.job_roles where no_hours;                  -- Disponibilizador
   select t.name, t.no_team, r.name, c.quantity from public.service_types t
     join public.service_type_crew c on c.service_type_id = t.id and c.archived_at is null
     join public.job_roles r on r.id = c.job_role_id
    where t.name = 'DISPONIBILIZAR';                                            -- 1 Disponibilizador
   select t.name, t.no_team, array(select s.name from public.sectors s where s.id = any (t.sector_ids)) as setores
     from public.service_types t where t.name like 'REUNIAO%' order by t.name;  -- sem equipe, cada uma no seu setor
   select public.event_series('MBA em Gestão de Projetos - Aula 3');            -- mba em gestao de projetos
   select t.name from public.service_types t
    where t.id = public.prefix_type('Reunião Mediadores POLI USP PRO');         -- REUNIAO MEDIADORES
   select kind, count(*) from public._backup_0020 group by kind;                -- eventos e histórico que mudaram
   ```
4. **CI verde e merge**: `gh pr checks 2` tudo verde; depois `gh pr merge 2 --merge`. O merge publica o app
   no GitHub Pages sozinho. Em poucos minutos o rodapé do menu mostra `v1.1.0`.
5. **Serviço de fundo no NAS** (quem tem acesso ao NAS, como o Henrique): na pasta
   `docker/cronograma-audiovisual`, `docker compose pull && docker compose up -d`. Para usar o MiniCPM5, siga
   antes `docs/ia-local.md` (subir o Ollama e baixar o modelo).
6. **Testar no app publicado**, com a conta de administrador:
   - Painel: 3 cartões (semana atual em destaque), avisos com ícone e cor, pendências por último.
   - Semana: troca de semana com animação, "Semana atual" sob o título, a grade com uma coluna por dia, o
     placar no topo e "Fora: ..." nos dias com folga. Numa semana futura, as vagas abertas vêm tracejadas com a
     sugestão.
   - Semana com evento sem tipo: "Identificar os tipos" acha os tipos pelas palavras-chave e pede ao serviço de
     fundo os outros. Se aparecer "ainda não foi liberada no servidor", a 0012 não entrou.
   - Porte: clicar num EVENTO abre os detalhes com Simples, Médio e Grande; trocar para Grande muda as vagas.
   - Estrela: marcar um evento nos detalhes, recarregar a página, a estrela continua no cartão.
   - Tipos de serviço: abrir um tipo, escolher um ícone no banco de ícones, salvar, recarregar, o ícone fica.
   - Se for usar o MiniCPM5: Configurações > Geral, fornecedor "Modelo local", endereço e modelo, "Testar
     conexão" deve dizer "Conexão aceita". A IA só identifica tipos ("Identificar os tipos"): a sugestão de
     pessoas na grade é a do histórico, que acertou mais que a IA nos testes.
7. Depois de alguns dias sem problema: `drop table public._backup_0013; drop table public._backup_0015; drop table public._backup_0017; drop table public._backup_0018; drop table public._backup_0019;` e apague esta seção de pendência
   do `CLAUDE.md`.

## Desfazer

Use se a 1.1.0 der problema sério. O app antigo funciona com o banco novo e o app novo funciona com o banco
antigo (sem estrela, sem ícone escolhido, sem a identificação pelo servidor). Então dá para desfazer só a parte
que deu problema. Única ressalva: com a 0017 no ar, o app antigo soma as equipes dos três portes na "equipe
estimada" da prévia (as vagas, que o banco cria, saem certas).

1. **App** (volta para a 1.0.1):
   ```
   git checkout main
   git pull
   git revert -m 1 <commit do merge do PR #2>
   ```
   Isso vai num branch e num PR, como qualquer ajuste. O merge publica de novo.
2. **Serviço de fundo**: no NAS, volte a imagem anterior. Antes, troque o fornecedor para Gemini na tela, porque
   o worker antigo não conhece o local. Ou deixe como está: o worker novo funciona com o banco antigo.
3. **Banco**, nesta ordem. Rode cada arquivo inteiro no SQL Editor do painel; cada um roda numa transação só:
   0. `supabase/rollback/0022_down.sql`: tira sede, horário e "externo" e os alertas novos. Depois
      `supabase/rollback/0021_down.sql`: as vagas voltam a nascer só pela equipe do tipo (as já criadas ficam).
      Depois `supabase/rollback/0020_down.sql`: tira as regras de começo e o que as séries aprenderam, e volta os
      eventos e o histórico que mudaram de tipo ao que eram.
   1. `supabase/rollback/0019_down.sql`: as reuniões de setor voltam a pedir equipe e a equipe deixa de ler os
      tipos e as reuniões.
   2. `supabase/rollback/0018_down.sql`: tira o Disponibilizador e a "função que não ocupa horário", volta o
      DISPONIBILIZAR a não exigir equipe e os eventos que mudaram de tipo ao que eram.
   3. `supabase/rollback/0017_down.sql`: tira o porte, volta EVENTO, GRAVACAO, PODCAST e TRANSMISSAO à equipe
      de antes e refaz as vagas deles onde ninguém foi escalado. Depois, todos tocam em "Reler agora".
   4. `supabase/rollback/0016_down.sql`: tira a ordem e o nível das funções e a marca de trabalho complexo.
   5. `supabase/rollback/0015_down.sql`: volta as reuniões como eram (REUNIAO INTERNA com a equipe inteira) e
      refaz as vagas dos eventos de reunião sem ninguém escalado.
   6. `supabase/rollback/0014_down.sql`: volta o fornecedor para Gemini e tira as colunas da IA local.
   7. `supabase/rollback/0013_down.sql`: volta os eventos que mudaram de tipo, o NAO ESCALAR e o
      DISPONIBILIZAR (equipe típica e vagas), apaga FERIAS e FOLGA se ninguém os usou e tira as colunas
      novas. Estrelas e ícones escolhidos depois da 1.1.0 se perdem.
   8. `supabase/rollback/0012_down.sql`: volta `request_job` e `build_week_internal`.
   9. Registre no histórico de migrações:
      `npx supabase migration repair --status reverted 0019 0018 0017 0016 0015 0014 0013 0012`.
   10. Confira com `select name, no_team, keywords from public.service_types order by name;`. Depois de
      conferir, apague as cópias: `drop table public._backup_0013; drop table public._backup_0015; drop table public._backup_0017; drop table public._backup_0018; drop table public._backup_0019;`.
4. Os tipos que a identificação gravou nos eventos (por palavra-chave, histórico ou IA) **não** são desfeitos:
   são tipos certos, e o administrador pode trocar qualquer um na tela.
