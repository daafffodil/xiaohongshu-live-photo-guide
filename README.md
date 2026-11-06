# 小红书小工具唤起发布页

记录 shamsham 与酸汤の视频转实况从素材生成到小红书 live图发布的接入方法与排查过程。

适用于小红书创作服务平台里的离线 H5 小工具。资料更新日期为 2026-11-06。shamsham 1.0.10 归档保留的是当时用户确认正常运行的预览包。视频工具 1.0.7 和高清版 1.0.8 已由用户确认可用，1.0.15 已上传预览，等待 iPhone 验证。完整可运行代码见[版本归档](snapshots/README.md)。

视频工具的完整试错、存储超限、请求过大与最新预览方案见[视频转 live图排查记录](docs/video-live.md)。

## 接入方式

使用小工具容器注入的 `window.xhs.miniTool.postNote`，把素材、标题和正文交给原生笔记编辑页，用户在那里编辑并决定是否发布。不需要自行实现小红书草稿页面，也不需要先把 live图保存到手机相册。

live图按一组封面图片和动态视频传入。shamsham 先把 Canvas 动画编码为 MP4，再通过 `writeTempFile` 把封面与视频转成容器本地路径，最后调用 `postNote`。这不是把 MP4 当作视频笔记发布，也不是把 GIF 改名成 live图。接口字段和版本要求以[官方小工具文档](https://miniapp-sandbox.xiaohongshu.com/minitool/doc#s3-3)为准。

## 最小示例

下面按官方公开参数整理。`coverDataUrl` 是 JPEG 或 PNG 的 data URI，`mp4Blob` 是已经编码完成的 MP4，不能只是给其他视频格式改扩展名。

```js
let publishing = false;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('视频读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function publishLive(coverDataUrl, mp4Blob, title, content) {
  if (publishing) return;
  const sdk = window.xhs && window.xhs.miniTool;
  if (!sdk || !sdk.writeTempFile || !sdk.postNote) {
    throw new Error('请在小红书小工具内打开');
  }

  publishing = true;
  try {
    const cover = await sdk.writeTempFile({ data: coverDataUrl });
    const video = await sdk.writeTempFile({
      data: await blobToDataUrl(mp4Blob)
    });
    if (!cover.filePath || !video.filePath) {
      throw new Error('发布素材写入失败');
    }

    return await sdk.postNote({
      title,
      content,
      pageType: 'slides_edit',
      mediaInfo: {
        live_photo_sources: [{
          url: cover.filePath,
          video_url: video.filePath
        }]
      }
    });
  } finally {
    publishing = false;
  }
}
```

从按钮点击处理器调用此函数，并在界面显示生成状态与错误。把脚本放进小工具包，通过外部脚本引用加载。这个示例不包含动画编码器，也不自动发出第二次发布请求。

`mediaInfo` 按小工具公开文档传对象，不手动 `JSON.stringify`。普通浏览器没有原生接口；本地模拟成功只说明应用自己的流程可运行。官方文档要求 live图发布使用支持该能力的客户端，当前写明为 9.43 及以上。

### 静态图对照

先验证这条独立链路，能区分基础发布入口故障和 live图素材故障。

```js
const sdk = window.xhs.miniTool;
const image = await sdk.writeTempFile({ data: canvas.toDataURL('image/jpeg', 0.95) });
await sdk.postNote({
  title: '我的照片',
  content: '今天的记录',
  pageType: 'photo_publish',
  mediaInfo: { image_resources: [{ url: image.filePath }] }
});
```

静态图测试通过不能代替 live图测试。需要在原生编辑页确认照片能播放，而不只是看见一张封面。

## shamsham 验证记录

| 版本 | 结果 | 说明 |
| --- | --- | --- |
| 1.0.6 | 用户确认静态图进入草稿页，live图报错 | 报错包含 `10001` 和 `slides resource too few` |
| 1.0.7 | 用户随后反馈发布成功，并反馈生成的 live图分辨率偏低 | 曾出现“当前笔记发布中，请稍后尝试”；没有保存手机端每次调用的完整日志 |
| 本地 1.0.8 | 仅本地测试通过，未上传 | 移除自动参数轮换，改成每次点击一次请求；不能把它写成已经在手机成功的版本 |
| 1.0.9 预览 | 用户确认静态图正常，live图再次报 `10001` 和 `param=mediaInfo` | 带入未经真机确认的单路线逻辑，高清输出又触发不同的文件写入分支 |
| 1.0.10 预览 | 用户扫码确认修复版正常运行 | 恢复 1.0.7 兼容函数，高清 MP4 统一使用平台返回的临时文件路径；未提交发布 |

1.0.7 同时做了以下修改：

- 小于等于 4 MiB 的视频优先用 `writeTempFile` 写入。4 MiB 是项目自己的分支阈值，不是官方公布的接口上限。
- 写入后用 `<video>` 检查文件能否加载出第一帧，并检查尺寸和时长。
- 对明确的媒体参数拒绝，依次尝试两种发布入口和两种字段名。

该版本的发布函数按原样保存于 [examples/shamsham-1.0.7-publisher.js](examples/shamsham-1.0.7-publisher.js)。它依赖原项目的 `state` 和 `ShamCaptions`，是排查记录，不是独立可运行的组件。

实际尝试顺序如下：

| 次序 | pageType | 媒体字段 |
| --- | --- | --- |
| 1 | `slides_edit` | `live_photo_sources` |
| 2 | `slides_edit` | `live_photo_resources` |
| 3 | `photo_publish` | `live_photo_sources` |
| 4 | `photo_publish` | `live_photo_resources` |

只有前一次返回特定媒体参数错误才继续。每次仍是同一组封面和视频，没有复制成两张素材，也没有降级为静态图或视频笔记。

当前公开小工具文档写的是 `live_photo_sources`；排查时读取的官方电脑模拟器媒体解析代码使用 `live_photo_resources`。这只能证明两处实现存在差异，不能据此宣布手机端统一需要后一个字段。模拟器来源是[官方模拟器页面](https://miniapp-sandbox.xiaohongshu.com/simulator/releases/v0.2.2-9d88c5546499-0b9c738464e0)。

由于缺少成功那次的原生调用日志，无法确定最终命中了哪一组参数，也无法把成功单独归因于文件写入或参数适配。复用时应从公开契约开始，记录每次尝试及最终接受的组合。下面的兼容顺序是本项目的实测处理，不是官方对所有客户端的统一要求；不能对取消、繁忙或未知错误连续重发。

## shamsham 高清预览修复

### 问题与回退

1.0.9 预览版提高到 1080×1440，并增加文案和动态效果后，用户反馈静态图仍能进入发布页，但 live图再次出现 `10001 postNote:fail invalid parameter, param=mediaInfo`。

对比实际上传 ZIP，发现两个变化：

- 1.0.9 带入了未经手机成功验证的本地 1.0.8 发布函数，删除 1.0.7 的兼容处理，固定为 `photo_publish + live_photo_sources`。
- 高清视频超过项目原来设定的 4 MiB 分界，写入逻辑从 `writeTempFile` 返回的临时路径切换到分片写入并构造持久路径。4 MiB 不是已知的官方发布限制。

### 1.0.10 修复

从实际成功的 1.0.7 ZIP 恢复发布函数，保留前文四组参数的顺序。只有错误码为 `10001`，且消息同时包含 `invalid parameter` 与 `mediaInfo` 或 `slides resource too few` 时，才检查下一组；遇到繁忙、取消或其他错误立即停止。成功后在当前会话复用接受的组合。

所有生成 MP4 均交给 `writeTempFile`，只使用返回的完整 `filePath`，不再按大小切换为自行构造的路径。视频读取设 15 秒超时，写入设 30 秒超时；写入失败就停止，不提交半成品。封面和视频写入后仍验证视频能读到第一帧、有效尺寸和时长。

这次保留 1080×1440、50 句文案和七种动态，没有靠降分辨率、复制素材或改成静态图来绕开报错。

### 验证结果

语法检查与完整 69 项本地测试通过，上传产物的 10 项重点测试通过。其中包括 12 MiB MP4 只使用返回的临时路径，以及将发布顺序与真实 1.0.7 函数逐一比较。

随后用户扫描 **1.0.10 预览码并确认正常运行**。这是用户提供的手机反馈，不等同于电脑模拟器验证，也不表示该版本已经提交审核或发布。用户要求继续修改界面，因此保持预览状态。

两项改动在同一版修复，且没有原生调用日志，所以不能单独断言是哪一个字段或写入分支造成了全部失败。完整代码保存在[1.0.10 原始包](snapshots/shamsham-1.0.10.zip)，历史对照为[1.0.7 原始包](snapshots/shamsham-1.0.7.zip)。后续修改应保留这两个确认可用的版本，分别验证新增功能与发布流程。

## 报错处理

| 现象 | 已知信息 | 处理方式 |
| --- | --- | --- |
| 点击完全无反应 | 可能没有绑定事件，或初始化与生成过程被阻塞 | 让核心按钮先绑定；生成、字体与文件写入分别显示状态和设置超时 |
| `10001` 和 `param=mediaInfo` | 原生侧拒绝媒体参数 | 保留完整错误；核对对象结构、字段名、资源路径，以及 SDK 是否已经负责序列化 |
| `slides resource too few` | 发布侧没有得到足够的可用素材 | 检查路径与视频解码；单独测试入口和字段；不能直接推断必须传两张图片 |
| `storage quota exceeded / total_over_limit` | 视频载入回退时写入工作区超额，尚未生成发布素材 | 查询容量，清理本次失败文件；不能仅凭时长判断文件大小 |
| `writeTempFile payload too large` | 生成后的发布素材在写入时被拒，尚未调用发布接口 | 控制编码后体积和 Base64 膨胀；1.0.15 压缩方案待 iPhone 验证 |
| 当前笔记发布中 | 原生发布流程可能仍被占用 | 停止自动重发；避免用后一次错误覆盖最早的失败原因 |

官方文档没有给出本案例 `slides resource too few` 的唯一原因，以上是排查方法，不是官方错误码释义。

shamsham 的按钮在 `postNote` 尚未结束时保持禁用。不要给发布页套一个短超时后自动解锁重发，用户可能仍在原生编辑页。文件生成与写入可以设超时；超时后的迟到回调必须终止，不能继续发布。

重试可以缓存当前图片和参数对应的临时路径，但路径不应跨会话长期保存。重新生成时使用新文件名，防止超时写入覆盖下一次任务。

## 视频转live图案例

酸汤的视频转实况工具复用了 shamsham 已成功版本的发布流程。下面记录的是独立工具的版本，不能与 shamsham 的同名版本混淆。

### 文件找不到

手机端运行视频工具 1.0.6 时，用户反馈内置绿色示例可以发布 live图，但选择约两秒的 MP4 或拍摄视频后，发布返回 `postNote:fail file not found`。

排查发现，旧代码按**生成后的 MP4 大小**分流：小于等于 4 MiB 时使用 `writeTempFile` 返回的临时路径，超过 4 MiB 时切换到分片写入并构造持久文件路径。4 MiB 是项目自己的阈值，不是小红书公开的上传或发布上限；源视频只有两秒也可能在重新编码后超过这个值。

本地对照结果：

| 素材 | 转换结果大小 | 结果 |
| --- | --- | --- |
| 内置绿色示例 | 2,050,451 字节 | 旧版走临时文件分支；用户确认手机可发布 |
| 两秒复杂测试视频 | 4,744,112 字节 | 旧版走持久路径分支；本地 MP4 可解码为 384×512、两秒 |

这些证据把重点指向生成文件与发布器之间的路径交接。它不是“超过 4 MiB 就无法转成 live图”，也不能仅凭 `file not found` 断言编码损坏。我们没有原生文件系统日志，未独立证明具体哪一种路径规则导致失败。

### 1.0.7 修复

- 所有生成 MP4 均通过 `writeTempFile` 写入，取消按 4 MiB 切换发布产物存储方式的分支。
- 封面和视频只使用接口返回的完整 `filePath`，不拼接、不推算发布路径。等待两次写入完成并验证视频可读取，再调用 `postNote`。
- MP4 写入等待时间延长至 30 秒。写入失败时显示错误，不继续提交半成品。
- 收到 `file not found`、`ENOENT` 等错误后清除已准备的路径缓存。用户下次点击重新生成和写入，不自动重复调用发布。
- 保留“发布视频”对照入口，与 live图共用同一组封面和视频路径，便于比较文件读取问题和 live图媒体参数问题。

普通视频使用 `pageType: 'video_publish'` 和 `mediaInfo.video_resources: { video_url, cover_url }`；live图使用一组封面与视频的数组。不要因为添加对照入口就把 live图失败自动降级成视频笔记。

本轮 27 项回归测试通过，包括超过 4 MiB 时只使用返回的临时路径、失败后缓存重建、发布防重复和参数兼容。随后用户扫码体验视频工具 **1.0.7 并确认可用**。这是用户提供的手机反馈，不是本地模拟结果；仍没有完整的 iOS/Android 设备与客户端版本矩阵。

### 清晰度是另一个问题

发布成功后，用户反馈示例以及上传视频生成的 live图偏糊。代码检查确认，视频工具 1.0.7 将输出固定为 **384×512**；打包时还把内置 GIF 缩到 **160×212**。

这属于生成画面的尺寸和示例素材质量问题，与此前的文件路径错误不同。修复方向是提高生成视频和封面的实际像素尺寸，并更换清晰示例；不能只放大页面里的预览元素。提高分辨率会增加编码时间、文件大小和写入内存，需另外验证手机表现。后续 1.0.8 已按素材有效像素生成，最高 1080×1440，封面与视频同尺寸，用户随后确认手机发布没有问题。完整原始包见[1.0.8 归档](snapshots/酸汤の视频转实况-1.0.8.zip)。这一反馈不代表所有素材大小和客户端都通过；后续出现的存储配额与单次写入请求超限，详见[补充排查记录](docs/video-live.md)。

## 标题正文与话题

标题和正文可以通过 `title`、`content` 带入。正文里拼接 `#话题` 不保证它在编辑页变成蓝色原生话题。

[官方调酒小组件教程](https://miniapp.xiaohongshu.com/doc/DC072425)是静态图片发布示例，展示了小组件的 `tags` 等参数。它所属接口与离线 H5 小工具不同，不能把其中的上传方法、序列化方式和自动挂载能力整套混用。

shamsham 1.0.7 尝试传入逗号分隔的 `tags`。当前小工具公开文档没有列出该字段，本案例也没有确认它已转换成蓝色话题，因此最小示例不包含它。小工具自动挂载同样未在本案例完成验证。

## 验收范围

需要分别检查封面、视频、临时路径和原生编辑页。对照片或文字改变后生成的新内容，确认进入编辑页的仍是当前那一份素材，并验证取消、返回、再次发布和连续点击。

电脑模拟器、本地桥接替身、iOS 和 Android 的验证结果应分别记录。这个案例没有完整的双端设备矩阵，不能保证所有版本都一致。发布接口成功也不代表笔记最终审核通过。

本仓库提供方法、最小示例及用户确认可运行的[完整版本代码包](snapshots/README.md)。归档保留运行所需的默认素材和第三方授权，不包含账号凭证、登录状态或用户上传的私人照片。

