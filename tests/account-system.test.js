const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const accountSource = fs.readFileSync(path.join(root, "src", "account-system.js"), "utf8");
const gomokuSource = fs.readFileSync(path.join(root, "src", "fun-games", "gomoku.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "202608160001_account_profiles_sync.sql"), "utf8");
const buildSource = fs.readFileSync(path.join(root, "scripts", "build-production.mjs"), "utf8");

test("account UI supports invited-user login without public registration", () => {
  assert.match(html, /src\/account-system\.js/);
  assert.match(html, /账号设置/);
  assert.match(html, /管理员邀请的邮箱账号登录/);
  assert.match(accountSource, /auth\.signInWithPassword/);
  assert.doesNotMatch(accountSource, /auth\.signUp/);
  assert.doesNotMatch(html, /data-account-sign-up/);
  assert.match(html, /accountView\?\.dataset\.accountView === "signed-out" && expectedView === "loading"/);
});

test("account profile supports nickname avatar password and sign out", () => {
  assert.match(html, /data-account-save-profile/);
  assert.match(html, /保存头像和昵称/);
  assert.match(html, /data-account-avatar-preview/);
  assert.match(html, /URL\.createObjectURL\(file\)/);
  assert.match(html, /data-account-update-password/);
  assert.match(html, /data-toggle-password="accountPassword"/);
  assert.match(html, /data-toggle-password="accountNewPassword"/);
  assert.match(html, /data-toggle-password="accountConfirmPassword"/);
  assert.match(html, /重置密码/);
  assert.match(html, /无法查看当前密码/);
  assert.match(html, /data-account-sign-out/);
  assert.match(accountSource, /storage\.from\("avatars"\)\.upload/);
  assert.match(accountSource, /auth\.updateUser\(\{ password:/);
  assert.match(accountSource, /avatarFile\.size > 2 \* 1024 \* 1024/);
});

test("settings uses separate account navigation and silent local status updates", () => {
  assert.match(html, /data-settings-view="account"/);
  assert.match(html, /data-settings-view="navigation"/);
  assert.match(html, /data-settings-view="unlock"/);
  assert.doesNotMatch(html, /data-account-sync(?:\s|>)/);
  const actionStart = html.indexOf("async function runAccountAction");
  const actionEnd = html.indexOf("function handleAccountLogin", actionStart);
  const actionBlock = html.slice(actionStart, actionEnd);
  assert.doesNotMatch(actionBlock, /renderSettingsPage/);
  assert.match(html, /updateAccountStatusView\(accountState\)/);
});

test("account initialization ignores duplicate auth events and prevents reload loops", () => {
  assert.match(accountSource, /event === "INITIAL_SESSION"\) return/);
  assert.match(accountSource, /event === "SIGNED_IN" && nextSession\?\.user\?\.id === activeUserId/);
  assert.match(accountSource, /keys\.sort\(\)\.forEach/);
  assert.match(html, /glass_nav_last_data_reload/);
  assert.match(html, /now - Number\(previous\.time \|\| 0\) < 5000/);
});

test("personal app state is isolated by authenticated RLS policies", () => {
  assert.match(migration, /alter table public\.profiles enable row level security/);
  assert.match(migration, /alter table public\.user_app_state enable row level security/);
  assert.match(migration, /auth\.uid\(\)\) = user_id/);
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.match(accountSource, /glass_nav_stock_watchlist/);
  assert.match(accountSource, /glass_nav_fun_games_v1/);
  assert.doesNotMatch(accountSource, /glass_nav_stocks_unlocked/);
});

test("gomoku uses the signed-in account nickname and shared Supabase client", () => {
  assert.match(html, /getPlayerName:\s*\(\) => AccountSystem\.getDisplayName\(\)/);
  assert.match(html, /getClient:\s*\(\) => AccountSystem\.getClient\(\)/);
  assert.match(gomokuSource, /getAccountName\(\) \|\| getInputValue/);
  assert.match(gomokuSource, /设置 → 账号设置/);
});

test("stock access remains separately locked and account code is production protected", () => {
  assert.match(html, /<h1>解锁功能<\/h1>/);
  assert.doesNotMatch(html, /管理股市入口|显示股市入口|股市功能已解锁/);
  assert.match(html, /const STOCKS_UNLOCKED_KEY = "glass_nav_stocks_unlocked"/);
  assert.match(buildSource, /"src\/account-system\.js"/);
});
