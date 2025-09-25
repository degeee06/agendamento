# 1️⃣ Imagem base (Docker Hub oficial)
FROM docker.io/library/node:20-alpine

# 2️⃣ Define diretório de trabalho
WORKDIR /app

# 3️⃣ Copia package.json e package-lock.json
COPY package*.json ./

# 4️⃣ Instala dependências
RUN npm install --production

# 5️⃣ Copia o restante do código
COPY . .

# 6️⃣ Expõe a porta que o Render vai usar
EXPOSE 3000

# 7️⃣ Comando para rodar a aplicação
CMD ["node", "server.js"]
