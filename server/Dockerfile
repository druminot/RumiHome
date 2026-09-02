FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# node:sqlite requiere Node 22.5+
ENV DB_PATH=/data/rumihome.db
VOLUME /data
EXPOSE 3001
CMD ["node", "dist/index.js"]