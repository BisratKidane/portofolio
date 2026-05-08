FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm install --workspace backend
COPY backend ./backend
WORKDIR /app/backend
EXPOSE 4000
CMD ["npm", "start"]
