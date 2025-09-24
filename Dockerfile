# 1️⃣ Usa Node 20 Alpine oficial (leve e público)
FROM docker.io/library/node:20-alpine

# 2️⃣ Define diretório de trabalho no container
WORKDIR /app

# 3️⃣ Copia arquivos de dependências
COPY package*.json ./

# 4️⃣ Instala dependências
RUN npm install --production

# 5️⃣ Copia toda a aplicação
COPY . .

# 6️⃣ Expõe a porta que o Render vai usar
EXPOSE 10000

# 7️⃣ Executa o server.js
CMD ["node", "server.js"]
