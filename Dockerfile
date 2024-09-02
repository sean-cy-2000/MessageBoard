FROM node:latest
# 所使用的nodejs版本

WORKDIR /usr/src/app
# 這是docker內部的路徑，不是我電腦上的路徑。

COPY package*.json ./
RUN npm install
# 複製package.json然後執行install就可以安裝需要的庫

COPY . .
# 複製所有程式碼的文件到容器的工作資料夾

EXPOSE 3000
# 使用3000 port

CMD ["node", "server.js"]
# 執行容器時會執行的命令