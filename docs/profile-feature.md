# 个人档案

登录后可通过左下角头像或「个人档案」进入。可修改昵称，选择 JPG 或 PNG 头像，预览后保存，也可恢复默认。昵称允许 1–30 个 Unicode 字符，用户 ID 只读。保存后侧栏同步更新，公开观察和评论读取最新昵称。

系统通过账号 ID 从六款居中的猫咪图案中分配默认头像。同一账号刷新或恢复默认时会显示同一款图案。云端未登录时，侧栏头像进入登录窗口。

## 存储与兼容

- 本地模式的资料存储在 Electron 用户数据目录的 `observer-profile.json`。本地 ID 与云端账号 ID 分开。
- 云端使用 `GET /profile` 和 `PUT /profile`。服务端根据认证会话确定资料归属，校验昵称及头像，并将资料写入 `user_profiles`。
- 客户端将原图裁成方形并压缩为 JPEG。头像数据上限为 40 KiB。恢复默认会清空已保存的自定义头像。
- 如果旧版 API 缺少资料接口，客户端可从当前会话读取只读身份，并提示联系管理员更新服务端。

## 部署与验证

新装数据库使用 `server/schema.sql`。已有环境由数据库管理员执行 `server/profile-migration.sql`，创建资料表并补充旧资料表缺少的 `avatar_url` 字段。更新服务端时一起部署 `src/backend/user_profile.js`，再重启 `meow-api`。[部署步骤](cloud-deployment.md#验证更新与停用)

`test/user_profile.test.js` 检查本地持久化和字段校验，`test/cloud_profile.test.js` 在模拟数据库下检查认证和资料路由。`scripts/review-redesign.cjs` 验证 Electron 中的保存、重读、侧栏同步和恢复默认。
