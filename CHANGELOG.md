# Registro de versões

Cada versão nova entra no topo, com a data e o que mudou para quem usa.
PATCH para um conserto, MINOR para algo novo, MAJOR quando o jeito de usar muda.

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
