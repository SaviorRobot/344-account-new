FROM node:24-alpine
WORKDIR /app
COPY package.json server.js index.html styles.css app.js ./
RUN mkdir -p /app/data
ENV PORT=3000 LEDGER_DB_PATH=/app/data/ledger.db
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
