FROM node:20-alpine

WORKDIR /app

# Needed to compile native modules like better-sqlite3 on Alpine
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
