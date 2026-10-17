# Serviço de fundo do Cronograma Audiovisual, para o Docker do NAS (ADR-006).
# Construído a partir da raiz do repositório:
#   docker build -f apps/worker/Dockerfile -t cronograma-audiovisual-worker .
# Não expõe porta nenhuma: só faz conexões de saída (Supabase, Google, Gemini e serviços de push).
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# O package.json da raiz traz a versão única do produto, que o worker mostra no log de partida.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
RUN npm ci --omit=dev --workspace @cronograma/worker --no-audit --no-fund && npm cache clean --force

COPY tsconfig.base.json ./
COPY packages/core/src packages/core/src
COPY apps/worker/tsconfig.json apps/worker/
COPY apps/worker/src apps/worker/src

USER node
CMD ["node", "--import", "tsx", "apps/worker/src/index.ts"]
