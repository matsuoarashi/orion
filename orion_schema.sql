-- 洋食オリオン 運営アプリ  初期スキーマ v1
-- Supabase SQL Editor に貼って Run（何度実行しても壊れないようにしてあります）

create extension if not exists pgcrypto;

-- ===== 店舗・設定 =====
create table if not exists stores (
  id text primary key,                  -- 'kanda'
  name text not null,
  open_time text not null default '11:00',
  close_time text not null default '14:00',   -- 営業終了（後で15:00等に変更可）
  leave_time text not null default '15:15',   -- 退勤目安
  change_fund int not null default 20000,     -- 釣銭準備金
  fridge_warn numeric not null default 8,     -- 冷蔵 警告℃
  fridge_max numeric not null default 10,     -- 冷蔵 基準℃
  freezer_warn numeric not null default -15,  -- 冷凍 基準℃
  paypay_enabled boolean not null default true,
  alert_email text,
  created_at timestamptz default now()
);
insert into stores (id, name, alert_email) values ('kanda', '洋食オリオン 神田淡路町', 'orion.napolitan@gmail.com')
on conflict (id) do nothing;

-- ===== 担当者 =====
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  name text not null,
  role text not null default 'staff' check (role in ('staff','admin')),
  pin_hash text not null,              -- sha256(pin + salt)  salt は 'orion'
  pin_initial boolean not null default true,   -- 0000 のまま = true
  active boolean not null default true,
  sort int not null default 100,
  created_at timestamptz default now(),
  unique (store_id, name)
);
-- 初期PIN 0000 : sha256('0000orion')
insert into staff (store_id, name, role, pin_hash, sort) values
 ('kanda','松尾','admin', encode(digest('0000orion','sha256'),'hex'), 1),
 ('kanda','長下','admin', encode(digest('0000orion','sha256'),'hex'), 2),
 ('kanda','喜田','staff', encode(digest('0000orion','sha256'),'hex'), 3),
 ('kanda','大崎','staff', encode(digest('0000orion','sha256'),'hex'), 4),
 ('kanda','リザ','staff', encode(digest('0000orion','sha256'),'hex'), 5)
on conflict (store_id, name) do nothing;

-- ===== 商品 =====
create table if not exists products (
  id text primary key,                 -- 'orion','orion_half',...
  store_id text not null references stores(id),
  name text not null,
  label text not null,                 -- ボタン表示（| で改行）
  price int not null,
  category text not null check (category in ('meal','drink','other')),
  takeout boolean not null default false,   -- 持ち帰りタブに出すか
  noodle numeric not null default 0,        -- 茹で麺 消費量(玉)
  sort int not null default 100,
  active boolean not null default true
);
insert into products (id, store_id, name, label, price, category, takeout, noodle, sort) values
 ('orion','kanda','オリオン','オリオン',1000,'meal',true,1,1),
 ('orion_half','kanda','オリオン ハーフ','オリオン|ハーフ',800,'meal',true,0.5,2),
 ('nashi','kanda','ナシナシ','ナシナシ',800,'meal',true,1,3),
 ('nashi_half','kanda','ナシナシ ハーフ','ナシナシ|ハーフ',600,'meal',true,0.5,4),
 ('cola','kanda','コカ・コーラ','コカ・コーラ',300,'drink',false,0,5),
 ('cola_zero','kanda','コカ・コーラ ゼロ','コカ・コーラ|ゼロ',300,'drink',false,0,6),
 ('ginger','kanda','ジンジャーエール','ジンジャー|エール',300,'drink',false,0,7),
 ('lager','kanda','キリンラガー 小瓶','キリンラガー|小瓶',500,'drink',false,0,8),
 ('oribako','kanda','折箱','折箱',0,'other',false,0,9),
 ('makanai','kanda','賄い','賄い',0,'other',false,1,10)
on conflict (id) do nothing;

-- ===== 会計（追記のみ） =====
create table if not exists sales (
  id uuid primary key,                 -- 端末生成（同じIDは無視 = 二重登録防止）
  store_id text not null references stores(id),
  ts timestamptz not null,
  biz_date date not null,
  staff_name text,
  mode text not null check (mode in ('店内','持ち帰り','練習')),
  items jsonb not null,                -- [{id,name,price,qty}]
  total int not null,
  payment text not null default 'cash' check (payment in ('cash','paypay')),
  tender int,
  void_of uuid,                        -- 取消なら元の会計id
  reason text,
  device text,
  created_at timestamptz default now()
);
create index if not exists sales_store_date on sales (store_id, biz_date);

-- ===== 現金の出入り（支出・両替・釣銭補充・回収・入金） =====
create table if not exists cash_moves (
  id uuid primary key,
  store_id text not null references stores(id),
  ts timestamptz not null,
  biz_date date not null,
  staff_name text,
  kind text not null check (kind in ('expense','change','prep','collect','deposit')),
  amount int not null,
  payee text,
  memo text,
  has_slip boolean,
  created_at timestamptz default now()
);

-- ===== リスト項目の定義（開店前/営業中/閉店後/週次/月次） =====
create table if not exists task_defs (
  id text primary key,
  store_id text not null references stores(id),
  phase text not null check (phase in ('open','during','close','weekly','monthly')),
  sort int not null,
  label text not null,
  type text not null default 'check' check (type in ('check','temp','cash','text','clock_in','clock_out','handoff','sync')),
  manual_key text,                     -- マニュアルのページキー
  config jsonb default '{}',           -- 温度なら {"targets":[...]} など
  active boolean not null default true
);
insert into task_defs (id, store_id, phase, sort, label, type, manual_key, config) values
 ('clock_in','kanda','open',10,'出勤する','clock_in',null,'{}'),
 ('handoff','kanda','open',20,'昨日の引継ぎを読む','handoff',null,'{}'),
 ('health','kanda','open',30,'体調・手指・手洗い','check','hygiene','{}'),
 ('change_fund','kanda','open',40,'釣銭を確認','cash','regi','{"expect":"change_fund"}'),
 ('temps','kanda','open',50,'冷蔵庫・冷凍庫・コールドテーブルの温度','temp','hygiene','{"targets":[{"key":"fridge","label":"冷蔵庫","kind":"fridge"},{"key":"freezer","label":"冷凍庫","kind":"freezer"},{"key":"coldtable","label":"コールドT","kind":"fridge"}]}'),
 ('utilities','kanda','open',60,'ガス・水道・換気','check',null,'{}'),
 ('prep_check','kanda','open',70,'前夜の仕込み（麺・ソース）を確認','check','cooking','{}'),
 ('floor_open','kanda','open',80,'客席・トイレ・看板・レジ起動','check','service','{}'),
 ('count_cash','kanda','close',10,'現金を数える','cash','regi','{"diff_reasons":["釣銭ミス","登録し忘れた支出","わからない"]}'),
 ('collect','kanda','close',20,'釣銭を残して売上金を袋へ','check','regi','{}'),
 ('kitchen_close','kanda','close',30,'厨房：器具・コンロ・作業台・冷蔵庫','check','hygiene','{}'),
 ('floor_close','kanda','close',40,'客席・トイレ・ゴミ・納品書をポケットへ','check',null,'{}'),
 ('daily_note','kanda','close',50,'今日の一言（困ったこと・明日へ）','text',null,'{}'),
 ('lockup','kanda','close',60,'ガス・水道・電源・施錠','check','trouble','{}'),
 ('clock_out','kanda','close',70,'退勤する','clock_out',null,'{}'),
 ('grease_trap','kanda','weekly',10,'グリストラップ清掃','check','hygiene','{"dow":6}'),
 ('hood','kanda','monthly',10,'換気フード清掃','check','hygiene','{"day":1}'),
 ('pest','kanda','monthly',20,'害虫チェック','check','hygiene','{"day":1}')
on conflict (id) do nothing;

-- ===== リストの実績（誰が・いつ・何を・値） 追記のみ =====
create table if not exists task_logs (
  id uuid primary key,
  store_id text not null references stores(id),
  biz_date date not null,
  task_id text not null,
  staff_name text,
  ts timestamptz not null,
  value jsonb,                          -- {"fridge":4.0,...} / {"counted":64350,"expected":64850,"reason":"釣銭ミス"} / {"text":"..."}
  alert boolean not null default false, -- 基準超え・差異あり など
  skipped_by text,                      -- 管理者スキップ
  created_at timestamptz default now()
);
create index if not exists task_logs_store_date on task_logs (store_id, biz_date);

-- ===== 報告（売切れ・不足・設備）と引継ぎ =====
create table if not exists reports (
  id uuid primary key,
  store_id text not null references stores(id),
  ts timestamptz not null,
  biz_date date not null,
  staff_name text,
  kind text not null check (kind in ('soldout','stock_low','stock_order','equipment','handoff','delivery')),
  item text,
  detail text,
  priority text default 'normal' check (priority in ('normal','check','urgent')),
  ack_by text,
  ack_ts timestamptz,
  created_at timestamptz default now()
);

-- ===== 出退勤 =====
create table if not exists clocks (
  id uuid primary key,
  store_id text not null references stores(id),
  staff_name text not null,
  biz_date date not null,
  kind text not null check (kind in ('in','out')),
  ts timestamptz not null,
  device text,
  created_at timestamptz default now()
);

-- ===== シフト（希望と確定） =====
create table if not exists shift_requests (
  id uuid primary key,
  store_id text not null references stores(id),
  staff_name text not null,
  day date not null,
  pref text not null check (pref in ('ok','maybe','ng')),
  memo text,
  ts timestamptz not null,
  unique (store_id, staff_name, day)
);
create table if not exists shifts (
  id uuid primary key,
  store_id text not null references stores(id),
  staff_name text not null,
  day date not null,
  start_time text not null default '10:15',
  end_time text not null default '15:15',
  published boolean not null default false,
  unique (store_id, staff_name, day)
);
create table if not exists shift_periods (   -- 「11月の希望 締切10/20」
  store_id text not null references stores(id),
  month text not null,                        -- '2026-11'
  deadline date,
  published boolean not null default false,
  primary key (store_id, month)
);

-- ===== 研修 =====
create table if not exists training_defs (
  id text primary key,
  store_id text not null references stores(id),
  sort int not null,
  label text not null,
  steps jsonb not null                        -- [{"key":"read","label":"マニュアルを読んだ","by":"self"},{"key":"verify","label":"...","by":"admin"}]
);
insert into training_defs (id, store_id, sort, label, steps) values
 ('t1','kanda',1,'お店のこと・商品・ルール','[{"key":"read","label":"マニュアルを読んだ","by":"self"},{"key":"verify","label":"管理者に説明できた","by":"admin"}]'),
 ('t2','kanda',2,'衛生（手洗い・温度・保存）','[{"key":"read","label":"マニュアルを読んだ","by":"self"},{"key":"verify","label":"管理者の前で温度記録をやった","by":"admin"}]'),
 ('t3','kanda',3,'接客（注文票・提供・持ち帰り）','[{"key":"read","label":"マニュアルを読んだ","by":"self"},{"key":"verify","label":"管理者の前で接客した","by":"admin"}]'),
 ('t4','kanda',4,'レジ（現金・PayPay・取消）','[{"key":"read","label":"マニュアルを読んだ","by":"self"},{"key":"practice","label":"練習モードで会計を5回やった","by":"auto","count":5},{"key":"verify","label":"管理者の前で本番会計を3回やった","by":"admin"}]'),
 ('t5','kanda',5,'調理（麺・ソース・4商品）','[{"key":"read","label":"マニュアルを読んだ","by":"self"},{"key":"verify","label":"管理者と一緒に1日作った","by":"admin"}]'),
 ('t6','kanda',6,'開店（リストを1人で通す）','[{"key":"verify","label":"1人で開店リストを完了した","by":"admin"}]'),
 ('t7','kanda',7,'閉店（現金締めまで1人で通す）','[{"key":"verify","label":"1人で閉店リストを完了した","by":"admin"}]')
on conflict (id) do nothing;

create table if not exists training_logs (
  id uuid primary key,
  store_id text not null references stores(id),
  staff_name text not null,
  training_id text not null,
  step_key text not null,
  done_by text,
  ts timestamptz not null,
  unique (store_id, staff_name, training_id, step_key)
);

-- ===== マニュアル =====
create table if not exists manuals (
  key text primary key,                  -- 'regi','cooking','service','hygiene','trouble','about'
  store_id text not null references stores(id),
  title text not null,
  body_md text not null default '',
  media_url text,
  sort int not null default 100,
  updated_by text,
  updated_at timestamptz default now()
);
insert into manuals (key, store_id, title, sort) values
 ('about','kanda','お店のこと',1),('cooking','kanda','調理',2),('service','kanda','接客',3),
 ('regi','kanda','レジ',4),('hygiene','kanda','衛生',5),('trouble','kanda','困ったとき',6)
on conflict (key) do nothing;

-- ===== 権限：ログイン済み（店アカウント）のみ読み書き可 =====
do $$
declare t text;
begin
  foreach t in array array['stores','staff','products','sales','cash_moves','task_defs','task_logs','reports','clocks','shift_requests','shifts','shift_periods','training_defs','training_logs','manuals']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_all on %I', t);
    execute format('create policy auth_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ===== 集計ビュー（管理者画面・日報用） =====
create or replace view v_daily as
select store_id, biz_date,
  count(*) filter (where void_of is null and mode <> '練習') as sales_count,
  coalesce(sum(total) filter (where void_of is null and mode <> '練習'),0) as sales_total,
  coalesce(sum(total) filter (where void_of is null and mode <> '練習' and payment='cash'),0) as cash_total,
  coalesce(sum(total) filter (where void_of is null and mode <> '練習' and payment='paypay'),0) as paypay_total,
  count(*) filter (where void_of is null and mode='店内') as eatin_count,
  count(*) filter (where void_of is null and mode='持ち帰り') as togo_count
from sales group by store_id, biz_date;
