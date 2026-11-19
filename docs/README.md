# 喵喵地图

喵喵地图是一款记录、查找和分享校园猫咪观察的 Windows 桌面应用。项目源于华南理工大学第二十一届软件文化节「鼎甲杯」软件设计大赛。

## 下载与版本

正式版 **v2.3.1** 提供单个 Windows x64 安装包，下载后双击安装。[发布说明](https://github.com/ZhouJiataizjt/meow-meow/releases/tag/v2.3.1) · [下载安装包](https://github.com/ZhouJiataizjt/meow-meow/releases/download/v2.3.1/meow-meow-map-2.3.1-win-x64-Setup.exe)

本版修复未登录或查看他人打卡时的猫咪头像显示，并为自选猫咪头像增加位置、缩放和裁剪预览。公开示例打卡存于云端。

## 使用

- **发现地图**默认打开华南理工大学大学城校区。观察列表支持按日期、校园、距离和关键词筛选，也可把相距较近的打卡聚在一起。地图提供校园边界和热力图。
- **新增观察**打开表单后可填写标题、描述和照片，选择「在地图上选择位置」后点选坐标，再保存。手机或相机的猫咪照片可作为观察附件上传。
- **猫咪档案**保存固定 ID、昵称、品种或花色、识别特征和备注。新档案可以从新增观察表单直接创建，档案时间线汇总本人关联的普通观察和地图打卡。改昵称保留历史关联。
- **公开观察**可免登录浏览云端的普通观察、地图打卡及关联照片。登录后可新增记录，对地图打卡点赞或评论。作者可在「我的观察记录」编辑、删除自己的条目，并筛选「缺少具体地点」后补填地点。
- **寻猫小助手**登录后可查询公开观察。校园清单分开列出真实记录和示例打卡，一般问题由服务端检索并调用百炼生成回答。地图打卡引用可跳转到地图。
- **统计面板**可切换「我的记录」和「公开地图」，查看时间分布、来源、品种与校园覆盖。结果按观察记录统计，可排除示例。
- **喵喵轨迹**在发现地图工具栏选择一只猫，地图会按时间连起该档案带时间和坐标的打卡，并缩放到点位范围。连线用于回顾目击顺序。小谷围的示例数据包含同一档案的多次模拟打卡，部分条目附带有署名和许可说明的真实参考照片。
- **个人档案**支持修改观察者昵称、上传头像并恢复默认。[个人档案说明](profile-feature.md)

统计面板的「添加校园示例」可为当前账号添加小谷围岛 9 所高校、每校 3 条的模拟数据。重复运行按固定 ID 跳过已存在的条目。

## 从源码运行

在仓库根目录用 Windows PowerShell 执行。项目可用 Node.js 22 构建和测试。

```powershell
npm ci
npm start
```

如果 Electron 二进制下载失败，可在重新安装前为当前终端设置可用的 `ELECTRON_MIRROR`。npm registry 用于下载 npm 包，Electron 运行时使用独立的下载地址。

应用默认直连喵喵云端 API，底图瓦片需要网络。显式启用本地 JSON 存储可用：

```powershell
$env:MEOW_LOCAL_MODE = '1'
npm start
Remove-Item Env:MEOW_LOCAL_MODE
```

本地数据位于 Electron `userData/data`，照片位于 `userData/images`。旧版 JSON 会在首次启动时复制，已有文件优先保留。需要跨设备或跨模式迁移时，可通过侧栏导出和导入 JSON，并一并保留备份指向的照片文件。[云端使用与数据迁移](cloud-deployment.md)

「拍照识别品种」是单独的实验入口，桌面源码中的识别密钥仍为占位值。寻猫小助手使用的是服务端配置。

## 开发与打包

```powershell
node --test './test/*.test.js'
npm run lint
.\node_modules\.bin\electron.cmd scripts\review-redesign.cjs
```

Windows 打包使用仓库已有的 electron-builder 和 NSIS。在干净的发布副本中执行：

```powershell
npm ci
npm run dist -- --win nsis --x64 --publish never
```

输出位于 `build_output/`。发布前核对安装包版本、应用资源及 SHA-256。

更多资料见 [项目报告](REPORT.md)、[界面规范](../DESIGN.md)、[云端部署](cloud-deployment.md) 和 [服务器运维](SERVER_MANAGEMENT.md)。
