# Ajustes de interface com o Claude

Como fazer ajustes de tela e de uso no Cronograma Audiovisual conversando com o Claude, vendo o resultado na hora
e publicando para a equipe. Não precisa saber programar: você pede em português, o Claude mexe no código, você
confere no navegador e, quando estiver bom, ele publica.

## Uma vez só: preparar o computador

1. Instale o [Git para Windows](https://git-scm.com/download/win) e o [Node.js 22](https://nodejs.org) (aceite as
   opções padrão dos dois instaladores).
2. Instale o [GitHub CLI](https://cli.github.com) e, num terminal (PowerShell), rode `gh auth login`: escolha
   **GitHub.com**, **HTTPS**, **Login with a web browser** e entre com a conta **audiovisualpecege**.
3. Baixe o projeto numa pasta sua, por exemplo `Documentos\cronograma-audiovisual`:

   ```powershell
   cd $HOME\Documents
   gh repo clone audiovisualpecege/cronograma-audiovisual
   cd cronograma-audiovisual
   npm ci
   ```

4. Crie o arquivo `apps\web\.env` copiando o `apps\web\.env.example` e preencha as três linhas com os valores de
   **GitHub > audiovisualpecege/cronograma-audiovisual > Settings > Secrets and variables > Actions > Variables**
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`). São valores públicos, mas o arquivo
   fica só no seu computador e nunca vai para o GitHub.
5. No **Claude** (app do computador, aba **Code**), abra a pasta `cronograma-audiovisual`. O Claude lê sozinho o
   `CLAUDE.md` do projeto, com as regras da Chiaro (design system, tema escuro, versão) e o jeito de trabalhar.

## Cada rodada de ajustes

1. **Comece pedindo:** "atualiza o projeto, cria um branch para os ajustes de hoje e roda o app". O Claude baixa o
   que mudou, abre o branch e sobe o app em `http://localhost:5173/`. Abra esse endereço no navegador e entre com
   o seu e-mail e senha da plataforma.
2. **Peça os ajustes como falaria com alguém:** "no Painel, as pendências estão pequenas demais no celular",
   "na Minha semana, quero o horário antes do título", "o botão Publicar está escondido". Mande print se ajudar.
   A tela no navegador se atualiza sozinha a cada mudança.
3. **Confira no celular também:** no navegador do PC, `F12` e o ícone de celular mostram a tela no tamanho de um
   aparelho.
4. **Quando estiver bom, peça:** "sobe a versão, atualiza o CHANGELOG e abre o pull request". O Claude roda os
   testes e abre o PR no GitHub.
5. **Publicar:** no PR, espere o **CI** ficar verde (uns 3 minutos) e clique em **Merge pull request**. Em mais uns
   2 minutos a versão nova está no ar. Confira o número no rodapé do menu. Na equipe, o app atualiza sozinho ao
   reabrir ("Atualizado para vX.Y.Z").

## Cuidados

- **O app no seu computador usa os dados de verdade.** Olhar, abrir telas, filtrar e redimensionar é seguro.
  **Publicar**, **Escalar**, **Montar semana**, **Aceitar** propostas, cadastros e **Importar** gravam de verdade e a
  equipe vê. Para testar esses botões, use uma semana futura sem uso e desfaça depois, ou combine antes com o
  Planejamento.
- Ajuste que mexe no banco de dados (o Claude avisa: "precisa de migração") não se publica só com o merge: chame o
  Henrique, que aplica a migração antes.
- O CI ficou vermelho? Peça ao Claude: "o CI do PR falhou, vê o que é e corrige". Não faça o merge com ele
  vermelho: a `main` nem deixa.
- Sugestões da equipe continuam chegando pelo Task Forge, na ideia #26. Dá para pedir ao Claude: "pega a correção
  aprovada da #26 e faz" e seguir a mesma rodada.

## Quando algo dá errado

| O que acontece | O que fazer |
|----------------|-------------|
| `npm ci` ou `npm run dev` dá erro | Peça ao Claude: "o comando deu este erro" e cole a mensagem. |
| O app local abre sem dados ou não entra | Confira o `apps\web\.env` (passo 4). |
| O PR não deixa fazer merge | O CI ainda está rodando ou falhou: veja o passo de CI acima. |
| A versão nova não aparece no ar | Em **Actions > GitHub Pages**, veja se a última execução terminou verde. |
