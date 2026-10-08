FROM nginx:1.29-alpine
COPY www /usr/share/nginx/html
EXPOSE 80
