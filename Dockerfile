# 1️⃣ Imagem base (substituindo node:20-alpine por uma tag estável)
FROM node:20-bullseye-slim

# 2️⃣ Define diretório de trabalho
WORKDIR /app

# 3️⃣ Copia package.json e package-lock.json
COPY package*.json ./

# 4️⃣ Instala dependências
RUN npm install --production

# 5️⃣ Copia todo o código
COPY . .

# 6️⃣ Expõe porta do app
EXPOSE 3000

# 7️⃣ Comando para rodar o servidor
CMD ["node", "index.js"]
