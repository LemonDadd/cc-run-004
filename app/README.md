# 汉字笔顺 · 临摹本生成器

输入一个汉字，在浏览器里把它拆解成笔画、按正确笔顺逐笔播放动画，并生成可打印的临摹本（田字格 / 米字格 / 描红 / 空白格）。纯静态站点，数据全部内置在容器里，离线可用。

## 功能

- **笔顺动画**
  - 内置 9500+ 个汉字的笔顺数据（SVG 路径 + 每笔中位数坐标），覆盖 GB2312 全部常用字、次常用字及大量繁体/古文字形
  - SVG 路径逐笔绘制，`requestAnimationFrame` 控制进度
  - 播放 / 暂停 / 上一笔 / 下一笔 / 循环 / 进度拖动，笔速 0.25×–3× 可调
  - 笔画按「横、竖、撇、捺、点、折」六类着色拆解（依据中位数几何自动判别）
  - 可开关字形底影、底影浓度、笔锋轨迹
  - 多字连续浏览、拼音标注、单字 PNG 导出、收藏单字
- **字帖模板**
  - 《千字文》《三字经》《百家姓》《弟子规》原文顺序字帖，常用字（GB2312 一级 3755 字）/ 次常用字（二级 3008 字）字表
  - 任意起止区间、自定义文本（按字表去重或按原文顺序保留重复字）
- **临摹本（A4）**
  - 田字格 / 米字格 / 空白格，首格描红可选田/米/无格底
  - 描红浓度 5%–80%、每字练习格数、格子大小、拼音标注、标题
  - 浏览器矢量打印（打印对话框可直接「另存为 PDF」）、jsPDF 下载多页 PDF、导出 PNG
- **本地数据**：字帖、收藏、设置均存浏览器 IndexedDB，不上传任何服务器；支持导出 / 导入 JSON 备份
- **离线**：Service Worker 缓存应用外壳与数据分片；设置页可一键预下载全部字库（约 29MB）

## 快速运行（Docker）

```bash
docker compose up --build
```

打开 <http://localhost:8080>。数据完全留在浏览器，容器只提供静态文件。

停止：

```bash
docker compose down
```

## 不使用 Docker（任意静态服务器）

```bash
cd web
python3 -m http.server 8080
# 或： npx serve -l 8080 .
```

> 需要通过 HTTP 访问（Service Worker、fetch 分片、IndexedDB 在 `file://` 下不可用）。

## 目录结构

```
app/
├── Dockerfile              # nginx:alpine 静态托管
├── docker-compose.yml      # 一键运行（映射 8080）
├── nginx.conf              # 缓存 / gzip / SPA 回退
└── web/
    ├── index.html
    ├── sw.js               # 离线缓存
    ├── manifest.webmanifest
    ├── css/app.css
    ├── vendor/jspdf.umd.min.js
    ├── js/
    │   ├── data.js         # 分片加载、路径解码、笔画分类
    │   ├── animator.js     # SVG 场景 + rAF 播放器
    │   ├── sheet.js        # A4 临摹本排版 + PNG/PDF/打印
    │   ├── db.js           # IndexedDB（字帖/收藏/设置）
    │   └── app.js          # 界面逻辑
    └── data/
        ├── manifest.json   # 98 个坐标分块的清单（9565 字）
        ├── cXXXX.json      # 按码位分块的紧凑笔顺数据（按需加载）
        ├── primers.json    # 四书经典 1653 字子集包（批量生成秒开）
        ├── templates.json  # 模板字表（去重）
        ├── sequences.json  # 经典原文顺序序列（含重复）
        └── pinyin.json     # 拼音
```

## 数据格式与构建

每笔数据编码为紧凑整数数组：`[图元类型, 坐标…, -1, 中位数x,y…, -2, …]`，图元类型 `0=M 1=L 2=Q 3=C 4=Z`，坐标系 1024×1024（y 轴向上，渲染时垂直翻转）。中位数按收笔→起笔存储，动画绘制时反转以呈现正确运笔方向。

数据来自开源项目：

- [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) / [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)（LGPL / Arphic Public License）
- 启蒙经典文本来自 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)（蒙学目录），繁简映射用 OpenCC `TSCharacters.txt`

重新构建数据（数据准备脚本在仓库外的 `tools/`，容器内只含产物）：

```bash
node tools/build.js
```

## 验收对照

| 验收项 | 实现 |
| --- | --- |
| 常用字笔顺动画正确 | 9565 字内置；中位数反向 + y 轴翻转，运笔方向与字形经逐字渲染核对 |
| 临摹本可导出可打印 | A4 SVG 排版；浏览器打印另存 PDF、jsPDF 多页 PDF、PNG 导出 |
| 批量 100 字生成 < 2s | 经典模板经 `primers.json` 单包加载，实测数据+排版约 0.1–0.3s |
| 离线可用 | Service Worker 缓存外壳/分片，设置页一键预下载全部字库 |
| Docker 一键可跑 | `docker compose up --build`，nginx 托管，端口 8080 |
