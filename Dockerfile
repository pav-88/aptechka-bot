FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma/ prisma/
COPY src/ src/

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/prisma/ prisma/
COPY --from=builder /app/dist/ dist/

RUN npx prisma generate

ENV NODE_ENV=production
ENV DATABASE_PROVIDER=postgresql

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]