FROM nginx:1.27-alpine

# 站点文件
COPY . /usr/share/nginx/html/
# nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
