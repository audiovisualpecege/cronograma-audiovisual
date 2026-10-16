# Layouts das planilhas de cronograma

Levantamento feito na tarefa 2 abrindo os dois anexos da ideia #26 com o SheetJS:

- `1-Cronograma Semanal OFICIAL 2026.xlsx`: 220 abas, uma por semana, de agosto de 2022 a outubro de 2026.
- `2-Cronograma Claude.xlsx`: 6 abas, a semana de 10/08/2026 montada numa planilha feita com o Claude.

Cada layout tem um `LayoutParser` em `layouts/` (`detect(sheet)` e `parse(sheet, ctx)`). A leitura passa
cada aba ao primeiro parser que a reconhece (`LAYOUT_PARSERS` em `read.ts`); aba que nenhum reconhece vai
para "não importados" com `layout_desconhecido` e as outras seguem. Resultado da leitura dos anexos em
16/10/2026: 211 semanas, 17.511 eventos e 42.650 alocações no oficial, com 2.368 linhas em "não importados"
(1.958 delas observações do dia); 2 semanas, 137 eventos e 157 alocações no do Claude.

## Regras comuns

- **Semana**: segunda a domingo, em America/Sao_Paulo. Os eventos de uma aba são agrupados pela segunda-feira
  da data deles, então o domingo de uma aba que começa na segunda seguinte cai na semana certa. Abas que trazem
  a mesma semana (cópias como `06 a 11 de janeiro (2)`, ou o domingo da aba seguinte) são juntadas numa semana
  só; o mesmo evento repetido noutra aba entra uma vez.
- **Ano**: as abas do oficial só têm dia e mês. O ano é o que faz mais dias da semana escritos baterem com as
  datas ("05/10 SEGUNDA" só é segunda em 2015, 2020 e 2026), preferindo um ano a até 400 dias da maior data já
  lida no arquivo e, na primeira aba, o mais recente que não passa de hoje. O sufixo do nome da aba (`-26`)
  desempata. Datas de janeiro numa aba que começa em dezembro caem no ano seguinte.
- **Dia da semana que não bate**: a data fica fora com `data_invalida` ("05/08 TERÇA" numa aba de setembro de
  2023 é erro de digitação). Nos anexos, 40 linhas saem com `data_invalida`, 32 delas numa única aba.
- **Horário**: `HH:MM - HH:MM` com as variações encontradas (`19:00 -23:00`, `14:00  18:00`, `8:30 - 12:00`,
  `14h às 15h`, `17h:30`). Número de série do Excel (`0,5833` = 14:00) é só o início. Fim antes do início é
  evento que atravessa a meia-noite. Minuto ou hora impossível (`19:300`) vai com `horario_invalido`.
- **Nomes**: separados por `+`, `,`, `/`, `;`, `&` ou ` e `; o que está entre parênteses sai
  (`Bruno (presencial)`). Grupos que não são pessoas ficam de fora (`Todos`, `Todos os funcionários`,
  `Equipe Marketing`, `Monitor`, `TI`, `A definir`). Frase com mais de 4 palavras ou com número volta como
  `nome_nao_reconhecido`. A ligação com o cadastro é feita na revisão (`matchName`).
- **Cancelado**: `CANCELADA`, `CANCELADO`, `ADIADA` ou `DESMARCADO` no título ou nas observações marca
  `cancelled: true`; o evento continua na leitura para a revisão decidir.
- **Mesclagens**: a do padrão ocupa a linha inteira (da coluna A ou B até a última, ou até a penúltima) e é
  separador de dia ou observação do dia. Qualquer outra (só algumas colunas, ou duas linhas de um evento) tira
  a linha com `celula_mesclada`.

## Motivos de "não importado"

| Motivo | Quando |
| --- | --- |
| `celula_mesclada` | Linha tocada por mesclagem fora do padrão |
| `data_invalida` | Data impossível (`31/02`), dia da semana que não bate, ou linha da aba Escala sem data |
| `horario_invalido` | Horário que não se lê |
| `sem_data` | Linha de evento sem data (seções "ATIVIDADES", "NOVAS DEMANDAS", "ESPERANDO FEEDBACK") |
| `observacao` | Observação do dia ("Folga ...", "Férias ...", "Recesso ..."), mostrada para o administrador |
| `nome_nao_reconhecido` | Texto na coluna de equipe que não parece nome |
| `layout_desconhecido` | Aba que nenhum parser reconhece (`Legenda`, `Edição.`) |
| `aba_vazia` | Aba sem nada (`Planilha1` a `Planilha4`) |
| `aba_resumo` | Abas de resumo da planilha do Claude (`Revisar`, `Painel`, `Grade Semanal`), que repetem a `Escala` |
| `aba_cadastro` | Abas de cadastro da planilha do Claude (`TiposDemanda`, `Profissionais`) |

## `oficial-2026`: tabela com a coluna DIA (205 abas, de outubro de 2022 a outubro de 2026)

Parser: `layouts/oficial2026.ts`. Fixture: `fixtures/oficial-2026.xlsx`.

- Cabeçalho na linha 1 (aceita até a 3). Colunas, nesta ordem, com variações ao longo dos anos:
  `DIA`, `HORÁRIO`, `LOCAL`, `DEMANDA`, `OBSERVAÇÕES`, `LINKS` (desde novembro de 2022),
  `EQUIPE/OPERADOR`, `MEDIADOR` (`MEDIADOR/RELATÓRIO` até 2023), `ASSISTENTE`, `SUPORTE`, e em outubro de 2022
  também `SETOR` (Audiovisual ou Estúdios, ignorada) e `PLANEJAMENTO`. Numa aba a célula A1 é `,` no lugar de
  `DIA`; a coluna continua sendo a do dia.
- Cada evento é uma linha. `DIA` traz `dd/mm` e o dia da semana numa segunda linha (`05/10\nSEGUNDA`), às vezes
  com enfeites (`✨25/03✨\nTERÇA`, `🎬 01/04✨\nQUARTA`).
- Entre os dias há linhas vazias mescladas na largura toda; observações do dia ficam numa linha mesclada com o
  texto na coluna A ou B.
- Funções: cada coluna depois de `LINKS` (ou de `OBSERVAÇÕES`) é uma função: `Operador`, `Mediador`,
  `Assistente`, `Suporte`, `Planejamento`. Texto longo solto na linha do cabeçalho não vira função.
- Detecção: cabeçalho com `HORÁRIO` e `DEMANDA` nas 3 primeiras linhas, `HORÁRIO` depois da primeira coluna e
  nenhum título de dia ("SEGUNDA 22/08") nas 6 primeiras linhas.
- Algumas abas têm, no fim, uma seção "ATIVIDADES" com `DEMANDA`, `OBSERVAÇÕES` e `RESPONSÁVEL(IS)` mesclados
  em pares de colunas: sai com `celula_mesclada` ou `sem_data`.

## `oficial-2022-blocos`: um bloco por dia (9 abas, agosto e setembro de 2022, e as abas `Edição`)

Parser: `layouts/oficial2022Blocos.ts`. Fixture: `fixtures/blocos-2022.xlsx`.

- Cada dia começa com um título mesclado na largura toda: `SEGUNDA 22/08` (às vezes
  `SEGUNDA 20/02 - FERIADO`). Seguem observações do dia (linhas mescladas) e um cabeçalho próprio do dia.
- Cabeçalho: `DATA`, `HORÁRIO`, `LOCAL`, `DEMANDA`, `OBSERVAÇÕES`, `RESPONSÁVEL(IS)` em agosto de 2022; sem
  `DATA` a partir de setembro de 2022; nas abas `Edição` (janeiro de 2024) só `HORÁRIO`, `LOCAL`, `DEMANDA`,
  `RESPONSÁVEL (IS)`. A coluna `DATA`, quando existe, tem um número de série solto numa linha e é ignorada:
  vale o título do dia.
- Função única: `Responsável`.
- Uma seção sem horário ("NOVAS DEMANDAS", "ATIVIDADES", com cabeçalho `DEMANDA`, `OBSERVAÇÕES`,
  `RESPONSÁVEL(IS)`) encerra o dia; as linhas dela saem com `sem_data` ou `celula_mesclada`.
- Detecção: um título de dia na coluna A nas 6 primeiras linhas e ao menos um cabeçalho com `HORÁRIO` e
  `DEMANDA`.

## `claude-escala`: aba técnica da planilha do Claude

Parser: `layouts/claudeEscala.ts`. Fixture: `fixtures/claude-escala.xlsx`.

- Aba `Escala`: linha 1 com "Data início" e a data da semana; cabeçalho na linha 3: `ID Evento`, `Data`,
  `Início`, `Fim`, `Local`, `Nome da Demanda`, `Observação`, `Link`, `Tipo`, `Status`, `Equipe Alocada`,
  `Status Escala`, `Travado`, `Tipo Manual`.
- `Início` e `Fim` são números de série com data e hora. Início e fim à meia-noite em dias diferentes é evento
  de dia inteiro (férias), com o último dia em `endDate`.
- `ID Evento` é o id do evento na Google Agenda (`...@google.com|<instante>`) e vai em `externalId`.
- `Tipo` vira `typeLabel` (`AULA MBA`, `WEBINAR`, `EVENTO`, `FOTOS`...); `NAO IDENTIFICADO` fica nulo.
- `Equipe Alocada` é uma lista separada por vírgula, sem a função de cada pessoa: `role` sai nulo e a revisão
  liga a função.
- Abas de resumo (`Revisar`, `Painel`, `Grade Semanal`) repetem a `Escala` e não são lidas; `TiposDemanda`
  (tipo e equipe típica) e `Profissionais` (pessoas e funções habilitadas) são cadastros. Ficam como
  `aba_resumo` e `aba_cadastro`.

## Pendências

- `TiposDemanda` e `Profissionais` poderiam alimentar a sugestão de cadastro (`suggestCatalogFromHistory`); hoje
  só os rótulos das semanas lidas entram nela.
- A aba `Edição.` é um controle de demandas de edição (código, gravação, entrega, status, editor), não uma
  semana; fica como `layout_desconhecido`.
