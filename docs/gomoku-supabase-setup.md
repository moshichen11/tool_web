# 联机五子棋 Supabase 配置

## 1. 填写 Publishable key

打开 `src/supabase-config.js`，只填写 API Keys 页面中的 Publishable key：

```js
window.SUPABASE_CONFIG = Object.freeze({
  url: "https://xdrkgauohmyxgrmvakgk.supabase.co",
  publishableKey: "sb_publishable_这里替换为你的密钥",
});
```

不要填写 Secret key、`service_role` 或数据库密码。

## 2. 初始化数据库

1. 打开 Supabase Dashboard。
2. 进入 **SQL Editor**。
3. 新建查询。
4. 复制并执行 `supabase/migrations/202608150001_gomoku_multiplayer.sql` 的全部内容。

脚本会创建棋局表、私有玩家凭证表、RLS 策略、落子 RPC 和 Realtime 发布配置。重复执行是安全的。

## 3. 测试双人对战

1. 打开网站的“趣味 → 联机五子棋”。
2. 创建房间并复制邀请链接。
3. 使用另一台设备或无痕窗口打开邀请链接。
4. 输入不同昵称并加入房间。

同一个普通浏览器窗口会保存当前玩家身份，因此不适合同时模拟双方。
