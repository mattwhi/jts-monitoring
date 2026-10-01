FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 3000
CMD ["npm","start"]
