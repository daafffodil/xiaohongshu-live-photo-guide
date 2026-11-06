(function (root) {
  'use strict';
  const plain = [
    '今天也有认真吃饭', '午后的风刚刚好', '在窗边多坐了一会儿', '散步时带回来一点晚霞', '刚好路过一树花开',
    '把喜欢的日常留一张', '热咖啡和慢下来的下午', '走一段没有计划的路', '今天的阳光落在桌上', '晚饭后再多绕一个弯',
    '早餐多加了一颗蛋', '买到了刚出炉的面包', '这一口留到最后再吃', '厨房里飘着炖汤的香气', '给自己盛了满满一碗',
    '冰箱里还有昨天的西瓜', '回家的路上买了一束花', '花瓶里的枝条又长高了', '窗台上新冒出两片叶子', '今天穿了最舒服的那件',
    '洗好的床单有太阳味', '晒着太阳翻了几页书', '书读到一半去泡了杯茶', '雨停之后开了一会儿窗', '听着雨声收拾了桌子',
    '楼下的猫又在老地方', '猫把靠窗的位置占走了', '和小狗一起等红灯', '路边的小花开得正好', '公园的长椅今天有空位',
    '绕远路看了一眼河边', '走到这里刚好起风了', '把耳机摘下来听听风', '云慢慢走过了屋顶', '等到了路灯亮起来',
    '天黑之前又拍了一张', '今天的晚霞有一点粉', '周末睡到了自然醒', '在家待着也很舒服', '约好的散步没有迟到',
    '和朋友分了一块蛋糕', '坐下来聊到茶都凉了', '路过的小店放着老歌', '听完这首歌再回家', '给今天拍一张合照',
    '把小票夹进了书里', '整理相册发现漏掉的照片', '桌上留着没画完的画', '把喜欢的杯子拿出来用', '今晚的月亮从窗边经过'
  ];
  function palette(context, width, height) {
    try {
      const pixels = context.getImageData(0, 0, width, height).data;
      let red = 0, green = 0, blue = 0, chroma = 0, count = 0;
      for (let i = 0; i < pixels.length; i += 256) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        red += r; green += g; blue += b; chroma += Math.max(r, g, b) - Math.min(r, g, b); count++;
      }
      if (!count) return '';
      if (chroma / count < 14) return '黑白';
      if (green > red * 1.12 && green > blue * 1.06) return '绿色';
      if (blue > red * 1.13 && blue > green * 1.04) return '蓝色';
      if (red > green * 1.18 && red > blue * 1.2) return '暖色';
    } catch (_) {}
    return '';
  }
  function note(settings) {
    const isStatic = settings.output === "static";
    const text = String(settings.text || '').replace(/\u00b7/g, ' ').trim();
    const modes = { flow: '逐字出现', float: '漂浮', wave: '波浪', orbit: '环绕', breathe: '呼吸', sway: '摇摆', bounce: '弹跳', path: '沿路径流动' };
    const mode = modes[settings.mode] || modes.flow;
    const topics = [
      { words: /吃|饭|餐|美食|咖啡|蛋糕|甜品|火锅|早餐|午餐|晚餐|面包|做菜/, title: '吃饭日常', tags: ['美食日常'] },
      { words: /旅行|旅游|出游|海边|度假|爬山|山顶|日落|看海/, title: '旅行记录', tags: ['旅行记录'] },
      { words: /猫|狗|宠物|小咪|小汪/, title: '宠物日常', tags: ['宠物日常'] },
      { words: /画画|插画|手绘|水彩|蜡笔|涂鸦/, title: '手绘记录', tags: ['插画分享'] },
      { words: /散步|公园|花|树|阳光|下雨|街道|周末/, title: '生活记录', tags: ['生活记录'] }
    ];
    const topic = topics.find(item => item.words.test(text));
    const embeddedTags = [];
    const caption = text.replace(/#([^\s#，。！？、,!?]+)/g, (_, tag) => { embeddedTags.push(tag); return ''; }).trim();
    const cleanTitle = caption.replace(/[，。！？、；：…“”‘’（）《》「」『』【】.,!?;:"'()[\]{}<>]/g, '').replace(/\s+/g, '');
    const generic = !cleanTitle || plain.includes(caption) || /^今天(?:拍到|收集到)的/.test(caption) || /^照片里的/.test(caption);
    const titleBase = topic ? topic.title : generic ? '照片文字' : cleanTitle;
    const suffix = isStatic ? '照片' : /live图$/i.test(titleBase) ? '' : 'live图';
    const title = Array.from(titleBase).slice(0, 20 - Array.from(suffix).length).join('') + suffix;
    const tags = ['shamsham', '小红书小工具', isStatic ? '静态图' : 'live图', isStatic ? '照片配字' : '动态文字'];
    const extras = embeddedTags.concat(topic ? topic.tags : ['照片配字']);
    extras.forEach(tag => {
      const clean = Array.from(tag.replace(/[^a-zA-Z0-9_\u3400-\u9fff]/g, '')).slice(0, 20).join('');
      if (clean && tags.indexOf(clean) < 0 && tags.length < 7) tags.push(clean);
    });
    const description = isStatic ? '用 shamsham 给照片加上了文字。' : '用 shamsham 给照片加上' + mode + '的文字，做成了一张live图。';
    const body = (caption ? caption + '\n\n' : '') + description;
    const hashtags = tags.map(tag => '#' + tag).join(' ');
    const publishBody = Array.from(body).slice(0, 1000 - Array.from(hashtags).length - 2).join('');
    return { title, body: publishBody, content: publishBody + '\n\n' + hashtags, tags };
  }
  let remaining = [];
  function randomCaption(current) {
    if (!remaining.length) {
      remaining = plain.slice();
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const value = remaining[i]; remaining[i] = remaining[j]; remaining[j] = value;
      }
    }
    let index = remaining.length - 1;
    if (remaining[index] === current && index > 0) index--;
    return remaining.splice(index, 1)[0];
  }
  root.ShamCaptions = {
    palette,
    note,
    random: randomCaption,
    suggest(color, index) {
      return plain[Math.abs(index || 0) % plain.length];
    }
  };
})(window);
