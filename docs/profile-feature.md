# 个人档案功能与服务端更新

桌面入口：左下角头像或“个人档案”。昵称限制为 1–30 个 Unicode 字符；用户 ID 为只读，后台按当前认证会话确定身份，拒绝覆盖 ID。昵称更新后，公开观察与评论会使用最新昵称。

本地模式立即可用，资料存储在 Electron 用户数据目录的 `observer-profile.json`，退出重开后 ID 和昵称保持不变。本地 ID 与云端账号 ID 分离。

云端代码已增加 `GET /profile` 和 `PUT /profile`，需要与桌面更新一起部署。现有服务器应先由数据库管理员执行 `server/profile-migration.sql`，再更新 `server/index.js` 并重启 meow-api。服务账号只有读写权限，因此应用启动时不执行建表语句。首次安装的 `server/schema.sql` 已包含新表。

2026-11-17 已通过 Alliwebapp 部署到现有服务器，执行新增资料表迁移并重启 meow-api。已通过临时账户验证真实 MySQL 的资料读取、昵称修改、重读和 ID 不可修改；临时账户已清理，原有两条地图观察保留。源码和数据库备份位于服务器 `/root/meow-profile-backups/20261117T120746Z/`。客户端兼容尚未部署的新环境：可读取只读账号身份，并明确提示服务端尚未启用编辑；不会把该情况误报为网络失败。

验证：`test/cloud_profile.test.js` 运行实际 HTTP 路由处理器，模拟数据库验证登录限制、昵称读写和 ID 不可更改；不等价于真实 MySQL/线上集成测试。`test/user_profile.test.js` 检查本地持久化、允许字段和昵称校验。`scripts/review-redesign.cjs` 验证实际 Electron UI。

个人头像支持选择 JPG 或 PNG、预览和恢复默认。保存后同步到当前账号的个人档案和侧栏头像。云端升级先执行 `server/profile-migration.sql`，再发布 `server/index.js` 和共享校验模块 `src/backend/user_profile.js`，最后重启 `meow-api`。
