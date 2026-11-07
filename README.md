# 把心事轻轻放下

谁都能来。不表演，不诊断。放下，就可以走。

一个纯前端页面。写下的字只留在当次输入框里，点「放下」后即丢弃，不进入数据库、localStorage、IndexedDB，也不会发到网络。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端里给出的本地地址。

路径：入口 → 写下 → 放下 → 确认。确认后可以离开，回到入口；也可以「再放一条」，回到空的输入框。没有注册，没有账号。

## 构建

```bash
npm run build
```

构建结果在 `dist/`。需要预览时：

```bash
npm run preview
```

## 公开页面

推到 `main` 后，GitHub Actions 会构建并发布到：

https://zhangbin19850305-creator.github.io/xinshi-fangxia/

Pages 构建使用站点前缀 `/xinshi-fangxia/`。本地 `npm run dev` 仍在 `/`。没有后端，页面内容默认不保存。

仓库管理员需要先在 Settings → Pages 里把 Source 设为 GitHub Actions。当前的 Actions 令牌只能部署，不能代替管理员打开 Pages。
