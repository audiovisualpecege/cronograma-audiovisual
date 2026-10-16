# Origem: Task Forge, ideia #26 (026-plataforma-cronograma-audiovisual)

Os arquivos da ideia estão em `.compozy/tasks/026-plataforma-cronograma-audiovisual/` (comece por `_ideia.md`).

## Protocolo da forja
- Toda pergunta de decisão das skills /grill-me, /cy-create-prd, /cy-create-techspec e /cy-create-tasks
  vai pelo MCP `taskforge`, ferramenta `perguntar` (ideia 26, destinatário padrão: o autor).
  Nunca pergunte no chat nem com AskUserQuestion: ninguém está olhando o terminal.
- Uma pergunta por vez: 2 a 4 opções com descrição e a sua recomendação com `recomendado: true`.
- Depois de perguntar, encerre a sessão. O vigia retoma quando a resposta chegar; leia com `ver_respostas`.
- Fatos que dá para descobrir sozinho você pesquisa; decisões são do autor.
- Ao fechar cada etapa, publique com `publicar_documento` (briefing, prd, techspec, como_usar).
- Grave tudo dentro desta pasta, nunca numa pasta temporária. Se uma gravação for negada, não contorne:
  encerre dizendo o que foi negado.
- Não use `registrar_progresso`: quem registra o andamento da forja é o vigia.
- Nunca use travessão nos textos.

## Preferências da equipe
A base do que a equipe já decidiu nas ideias anteriores está em `.compozy/PREFERENCIAS.md` (o vigia a atualiza
antes de cada etapa; não a edite). Antes de fazer qualquer pergunta, leia o arquivo inteiro.
- O que está lá já está decidido: aplique sem perguntar e cite, no documento da etapa, numa seção
  "Preferências aplicadas", quais entradas você seguiu.
- Pergunte só o que esta ideia decide de novo e que muda a solução. Quando a base e a ideia já bastam,
  siga sem perguntar; quando falta algo decisivo, pergunte. Não há número certo de perguntas.
- Quando uma pergunta ainda é necessária e a base tem algo parecido, essa é a primeira opção, com a
  descrição dizendo que é o costume da equipe.
- Uma entrada mais recente vale sobre uma mais antiga que a contradiga.

## Design system da Chiaro Filmes
Toda interface deste projeto (app, extensão, painel web, tela de desktop, página, e-mail em HTML) segue o
design system da Chiaro Filmes. Isso é regra da empresa, não uma decisão a perguntar.
- Ele está em `design-system/chiaro/`. Antes de desenhar ou codificar qualquer tela, leia `design-system/chiaro/DESIGN.md`
  e os arquivos que ele indicar.
- Use o que está lá (cores, tipografia, espaçamentos, componentes, ícones, logos, tom dos textos) em vez de
  inventar; importe os tokens e as fontes de lá em vez de copiar valores soltos no código.
- Tema escuro, sempre: toda tela sai no tema Noite do design system, nunca no tema claro, e não há
  alternância de tema nem se segue a preferência do sistema. Na web, `<html data-theme="noite">` desde o
  primeiro HTML (sem piscar claro ao carregar), `color-scheme: dark` e o fundo `--surface-page` (Noite) no
  `body`; os tokens de `:root` do export são o tema claro e não valem sozinhos. Fora da web (Android, TV,
  desktop nativo), use os valores do bloco `[data-theme="noite"]` de `tokens/colors.css` no tema do app.
  Diálogos, menus, campos, dicas, e-mails em HTML e barras de rolagem também ficam escuros.
- Ícone do produto: todo produto com interface tem um ícone próprio, desenhado para ele, que mostre o que o
  produto faz. O ícone da Chiaro (`icone-chiaro`) e os logos da Chiaro nunca são o ícone do produto; o logo
  da Chiaro só aparece como assinatura, onde fizer sentido ("um produto Chiaro Filmes").
  Desenhe o símbolo em SVG na linguagem da marca (paleta e gradiente da Chiaro, cantos arredondados, traço
  limpo, legível em 16 px), guarde o SVG no código e gere dele todos os tamanhos que a plataforma pede:
  favicon e ícones do app web (16, 32, 180, 192, 512), os 16, 32, 48 e 128 de uma extensão, o .ico de um
  programa de desktop.
- Quando o design system não cobrir um caso, siga o espírito dele e diga na TechSpec ou na nota o que foi decidido.
- Não edite `design-system/chiaro/`: o vigia a sobrescreve com a versão do NAS.
- Sem interface (um script, um serviço), ignore esta seção.

## Versão do produto
Todo app, extensão ou programa com interface tem versão, e ela aparece na interface. É regra, não se pergunta.
- Use versão semântica (MAJOR.MINOR.PATCH) num lugar só, que o resto lê: o `version` do `package.json`
  (numa extensão, o `manifest.json` traz o mesmo número; noutra linguagem, o arquivo de projeto dela).
- A primeira entrega sai como 1.0.0. Cada correção sobe a versão: PATCH para um conserto, MINOR para algo
  novo, MAJOR só quando quem usa precisa mudar o jeito de usar.
- Mostre a versão como `v1.2.3` num canto discreto e fixo (rodapé, tela Sobre, popup da extensão), lida do
  arquivo de versão no build, nunca digitada à mão numa tela.
- Registre cada versão em `CHANGELOG.md`, com a data e o que mudou, nas palavras de quem usa.
- Sem interface (um script, um serviço), basta o número no arquivo de projeto e o `CHANGELOG.md`.
