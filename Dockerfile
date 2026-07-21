FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 持久化SQLite数据目录
VOLUME ["/app/data"]

ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "server.js"]
