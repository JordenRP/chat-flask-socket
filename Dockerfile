FROM python:3.11-slim as chat-server

WORKDIR /app

COPY server.py /app/
COPY static /app/static

RUN pip install websockets cryptography

CMD ["python", "server.py"]

FROM nginx:alpine AS web-server

COPY nginx/default.conf /etc/nginx/conf.d/default.conf

COPY static /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
