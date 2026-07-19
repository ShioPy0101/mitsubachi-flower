# flower Windows / After Effects 技術調査

調査日: 2026-07-20
作業ディレクトリ: `C:\Users\{windows-user-name}\General\workspace\mitsubachi-flower`
対象: Mitsubachi上の動画・画像をAfter Effects内パネルから参照し、Windowsローカルキャッシュへ取得後にAEプロジェクトへ読み込む構成の技術調査と最小PoC。

## 調査した環境

### 確認できた事実

- OS: Microsoft Windows `10.0.26200`
- PowerShell: `7.4.17` (`PSEdition=Core`)
- Node.js: `v22.16.0`
- npm: `10.9.2`
- git: `2.37.0.windows.1`
- `git config --get core.autocrlf`: `true`
- `Get-FileHash`: `Microsoft.PowerShell.Utility`, version `7.0.0.0`
- After Effects install candidate: `C:\Program Files\Adobe\Adobe After Effects 2022`
- After Effects executable: `C:\Program Files\Adobe\Adobe After Effects 2022\Support Files\AfterFX.exe`
- After Effects file/product version: `22.5`
- AE support folder exists: `C:\Program Files\Adobe\Adobe After Effects 2022\Support Files`
- CEP engine folder exists: `C:\Program Files\Adobe\Adobe After Effects 2022\Support Files\CEPHtmlEngine`
- 開発用CEP拡張を配置済み: `%APPDATA%\Adobe\CEP\extensions\mitsubachi-flower -> .\flower`
- `HKCU\Software\Adobe\CSXS.11\PlayerDebugMode` を `1` に設定済み

## Windows上のAdobe関連ディレクトリ

- After Effectsインストール先: `C:\Program Files\Adobe\Adobe After Effects 2022`
- Support Files: `C:\Program Files\Adobe\Adobe After Effects 2022\Support Files`
- Scripts: `C:\Program Files\Adobe\Adobe After Effects 2022\Support Files\Scripts`
- ScriptUI Panels: `C:\Program Files\Adobe\Adobe After Effects 2022\Support Files\Scripts\ScriptUI Panels`
- CEP user extensions: `C:\Users\{windows-user-name}\AppData\Roaming\Adobe\CEP\extensions`
- CEP common extensions: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions`
- UXP settings root: `C:\Users\{windows-user-name}\AppData\Roaming\Adobe\UXP`
- UXP plugin候補: `%APPDATA%\Adobe\UXP\Plugins` は未作成
- AE user settings root: `C:\Users\{windows-user-name}\AppData\Roaming\Adobe\After Effects`

flower保存先は以下の作成、書き込み、削除、SHA-256計算に成功した。

- cache: `C:\Users\{windows-user-name}\AppData\Local\Mitsubachi\Flower\cache`
- logs: `C:\Users\{windows-user-name}\AppData\Local\Mitsubachi\Flower\logs`
- config: `C:\Users\{windows-user-name}\AppData\Roaming\Mitsubachi\Flower\config`

Program Files配下のScriptUI Panelsは管理者権限が絡むため、flower開発版はユーザーCEP extensions、ランタイムデータはMitsubachi配下のAppDataを使う方針がよい。

## After Effectsの拡張方式

| 方式           |           パネルUI |            JS/TS UI |       フッテージ一覧 | ローカル追加 | 差し替え | Mitsubachi ID保存 |            HTTP API | 通信/開発/配布                                                               |
| -------------- | -----------------: | ------------------: | -------------------: | -----------: | -------: | ----------------: | ------------------: | ---------------------------------------------------------------------------- |
| CEP            |                 可 |                  可 | ExtendScript経由で可 |           可 |       可 |  `Item.comment`等 | CEP内fetch/Node候補 | `CSInterface.evalScript()`、`%APPDATA%\Adobe\CEP\extensions`、製品はZXP/署名 |
| ExtendScript   |     メニュー実行可 |              古いJS |                   可 |           可 |       可 |                可 |  AE設定で許可が必要 | File > Scripts、`.jsx`/`.jsxbin`                                             |
| ScriptUI Panel |                 可 |        ScriptUIのみ |                   可 |           可 |       可 |                可 |                同上 | `Scripts\ScriptUI Panels`、AE再起動                                          |
| UXP            | AEでは採用根拠なし | UXP対応アプリでは可 |               未確認 |       未確認 |   未確認 |            未確認 |              未確認 | AE向け正式利用可否を確認できず                                               |

採用推奨は **CEP Panel + ExtendScript bridge + Node.js stream処理**。

理由:

- AE 2022にCEPHtmlEngineが存在し、CEP拡張ディレクトリとCSXS.11開発設定で開発版を読める構成を確認した。
- UIはHTML/CSS/JSで実装でき、TypeScriptをビルドして使える。
- AE操作はExtendScript DOMで `app.project.importFile()`、`Project.selection`、`FootageItem.replace()`、`Item.comment` を使える。
- 大容量ファイル、SHA-256、atomic rename、ログ、HTTPはExtendScriptではなくCEP側Nodeまたは将来の補助プロセスへ寄せられる。
- UXPはAdobe全体では現行拡張基盤だが、After Effects用flowerに必要なAE DOMパネルとして正式利用可能な根拠を今回確認できなかった。

参考: Adobe Help Scripts in After Effects, Adobe After Effects developer page, After Effects Scripting Guide FootageItem, Adobe CEP Resources.

## Mitsubachi API接続結果

PowerShellとNode.jsで以下へ非破壊GETを実行した。

- `https://mitsubachi-api.shiosalt.com/api/health/live`
- `https://mitsubachi-api.shiosalt.com/api/health/ready`

確認できた事実:

- TLS証明書エラー: なし
- HTTP status: 両方 `200 OK`
- response body: 両方 `{"status":"ok"}`
- timeout: 20秒設定でタイムアウトなし
- Node User-Agent: `mitsubachi-flower-investigation/0.1 Node`
- PowerShell User-Agent: `mitsubachi-flower-investigation/0.1 PowerShell`
- Nodeで `Origin: file://flower-panel` を付けてもhealthは200
- レスポンスヘッダーに `strict-transport-security`, `x-request-id`, `content-type=application/json; charset=utf-8` を確認

Range Request:

- health endpointに `Range: bytes=0-0` を送った結果は `206` ではなく `200` で全体15 bytes返却。
- 実ファイルダウンロードAPIのRange可否は未確認。

Cookie/CORS:

- PowerShell/NodeではCookie jarを明示実装すればCookie保持可能。
- CEPパネルのブラウザ文脈ではCORSの影響を受ける可能性がある。
- CEP内Node `https` ならブラウザCORSは通常受けないが、Cookie共有や認証情報管理は自前設計が必要。
- AEパネル内fetch/XMLHttpRequest/Node `https` 差分は未確認。

## 認証方式の検討

既存のメールマジックリンク + CookieセッションをCEPパネルからそのまま使うのはリスクが高い。

- 外部ブラウザとCEP/CEF/NodeでCookie jarを共有できるとは限らない。
- `HttpOnly` CookieはパネルJSから読めず、Node側でもそのまま再利用できない。
- `Secure` はHTTPS必須で問題ない。
- `SameSite=Lax` はパネル内XHR/fetchやfile originでは期待通り送られない可能性がある。
- CSRFトークン前提のブラウザUIをNode HTTPへ転用すると監査しづらい。

代替案比較:

| 方式                 | 評価 | 理由                                                 |
| -------------------- | ---- | ---------------------------------------------------- |
| AE専用の一時トークン | 中   | 短命tokenを発行できるが、発行/保管/失効設計が必要    |
| デバイスコード方式   | 高   | Cookie共有不要。外部ブラウザで承認でき、監査しやすい |
| localhost callback   | 中   | UXは良いが、ポート競合、Firewall、listener寿命が課題 |
| custom URI scheme    | 中   | UXは良いが、Windows登録、衝突、署名が課題            |
| 手動コード入力       | 高   | 実装が単純で安全。初期PoCに向く                      |

推奨は **flower専用デバイスコード方式 + 手動コード入力fallback**。ブラウザ用エンドポイントへ直接混ぜず、flower専用Controller/Endpointから既存認証Service層を呼ぶ。認証ロジックは重複実装しない。

認証情報は平文ファイルへ保存しない。Windows Credential Managerを優先候補にする。CEP同梱Nodeでnative moduleを使う場合はABI互換性リスクがあるため、製品版では小さなローカル補助プロセスにCredential Managerアクセスを持たせる案が堅い。

## ローカルキャッシュ設計

推奨構造:

```text
%LOCALAPPDATA%\Mitsubachi\Flower\cache\
  sha256\
    ab\
      abcdef0123456789...\
        payload.mp4
        metadata.json
```

設計方針:

- 実体パスはSHA-256ベース。元ファイル名は表示用メタデータに保持する。
- 同一hashは複数プロジェクトで共有する。
- 一時ファイルへstream保存し、ダウンロード中にSHA-256を同時計算する。
- 完了後にhash一致を確認し、同一ディレクトリ内renameで昇格する。
- hash不一致時は一時ファイルを削除し、expected/actual hash、bytes、request id、drive item idをログに出す。認証情報は出さない。
- 中断復旧は、まずtmp削除+再取得から開始し、Range対応API確認後にresumeを追加する。
- 容量上限とLRUはmetadataにlastAccessAtを持たせる。
- AEが開いているファイル、Windows Defender等の一時ロックは削除/rename失敗として扱い、backoff retry後に次回GCへ延期する。
- Unicode、日本語、絵文字、予約名、同名ファイルは実体パスに使わず、表示名のみmetadataへ保存する。

既存PoCでは、Node stream SHA-256、hash normalize、一時ファイル、rename、hash不一致時のtmp削除、Windowsパス区切り対応テストを確認済み。HTTP download stream、Range resume、LRU GC、Defender retry、実ファイルロック検証は未実装。

## hash検証

PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 -Path "C:\path\to\file.mp4"
```

Node.jsでは `createReadStream(filePath)` を `crypto.createHash("sha256")` へpipelineし、ファイル全体をメモリへ読まない。既存PoCの `sha256File()` は `sha256:<lower hex>` を返す。サーバー側hashアルゴリズムはDBへアクセスしていないため未確認だが、flower側は `sha256:<64 hex>` を前提にしている。

## 仮想ファイル方式

0バイトmp4をAEへ読み込ませる実機操作は未実施。現時点では採用しない。

理由:

- AEが0バイト動画を有効なFootageItemとして受け入れる保証がない。
- 無効動画の即時拒否、missing扱い、reload挙動はAE実機差分が出やすい。
- ExtendScriptには `FootageItem.replaceWithPlaceholder()` があり、placeholder footageの方が明示的。
- 初期UXでは、ダウンロード完了後に正式フッテージとしてimportする方が事故が少ない。

代替案は、flowerパネルにファイル一覧を表示し、ユーザー選択後にローカルキャッシュへdownload、SHA-256検証、AEへ正式importする方式を優先する。

## ドラッグ＆ドロップ

AE実機でDOM要素からProject panel/Compositionへドラッグする検証は未実施。直接ドラッグは難しい可能性が高い。

- CEPパネル内DOM dragはブラウザ内イベントであり、AE Project panelがOSファイルドラッグとして受け取る形式とは異なる可能性がある。
- ダウンロード前アイテムをドラッグして、ドロップ完了までAEに開かせない制御は難しい。
- ドロップ先コンポジション識別もCEP DOMだけでは困難。

初期PoCでは、既存の `Import Local File` / 将来の `AEへ読み込む` ボタン方式を採用する。

## AEプロジェクトとの関連付け

最低保持情報:

- `drive_item_id`
- organization ID
- SHA-256
- server updated at
- local cache path
- last synced at
- flower schema version

方式比較:

| 保存先                       | 評価 | 長所                                                                 | 課題                                                        |
| ---------------------------- | ---- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `FootageItem.comment`        | 高   | `.aep`内に保存され、別PC移動/Save As/複製に追従しやすい。PoC実装済み | 既存コメントとの共存、15,999 bytes上限、ユーザー編集        |
| XMP                          | 中   | メタデータ用途として自然                                             | AE DOMからの安定操作、監査性、実装コスト未確認              |
| AEプロジェクト内専用アイテム | 中   | プロジェクト内にまとまる                                             | 誤削除、検索、復元ルールが必要                              |
| `.aep` sidecar JSON          | 中   | Git管理しやすい                                                      | `.aep` rename/Save As/移動/複製でずれる。JSON破損対応が必要 |
| `%APPDATA%` プロジェクト別DB | 中   | 大きなメタデータに向く                                               | 別PC移動や複数ユーザー共有に弱い                            |

推奨は、初期は `FootageItem.comment` に小さなflower JSONを保存する方式。既存コメント保護のため、製品版では専用ブロックまたはcommentが空の時のみ書くポリシーを検討する。

## 変更監視

推奨順序は、手動更新、一定間隔ポーリング、差分取得API、必要になった場合のみWebSocket/SSE。

- CEPパネルが閉じている/非表示の時にtimerが継続するかは未確認。
- AE終了時にはCEPプロセスも終了する想定。長時間処理は補助プロセス化を検討する。
- 自動差し替えは事故リスクが高い。初期は更新確認UIを出し、ユーザー操作でreplaceする。
- 編集中/使用中ファイルの上書きは禁止。hash別パスへ新規取得し、AE itemをreplaceする。

## ログ

最小ログ項目: timestamp、level、flower version、AE version、Windows version、operation、organization ID、user ID、drive item ID、request ID、HTTP status、downloaded bytes、download duration、hash result、local path、error category。

ログ禁止: Cookie、Authorization header、access token、refresh token、magic link URL、email auth code、CSRF token、個人情報を含むレスポンス本文。

既存PoCにはUI/JSX/cache/errorのログチャンネルとredaction helperがある。永続JSONLログは未実装で、保存先は `%LOCALAPPDATA%\Mitsubachi\Flower\logs` を使う。

## 最小PoCの状態

既存 `flower/` はCEP + ExtendScript + Node streamの最小ハーネスとして成立している。

実装済み:

- CEP manifest: `flower/manifest/CSXS/manifest.xml`
- Panel UI: `flower/panel/index.html`, `flower/panel/src/main.ts`
- ExtendScript bridge: `flower/jsx/flower.jsx`
- Bridge escaping/parser tests: `flower/tests/bridge.test.ts`
- SHA-256/cache tests: `flower/tests/cache.test.ts`
- fixture cache: `flower/src/cache.ts`
- 開発用インストール: `npm run install:dev`

PoCでできること:

1. AE上にCEP panelを表示する構成を配置済み。
2. PanelにCEP/bridge/AE version/OS/statusを表示する実装がある。
3. health endpointへのパネル内アクセスは未実装。PowerShell/Nodeでは接続確認済み。
4. 任意ローカルファイル選択はExtendScript `File.openDialog()` で実装済み。
5. SHA-256はNode streamで計算する実装済み。
6. 選択ファイルをAEへimportするExtendScript実装済み。
7. FootageItem.commentへfixtureのMitsubachi ID/hashを書き込む実装済み。
8. Project再読込後の復元はAE GUI実機確認が未実施。

実行結果:

- `npm install`: 成功。追加3 packages、脆弱性0。
- `npm run test`: 10/10 pass。
- `npm run doctor`: OK。
- `npm run install:dev`: `%APPDATA%\Adobe\CEP\extensions\mitsubachi-flower` に配置成功。

## 判明した制約

- AE実機GUIの起動、Windowメニューからの表示、実プロジェクト保存/再読込は未確認。
- health endpointはRangeを206で返さない。実ファイルAPIで再確認が必要。
- UXPはAE向けflower採用根拠を確認できなかった。
- CEP/Nodeは便利だが、認証情報保管や長時間大容量ダウンロードを安定運用するなら補助プロセス化の余地がある。
- Program Files配下のScriptUI Panelsは管理者権限の問題があるため、通常開発・配布では避けたい。
- `Item.comment` は便利だが、既存コメントを壊さない設計が必要。

## 未解決事項

- AE上で実際にflower panelを表示できるか。
- AE panel内fetch/XMLHttpRequest/Node `https` のhealth接続。
- AE panel内のCookie挙動、CORS、Origin、User-Agent。
- 本番ファイルダウンロードAPIのRange、stream、Content-Length、hash metadata。
- 0バイトmp4、最小mp4、placeholder、missing footageのAE実挙動。
- Drag & dropの成立可否。
- Windows Credential Managerの実装経路。
- 大容量ファイルのhash計算時間、Defender lock、AE file lock。
- Unicode/日本語/絵文字/予約名の実素材import。

## 次に実装すべき最小単位

1. Panelにhealth endpointチェックボタンを追加し、CEP内Node `https` とブラウザfetchの両方の結果を表示する。
2. `Import Local File` 後に `Item.comment` からflower metadataを読み戻す `Scan Project Metadata` を追加する。
3. `%LOCALAPPDATA%\Mitsubachi\Flower\logs` へredaction済みJSONLログを書き出す。
4. 実ファイルAPIが決まったら、認証なし/短命URLの範囲でstream download + hash verify + importを実装する。
5. 認証はflower専用device code endpointを設計し、既存Service層を呼ぶController/Endpointで分離する。

## セキュリティ上の懸念

- CookieセッションをCEP/Nodeで無理に再利用すると、CSRF、SameSite、Cookie jar、ログ漏洩の監査が難しくなる。
- 署名付きURL、Authorization header、magic link URLはredactionを必須にする。
- 認証情報はWindows Credential Managerまたは補助プロセス経由で扱い、平文ファイルへ保存しない。
- `PlayerDebugMode=1` は開発用設定。製品配布時は署名済みパッケージへ移行し、常用を避ける。

## Windows固有の問題

- path separator差分。今回テストをWindows対応に修正した。
- `core.autocrlf=true` のため改行差分に注意。
- Program Files配下への配置は権限問題がある。
- Defenderやインデクサによる一時ロックにretryが必要。
- 予約名、長いパス、Unicode表示名は実体パスに使わない。

## AE固有の問題

- ExtendScript実行はAEメインスレッドに影響しうるため、重いI/Oやhash計算を置かない。
- `Item.comment` の上限と既存コメント保護が必要。
- `FootageItem.replace()` 後のID、comment、レイヤー参照、尺、解釈は実機確認が必要。
- パネル非表示時のtimer、AE終了時の処理、プロジェクト切替検知は未確認。
