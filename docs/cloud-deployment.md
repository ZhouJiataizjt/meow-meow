# 喵喵地图云端部署

2026-11-03 更新：应用默认直连 http://8.148.216.205/meow-api，不建立 SSH 隧道，不需要 SSH 密钥。服务器管理连接与客户端访问相互独立。

## 启动与使用

在项目根目录运行 `npm start`，或双击打包后的应用即可连接云端。`scripts/start-cloud.ps1` 是相同默认启动方式的快捷脚本，已移除隧道逻辑。

未登录可浏览公开地图、照片、点赞数和评论。点击侧栏“登录”，用邮箱格式的账户名注册，密码 8–128 位；目前没有邮箱验证或密码找回。无需使用购物网站账户。按当前要求使用 HTTP，登录信息和会话令牌不加密传输，演示账户应使用独立密码。

- 所有地图观察及所附照片公开，已有云端地图观察也按此规则展示。作者才能编辑、删除观察。
- 个人观察表和猫咪档案仍按账户隔离。公开地图只展示关联猫咪的名字，不开放猫咪私有备注和用户邮箱。
- 登录后可以点赞、取消点赞、评论和删除自己的评论。一名用户对一条观察最多一个赞，评论最多 1000 字，每分钟最多 5 条，每条观察最多 100 条。删除观察自动清理点赞评论。
- 地图按每页 100 条读取；当前桌面版本最多读取约一万条公开观察。不同账户相同记录 ID 使用复合标识区分。
- 图片只在被公开观察引用期间允许匿名读取；未引用图片仅上传者可读。设备已经下载的照片缓存不会被远程撤回。

旧本地数据保留，不会自动上传。需要离线维护或导出原记录时显式启动：

```powershell
$env:MEOW_LOCAL_MODE = '1'
npm start
# 之后恢复默认云端
Remove-Item Env:MEOW_LOCAL_MODE
```

本地导出的 JSON 可在云端模式导入。已有 ID 跳过，档案先于观察导入；中途失败可能部分导入，重试可继续。照片原文件必须仍存在。云端导出只导出本人数据，不把其他人的公开记录复制成自己的记录；照片路径指向本机缓存，迁移须一并保存照片。

## 服务与配置

- 源码 `/srv/projects/meow-map`，服务 `meow-api`，系统账户 `meow-api`，监听 `127.0.0.1:8091`。
- Nginx `/meow-api/` 转发到该服务，公网仍只使用原有 22、80 端口，购物网站原路由保持不变。
- Nginx 限流配置 `/etc/nginx/conf.d/meow-api-limits.conf`：每 IP 每秒 8 次请求、突发 20、最多 8 个连接；超限返回 429。
- 数据库 `meow_map`，用户 `meow_app@localhost`，仅本库 CRUD、最多 2 个连接。表包括 users、sessions、entries、uploads、likes、comments。
- 外部配置 `/etc/meow-map/config.json`，root:meow-api、0640。数据库密码随机生成，不进源码。图片目录 `/var/lib/meow-map/uploads`。
- 密码 scrypt 哈希，会话令牌仅存哈希、7 天有效，登录撤销旧会话。桌面 safeStorage 加密存储登录态，不可加密时只保存在内存。
- 大模型服务、定时备份与 HTTPS 均按要求跳过，购物网站 SMTP 不受影响。

## 资源限制

单进程，Node 堆 64 MiB，MemoryHigh=144M、MemoryMax=192M、MemorySwapMax=64M、CPUQuota=50%、TasksMax=24。最多 4 个并行请求、16 个直连连接、2 个数据库连接，密码哈希串行处理，每 IP 每分钟最多 10 次认证尝试。

JSON 请求最多 16 KiB，每账户每类记录最多 1000 条；单图 2 MiB，客户端与服务端均限制每条最多 6 张，总图片量约 1 GiB（并发可能多出数 MiB）。

`meow-memory-guard.timer` 每分钟检查可用内存，低于 180 MiB 时停止喵喵服务，需排查后手动恢复。硬上限约束喵喵进程，不能保证其他服务永不触发整机 OOM。

```bash
systemctl status meow-api meow-memory-guard.timer --no-pager
systemctl show meow-api -p MemoryCurrent -p MemoryPeak -p MemoryMax -p NRestarts
journalctl -u meow-api -n 50 --no-pager
free -m
```

## 验证、更新与停用

`python3 /srv/projects/meow-map/server/verify.py` 使用两个随机测试账户验证认证、公开地图、私有数据隔离、作者权限、点赞评论和图片限制。最后按精确 ID 清理测试用户及图片。小规模负载检查仅为 4 并发的 40 次健康请求。

`scripts/smoke-api.cjs` 不设置 API 地址、不建隧道，验证真实 Electron 默认公网连接、注册、照片、档案关联、记录编辑和点赞评论。临时用户 ID 写到已忽略的 artifacts/api-desktop-test.json，结束后需在服务器清理该用户和照片。

服务器更新只覆盖喵喵源码，执行 schema.sql 的建表迁移和语法检查后，仅重启 meow-api。执行 enable-public.py 可更新喵喵 Nginx 路由，校验失败会恢复配置。外部配置与购物网站源码不覆盖。

停用：`systemctl disable --now meow-api meow-memory-guard.timer`。此命令不停止 Tomcat、MySQL、Nginx，不删除数据。Nginx 配置保留 before-meow / before-public 时间戳备份。
