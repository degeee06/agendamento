# 1️⃣ Usa Node 20 oficial no GHCR
FROM ghcr.io/nodejs/node:20

# 2️⃣ Define diretório de trabalho no container
WORKDIR /app

# 3️⃣ Copia package.json e package-lock.json
COPY package*.json ./

# 4️⃣ Instala dependências
RUN npm install --production

# 5️⃣ Copia todo o restante da aplicação
COPY . .

# 6️⃣ Mantém EXPOSE por boas práticas (Render ignora)
EXPOSE 10000

# 7️⃣ Usa a porta definida pelo Render via variável de ambiente
CMD ["node", "server.js"]
