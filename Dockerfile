# Use Node 20 Alpine (mais leve)
FROM node:20-alpine

# Diretório de trabalho no container
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia todo o restante da aplicação
COPY . .

# Expõe a porta que seu server.js usa
EXPOSE 10000

# Comando para iniciar o server
CMD ["node", "server.js"]
