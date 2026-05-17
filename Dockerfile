FROM node:18-alpine

# Native build tools required for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy and install dependencies first (better layer caching)
COPY artifacts/api-server/package.json ./package.json
RUN npm install

# Copy source code and build config
COPY artifacts/api-server/src ./src
COPY artifacts/api-server/tsconfig.json ./tsconfig.json
COPY artifacts/api-server/build.mjs ./build.mjs

# Compile TypeScript → dist/
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/bot_data.db

RUN mkdir -p /data

EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/index.js"]
