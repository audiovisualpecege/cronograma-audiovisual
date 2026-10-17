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
