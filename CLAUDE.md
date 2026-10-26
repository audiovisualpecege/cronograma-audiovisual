# Cronograma Audiovisual

Escala semanal da equipe de audiovisual (Task Forge, ideia #26). Um produto Chiaro Filmes.
Desde a 1.0.1 (19/10/2026) o código mora aqui no GitHub e os ajustes são feitos por conversa, direto neste
repositório; a forja do Task Forge não mexe mais nele. O guia de como trabalhar está em `docs/ajustes-de-interface.md`
e o guia técnico (configuração, publicação, problemas) em `docs/como-usar.md`.

## Publicação pendente
A 1.1.0 (PR #2, branch `ajuste/painel-e-semana`) tem migrações ainda não aplicadas (0012 a 0019), mais os dados iniciais de prioridade
(`..\dados-iniciais\aplicar-prioridades.mjs`, fora do repositório), muda o
serviço de fundo (IA local) e ainda não teve merge.
Antes de publicar, ou se for preciso desfazer, siga `docs/publicar-1.1.0.md`. Apague esta seção quando a 1.1.0
estiver no ar e firme.

## Como trabalhar
- Quem pede os ajustes conversa com você: pergunte no chat quando faltar uma decisão, mostre o resultado e itere.
- Cada rodada de ajustes vai num branch próprio (`ajuste/<assunto-curto>`) e entra na `main` por pull request.
  A `main` só aceita PR com o CI verde, e o merge publica o app no GitHub Pages sozinho.
- Antes de abrir o PR: `npm test` (unidade), `npx tsc -p apps/web --noEmit` e `npx eslint` nos arquivos mudados.
  Teste novo para o que mudou de comportamento; ajuste de visual não precisa de teste novo, mas não pode quebrar
  os que existem.
- A visualização local (`npm run dev`) usa o banco de verdade, com o login de administrador de quem está testando.
  Mexer na tela é seguro; **Publicar**, **Confirmar** (fichas e "Confirmar sugestões", que montam a semana),
  escolher pessoa, cadastros e importação gravam de verdade e a
  equipe vê. Avise antes de clicar em qualquer um deles e prefira uma semana futura sem uso.
- Migração nova em `supabase/migrations/` não se aplica sozinha: ela precisa de `npx supabase db push`, feito pelo
  responsável depois de revisar, antes do merge do código que depende dela. Diga isso no PR.
- Nunca grave segredos no repositório (`.env`, chaves, senhas): ele é público. `apps/web/.env` fica só na máquina.
- Mudou o serviço de fundo (`apps/worker`)? Depois do merge, o NAS precisa de `docker compose pull && docker
  compose up -d` na pasta `docker/cronograma-audiovisual`. Diga isso no PR.
- Nunca use travessão nos textos (interface, mensagens, documentos).

## Design system da Chiaro Filmes
Toda interface deste projeto segue o design system da Chiaro Filmes. Isso é regra da empresa, não uma decisão a
perguntar.
- Ele está em `design-system/chiaro/`. Antes de desenhar ou codificar qualquer tela, leia `design-system/chiaro/DESIGN.md`
  e os arquivos que ele indicar.
- Use o que está lá (cores, tipografia, espaçamentos, componentes, ícones, logos, tom dos textos) em vez de
  inventar; importe os tokens e as fontes de lá em vez de copiar valores soltos no código.
- Tema escuro, sempre: toda tela sai no tema Noite, nunca no tema claro, sem alternância de tema e sem seguir a
  preferência do sistema. `<html data-theme="noite">` desde o primeiro HTML, `color-scheme: dark` e o fundo
  `--surface-page` no `body`. Diálogos, menus, campos, dicas e barras de rolagem também ficam escuros.
- O ícone do produto é o do Cronograma Audiovisual; o logo da Chiaro só aparece como assinatura.
- Quando o design system não cobrir um caso, siga o espírito dele e diga no PR o que foi decidido.
- Não edite `design-system/chiaro/`: ele é a cópia do design system publicado da empresa.

## Versão do produto
- Versão semântica num lugar só: o `version` do `package.json` da raiz. O app, o programa de desktop e o serviço
  de fundo leem dali, e os testes também (nunca escreva o número à mão num teste ou numa tela).
- Cada PR que muda o que a equipe vê sobe a versão: PATCH (`1.0.2`) para um conserto ou ajuste de tela, MINOR
  (`1.1.0`) para algo novo, MAJOR só quando o jeito de usar muda.
- Registre a versão no topo do `CHANGELOG.md`, com a data e o que mudou, nas palavras de quem usa.
- A versão aparece como `v1.2.3` no rodapé do menu e na tela Sobre.

## GitHub
Tudo no GitHub fica na conta `audiovisualpecege`, neste repositório (`audiovisualpecege/cronograma-audiovisual`).
Não crie outros repositórios nem publique noutra conta.
