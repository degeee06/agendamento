# ----------------------------
# Dockerfile pronto para Render
# ----------------------------

# 1️⃣ Usa Node 20 oficial (mais confiável que Alpine no Render)
FROM node:20

# 2️⃣ Define diretório de trabalho no container
WORKDIR /app

# 3️⃣ Copia apenas package.json e package-lock.json para instalar dependências primeiro (cache otimizado)
COPY package*.json ./

# 4️⃣ Instala dependências
RUN npm install --production

# 5️⃣ Copia todo o restante da aplicação
COPY . .

# 6️⃣ Expor porta (Render usa variável PORT)
EXPOSE 10000

# 7️⃣ Define comando de inicialização usando a porta do Render
CMD ["node", "server.js"]
