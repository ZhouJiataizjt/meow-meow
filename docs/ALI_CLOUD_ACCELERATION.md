# 阿里云访问架构

当前桌面客户端默认通过阿里云 ECS 上的喵喵 API 访问云端。Nginx 转发 `/meow-api/`，Node.js 处理账号和数据请求，MySQL 和上传目录保存数据。桌面端可通过 `MEOW_API_URL` 指定另一套喵喵 API 地址。[云端部署与配置](cloud-deployment.md)

旧版文档中的 ECS 反代方案用于 Supabase。相关兼容代码和 SQL 仍保留，可从 `src/backend/supabase_config.js` 和 `src/frontend/js/main.js` 查阅。维护当前环境请按喵喵 API 的健康检查、服务日志和 Nginx 路由排查。[服务器运维](SERVER_MANAGEMENT.md)
