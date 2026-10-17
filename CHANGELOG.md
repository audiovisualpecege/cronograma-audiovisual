# Registro de versões

Cada versão nova entra no topo, com a data e o que mudou para quem usa.
PATCH para um conserto, MINOR para algo novo, MAJOR quando o jeito de usar muda.

## 1.0.0 (16/10/2026)

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
