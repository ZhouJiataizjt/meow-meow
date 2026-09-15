华南理工大学第二十一届软件文化节“鼎甲杯”软件设计大赛 PC 端参赛作品是也

当前版本已改造为“喵喵地图”：以猫咪发现地点、猫咪记录和本地地图为核心，默认离线运行。

这个版本已经移除了图片识别模块，不再需要下载和启动 PyTorch、ResNet 或 Python 模型环境。

特别感谢：Gemini-3pro，Gemini-2.5pro，Chatgpt-5.1（排名分先后）

### 当前功能

- 猫咪图鉴查询：支持按地区和名称/品种查询（需要配置大模型 API 才会返回在线结果）。
- 今日寻猫推荐：支持按地区生成推荐（需要配置大模型 API）。
- 我的猫咪记录：本地新增、编辑、删除和搜索记录。
- 喵喵地图：本地地图打点、图片、详情、编辑、删除、搜索和日期筛选。

智能识别模块已经移除。仓库中保留的旧模型和训练脚本仅作为历史文件，应用运行时不会加载。

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

数据库和大模型 API 当前没有配置，启动后会使用本地 JSON 数据；地图和记录功能可以直接使用，在线查询、推荐以及云端社交功能需要以后再配置对应服务。

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
