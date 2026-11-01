# 洋食オリオン アプリ構成と更新ルール（2026/11/01）

複数の Claude のスレッドがこのリポジトリと同じ Apps Script を更新している。上書き事故を防ぐため、更新前にこのファイルを読むこと。

## 1. アプリ（使う人ごとに 3 つ＋お客様用）

| 入口 | ファイル | 使う人・端末 | 中身 |
| --- | --- | --- | --- |
| 管理者アプリ | kanri.html（ホーム画面名「管理者」manifest-kanri.json） | 松尾・長下（管理者） | 締め・分析／発注／経費／スタッフ・シフトを切り替え。中は下の各画面を埋め込み |
| スタッフアプリ | staff/index.html（URL は /orion/staff/。ホーム画面の「勤怠」） | スタッフ個人のスマホ | 打刻・連絡・希望・シフト・履歴・聞く。ホームの「店の仕事」から在庫・受け取り・締め・報告 |
| 店舗（レジ） | index.html | 店の端末 | 会計・テイクアウト（予約受付・プリンター・通知）・来店カウント。締めは予備として残す |
| お客様 | order.html | お客様 | テイクアウト予約 |

画面ファイル（単体でも開けるが、入口は上の 3 つ）：

| ファイル | 役割 | 主な入口 |
| --- | --- | --- |
| dashboard.html | 締め確認・分析・人タブ（質問・メール候補・契約期限） | 管理者アプリ |
| hacchu.html | 在庫・発注・受け取り（1 画面に ①数える ②発注 ③届く）。発注計画は画面側で計算 | 管理者アプリ／スタッフアプリ（../hacchu.html?from=staff#chef/#hall/#recv/#report） |
| shime.html | スタッフの締め（締めた人を記録） | スタッフアプリ |
| keihi.html | 経費（レシート・請求書） | 管理者アプリ |
| staff/admin.html | スタッフ・シフト・給与・お知らせ・設定（staff フォルダにある） | 管理者アプリ |
| start.html | 出店（ORION START）：案件一覧・案件詳細（試算・凍結・評価・現地調査）・物件Inbox・神田の基準値 | 管理者アプリ「出店」 |
| busy.js | 共通ローディング。通信中の二重タップ防止（書き込み中は画面にふた、読み込みは上に細いバー） | 各画面の最初の script で読む |

※ 転送ページ：orders.html → レジのテイクアウト（index.html#takeout）、app.html（旧 Supabase 版）→ レジ。旧アイコン（分析・発注・経費・管理）はホーム画面から開くと管理者アプリへの案内が出る（busy.js）
※ staff_index.html は staff/ へ移動するだけの転送ページ。スタッフアプリの修正は staff/index.html に入れる

## 2. サーバー（Apps Script）

- 分析 GAS（レジ・分析・発注・経費・ORION OS）：1 ファイル（コード.gs）。デプロイ AKfycbzFNl4…OVUg
- STAFF GAS（勤怠・スタッフ・シフト）：別プロジェクト。デプロイ AKfycbwgGW6…PLc7c
- 収集スクリプト（orion.napolitan@gmail.com）：collector.gs

分析 GAS コード.gs の並び（上から）：

1. 本体（doPost / doGet ほか）
2. `// ===== ORION OS 台帳（Facts` から `// ===== ORION OS END` まで：facts.gs + mail.gs + ledgers.gs
3. `// ===== ORION OS END` より下：別ファイルの追加分（stocktake.gs など。同名関数は後ろが勝つ）
   - start.gs（ORION START）もここ。`// ===== ORION START v0.1` 〜 `// ===== ORION START END` を丸ごと差し替える。関数はすべて start 接頭辞

## 3. 更新ルール

1. **アップロード前に main の最新コミットを確認**し、自分が持っているファイルが最新を土台にしているか確かめる。違えば最新を取得して差分を入れ直す（丸ごと上書きしない）
2. **GAS は範囲を決めて差し替える**。ORION OS ブロックは「開始の目印〜END の目印」の間だけを差し替える。ファイル末尾までの一括置換はしない
3. GAS の末尾に追加するファイル（stocktake.gs など）は END の目印より下に置き、GitHub の同名ファイルと一致させる
4. GAS を変えたら「新バージョン」でデプロイし、変えた .gs を GitHub にも上げる
5. 担当の目安：発注計画・在庫マスター（hacchu.html の発注計画部分、stocktake.gs）は在庫スレッド。入口の統合・締め・ORION OS（facts/mail/ledgers）・分析は統合スレッド。相手の担当部分を変えるときは、最新を取得してから小さく足す

## 4. 2026/11/01 の事故記録

- 統合スレッドが hacchu.html を 2 回丸ごと上げ、在庫スレッドの発注計画（710f416・85f458a）を消した → 85f458a を土台に再適用して復旧
- 統合スレッドの GAS 末尾一括置換で stocktake.gs の追加分が消えた → END の目印の下に戻して復旧（v57）

## 5. 分析 GAS の変更履歴（11/1 夜）

- v58：価格に「単価状態（確定）」と税抜価格を保存（invPriceSave_）
- v59：発注アプリの価格追加・編集が動いていなかった取り付け漏れを修正（handleInvPost に inv_price_save / inv_price_delete）
- v60：納品済みの発注をもう一度「届いた」にしても在庫を足さない（invOrderUpdate_）
- v61：doGet に `mode=day_lite`（今日の売上と今日の締めだけ。スマホの締め画面用・約3秒）を追加。会計の受信は、シートに書けた後で二重送信ガードの印を付け、失敗時は "error" を返す（レジはそれを見て送り直す）
- コード.gs 本体（doGet / doPost / dayLite_）は GitHub に控えがない。変えたらここに書く
- v62：未回答の質問を決まりを作らずに閉じる `os_q_close`、os_home に承認待ちの決まり `pendingKnow` を追加（facts.gs）
- v63：`day_lite` に PayPay 取引メールの今日の合計（ppMail）と `date=yyyy/MM/dd`（過去日の確認用）を追加。商品原価（COSTS）を最新の仕入価格で改定

- v65：staffing.gs を ORION OS END の下に追加。日別人件費は STAFF の勤怠シートから直接計算（人件費(STAFF) タブ＝IMPORTRANGE は退勤時に書かれた日次表で、あとから承認・修正した勤怠が入らないため）。doGet の pnl.laborDaily を上書き
- v66：rebuildPnl（月次損益）と開業費の研修費も stfLaborRows_ で勤怠から計算。人が足りない日のメール通知 stfShortNotify（毎日17時・3週間先まで、送り先 orion.napolitan@gmail.com）

- v67：一度きりの修正・調査用の関数 23本を削除（applyPayPay・fixToday1015・importExpenses20261028 など。全文は v66 に残る）。rc_home に日付が空の登録 undated を追加（経費アプリの一覧の上に出す）
- v68：発注先一覧の編集 inv_supplier_save（管理者。仕入先シートの1行を業者名で更新）
- 在庫スレッドの一度きりの関数（invSeedMaster・invApply20261101・invFix20261101b）は在庫スレッドの担当なので残している

- 11/1 夜：古い「利益」シート（原価が手入力の旧値）と「経費」シートの見本行（（例）食材 ○○商店・0円）を削除。利益シートを書いていた rebuildProfit も削除（保存のみ・デプロイ v68 のまま）

## 6. 原価（COSTS）の根拠

- 金額は公開リポジトリに書かない。材料ごとの量・単価・合計は Drive「オリオン 原価・仕入価格（非公開）」 にある（松尾のみ）
- 計算式は分析 GAS の COSTS（オリオン＝ナシナシ＋ハンバーグ・コロッケ・卵・デミ／ハーフ＝半分（オリオン ハーフは卵なし）／TG＝店内＋容器＋袋・割り箸など）
- 量が決まったら（承認待ちの決まり「麺の量」「ソースの量」）、Drive の表と COSTS を直す

## 7. ORION START v0.1（11/1 夜・出店判断と答え合わせ）

- 台帳は**別ファイル**「ORION START 事務局台帳」（松尾・長下のみ閲覧）。分析シートには書かない（決裁ログの「提案中」行だけは共通台帳に書く）
- ファイル ID は Script Properties の `START_SS_ID`。初回はエディタで `startSetup()` を1回実行（ファイル作成・タブ作成・PRJ-0001 神田 baseline／PRJ-0002 飯田橋 screening の登録。何度実行しても重複しない）
- 取り付け：facts.gs の handleOsGet / handleOsPost に1行ずつ（`os_start_` で始まる mode / type を start.gs へ）
- タブ：案件／物件／掲載／試算／評価／現地調査／店舗設定／容量／来店品質／変更履歴
- 数値の確度：fact / observed / estimated / assumption / unknown。店舗設定は上書きせず、有効開始つきの新しい行を足す
- 試算は凍結すると変更不可（SHA-256 を保存。`startVerifyFrozen()` で検証）。直すときは新しい版
- 神田の容量：demonstrated（実証済みの下限）／theoretical_seat（席×60÷(滞在+入替)×稼働率）／kitchen（unknown）／sustainable を分けて保存
- 来店品質：差率 3%以内 A（滞在の実測に使う）／10%以内 B（在店人数だけ比例補正）／それ以上 C（参考）
- 滞在の実測は**累積曲線（入店累積−退店累積）の面積法**。既存のレジ・分析画面の「先着順の突き合わせ」は押し漏れがあると短く出る
- 物件の Gmail 取り込み（本線）：物件サイトの新着メールは orion.napolitan@gmail.com に届く。orion 側の Gmail フィルタで「ORION/物件」ラベル・カテゴリ「メイン」にし、既存の収集スクリプト（collector.gs・10分ごと）が本体へ送る。osMailIngest_（mail.gs）から startIngestMessages_ が物件サイトの差出人だけを「掲載」に未確認で入れる。読めない値は空欄＝未確認項目。ページの自動取得はしない
- 補助：分析GAS側の Gmail（arashi.matsuo）に届いた物件メールは `startMailScan`（「ORION/物件」ラベル。設定は `startMailTriggerInstall()`）
