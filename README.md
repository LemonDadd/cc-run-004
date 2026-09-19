# 汉字笔顺 · 临摹本

输入汉字，在浏览器中逐笔播放笔顺动画，并生成可打印 / 可导出 PDF 的临摹本（田字格、米字格、九宫格、描红、空白格）。

- **本地内置笔顺数据**：约 **9600 个**汉字（makemeahanzi / hanzi-writer-data），含每一笔的中线起止坐标与笔画类型（横、竖、撇、捺、点、折、提）。
- **逐笔动画**：SVG 路径绘制，`requestAnimationFrame` 控制进度，支持 播放 / 暂停 / 单步 / 循环 / 笔速调节 / 淡灰底字。
- **临摹本排版**：A4 分页，「示范 + 描红 + 空格」等多种模式，格子类型、描红浓度、每页行列可调。
- **导出**：浏览器打印（可直接另存 PDF）、jsPDF 导出多页 PDF、Canvas 导出 PNG。
- **字帖模板**：内置《千字文》（1000 字全不重复）《三字经》全文，可批量生成。
- **本地存储**：字帖 / 收藏 / 设置存 IndexedDB，支持整体导出 / 导入 JSON。
- **离线可用**：Service Worker 缓存全部资源与数据。
- **一键运行**：nginx Docker 镜像，`docker compose up --build`。

## 快速开始

### Docker（推荐）

```bash
docker compose up --build
# 浏览器访问 http://localhost:8080
```

### 本地静态服务器

数据与模块需经 HTTP 访问（不能直接双击 index.html）：

```bash
python3 -m http.server 8080
# 或 npx serve .
```

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 笔顺动画 | 输入单字 / 多字，按正确笔顺逐笔书写；米字格底；笔画类型图例随书写高亮 |
| 临摹本 | 选格子（田 / 米 / 九宫 / 空白）、模式（范+描+空 / 全描红 / 全空白）、描红浓度、行列数 |
| 模板 | 《千字文》《三字经》一键载入，支持全文批量生成 |
| 导出 | PDF（jsPDF，多页 A4）、PNG（每页一张）、浏览器打印 |
| 我的字帖 | 保存当前内容与排版；生成字帖 / 看笔顺 / 删除；JSON 导入导出 |
| 性能 | 100 字（500 格）生成约 30 ms；数据一次加载后缓存 |

## 目录结构

```
index.html              页面
css/style.css
sw.js                   Service Worker（离线）
src/
  data.js               笔顺数据加载（坐标 y 轴翻转）
  stroketype.js         笔画类型识别（横/竖/撇/捺/点/折/提）
  geometry.js           中线 → 可变宽度带状 SVG path（支持进度截断）
  charview.js           单字渲染进格子
  grids.js              田字格 / 米字格 / 九宫格 / 空白格
  player.js             rAF 动画播放器（暂停/单步/循环/调速）
  workbook.js           A4 分页排版
  exporter.js           PNG / PDF 导出
  templates.js          《千字文》《三字经》原文
  db.js                 IndexedDB + JSON 导入导出
  app.js                主控
data/strokes.json       本地笔顺数据（构建产物，6.5MB / gzip 2.4MB）
vendor/jspdf.umd.min.js jsPDF（离线）
scripts/build_data.py   由 hanzi-writer-data 重新构建数据
```

## 重新构建笔顺数据

数据已内置。若要从上游重新生成：

```bash
# 取得 hanzi-writer-data 的单字 JSON 目录后：
python3 scripts/build_data.py <解包目录>/package data/strokes.json
```

## 数据与字体版权

- 笔顺数据：[makemeahanzi](https://github.com/skishore/makemeahanzi) / hanzi-writer-data，源自文鼎开源字体（ARPHIC Public License，见 `data/ARPHICPL.TXT`）。
- 无笔顺数据的极生僻字自动退回系统楷体显示。
