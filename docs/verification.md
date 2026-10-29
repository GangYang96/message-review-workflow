# 发布检查

检查日期：2026-10-29。

- Node.js 24.19.0：核心规则、非法输入、CLI 输出与文件保护测试通过，见 tests/。
- Edge / Playwright：独立 index.html 使用 file:// 打开，中文和英文的主要交互通过。
- 页面宽度 1440、768、390 像素：未发现横向溢出。
- 浏览器没有未处理的 JavaScript 异常。
- 此记录为本地验证；线上 GitHub Actions 的结果以仓库 Actions 页为准。

未验证：读屏器实际使用、Safari/iOS 兼容性、生产数据、并发与负载。
