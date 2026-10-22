// Instruções e formatos de resposta da IA, iguais para todos os fornecedores (Gemini e modelo local) e para o app
// quando chama a IA deste computador. Só vão códigos (P1, R1, T1), horários, cargas e títulos de evento.

export const PROPOSE_INSTRUCTION = [
  'Você monta a pré-escala de uma equipe de audiovisual.',
  'Recebe vagas (slot) com função (role), tipo de serviço (type), horário e até 5 candidatos já conferidos:',
  'todos têm a função, estão sem ausência e cabem no limite de horas. Pessoas, funções e tipos vêm só como códigos.',
  'Escolha um candidato por vaga, ou null se nenhum servir. Prefira quem tem mais histórico (hist) naquela função',
  'e tipo; em empate próximo (inTieGroup), quem tem menos carga (loadHours, depois loadCount).',
  'Não ponha a mesma pessoa em vagas com horários sobrepostos e não passe do limitHours somando as horas escolhidas.',
  'Para cada vaga, devolva { slot, person, reason }, com reason curta em português (até 80 caracteres),',
  'por exemplo "costuma fazer T1; 12 h na semana". Use só os códigos recebidos.',
].join(' ');

export const CLASSIFY_INSTRUCTION = [
  'Classifique cada evento da agenda de uma equipe de audiovisual em um dos tipos de serviço dados, pelo título.',
  'Devolva { id, type, certainty } para cada item: type é o código do tipo (por exemplo T1) ou null quando nenhum',
  'serve; certainty é "media" quando o título deixa claro e "baixa" quando é um palpite.',
].join(' ');

export const PROPOSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      slot: { type: 'string' },
      person: { type: ['string', 'null'] },
      reason: { type: 'string' },
    },
    required: ['slot', 'person', 'reason'],
  },
};

export const CLASSIFY_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { type: ['string', 'null'] },
      certainty: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    },
    required: ['id', 'type', 'certainty'],
  },
};
