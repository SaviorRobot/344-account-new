FROM node:22-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm install --only=production

# 复制全部项目代码
COPY . .

# 持久化SQLite数据库目录
VOLUME ["/app/data"]

# 生产环境标识
ENV NODE_ENV=production

# 对外暴露端口3000
EXPOSE 3000

# 启动命令，匹配你的server.js
CMD ["node", "server.js"]
