FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm install --workspace frontend
COPY frontend ./frontend
WORKDIR /app/frontend
EXPOSE 5173
CMD ["npm", "start"]
