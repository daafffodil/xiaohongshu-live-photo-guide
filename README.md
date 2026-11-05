# 小红书小工具唤起发布页

记录 shamsham 从静态图发布到 live图发布的接入方法与排查过程。

适用于小红书创作服务平台里的离线 H5 小工具。资料核对日期为 2026-11-05。

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

由于缺少成功那次的原生调用日志，无法确定最终命中了哪一组参数，也无法把成功单独归因于文件写入或参数适配。复用时应从公开契约开始，一次只验证一组参数，不照搬历史版本的连续重试。

## 报错处理

| 现象 | 已知信息 | 处理方式 |
| --- | --- | --- |
| 点击完全无反应 | 可能没有绑定事件，或初始化与生成过程被阻塞 | 让核心按钮先绑定；生成、字体与文件写入分别显示状态和设置超时 |
| `10001` 和 `param=mediaInfo` | 原生侧拒绝媒体参数 | 保留完整错误；核对对象结构、字段名、资源路径，以及 SDK 是否已经负责序列化 |
| `slides resource too few` | 发布侧没有得到足够的可用素材 | 检查路径与视频解码；单独测试入口和字段；不能直接推断必须传两张图片 |
| 当前笔记发布中 | 原生发布流程可能仍被占用 | 停止自动重发；避免用后一次错误覆盖最早的失败原因 |

官方文档没有给出本案例 `slides resource too few` 的唯一原因，以上是排查方法，不是官方错误码释义。

shamsham 的按钮在 `postNote` 尚未结束时保持禁用。不要给发布页套一个短超时后自动解锁重发，用户可能仍在原生编辑页。文件生成与写入可以设超时；超时后的迟到回调必须终止，不能继续发布。

重试可以缓存当前图片和参数对应的临时路径，但路径不应跨会话长期保存。重新生成时使用新文件名，防止超时写入覆盖下一次任务。

## 标题正文与话题

标题和正文可以通过 `title`、`content` 带入。正文里拼接 `#话题` 不保证它在编辑页变成蓝色原生话题。

[官方调酒小组件教程](https://miniapp.xiaohongshu.com/doc/DC072425)是静态图片发布示例，展示了小组件的 `tags` 等参数。它所属接口与离线 H5 小工具不同，不能把其中的上传方法、序列化方式和自动挂载能力整套混用。

shamsham 1.0.7 尝试传入逗号分隔的 `tags`。当前小工具公开文档没有列出该字段，本案例也没有确认它已转换成蓝色话题，因此最小示例不包含它。小工具自动挂载同样未在本案例完成验证。

## 验收范围

需要分别检查封面、视频、临时路径和原生编辑页。对照片或文字改变后生成的新内容，确认进入编辑页的仍是当前那一份素材，并验证取消、返回、再次发布和连续点击。

电脑模拟器、本地桥接替身、iOS 和 Android 的验证结果应分别记录。这个案例没有完整的双端设备矩阵，不能保证所有版本都一致。发布接口成功也不代表笔记最终审核通过。

本仓库只提供方法、最小示例和已发布版本的函数记录，不包含账号凭证、个人照片或完整小工具上传包。

