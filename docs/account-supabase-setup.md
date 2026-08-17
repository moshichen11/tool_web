# Supabase 账号系统启用步骤

网页端代码已经接好，但数据库表、头像存储桶和安全规则必须在你的 Supabase 项目中执行一次后才能使用。

## 1. 执行数据库脚本

1. 登录 Supabase，打开项目 `tool-web-multiplayer`。
2. 左侧点击 **SQL Editor**。
3. 点击 **New query**。
4. 在 VS Code 打开 `supabase/migrations/202608160001_account_profiles_sync.sql`。
5. 全选并复制脚本，粘贴到 SQL Editor。
6. 点击 **Run**。如果出现安全提醒，确认脚本内容来自本项目后继续执行。

脚本会创建：

- `profiles`：昵称和头像路径；
- `user_app_state`：每个用户自己的导航、自选股、策略配置和趣味成绩；
- `avatars`：私有头像存储桶；
- RLS 规则：登录用户只能访问自己的数据。

## 2. 配置网站地址

1. Supabase 左侧打开 **Authentication**。
2. 进入 **URL Configuration**。
3. `Site URL` 填写正式网站：`https://kid1412.dpdns.org/`。
4. 在 `Redirect URLs` 中也加入：`https://kid1412.dpdns.org/**`。
5. 本地测试时再加入你的本地地址，例如 `http://127.0.0.1:5500/**`。

这样邀请邮件里的链接才能正确回到网站，并由网页读取登录会话。

## 3. 关闭公开注册

1. 打开 **Authentication → Sign In / Providers**。
2. 找到邮箱认证设置。
3. 关闭 **Allow new users to sign up**。
4. 保留邮箱登录开启。

网页本身没有注册按钮；关闭这个开关后，外部用户也不能直接调用公开注册接口创建账号。

## 4. 给用户发送邀请

1. 打开 **Authentication → Users**。
2. 点击 **Add user**。
3. 选择 **Send invitation**。
4. 填写用户邮箱并发送。
5. 用户打开邮件链接后进入网站，在 **设置 → 账号设置** 中设置新密码、昵称和头像。

不要把 Supabase Secret key 放进网页、GitHub 仓库或发给用户。网页只应使用 `Publishable key`。

## 5. 验证

1. 用邀请账号登录，修改昵称并添加一只自选股。
2. 点击“立即同步”，然后退出账号。
3. 确认退出后该账号的数据不再显示。
4. 在另一台电脑登录同一账号，确认昵称和自选股恢复。
5. 登录另一个账号，确认看不到第一个账号的个人数据。

股市的通行密码属于独立的本机解锁状态，不会上传到账号云端，也不会因登录账号而自动解锁。
