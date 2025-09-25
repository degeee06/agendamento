# ==============================
# Dockerfile para Node.js ES Modules
# ==============================

# 1️⃣ Imagem base
FROM node:20-alpine

# 2️⃣ Define diretório de trabalho
WORKDIR /app

# 3️⃣ Copia package.json e package-lock.json (ou yarn.lock)
COPY package*.json ./

# 4️⃣ Instala dependências
RUN npm install --production

# 5️⃣ Copia todo o código da aplicação
COPY . .

# 6️⃣ Define variáveis de ambiente padrão (podem ser sobrescritas no docker run)
ENV PORT=3000

# 7️⃣ Expõe a porta do servidor
EXPOSE 3000

# 8️⃣ Comando para iniciar a aplicação
CMD ["node", "index.js"]
