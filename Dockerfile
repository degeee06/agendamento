# Use Node 20 com Debian (mais compatível com OpenSSL)
FROM node:20-bullseye

# Diretório de trabalho no container
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia todo o restante da aplicação
COPY . .

# Porta que o Render vai expor (use a mesma do seu server.js)
EXPOSE 10000

# Comando para iniciar o server
CMD ["node", "server.js"]
