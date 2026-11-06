# shamsham 源码与复现

这是 shamsham 1.0.13 的完整小工具源码，包含路径、逐字、漂浮、波浪、环绕、呼吸、摇摆、弹跳，以及三秒 1080×1440 live图素材生成和小红书发布入口。

`app/` 中的 16 个文件与当时提交的小工具 ZIP 逐字节一致，没有重新压缩字体或改写发布函数。目录外额外提供本地服务器、测试与说明。原始 ZIP 也一并保留，详见 [manifest.json](manifest.json)。

## 本地运行

使用已安装 Node.js 的电脑，不需要 API Key、数据库或安装 npm 依赖。

```sh
git clone https://github.com/daafffodil/xiaohongshu-live-photo-guide.git
cd xiaohongshu-live-photo-guide/source/shamsham-1.0.13
node server.mjs
```

打开 http://127.0.0.1:4187/ 。终端保持运行，结束时按 Ctrl+C。端口被占用时，先关闭已有的本地预览。

不使用 Git 也可以在仓库页面选择 Code → Download ZIP，解压后进入 `source/shamsham-1.0.13` 运行 `node server.mjs`。不要双击 HTML 代替 HTTP 服务。

运行后可换图、编辑文字、切换八种动效、字体、颜色和大小。固定竖版 3:4，换图居中裁切；只有路径效果参考照片内容，其余按预设规则运动。字体已离线打包，采用常用中文子集，缺字可能由系统字体回退。

这是平台上传包的原样代码：普通浏览器可以体验编辑与动画，保存和发布按钮需要小红书容器，不会在电脑浏览器里打开手机发布页。此包没有另加浏览器 MP4 下载按钮。

## 文件入口

| 文件 | 改造方向 |
| --- | --- |
| [app/index.html](app/index.html)、[app/style.css](app/style.css) | 界面结构、配色、尺寸、按钮和图标 |
| [app/path.js](app/path.js) | 照片评分、曲线选择、弧长采样、沿曲线排字 |
| [app/motion.js](app/motion.js) | 各动效的缓动、时序和三秒循环 |
| [app/app.js](app/app.js) | 画面绘制、选图、排版、素材生成、发布与错误处理 |
| [app/mp4.js](app/mp4.js) | 像素帧编码为 H.264 并封装 MP4 |
| [app/captions.js](app/captions.js) | 五十句随机配文及发布标题、正文、话题文字 |
| [app/publish-entry.js](app/publish-entry.js) | 提前绑定按钮，避免编辑器初始化失败后无反馈 |
| [app/assets](app/assets)、[app/licenses/open-source.json](app/licenses/open-source.json) | 默认素材、字体、第三方许可与来源 |

## 模块复用

只做动态海报或网页文字时，可以保留 Canvas 绘制，取用 `path.js`、`motion.js` 和 `vendor/anime.min.js`，不接小红书。它们使用浏览器全局对象，没有要求使用 React、Vue 或打包框架。

路径模块的四个接口如下，实际调用与绘字可从 `app.js` 的 `drawPath` 开始阅读：

```js
// imageData 是裁切后的照片像素；项目分析尺寸为 96×128。
const analysis = window.ShamPath.analyze(imageData);
// 返回候选曲线筛选和局部调整后的锚点。
const anchors = window.ShamPath.curve(analysis, seed);
// 返回各行的曲线、字符位置、缩放、高低和倾斜参数。
// measure 返回每个字在 100px 字号下的实际宽度除以 100。
const lines = window.ShamPath.layout(analysis, text, width, height, fontSize, seed, measure);
// distance 是从曲线起点起算的像素弧长。
const point = window.ShamPath.sample(lines[0].path, distance);
```

`motion.js` 依赖先加载的 Anime.js，`ShamMotion.sample(mode, seconds)` 返回指定时刻的姿态。照片分析与固定随机种子在排版时计算，动画逐帧只取时间变化，不重新随机。字体加载完成后再测量文字。

改成其他 live图工具时，可以替换 `app.js` 的 `draw(context, width, height, time)`：绘制贴纸、手绘线条、相框或其他内容，再复用逐帧生成、MP4 编码、临时文件与发布流程。要同时保证封面与视频首帧一致，并将新内容的参数加入素材缓存标识，避免更改画面后发布旧素材。

本地 MP4 编码器适合本案例，压缩效率有限；不要将它视为任意视频工具的通用高压缩方案。提高分辨率、延长时长、增加运动面积都会增加文件大小与生成耗时，需要重新验证。

## 接入小红书

本地无需平台账号即可看动画；唤起小红书笔记编辑页需要自己的小工具项目和客户端容器。

1. 在自己的小红书创作服务平台项目中，按当前平台要求配置名称、图标和版本。
2. 对 `app/` 内部文件打 ZIP，确保 `index.html` 位于 ZIP 根目录；不要把 `server.mjs`、测试和外层目录打进去。
3. 上传后使用平台提供的预览码在小红书内打开。
4. 先检查静态图发布，再检查 live图的封面、播放、标题、正文、返回和重试。

接口由容器提供的 `window.xhs.miniTool` 注入。代码先生成 JPEG 与 MP4，分别用 `writeTempFile` 取得路径，再调用 `postNote` 打开原生笔记编辑页，由用户最终点击发布。

本包保留项目历史兼容处理。当前官方字段、失败分支和复用边界请同时阅读[完整说明](../../docs/shamsham-project-explained.md)与[排错记录](../../README.md)，不要只复制一个猜测的字段或改写本地文件路径。

正文中的 `#话题` 不保证成为蓝色可点击标签；自动挂载小工具也不作为普遍保证。新项目须自行验证这两项。

## 检查与验证范围

```sh
node --test tests/path.test.mjs tests/publish-entry.test.mjs
```

随附测试检查照片对曲线的影响、固定种子的稳定性、高清绘制坐标一致、长文字，以及发布入口的初始化失败和防重复行为。它们使用本地代码与替身，不会向小红书发笔记，不能替代真机验证。

本次补充源码时重新检查了文件与原始 ZIP 的一致性、脚本语法和随附测试。1.0.13 此前完成本地界面与回归检查并提交审核，但尚未获得用户的真机发布确认；历史上已确认可用的 1.0.7、1.0.10 仍单独保存在 [snapshots](../../snapshots/README.md)。旧版本早于路径效果。

第三方字体与 Anime.js 的许可随包保留，修改或分发时遵守原许可。制作自己的项目时，替换名称、图标和默认图片，使用自己有权使用的素材；不要将本仓库的测试记录当作新项目的验收结果。
