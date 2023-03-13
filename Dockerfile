
FROM --platform=linux/amd64 node:18-alpine
ENV NODE_ENV=production

WORKDIR /app

RUN npm install -g npm@9.6.1

COPY ["package.json", "package-lock.json*", "./"]
COPY ["index.js", "index.js", "./"]

RUN npm install --production

CMD [ "node", "index.js" ]
