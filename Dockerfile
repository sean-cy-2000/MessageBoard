FROM node:14
# 使用 Node.js 14 版本，這比較更輕量

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]