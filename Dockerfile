# Use Node 20 com Alpine (mais leve e recomendado)
FROM node:20-alpine

# Diretório de trabalho no container
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia todo o restante da aplicação
COPY . .

# O Render ignora EXPOSE, mas mantemos por boas práticas
EXPOSE 10000

# Usa a porta do Render via variável de ambiente
CMD ["node", "server.js"]
