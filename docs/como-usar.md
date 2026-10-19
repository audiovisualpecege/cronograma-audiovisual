# Cronograma Audiovisual: como usar

Plataforma de cronograma e escala da equipe de audiovisual. Um produto Chiaro Filmes.

O Cronograma Audiovisual tem quatro partes:

- **App web**, publicado em <https://audiovisualpecege.github.io/cronograma-audiovisual/>. No celular, ele é
  instalado como app (Android e iPhone).
- **Programa de Windows e Mac**: a mesma interface, instalada pela pasta central da rede.
- **Banco de dados e login** num projeto Supabase gratuito.
- **Serviço de fundo** no Docker do NAS. Ele relê as Google Agendas, chama a IA, envia as notificações, gera a
  agenda pessoal e manda os convites.

A configuração inicial é feita uma vez só, por quem cuida da TI da equipe. Siga as etapas na ordem. No fim, há
a instalação para cada pessoa e a publicação de versões novas.

## Sumário

1. [O que você precisa](#1-o-que-você-precisa)
2. [Google Cloud: conta de serviço e as duas agendas](#2-google-cloud-conta-de-serviço-e-as-duas-agendas)
3. [Supabase: projeto, migrações e e-mail](#3-supabase-projeto-migrações-e-e-mail)
4. [Chaves das notificações no celular](#4-chaves-das-notificações-no-celular)
5. [GitHub: publicação do app web](#5-github-publicação-do-app-web)
6. [Serviço de fundo no Docker do NAS](#6-serviço-de-fundo-no-docker-do-nas)
7. [Primeiro acesso do administrador](#7-primeiro-acesso-do-administrador)
8. [Instalar no celular](#8-instalar-no-celular)
9. [Instalar no PC e no Mac](#9-instalar-no-pc-e-no-mac)
10. [Liberar o programa sem assinatura na primeira abertura](#10-liberar-o-programa-sem-assinatura-na-primeira-abertura)
11. [Publicar uma versão nova](#11-publicar-uma-versão-nova)
12. [Quando algo não funciona](#12-quando-algo-não-funciona)

## 1. O que você precisa

- Acesso às contas Google **pecegeworks@gmail.com** e **audiovisualpecege@gmail.com**. Elas são as donas das duas
  agendas e da conta que envia os e-mails.
- Acesso ao GitHub como **audiovisualpecege**, dono do repositório `audiovisualpecege/cronograma-audiovisual`.
- Acesso de administrador ao NAS (`\\172.16.52.30`), com o Docker (Container Manager) instalado.
- Um computador com [Node.js 22](https://nodejs.org) ou mais novo e o código do repositório baixado. Ele serve
  para aplicar as migrações e gerar as chaves.

## 2. Google Cloud: conta de serviço e as duas agendas

A plataforma só **lê** as agendas e nunca altera nada nelas. A leitura é feita por uma conta de serviço do Google
Cloud.

1. Entre em <https://console.cloud.google.com> com a conta **audiovisualpecege@gmail.com**.
2. Crie um projeto: no seletor de projetos no topo, clique em **Novo projeto**, dê o nome `cronograma-audiovisual`
   e clique em **Criar**.
3. Com o projeto selecionado, abra **APIs e serviços > Biblioteca**, procure **Google Calendar API** e clique em
   **Ativar**.
4. Abra **IAM e administrador > Contas de serviço** e clique em **Criar conta de serviço**. Use o nome
   `cronograma-leitura`. Não precisa dar nenhum papel: clique em **Concluir**.
5. Clique na conta criada e anote o e-mail dela, algo como
   `cronograma-leitura@cronograma-audiovisual.iam.gserviceaccount.com`.
6. Na aba **Chaves**, clique em **Adicionar chave > Criar nova chave**, escolha **JSON** e clique em **Criar**. O
   navegador baixa um arquivo `.json`. Guarde-o: ele vai para o NAS na etapa 6 e não deve ser enviado por e-mail
   nem ir para o Git.
7. Compartilhe as **duas agendas** com a conta de serviço:
   1. Entre em <https://calendar.google.com> com **pecegeworks@gmail.com**.
   2. Na lista da esquerda, passe o mouse sobre a agenda, clique nos três pontos e em **Configurações e
      compartilhamento**.
   3. Em **Compartilhar com pessoas e grupos específicos**, clique em **Adicionar pessoas e grupos**, cole o e-mail
      da conta de serviço e escolha **Ver todos os detalhes do evento**. Clique em **Enviar**.
   4. Na mesma página, em **Integrar agenda**, anote o **ID da agenda**. Ele vai na tela Configuração da
      plataforma (etapa 7).
   5. Repita os passos com **audiovisualpecege@gmail.com** e a agenda dela.

## 3. Supabase: projeto, migrações e e-mail

### 3.1 Criar o projeto

1. Entre em <https://supabase.com/dashboard> (pode ser com a conta GitHub **audiovisualpecege**) e clique em
   **New project**.
2. Nome: `cronograma-audiovisual`. Região: **South America (São Paulo)**. Plano: **Free**. Crie uma senha forte
   para o banco e guarde-a.
3. Quando o projeto estiver pronto, abra **Project Settings > API** e anote:
   - **Project URL** (`https://xxxx.supabase.co`): vai para o app web e para o NAS.
   - **Publishable key** (ou **anon key**): vai para o app web. Ela é pública; quem protege os dados são as regras
     de acesso do banco.
   - **Secret key** (ou **service_role key**): vai **só** para o `.env` do NAS. Nunca coloque esta chave no app,
     no GitHub nem numa mensagem.
   - O **Project ref**, que é o `xxxx` do endereço.

O plano gratuito pausa o projeto depois de 7 dias sem uso. O serviço de fundo do NAS mantém o projeto ativo; se
ele ficar parado por muito tempo, entre no painel do Supabase e clique em **Restore project**.

### 3.2 Aplicar as migrações

No computador com o código do repositório, na pasta dele:

```bash
npm ci
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

O `db push` cria as tabelas, as regras de acesso, as funções e o espaço da agenda pessoal (pasta
`supabase/migrations/`). Rode o mesmo comando quando uma versão nova trouxer migrações novas.

### 3.3 Endereços do login

Em **Authentication > URL Configuration**:

- **Site URL**: `https://audiovisualpecege.github.io/cronograma-audiovisual/`
- **Redirect URLs**: adicione `https://audiovisualpecege.github.io/cronograma-audiovisual/**`

É para esse endereço que os links de convite e de "Esqueci a senha" levam.

### 3.4 E-mail pelo Brevo

O e-mail embutido do Supabase só envia para membros do projeto. Os convites e as senhas novas saem pelo
[Brevo](https://www.brevo.com), um serviço de envio gratuito (300 e-mails por dia), com o remetente
**pecegeworks@gmail.com**. Não precisa de domínio próprio nem de mexer em DNS.

1. Crie a conta no Brevo com **pecegeworks@gmail.com** (o remetente da conta já fica verificado). Para usar outro
   remetente, adicione em **Remetentes, Domínios e IPs > Remetentes** e confirme pelo código que chega nele.
2. Em **SMTP & API**, aba **SMTP**, anote o **Fazer login** (algo como `xxxx@smtp-brevo.com`) e clique em
   **Gerar chave SMTP**. Copie a chave na hora: ela só é mostrada uma vez.
3. No Supabase, abra **Authentication > Emails > SMTP Settings**, ative **Enable custom SMTP** e preencha:
   - **Sender email**: `pecegeworks@gmail.com`
   - **Sender name**: `Cronograma Audiovisual`
   - **Host**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Username**: o login do passo 2
   - **Password**: a chave SMTP do passo 2
4. Salve. Em **Authentication > Rate Limits**, confira **emails sent per hour** em pelo menos `30`, para mandar os
   convites da equipe de uma vez.

O Brevo avisa que remetente @gmail.com não é o ideal para entrega: no primeiro convite, peça para a pessoa olhar
o spam. Se a chave vazar ou parar de valer, gere outra no Brevo e troque no Supabase.

O Gmail com senha de app também serve (Host `smtp.gmail.com`, porta `465`), mas exige a verificação em duas
etapas na conta, e o Google costuma barrar a página de senhas de app logo depois de ela ser ligada ("Não foi
possível confirmar sua identidade"). Foi por isso que a instalação de 19/10/2026 ficou no Brevo.

## 4. Chaves das notificações no celular

As notificações no celular usam um par de chaves (VAPID). Gere uma vez só, no computador com o código:

```bash
npx web-push generate-vapid-keys
```

Anote a **Public Key** e a **Private Key**. A pública vai para o app web (etapa 5) e para o NAS (etapa 6); a
privada vai só para o NAS. Se trocar as chaves depois, todos precisam ativar as notificações de novo.

## 5. GitHub: publicação do app web

1. No repositório <https://github.com/audiovisualpecege/cronograma-audiovisual>, abra **Settings > Pages** e, em
   **Source**, escolha **GitHub Actions**.
2. Abra **Settings > Secrets and variables > Actions**, aba **Variables**, e crie três variáveis:
   - `VITE_SUPABASE_URL`: o Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY`: a Publishable key do Supabase
   - `VITE_VAPID_PUBLIC_KEY`: a Public Key da etapa 4
3. Abra **Actions > GitHub Pages > Run workflow**. Em alguns minutos o app abre em
   <https://audiovisualpecege.github.io/cronograma-audiovisual/>. Depois disso, cada mudança na `main` publica
   sozinha.

## 6. Serviço de fundo no Docker do NAS

O serviço de fundo só faz conexões de saída: não é preciso abrir porta nenhuma no NAS nem no roteador.

1. No NAS, crie a pasta `docker/cronograma-audiovisual` e, dentro dela, a pasta `segredos`.
2. Copie para `docker/cronograma-audiovisual` o arquivo `apps/worker/docker-compose.yml` do repositório.
3. Copie o JSON da conta de serviço (etapa 2) para `segredos/google-service-account.json`.
4. Copie `apps/worker/.env.example` para `docker/cronograma-audiovisual/.env` e preencha:

   | Variável | Valor |
   |----------|-------|
   | `SUPABASE_URL` | Project URL do Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secret key (service_role) do Supabase |
   | `APP_URL` | `https://audiovisualpecege.github.io/cronograma-audiovisual/` |
   | `VAPID_PUBLIC_KEY` | Public Key da etapa 4 |
   | `VAPID_PRIVATE_KEY` | Private Key da etapa 4 |
   | `VAPID_SUBJECT` | `mailto:audiovisualpecege@gmail.com` |

   As linhas `GOOGLE_SERVICE_ACCOUNT_FILE` e `GOOGLE_SERVICE_ACCOUNT_JSON` ficam comentadas: o `docker-compose.yml`
   já aponta para o arquivo da pasta `segredos`. A chave do Gemini não vai aqui: ela é informada na plataforma.
5. Num terminal do NAS (SSH), na pasta `docker/cronograma-audiovisual`:

   ```bash
   docker compose pull
   docker compose up -d
   docker compose logs -f
   ```

   O log mostra a versão em uso e as leituras das agendas. Saia do log com `Ctrl+C`; o serviço continua rodando e
   volta sozinho quando o NAS reinicia.
6. Para atualizar o serviço numa versão nova: `docker compose pull && docker compose up -d` na mesma pasta.

Se o painel do administrador mostrar "Serviço de fundo parado desde ...", confira se o contêiner
`cronograma-audiovisual-worker` está rodando (`docker ps`) e veja o log.

## 7. Primeiro acesso do administrador

O primeiro administrador é criado à mão, uma vez só. Os demais são convidados pela própria plataforma.

1. No Supabase, abra **Authentication > Users > Add user > Create new user**. Informe o e-mail e uma senha, marque
   **Auto Confirm User** e clique em **Create user**.
2. Abra **SQL Editor**, cole o comando abaixo trocando o nome e o e-mail, e clique em **Run**:

   ```sql
   insert into public.people (auth_user_id, name, email, profile, invite_status)
   select id, 'Nome do administrador', email, 'admin', 'accepted'
   from auth.users
   where email = 'email.do.administrador@exemplo.com';
   ```

3. Entre em <https://audiovisualpecege.github.io/cronograma-audiovisual/> com esse e-mail e senha. Você cai no
   **Painel**.
4. Em **Configuração**:
   - **Google Agendas**: adicione as duas agendas pelo ID anotado na etapa 2 e clique em **Reler agora**. O
     estado de cada uma deve ficar em dia em alguns minutos. Errou o ID? **Editar** corrige enquanto a agenda
     não tem eventos lidos, e **Remover** tira da lista uma agenda sem eventos.
   - **IA**: cole a chave do Gemini (crie em <https://aistudio.google.com/apikey> com a conta da equipe) e clique
     em **Testar chave**.
   - **Automações**: confira o liga e desliga de cada uma.
5. Cadastre setores, funções e tipos de serviço, importe as planilhas do cronograma em **Importar** e convide a
   equipe em **Pessoas**. Cada pessoa recebe um e-mail para criar a senha.

## 8. Instalar no celular

Cada pessoa abre <https://audiovisualpecege.github.io/cronograma-audiovisual/> no celular e entra com o e-mail e a
senha. Em **Preferências**, a plataforma mostra a instrução do navegador em uso.

**Android (Chrome)**

1. Toque no menu de três pontos ao lado do endereço.
2. Toque em **Instalar app** ou em **Adicionar à tela inicial** e confirme em **Instalar**.
3. Abra o Cronograma Audiovisual pelo ícone novo. Em **Preferências**, ative as notificações e toque em
   **Permitir**.

**iPhone (Safari)**

1. Abra o endereço no **Safari** (no iPhone, outros navegadores não instalam o app).
2. Toque em **Compartilhar** (o quadrado com a seta para cima), role a lista e toque em
   **Adicionar à Tela de Início**. Toque em **Adicionar**.
3. Abra o app **pelo ícone da tela inicial** e entre de novo. As notificações só funcionam assim, no iOS 16.4 ou
   mais novo: em **Preferências**, ative as notificações e toque em **Permitir**.

Se as notificações foram bloqueadas sem querer, a plataforma explica em **Preferências** como liberar nos ajustes
do aparelho.

## 9. Instalar no PC e no Mac

Os instaladores ficam na pasta central da rede:

- No Windows: `\\172.16.52.30\instaladores\cronograma-audiovisual`
- No Mac: a mesma pasta, conectada pelo Finder (ela aparece como `/Volumes/instaladores/cronograma-audiovisual`)

**Windows**

1. Abra a pasta no Explorador de Arquivos e dê dois cliques em `cronograma-audiovisual-X.Y.Z-windows.exe`.
2. Na primeira vez, o Windows pede uma liberação: veja a etapa 10.
3. A instalação é feita sozinha, só para o seu usuário, sem pedir senha de administrador. O programa abre no fim e
   ganha atalhos na área de trabalho e no menu Iniciar com o ícone do Cronograma Audiovisual.

**Mac**

1. No Finder, clique em **Ir > Conectar ao Servidor**, digite `smb://172.16.52.30/instaladores` e clique em
   **Conectar**.
2. Abra a pasta `cronograma-audiovisual` e dê dois cliques em `cronograma-audiovisual-X.Y.Z-mac.dmg`.
3. Na janela que abre, arraste **Cronograma Audiovisual** para a pasta **Aplicativos**.
4. Abra o programa pela pasta Aplicativos ou pelo Launchpad. Na primeira vez, o macOS pede uma liberação: veja a
   etapa 10.

O programa abre com o mesmo login do app web. A versão aparece no rodapé do menu lateral e na tela **Sobre**.

**Pasta dos instaladores no programa.** Ao abrir, o programa procura versão nova na pasta central. Se a pasta for
outra, troque em **Sobre > Versões novas > Pasta dos instaladores** e clique em **Salvar pasta**. Pode digitar o
endereço do Windows (`\\servidor\pasta`) também no Mac: o programa troca para `/Volumes/pasta` sozinho. Fora da
rede da empresa, o programa funciona normalmente e só não procura versão nova.

## 10. Liberar o programa sem assinatura na primeira abertura

Os instaladores são de uso interno e não têm assinatura de código da Microsoft ou da Apple. Por isso, na primeira
abertura em cada computador, o sistema pede uma confirmação. Isso é esperado e só acontece uma vez por versão.

**Windows: "O Windows protegeu o computador"**

1. Na janela azul do SmartScreen, clique em **Mais informações**.
2. Confira que o aplicativo é `cronograma-audiovisual-X.Y.Z-windows.exe` e clique em **Executar assim mesmo**.

Se o antivírus da empresa bloquear o arquivo, peça à TI para liberar a pasta `\\172.16.52.30\instaladores`.

**Mac: "Cronograma Audiovisual não pode ser aberto"**

1. Clique em **OK** (ou em **Concluído**) no aviso. Não mova o programa para o Lixo.
2. Abra **Ajustes do Sistema > Privacidade e Segurança**, role até o fim e, na mensagem sobre o Cronograma
   Audiovisual, clique em **Abrir Mesmo Assim**. Confirme com a senha do Mac e clique em **Abrir**.
3. Nas versões mais antigas do macOS, também funciona clicar no programa com a tecla **Control** pressionada,
   escolher **Abrir** e confirmar em **Abrir**.

Se o macOS disser que o programa **"está danificado e não pode ser aberto"**, é a mesma falta de assinatura. Abra o
**Terminal** e rode:

```bash
xattr -cr "/Applications/Cronograma Audiovisual.app"
```

Depois abra o programa de novo.

## 11. Publicar uma versão nova

A versão mora num lugar só: o `version` do `package.json` da raiz do repositório. O app web, o programa de desktop
e o serviço de fundo leem o número dali.

1. Suba a versão no `package.json` da raiz: PATCH (`1.0.1`) para um conserto, MINOR (`1.1.0`) para algo novo e
   MAJOR (`2.0.0`) quando o jeito de usar muda.
2. Escreva no topo do `CHANGELOG.md` a versão, a data e o que mudou, nas palavras de quem usa.
3. Envie para a `main`. O app web se atualiza sozinho: no celular, ao reabrir, aparece "Atualizado para vX.Y.Z".
   A imagem nova do serviço de fundo também é publicada; atualize o NAS como na etapa 6.
4. Gere os instaladores: no GitHub, abra **Actions > Instaladores do desktop > Run workflow** (ou crie uma tag
   `vX.Y.Z`). No fim, baixe os artefatos `instalador-windows` e `instalador-mac` da execução.

   Para gerar num computador, com o `apps/web/.env` preenchido como o `apps/web/.env.example` (os mesmos valores da
   etapa 5): `npm run dist:win -w @cronograma/desktop` num PC e `npm run dist:mac -w @cronograma/desktop` num Mac.
   Os arquivos saem em `apps/desktop/release/`.
5. Copie para a pasta central `\\172.16.52.30\instaladores\cronograma-audiovisual`:
   1. primeiro, os dois instaladores (`cronograma-audiovisual-X.Y.Z-windows.exe` e
      `cronograma-audiovisual-X.Y.Z-mac.dmg`);
   2. **por último**, o `latest.json`, substituindo o anterior. Ele diz qual é a versão atual; copiá-lo por último
      evita que alguém veja o aviso antes de o instalador estar na pasta.
6. Pronto: quem abrir o programa numa versão mais antiga vê o aviso "Versão nova" com o botão **Instalar vX.Y.Z**,
   que abre o instalador. Ninguém é atualizado sem clicar. Os instaladores antigos podem ser apagados da pasta
   depois de alguns dias.

O `latest.json` tem esta forma (os nomes são os dos arquivos na mesma pasta):

```json
{
  "version": "1.1.0",
  "windows": "cronograma-audiovisual-1.1.0-windows.exe",
  "mac": "cronograma-audiovisual-1.1.0-mac.dmg"
}
```

## 12. Quando algo não funciona

| O que acontece | O que fazer |
|----------------|-------------|
| Convite ou "Esqueci a senha" não chega | Confira a caixa de spam. No Supabase, confira o SMTP (etapa 3.4); no Brevo, em **Estatísticas > E-mails transacionais**, veja se o e-mail saiu ou foi barrado. |
| "Agenda X desconectada desde ..." | A agenda deixou de estar compartilhada com a conta de serviço. Refaça o passo 7 da etapa 2 e clique em **Reler agora**. |
| "Serviço de fundo parado desde ..." | O contêiner do NAS parou. Veja a etapa 6. |
| Notificações não chegam no iPhone | O app precisa estar instalado na tela inicial e aberto por lá ao menos uma vez (iOS 16.4 ou mais novo). Em **Preferências**, toque em **Reativar notificações**. |
| O programa não mostra versão nova | Confira se o computador está na rede da empresa e se a pasta em **Sobre** é a pasta central. O `latest.json` precisa ter a versão nova. |
| O programa abre e não carrega (Mac ou Windows) | Feche e abra de novo. Se continuar, reinstale pela pasta central. |
| A plataforma diz que está sem internet | O que já foi visto continua disponível. As mudanças esperam com o selo "a enviar" e seguem quando a internet voltar. |
