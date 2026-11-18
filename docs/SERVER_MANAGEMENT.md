# 喵喵地图服务器运维

喵喵 API 部署在阿里云 ECS 上，与同机其他应用共用 Nginx。维护时优先对喵喵服务执行单独检查或重启。

## 检查服务

在服务器上检查 Nginx、MySQL、喵喵 API 和内存守护定时器：

```bash
sudo systemctl status nginx mysql meow-api meow-memory-guard.timer --no-pager
curl -fsS http://127.0.0.1:8091/health
sudo journalctl -u meow-api -n 50 --no-pager
```

在客户端验证公网入口。健康接口返回 `ok: true`，并检查数据库是否可用。

```powershell
curl.exe -fsS http://8.148.216.205/meow-api/health
```

本机健康检查成功而公网检查失败时，检查 Nginx 的 `/meow-api/` 路由、ECS 安全组和公网地址。修改过 Nginx 配置时，先执行 `sudo nginx -t`，通过后执行 `sudo systemctl reload nginx`。

## 重启与地址变更

更新喵喵 API 的源码或百炼配置后，可用 `sudo systemctl restart meow-api` 应用变更。替换过 systemd unit 文件时，先运行 `sudo systemctl daemon-reload`，再重启服务并验证健康接口。

停用整台 ECS 会一并中断同机其他服务。实例启动后，应逐项核对服务状态和公网健康接口。若公网地址调整，源码运行可通过 `MEOW_API_URL` 指向新地址。更新默认地址的位置在 `src/backend/meow_api_client.js`，使用内置地址的安装包需要重新构建。

部署目录、数据库迁移、百炼环境变量和资源限制见 [云端部署](cloud-deployment.md)。
