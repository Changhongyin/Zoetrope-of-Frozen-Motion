# 提交清单 · Submission map

## 作品名称
**走马灯 —— 把一段 AI 动画冻成一圈雕塑**

## 作品简介（94 字）
可亲手转动的网页3D走马灯：动画被冻成一圈静止雕塑，打开快门才“活”过来，每帧可导出STL打印。给动画爱好者和3D打印玩家。角色、宫灯、绑骨、动作与打印文件均由Aholo Lux3D生成。

## 表单字段 → 文件

| 表单字段 | 填什么 | 文件 / 状态 |
| --- | --- | --- |
| 完整 Demo / 宣传视频（二选一） | 推荐「上传视频文件」 | `deliverables/video/zoumadeng_demo_1080p60.mp4`（130 MB，1920×1080，60 fps，78 秒，H.264，无音轨）。如上传有体积限制，用 `zoumadeng_demo_1080p60_compact.mp4`（47 MB，同分辨率同帧率，由前者二次压缩）。 |
| 同上，若想填 Demo 链接 | 需要先发布 | 把 `deliverables/zoumadeng_demo-web.zip`（33 MB，纯静态文件）解压上传到魔搭创空间或任意静态托管，入口为 `index.html`。**目前没有公网链接**，`localhost` 不能填。 |
| 项目报告书 | 上传文件 | `deliverables/report/zoumadeng_project-report.pdf`（7 页，3 MB） |
| 生态合作设备 / 技术使用情况 | **无** | 未使用任何合作方设备或技术。 |
| 应用赛道（1～3 项） | 建议：**3D 打印应用奖**；可加选 **游戏应用奖** | 3D 打印：作品直接产出水密的 STL / 3MF（见 `deliverables/print/`），但尚未打印实物，报告中已说明。游戏：可交互的网页玩具，契合度较弱，是否勾选由你决定。影视、空间设计、具身智能不适用。 |
| 项目源码（加分项，压缩包 ≤ 500 MB） | 上传压缩包 | `deliverables/zoumadeng_source-code.zip`（118 MB：源码、全部 Lux3D 原始产物与任务账本、README、API 规范） |
| 小红书链接（加分项） | 未发布 | 需要你本人账号发布并带 #Aholo黑客松。 |
| 「我确认作品使用 Aholo Lux3D 完成，且可运行、可演示」 | 属实 | 7 个 Lux3D 任务，ID 见 README 与报告第 3 页。 |

## 打印文件（deliverables/print/）
- `lux3d_export_rest-pose_80mm.stl`、`lux3d_export_rest-pose.3mf`：Lux3D 多格式导出（任务 6663902）
- `zoumadeng_Jog_Fwd_Loop_pose01…22_80mm.stl`：奔跑循环的 22 帧，每尊高 80 mm，均通过边流形（水密）检查
- `zoumadeng_Jog_Fwd_Loop_ring22_180mm.stl`：整圈带底盘，直径 180 mm（48 MB）

## 已核实 / 未核实
- 已核实：视频规格（ffmpeg 探测）、PDF 逐页版式、Demo 从共享目录和从 zip 解压后均可运行、共享目录内无 API 密钥。
- 未能核实：官方规则页是前端渲染，无法抓取。评分权重、截止时间（11 月 19 日 19:00）、赛道列表、源码包 500 MB 上限均来自你提供的截图；年份与时区、视频和报告的上传体积上限未确认。提交时请以表单实际提示为准。

## 需要你本人完成的外部动作
1. 在比赛表单上传并提交（含勾选两项声明）。
2. 如需公开 Demo 链接：发布到魔搭创空间，并在未登录的浏览器里打开验证。
3. 如需传播加分：发布小红书笔记。
