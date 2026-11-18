华南理工大学第二十一届软件文化节“鼎甲杯”软件设计大赛 PC 端参赛作品是也

当前版本已改造为“喵喵地图”：以猫咪发现地点、猫咪记录和地图为核心，默认连接云端公开地图，无需 SSH 隧道；发布、点赞、评论需要登录。底图瓦片仍需要网络。云端部署及离线模式见 [cloud-deployment.md](cloud-deployment.md)。

### 本地猫咪数据集

“猫咪档案”是所有观察共用的本地猫咪数据集。每只猫有固定 ID、昵称、品种/花色、识别特征和备注；新档案自动生成 UUID，旧档案保持原 ID，改昵称不影响历史关联。

地图“新增观察”和普通“添加记录”均可选择已有猫咪，或点击“没见过这只猫，新建档案”，填写昵称后“创建并选中”。新档案立即独立保存，随后保存观察时关联其 ID。同一只猫的地图打卡和普通观察会汇总到档案的相遇时间线。暂时无法确认身份时可以先不关联，之后编辑记录补充。JSON 备份包含猫咪档案及关联 ID。

### 本地版新增观察

点击“新增观察”会直接打开表单。填写标题、描述或选择照片后，点击“在地图上选择位置”，在地图点选发现地点，返回表单点击“保存观察”。选点时返回表单不会丢失已填写内容。

记录和猫咪档案保存在 Electron `userData/data` 目录，照片保存在 `userData/images`。首次启动自动复制旧版 JSON 数据，保留原文件，不覆盖已经迁移的用户数据。默认通过 `http://8.148.216.205/meow-api` 连接独立云端 API；设置 `MEOW_LOCAL_MODE=1` 可显式使用本地 JSON。Supabase 仅保留旧版兼容代码。

这个版本已经移除了图片识别模块，不再需要下载和启动 PyTorch、ResNet 或 Python 模型环境。

特别感谢：Gemini-3pro，Gemini-2.5pro，Chatgpt-5.1（排名分先后）

### 当前功能

- 寻猫小助手：登录后可用自然语言查询公开观察。回答引用的地图打卡可以在地图上查看，云端配置见 [云端部署](cloud-deployment.md#寻猫小助手)。
- 我的猫咪记录：本地新增、编辑、删除和搜索记录，支持关联猫咪档案和所在校园；本地记录的图片会自动拷贝进应用数据目录，原图移走或删除后记录不再裂图。
- 喵喵地图：本地地图打点、图片、详情、编辑、删除、搜索、日期筛选和热力图视图；支持按高校/校区筛选、距离排序与附近半径筛选、位置聚合（猫点），点击校园色块可查看区域汇总并一键跳转筛选结果。
- 高校范围与自动定位：地图打开即定位到华工大学城校区，可显示 12 所广州高校的校区边界（支持手工添加校内分区），新增打点时自动判定落点属于哪所高校、哪个校区/片区，校外则提示最近的校园；判定结果随记录保存并可在筛选和统计中使用。边界数据来自 OpenStreetMap，存于 `data/areas.json`（WGS84，应用内自动转换为 GCJ-02 与高德底图对齐，一个校区的多个不相交边界均会保留），可手工编辑修正；华工国际校区边界为手工近似录入。更新边界可重跑 `node scripts/build_areas.js`。
- 猫咪档案：支持按昵称、ID、品种、特征和备注搜索，可上传头像、选用内置猫咪头像或恢复首字头像。相遇时间线自动汇总自己的观察与地图打卡。
- 公开观察：无需登录即可浏览云端普通观察和地图打卡。「我的观察记录」支持筛出缺少具体地点的条目，补填地点或删除。
- 数据分析：在「我的记录」和「公开地图」之间切换，查看近 28 天趋势、来源和品种构成、星期 × 小时热力图、校园覆盖等图表。图表展示的是记录分布，不是猫咪数量估计。
- 校园示例：在数据分析页点击「添加校园示例」，可为当前账号添加小谷围岛 9 所大学、每校 3 条的演示记录。示例不代表真实目击，在统计页可单独排除，重复点击不会重复添加。
- 数据导出/导入：一键导出 JSON 备份，跨设备或跨模式（本地/云端）合并导入。
- 拍照识猫：添加记录时可选择照片，由多模态大模型识别品种并回填表单（需要配置 API Key）。

历史遗留的 PyTorch/ResNet 本地识别模块、训练脚本和相关模型文件已从仓库移除，识别功能改由大模型多模态接口承担。前端依赖的 Leaflet 库已本地化到 `src/frontend/vendor/`，不再依赖 unpkg CDN。

### 运行项目

### Windows PowerShell 正确启动方式

请在项目根目录 `D:\Desktop\other\meow-meow` 中执行。项目已经有 `package.json`，不需要再次执行 `npm init -y`。

第一次启动或依赖安装不完整时，建议使用 Electron 国内镜像：

```powershell
cd D:\Desktop\other\meow-meow
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
npm start
```

之后再次启动只需要：

```powershell
cd D:\Desktop\other\meow-meow
npm start
```

如果想确认 Electron 运行时是否安装完整，可以执行：

```powershell
Test-Path .\node_modules\electron\dist\electron.exe
```

返回 `True` 后才说明 Electron 本体已经下载完成。

### 本次启动问题记录

1. 第一次执行 `npm start` 时，项目提示 `'electron' 不是内部或外部命令`，原因是 `node_modules` 中没有完整安装 Electron。
2. 执行普通的 `npm install electron --save-dev` 时，Electron 的安装脚本需要继续下载运行时二进制，下载过程出现 `ECONNRESET` / `ETIMEDOUT`。
3. 单独设置 npm registry 只能加速 npm 包下载，不能保证 Electron 运行时下载使用同一个镜像；设置 `ELECTRON_MIRROR` 后重新安装才完成。
4. `node_modules` 曾留下安装失败的残留目录，但使用上面的安装命令重新安装即可恢复，不需要执行删除整个项目的操作。

云端数据库、公开地图、点赞和评论已接入；大模型 API 暂未配置。启动默认使用云端，本机旧记录仍保留，需要迁移时可通过 JSON 导出和导入。

### 开发命令

```powershell
npm test   # 运行测试（node --test，测试文件在 test/ 目录）
npm run lint  # ESLint 检查
```

配置云端猫咪档案功能时，除 `supabase_schema_update.sql` 外还需执行 `src/backend/cats_schema.sql`。

### 如何把屎山打包成exe

安装依赖

```
npm install --save-dev electron-builder
# 下载winCodeSign
https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z
把下载好的压缩包内的文件拷贝进C:\Users\{你的用户名}\AppData\Local\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0里
# 因nsis打包软件大小超过2G时会报错[File: failed creating mmap of "xxx.nsis.7z"]，故在此下载nsisbi
https://sourceforge.net/projects/nsisbi/
把下载好的压缩包内的文件拷贝进C:\Users\{你的用户名}\AppData\Local\electron-builder\Cache\nsis\nsis-3.0.4.1里
# 下载nsis
https://repo.huaweicloud.com/electron-builder-binaries/nsis-3.0.4.1/nsis-3.0.4.1.7z
把压缩包内的elevate.exe拷贝进C:\Users\{你的用户名}\AppData\Local\electron-builder\Cache\nsis\nsis-3.0.4.1里
```

```
cd {你存放代码的文件夹}
# 以下操作需要管理员权限
npm run dist
```

感谢：https://blog.csdn.net/qq_30795779/article/details/127428030

然GitHub Release 的单个文件上限是 2 GB，为了塞进release

```
cd {你存放代码的文件夹\build_output}
# 需要把7z添加进环境变量
7z a meow-meow-map_setup.7z meow-meow-map_Setup.exe meow-meow-map_Setup.nsisbin -v1900m
```

然后依次上传分卷即可。

安装说明：
1. 下载所有分卷（.001, .002, .003, .004）
2. 确保它们放在同一个文件夹中
3. 使用 7-Zip 打开 meow-meow-map_setup.7z.001 并解压
4. 解压后会得到：
   - meow-meow-map_Setup.exe
   - meow-meow-map_Setup.nsisbin
5. 双击 meow-meow-map_Setup.exe 开始安装
   安装过程中，进度条抽风是正常现象，请不用担心。
