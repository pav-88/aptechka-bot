FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma/ prisma/
COPY src/ src/

RUN npx prisma generate --schema=prisma/schema.railway.prisma
RUN npm run build

FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/prisma/ prisma/
COPY --from=builder /app/dist/ dist/

RUN npx prisma generate --schema=prisma/schema.railway.prisma

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --schema=prisma/schema.railway.prisma && node dist/index.js"]