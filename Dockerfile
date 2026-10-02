FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

# Required for native Node modules such as better-sqlite3
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]