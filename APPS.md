# 洋食オリオン アプリ構成と更新ルール（2026/11/01）

複数の Claude のスレッドがこのリポジトリと同じ Apps Script を更新している。上書き事故を防ぐため、更新前にこのファイルを読むこと。

## 1. アプリ（使う人ごとに 3 つ＋お客様用）

| 入口 | ファイル | 使う人・端末 | 中身 |
| --- | --- | --- | --- |
| 管理者アプリ | kanri.html（ホーム画面名「管理者」manifest-kanri.json） | 松尾・長下（管理者） | 締め・分析／発注／経費／スタッフ・シフト／採用／出店を切り替え。中は下の各画面を埋め込み |
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
| learn.html | 覚えること：ホール・厨房の手順カードと自分の習熟度（まだ／自信ない／できる）。管理者は「みんな」で全員の進み具合 | スタッフアプリ「店の仕事」 |
| recruit.html | 採用：応募者（状態・面接日時・メモ・連絡文コピー）と求人票（項目ごとにコピー・媒体の管理画面へ）。データは分析シートの「求人票」「応募者」タブ | 管理者アプリ「採用」 |
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

- v69（11/2 朝）：ORION START v0.1 を取り付け。start.gs を末尾に追加、handleOsGet / handleOsPost に os_start_ の1行ずつ、osMailIngest_ から startIngestMessages_ を呼ぶ。startSetup 実行済み（「ORION START 事務局台帳」を作成、PRJ-0001 神田・PRJ-0002 飯田橋）
- v70（11/2 朝）：物件メールの差出人に synchro-food.co.jp を追加（飲食店ドットコムの物件メールはこのドメインから届く）
- v71〜v74（11/2 朝）：ORION START v0.2（一次判定・まとめメール分割・ページ取り込み・朝の候補メール）。メール送信の権限を追加承認、`startDigestTriggerInstall()` 実行済み（毎朝7時台）、`startRejudgeAll()` 実行済み
- v75（11/2 朝）：先出し通知 ops_alerts（staffing.gs の後半）。15:30 opsNotifyOrder＝今日が締切の発注で足りなくなる品目、17:00 stfShortNotify＝人手不足（3週間）・年収の壁（設定 annual_caps）・衛生記録の付け忘れ・レジ締めの未入力。送り先 orion.napolitan@gmail.com。分析の「今朝の確認」は doGet mode=ops_alerts（管理者トークン）
- v76（11/2 朝）：LINE 通知（staffing.gs 末尾の LINE ブロック）。Messaging API（公式アカウント「洋食オリオン」）。doPost の先頭で LINE の webhook を受けてグループIDを LINE_CANDIDATES に保存。LINE_TOKEN を貼り、管理者グループに招待したあと linePickGroup() を 1 回実行すると LINE_TO が決まり、opsMail_ と同じ内容が LINE にも流れる（未設定なら何もしない）
- v77〜v78（11/2 朝）：採用（recruit.gs）。分析シートに「求人票」「応募者」タブ。doGet mode=rec_list／doPost rec_app_save・rec_job_save（管理者トークン）。メール取り込み（osMailIngest_）で Indeed の応募通知を応募者に自動追加（メールIDで重複なし）。未連絡（新規）の応募は ops_alerts の key "rec" で今朝の確認・17時のまとめに出る。求人票に Indeed の下書き（ホール・平日ランチ 10:30〜15:00・時給1,500円）と 9/29 の店舗スタッフ（休止・応募24）を登録
- v79（11/2 朝）：採用に rec_app_delete・rec_job_delete（誤登録の行を削除）。※ GAS の GET はブラウザにキャッシュされることがあるので、recruit.html は毎回 `_=時刻` を付けて読む
- v80（11/2 朝）：人手の見通し（recruit.gs 後半）。必要人数は STAFF の設定 `staffing_need`（JSON：店ごと・曜日ごと・ホール／厨房、1人の週出勤日数、1人で回せる食数）。管理者アプリ「採用」→「人手」で変更。doGet mode=rec_outlook（先4週間の不足・希望で埋まるか・あと何人）、doPost rec_need_save。人手不足の通知（stfShortDays_）もこの人数で判定。日付ごとの上書きは従来どおり「必要人数」シート
- 11/2 画面：発注（hacchu.html）の「55食／60食」切り替えを廃止。日ごとの見込み食数＝直近4週の同じ曜日の実績平均（分析と同じ売上データ dash-data を使用。足りなければ直近10営業日平均→55食）。増える日はタップして±食数（端末に保存 inv-extra）。祝日は休みとして計算。各品目に「この量で◯日の昼までもつ」を表示。※ 15:30 の発注締切メール（GAS opsOrderAlerts_）はまだ 55食固定
- 11/2 画面：管理者アプリ（kanri.html）が開いたとき・戻ってきたとき・「更新」で新しい版（V）を確認し、変わっていればアプリごと読み直す
- v81（11/2 朝）：覚えること（learn.gs）。スタッフアプリ「店の仕事」→「覚えること」（learn.html）。ホール・厨房の項目と手順は learn.html の ITEMS に書く（id は変えない）。本人が「まだ／自信ない／できる」をつけるだけで、第三者の確認はしない。記録は分析シート「習熟」タブ。doGet mode=learn_get（本人の分、管理者は全員分）／doPost learn_save
- 11/2 画面の決まり：どのアプリも「上＝アプリ名・ボタン（更新・切り替え・ログアウト）」「下＝主なタブ（白地・アイコン＋文字・ホームバーぶんの余白）」。画面の中の小さな切り替え（経費の登録／一覧など）は上に置く。管理者アプリ⇄勤怠は上のボタン（管理者アプリ「勤怠」、勤怠アプリの管理者だけ「管理者」）で行き来する
- v82（11/2 13時）：分析の作り置き（dashcache.gs）。開くのに10〜20秒かかっていた原因＝収支 5.5秒・ops 3.5秒・今朝の確認 7.6秒を毎回計算＋同時の読み込みで渋滞。10分ごと（7〜21時）に dashWarm が作り置き、画面はそれを読む（分析 約12秒→約4秒、今朝の確認 約11秒→約2.5秒）。締め・在庫など書き込みがあると作り置きを捨てる（レジの売上・カメラは除く）。トリガー dashWarm 設定済み。発注画面の見込み食数は、分析のデータが1時間以内なら取り直さない
- 注意：ORION START スレッドも同じ GAS を更新している（v69〜v74・start.gs）。編集前にエディタを読み込み直し、デプロイ直前にも相手の関数（startGet_ など）が残っているか確認する

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

## 8. ORION START v0.2（11/2 朝・物件探しの手間を減らす）

- 一次判定 `startJudge`：◎＝坪単価3万円以内・1階・6〜12坪がそろう／△＝基準外はないが未確認がある／×＝基準外（理由を残す。消さない）。基準は `START_JUDGE`。基準を変えたら `startRejudgeAll()`
- 取り込みの改良：飲食店ドットコムの [項目] 形式・階数・物件ページURL（/bukken/bukkens/数字・/bukken/transfer/detail/数字）を読む。自分の「マッチした希望条件」欄は読まない。居抜き譲渡速報などのまとめメールは物件ごとに分ける（メールID#譲渡No）。同じメール・同じURLは空欄だけ埋めて判定し直す（上書きしない）
- ページ取り込み `os_start_capture`：管理画面の「物件Inbox」にあるブックマーク「STARTに取り込む」を押すと、**松尾さんが開いている物件ページの表示テキスト**が届き、住所・賃料・面積・階・保証金・契約・造作・前テナント・設備（備考）・不動産会社・電話を同じURLの行に足す。変えた項目は変更履歴に前後を残す。表示テキストは「ページ控え」タブに残す（社内控え・再解析用）。**サーバーから物件サイトへはアクセスしない**（飲食店ドットコム規約 第9条の範囲内で使うため。自動取得はシンクロ・フードの許可が出てから）
- 朝の候補メール `startDailyDigest`：毎朝7時台、前回から増えた ◎ と △ だけを orion.napolitan@gmail.com へ（× は件数のみ。候補がなければ送らない）。設定は `startDigestTriggerInstall()` を1回
- 掲載タブに列を追加（末尾）：階・坪単価・重飲食・判定・判定理由・不動産会社・電話・備考・詳細取込日時・通知日時。新しいタブ：ページ控え
