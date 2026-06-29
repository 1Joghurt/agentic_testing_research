FROM oven/bun:slim AS build

WORKDIR /app

COPY package.json bun.lock angular.json tsconfig*.json vitest.config.ts playwright.config.ts ./
COPY src ./src
COPY realworld ./realworld

RUN bun install --frozen-lockfile
RUN bun run build && \
    site_dir="$(dirname "$(find /app/dist -name index.html -print -quit)")" && \
    test -n "$site_dir" && \
    mkdir -p /app/site && \
    cp -R "$site_dir"/. /app/site/

FROM nginx:1.31.1-alpine AS runtime

COPY --from=build /app/site /usr/share/nginx/html

RUN printf '%s\n' \
    'server {' \
    '  listen 3000;' \
    '  server_name _;' \
    '  root /usr/share/nginx/html;' \
    '  index index.html;' \
    '  location /api {' \
    '    proxy_pass http://backend:8081;' \
    '    proxy_set_header Host $host;' \
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
    '    proxy_set_header X-Forwarded-Proto $scheme;' \
    '  }' \
    '  location / {' \
    '    try_files $uri $uri/ /index.html;' \
    '  }' \
    '}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
