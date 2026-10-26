# Registro de versões

Cada versão nova entra no topo, com a data e o que mudou para quem usa.
PATCH para um conserto, MINOR para algo novo, MAJOR quando o jeito de usar muda.

## 1.1.0 (21/10/2026)

- Painel mais visual: no topo, cartões da semana atual (em destaque, com moldura no gradiente da Chiaro) e das 2
  seguintes, com ícone colorido e situação (sem montagem, em montagem ou publicada) e o que falta em cada uma. Logo
  abaixo, os **Avisos da agenda**: as últimas mudanças vindas das agendas nessas 3 semanas, cada uma com ícone e
  cor (verde novo, amarelo mudou, vermelho cancelado). As pendências vêm por último.
- **Reler agora** pede confirmação antes, porque existe um limite de sincronizações por dia. Vale no Painel e na
  Semana.
- Tela da Semana reorganizada: "< Semana de 19/10 >" no centro, com "Semana atual", "Próxima semana" etc.
  embaixo e a anterior e a seguinte esmaecidas dos lados (clique nas setas ou nelas para trocar; a semana nova
  entra deslizando). Embaixo, a situação da semana e os botões numa linha só (Nova atividade interna, Montar
  semana, Publicar, Propor escala), depois um cartão com ícone para cada função com quantas pessoas estão
  disponíveis (quem tem mais de uma conta na que mais fez), a seção **Folga e férias** (ausências cadastradas e
  eventos da agenda com férias, folga ou ausente no título, com a pessoa reconhecida pelo nome) e a lista de
  eventos. Saíram a grade por pessoa e os quadros de horas e de carga da lateral. Vaga ainda vazia aparece em
  destaque.
- **Propor escala** abre uma tela própria em 2 passos. Passo 1: os tipos de serviço dos eventos. Ao chegar, a
  tela já identifica os tipos pelas palavras-chave e pede ao serviço de fundo os que sobraram (títulos parecidos
  do histórico e o Gemini). Os que faltarem ficam em destaque, com sugestões do histórico para usar com um clique.
  Passo 2: a semana é montada, a IA propõe as pessoas e a revisão acontece ali mesmo (aceitar, trocar,
  descartar), com as vagas vazias em destaque.
- **Porte do evento**: EVENTO, GRAVAÇÃO e PODCAST têm porte Simples, Médio ou Grande, cada um com a sua equipe.
  No histórico de um ano, metade dos eventos teve 1 pessoa, mas todo EVENTO pedia 8 vagas. Sem escolha, vale o
  porte padrão do tipo, tirado do histórico: Simples no EVENTO, Médio na GRAVAÇÃO e no PODCAST. No passo 1 do Propor escala, cada evento desses tipos tem os três botões de porte, e o histórico sugere
  o porte quando o evento já aconteceu antes ("Usar Médio: 3 pessoas nas últimas vezes", ou todos de uma vez).
  O porte também se troca na página do evento, e o Grande chama primeiro quem é Referência. Em Dados > Tipos de
  serviço, "Tem porte" liga as três equipes em qualquer tipo. A TRANSMISSÃO deixou de pedir Suporte.
- **Escala sugerida pelo histórico, no próprio app**: o passo 2 do Propor escala sugere uma pessoa para cada
  vaga na hora, sem depender da IA. A regra saiu da análise do histórico: testada contra quem foi escalado de
  fato nas últimas 12 semanas, ela acerta a pessoa em 64% das vagas, contra 38% da regra anterior. A ordem é:
  1. quem tem a função, está livre no horário, sem ausência e dentro do limite de horas;
  2. **a turma fixa**, ou seja, quem fez o mesmo evento nas últimas 8 semanas;
  3. **o nível**: no trabalho complexo, a Referência primeiro; no simples, a Referência por último, livre para
     os complexos;
  4. **a prioridade da função** na lista da pessoa;
  5. o histórico na função e no tipo, com o recente pesando mais;
  6. a menor carga na semana.

  Cada sugestão diz o porquê e só vale depois de aceita. A IA vira um botão opcional.
- **Ordem de preenchimento** das sugestões:
  1. uma pessoa em cada evento, para nenhuma demanda ficar sem ninguém;
  2. as outras vagas dos eventos que não são reunião;
  3. por último, as reuniões.
- **Revisão da escala no Propor escala**:
  - os eventos começam recolhidos, com o resumo das vagas (preenchidas, sugestões e vazias);
  - a setinha mostra as pessoas de cada evento;
  - há os botões **"Abrir todos os eventos"** e **"Só vagas vazias"**.
- **Pessoas**: as funções de cada pessoa ficam em ordem de prioridade (setas para subir e descer) e cada uma tem
  um nível: Apoio, Titular ou Referência.
- **Tipos de serviço**: marca de **trabalho complexo**. Evento com estrela também conta como complexo.
- Conserto da proposta da IA, que falhava toda vez:
  - **Reuniões por setor**: a REUNIAO INTERNA pedia a equipe inteira (47 vagas por reunião, metade das vagas da
    semana), inclusive em reuniões de um setor só. Agora as reuniões de Edição, Produção, Planejamento, Técnica e
    Mediação pedem só as pessoas do setor, e as reuniões gerais só marcam o horário.
  - A IA recebe lotes menores (25 vagas).
  - Uma linha fora do formato na resposta não derruba mais o lote inteiro.
  - Quando falha, a tela mostra o motivo exato.
- **IA local**: em Configurações > Geral dá para trocar o Google Gemini por um modelo rodando na rede da
  empresa, como o MiniCPM5 (pelo Ollama ou similar). Informe o endereço do servidor e o nome do modelo e use
  "Testar conexão". Os dados não saem da empresa e não há cota do Google. Como subir o modelo:
  `docs/ia-local.md`.
- Menu novo: Painel, Semana e Equipe soltos; **Dados** (Pessoas, Funções, Setores, Tipos de serviço,
  Ausências, Padrões) e **Configurações** (Geral, Importar, Agenda pessoal, Preferências, Sobre) com submenu.
  O grupo da tela aberta já vem aberto.
- Os avisos do administrador viraram uma aba do Painel (Resumo e Avisos); o sino no topo continua.
- Propor escala, passo 1: botão **Só os sem tipo** para ver só o que falta; botão direito seleciona vários
  eventos e a barra que aparece define o tipo de todos de uma vez. A janela de detalhes abre na hora (as
  sugestões do histórico eram recalculadas a cada clique e travavam a tela).
- No Painel, o cartão da semana clareia ao passar o mouse, sem sublinhar o texto.
- Na tela Propor escala, clicar num evento abre os detalhes numa janela, sem sair da tela (quando, local,
  origem, tipo, equipe e a descrição da agenda). A página completa do evento fica a um clique.
- Tipo de serviço em negrito, com o ícone do tipo; para trocar, o lápis ao lado.
- Cada tipo tem um ícone. No cadastro de tipos há um banco de ícones para escolher; sem escolha, o app usa um
  pelo nome do tipo.
- Tipos novos **FERIAS** e **FOLGA**, sem equipe. O **NAO ESCALAR** fica para os horários reservados ("não
  marcar nada", pré-reserva). Esses eventos aparecem à parte, discretos, no fim de cada dia.
- **\*DISPONIBILIZAR** e **\*REDISPONIBILIZAR** não pedem mais ninguém escalado: viram lembrete.
- **Estrela de destaque**: quem monta a escala marca as atividades principais da semana com um clique. Por
  enquanto ela aparece nas telas de montagem; o visual no cronograma final ainda vai ser definido.
- Conserto: os eventos lidos da agenda antes de o tipo de serviço existir ficavam "a definir" para sempre, porque
  o serviço de fundo só identifica o tipo do evento novo. Agora dá para pedir a identificação de novo, e "Montar
  semana" numa semana já montada cria as vagas dos eventos que ganharam tipo depois.

## 1.0.1 (19/10/2026)

- Configuração > Google Agendas: cada agenda ganhou **Editar** e **Remover**. Errou o ID ao adicionar? Edite e a
  agenda volta a "aguardando a primeira leitura" e é lida na hora. O rótulo muda sempre; o ID só enquanto a agenda
  não tem eventos lidos, para os eventos antigos não serem dados como cancelados. Remover tira da lista uma agenda
  sem eventos; a que já tem eventos fica com a leitura desligada, para o histórico não se perder.
- Os convites e o "Esqueci a senha" saem pelo Brevo, com o remetente pecegeworks@gmail.com.
- Testes de tempo com folga no GitHub, onde rodam mais devagar, e um teste da tela do evento que às vezes falhava
  sem motivo.

## 1.0.0 (17/10/2026)

- Primeira versão do Cronograma Audiovisual: a base do app, com o ícone próprio, o visual escuro da Chiaro Filmes
  e o número da versão no rodapé.
- Banco de dados com acesso por perfil: a equipe vê só a escala publicada, os próprios avisos e as próprias
  ausências; rascunho, propostas da IA, configuração e histórico ficam só com os administradores.
- Serviço de fundo para o NAS: relê as Google Agendas sozinho (sem nunca alterá-las) e avisa quem está escalado
  quando um evento muda, é cancelado ou troca de semana; prevê o tipo de serviço dos eventos novos; propõe a
  escala com a IA para o administrador revisar; envia as notificações no celular; mantém o link da agenda pessoal;
  manda os convites por e-mail e corta o acesso de quem foi desativado. Cada automação tem o seu liga e desliga.
- Entrada por e-mail e senha, com "Esqueci a senha" e a tela de criar senha pelo link do e-mail; o aparelho
  continua logado até a pessoa sair. A equipe abre "Minha semana" e os administradores, o painel.
- Menu lateral no PC e no Mac, barra inferior com "Mais" no celular, e a versão no fim dos dois menus.
- Funciona sem internet: o que foi visto fica guardado no aparelho, a faixa "Sem internet, atualizado em ..."
  avisa a idade da cópia, as mudanças esperam com o selo "a enviar" e seguem ao reconectar; se outra pessoa
  mudou a mesma coisa, a plataforma mostra as duas versões para escolher.
- Cadastros do administrador: pessoas (convite por e-mail, "Reenviar convite", desativar mostrando as alocações
  que viram vagas abertas, reativar), setores, funções e tipos de serviço com a equipe típica, e folgas, férias e
  ausências. A lista de pessoas busca por nome, setor e função mesmo com centenas de pessoas, e tudo funciona sem
  internet, seguindo ao reconectar.
- Importação das planilhas de cronograma (.xlsx): a leitura acontece no aparelho com o progresso de cada aba e
  "Cancelar"; uma revisão mostra as semanas, liga cada nome a uma pessoa do cadastro, escolhe função e tipo, lista
  o que ficou de fora, e nada é gravado antes de confirmar.
- Tela "Padrões": quantos eventos cada tipo teve, a equipe típica, quem mais fez cada função e a carga média de
  cada pessoa, com filtro de período.
- Configuração: as Google Agendas lidas (com o estado e a última leitura, e "Reler agora"), a chave da IA (só o
  final dela aparece, com "Testar chave" e o aviso sobre o plano gratuito) e o liga e desliga de cada automação.
- Painel do administrador com as pendências no topo (mudanças da agenda, vagas sem escala, propostas para
  revisar, alterações não publicadas, duplicados e semanas sem montagem), o aviso "Serviço de fundo parado desde
  ..." e as agendas desconectadas.
- Semana: prévia por dia antes de montar, com a agenda de origem, o tipo previsto, a certeza, a equipe estimada e
  as horas pedidas e disponíveis por função; "Montar semana" cria as vagas. Depois, a escala em lista por evento
  ou em grade por pessoa e dia, com o painel de carga, alertas que pedem "Escalar mesmo assim", travar e desfazer.
- Pré-escala pela IA: "Propor escala" com o progresso, propostas com justificativa para aceitar, trocar ou
  descartar por vaga, por evento ou na semana inteira; nada vale sem o administrador aceitar.
- Publicar a semana com o resumo de vagas abertas, propostas pendentes e alertas; numa semana publicada, as
  edições ficam como "alterações não publicadas", com "Publicar alterações" e "Descartar alterações".
- Tela do evento: dados da agenda só para leitura ("Corrija na Google Agenda"), tipo, observações e vagas a mais,
  antes e depois das mudanças da agenda com "Marcar como revisado", duplicados e atividades internas.
- "Minha semana" para quem é escalado: o dia de hoje aberto e destacado com a próxima atividade no topo, cada
  atividade com horário, título inteiro, local que abre o mapa, função, observações e colegas, os selos "mudou"
  (com o que mudou), "cancelado" e "interna", folgas, férias e ausências no dia, e as setas de semana anterior e
  seguinte.
- "Equipe": a semana publicada de todos, por dia, com filtros por setor, função e pessoa, "a definir" nas vagas
  abertas e rolagem leve mesmo com centenas de pessoas.
- A equipe abre o evento só para leitura, com as observações e quem está escalado.
- Sino de avisos no topo, com o contador: o aviso chega na hora, tocar abre a atividade e marca como lido, e há
  "Marcar todos como lidos". A lista mostra os últimos 30 dias.
- Notificações no celular em Preferências, com o aviso de como liberar quando estão bloqueadas e o pedido para
  "Reativar notificações" quando o aparelho deixa de recebê-las.
- "Minha agenda no meu calendário": um link secreto com as suas atividades para assinar no Google, no iPhone ou
  no Outlook, com "Copiar link", "Gerar link novo" e desligar.
- App instalável no celular, com as instruções do navegador em uso (inclusive o iPhone), abertura em tela cheia
  no tema escuro e funcionamento sem internet; depois de uma atualização, aparece "Atualizado para vX.Y.Z".
- Publicação do app web em audiovisualpecege.github.io/cronograma-audiovisual.
- Programa para Windows e Mac, instalado pela pasta central da rede, com a mesma interface e o mesmo login do app
  web, no tema escuro, com o ícone próprio no atalho, na barra de tarefas e no Dock, e as notificações do sistema
  para os avisos novos.
- Aviso de versão nova no programa: ao abrir, se a pasta central tem versão mais nova, aparece "Instalar vX.Y.Z",
  que abre o instalador; fora da rede da empresa, nada aparece. A pasta muda na tela Sobre, com o endereço do
  Windows ou do Mac.
- Tela Sobre com a versão em uso.
- Guia "Como usar" com a configuração inicial, a instalação no celular, no PC e no Mac, a liberação do programa na
  primeira abertura e a publicação de versões novas.
