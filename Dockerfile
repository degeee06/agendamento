# Use Node 20 com Debian Bullseye (tag correta)
FROM node:20.11.1-bullseye

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

# Variáveis de ambiente podem ser definidas no Render, não aqui

# Comando para iniciar o server
CMD ["node", "server.js"]
