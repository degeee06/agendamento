# Use Node 20
FROM node:20-alpine

# Cria diretório de trabalho
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia todo o projeto
COPY . .

# Expõe porta (igual no server.js)
EXPOSE 3000

# Comando para iniciar
CMD ["node", "server.js"]
