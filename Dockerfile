# Hosted MCP endpoint (see http.js). Build: docker build -t eu-cloud-mcp .   Run: docker run -p 127.0.0.1:8090:8090 eu-cloud-mcp
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.js http.js ./
COPY lib ./lib
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8090
USER node
EXPOSE 8090
CMD ["node", "http.js"]
