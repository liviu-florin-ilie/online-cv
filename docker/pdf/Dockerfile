FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/pdf

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY generate-pdf.js ./

ENTRYPOINT ["node", "/opt/pdf/generate-pdf.js"]
