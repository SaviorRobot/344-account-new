FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
VOLUME ["/app/data"]
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
