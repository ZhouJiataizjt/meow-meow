# 喵喵地图云端部署

桌面应用默认直连 `http://8.148.216.205/meow-api`。客户端连接无需 SSH，服务器维护使用独立的管理连接。

## 启动与使用

在项目根目录运行 `npm start`，或启动已安装的应用，即可连接云端。在源码运行时可通过 `MEOW_API_URL` 指向另一个兼容的喵喵 API。`scripts/start-cloud.ps1` 会清除该覆写和本地模式变量，使用默认地址启动。

未登录可浏览公开地图、照片、点赞数和评论。点击侧栏「登录」，可用邮箱格式的账号名和 8–128 位密码注册。当前注册流程直接创建账号，暂无邮箱验证和密码找回。公网入口使用 HTTP，登录信息和会话令牌经明文 HTTP 传输。

- 已有和新增的云端观察记录与地图打卡，以及记录所附的备注和照片，均可在「公开观察」中浏览。该入口无需登录。作者使用「我的观察记录」编辑或删除自己的观察，也可按「缺少具体地点」筛选后补填地点。
- 猫咪档案仍按账户隔离。公开观察展示关联猫咪的名字，不开放猫咪档案备注和用户邮箱。
- 登录后可对地图打卡点赞、取消点赞、评论和删除自己的评论。一名用户对一条打卡最多一个赞，评论最多 1000 字，每分钟最多 5 条，每条打卡最多 100 条评论。删除打卡会清理关联互动。
- 公开观察表格和地图均按每页 100 条读取。表格可按需加载后续页，地图客户端将起始偏移量限制在 10,000。地图以账号及记录 ID 的组合区分同 ID 打卡。
- 图片只在被普通观察或地图打卡引用期间允许匿名读取；未引用图片仅上传者可读。设备已经下载的照片缓存不会被远程撤回。

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
- 数据库 `meow_map`，用户 `meow_app@localhost`，仅本库 CRUD、最多 2 个连接。表包括 `users`、`sessions`、`entries`、`uploads`、`likes`、`comments` 和 `user_profiles`。
- 外部配置 `/etc/meow-map/config.json`，root:meow-api、0640。数据库密码随机生成，不进源码。图片目录 `/var/lib/meow-map/uploads`。
- 密码 scrypt 哈希，会话令牌仅存哈希、7 天有效，登录撤销旧会话。桌面 safeStorage 加密存储登录态，不可加密时只保存在内存。
- 定时备份与 HTTPS 当前未配置。

## 寻猫小助手

服务端在 `server/cat-assistant.js` 处理检索和百炼调用。运行环境需要 Node.js 18 或更高版本。以 root 创建权限为 `0600` 的 `/etc/meow-map/dashscope.env`，配置 `DASHSCOPE_API_KEY`。默认使用北京工作空间兼容地址和 `qwen3.8-flash`，可通过 `DASHSCOPE_BASE_URL` 和 `DASHSCOPE_MODEL` 覆写。更新 systemd 单元后执行 `sudo systemctl daemon-reload`，然后重启 `meow-api`。登录桌面端后可分别测试校园清单和一般问答。

询问已知大学或校区有哪些猫咪记录时，服务直接统计已标注校园的公开观察，分别列出真实记录和示例打卡，每类最多显示最近 30 条。校园清单可在未配置百炼时运行。其他问题会检索最多 12 条真实公开观察，并将问题和候选记录的猫名、标题、地点、品种及观察时间发送给百炼。每个账户每分钟最多提问 5 次，服务同时处理一个提问。回答中引用的地图打卡可以定位。

## 资源限制

单进程，Node 堆 64 MiB，MemoryHigh=144M、MemoryMax=192M、MemorySwapMax=64M、CPUQuota=50%、TasksMax=24。最多 4 个并行请求、16 个直连连接、2 个数据库连接，密码哈希串行处理，每 IP 每分钟最多 10 次认证尝试。

普通 JSON 请求上限为 16 KiB，个人档案更新接口上限为 64 KiB。每账户每类记录最多 1000 条。单张图片上限为 2 MiB，每条最多上传 6 张，服务端图片总量阈值约为 1 GiB。

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

新装数据库使用 `server/schema.sql`。已有数据库使用 `server/profile-migration.sql` 补齐资料表及头像字段。同步源码时包括 `server/`、`src/backend/user_profile.js`、`data/areas.json` 和 `data/cat-avatar-presets.json`。对服务端脚本做语法检查后重启 `meow-api`，再验证本机和公网健康接口。调整喵喵专属 Nginx 路由时使用 `server/enable-public.py`，Nginx 配置校验失败时脚本会回滚。[服务器检查命令](SERVER_MANAGEMENT.md#检查服务)

若需对缺少地点的历史批次统一补录，`server/backfill-observation-location.sql` 会把地点和标题均为空的云端观察填为「小谷围大学城」，保留原有坐标。执行前应核对适用的数据范围，从项目根目录运行 `mysql meow_map < server/backfill-observation-location.sql`。

停用：`systemctl disable --now meow-api meow-memory-guard.timer`。此命令不停止 Tomcat、MySQL、Nginx，不删除数据。Nginx 配置保留 before-meow / before-public 时间戳备份。
