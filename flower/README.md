# flower

flowerは、MitsubachiのAfter Effects連携機能です。After Effects内のパネルからMitsubachi上の素材を選び、`file_hash`を基準にローカルキャッシュを確認し、ダウンロード済みの実ファイルだけをAfter Effectsへ読み込ませる想定です。

このディレクトリは技術検証用の最小ハーネスです。製品版ではありません。Mitsubachi API接続、認証、検索UI、実ダウンロードは未実装で、fixtureを使います。After Effects実機での確認が必要な項目は`docs/verification.md`に残しています。

## アーキテクチャ

```text
CEPパネル
  UI、状態表示、利用者操作

ExtendScript
  After Effects DOM操作

ローカル処理
  ダウンロード、キャッシュ、SHA-256検証

Mitsubachi
  drive_item_id、file_hash、権限、ダウンロードAPI
```

現在のハーネスでは、Mitsubachi部分を`fixtures/metadata.json`で代替します。`drive_item_id`は論理ファイル、`file_hash`はファイル内容とキャッシュキーを表します。

## 必要環境

- OS: WindowsまたはmacOSを検証対象。LinuxはAfter Effects実機検証対象外。
- Node.js: 20以上。開発環境では22系を推奨。
- パッケージマネージャー: npm。
- After Effects: CEP 11以降を想定したmanifestを置いていますが、対応バージョンは実機で確認してください。
- CEP開発設定: 未署名拡張を読み込むため`PlayerDebugMode=1`が必要です。
- 環境変数:
  - `FLOWER_CEP_EXTENSIONS_DIR`: 開発用CEP拡張の配置先を上書きする場合。
  - `FLOWER_ASSUME_CEP_DEBUG=1`: doctorでdebug設定を手動確認済みとして扱う場合。

## セットアップ

```sh
cd flower
npm install
npm run build
npm run test
npm run doctor
```

### 開発用CEP拡張のインストール

macOS:

```sh
cd flower
npm run install:dev
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

Windows:

```bat
cd flower
npm run install:dev
```

Windowsでは`regedit`で`HKEY_CURRENT_USER\Software\Adobe\CSXS.11`に文字列`PlayerDebugMode`=`1`を設定してください。After EffectsのCEPバージョンが異なる場合は`CSXS.12`など対象に合わせてください。

## After Effectsで開く

1. After Effectsを再起動する。
2. `Window > Extensions`または`Window > Extensions (Legacy)`を開く。
3. `flower development harness`を選ぶ。

## 検証手順

1. パネルを開き、`CEP runtime`がOKになることを確認する。
2. `Probe AE`でExtendScript疎通、AE version、project path、item count、selectionを確認する。
3. `Import Local File`でローカルファイルを読み込む。
4. `Write Metadata`で`Item.comment`へfixtureメタデータを書き込む。
5. FootageItemを1つ選択し、`Replace Selected Footage`で別ファイルへ差し替える。
6. コンポジションをアクティブにし、FootageItemを選択して`Add To Active Comp`を実行する。
7. `Run Cache Fixture`でSHA-256、キャッシュパス、一時ファイル、検証、再利用ログを確認する。

## ログ

パネル内で次のログを分離表示します。

- CEP UIログ
- ExtendScriptログ
- キャッシュ処理ログ
- エラーログ

認証トークン、Authorizationヘッダー、将来の署名付きURLはログへ出さない設計にします。

## アンインストール

```sh
cd flower
npm run uninstall:dev
```

## トラブルシューティング

- パネルが表示されない: CEP拡張の配置先、manifestの`Host Name="AEFT"`、After Effects再起動を確認してください。
- CEPのデバッグモードが有効でない: `PlayerDebugMode=1`をCSXSバージョンごとに設定してください。
- ExtendScriptを呼び出せない: `jsx/flower.jsx`がmanifestの`ScriptPath`から読めているか確認してください。
- ファイルアクセスが拒否される: After Effectsのスクリプト権限とOSのプライバシー設定を確認してください。
- パスに日本語が含まれる: 自動テストでは文字列エスケープのみ確認済みです。実ファイル読み込みは実機で確認してください。
- Windowsのバックスラッシュ: CEPからExtendScriptへ渡す値はJSON文字列としてエスケープします。
- manifestの対象バージョン不一致: `CSXS/manifest.xml`の`Host Version`と`RequiredRuntime`を検証対象AEに合わせてください。
- キャッシュを削除したい: `flower/cache`を削除してください。After Effectsに読み込み済みの素材参照は別途確認が必要です。

## 制約

- 大容量ダウンロードはまだ実装対象外。
- ネイティブドラッグ&ドロップは未検証。
- 自動差し替えは行わない。
- 更新は利用者の明示操作で反映する。
- 連番素材は別途検証が必要。
- プロキシ素材は別途検証が必要。
- UXP対応を前提にしない。

## 関連資料

- `docs/investigation.md`: 技術調査。
- `docs/architecture.md`: 責務分離とデータフロー。
- `docs/verification.md`: After Effects実機チェックリスト。
- `docs/known-limitations.md`: 制約と未確認事項。

## Windows調査メモ 2026-07-20

この環境では `C:\Program Files\Adobe\Adobe After Effects 2022\Support Files\AfterFX.exe` を確認しました。製品バージョンは `22.5` です。

開発用CEP拡張は次へ配置済みです。

```text
%APPDATA%\Adobe\CEP\extensions\mitsubachi-flower -> C:\Users\taku2\General\workspace\mitsubachi-flower\flower
```

AE 2022向けに未署名拡張の開発読み込み設定も有効化済みです。

```text
HKCU\Software\Adobe\CSXS.11\PlayerDebugMode = 1
```

Windowsでの確認手順:

1. `cd flower`
2. `npm install`
3. `npm run test`
4. `npm run doctor`
5. `npm run install:dev`
6. After Effects 2022を再起動する
7. `Window > Extensions` または `Window > Extensions (Legacy)` から `flower development harness` を開く

flowerのランタイム保存先候補:

```text
%LOCALAPPDATA%\Mitsubachi\Flower\cache
%LOCALAPPDATA%\Mitsubachi\Flower\logs
%APPDATA%\Mitsubachi\Flower\config
```

上記3ディレクトリはこのWindows環境で作成と書き込みを確認済みです。API health endpointはPowerShell/Node.jsから `200 OK` と `{"status":"ok"}` を確認済みですが、AEパネル内HTTPクライアントでの確認は未実施です。

詳細な調査結果は `..\docs\flower\windows-investigation.md` を参照してください。

## Rails flower API Phase 1 PoC

This harness can connect to the Mitsubachi Rails flower Phase 1 API from the After Effects 2022 CEP panel using a development-only Bearer token.

Implemented flow:

1. `GET /api/v1/flower/me`
2. `GET /api/v1/flower/drive_items?query=...&cursor=...&limit=50`
3. `GET /api/v1/flower/drive_items/:id`
4. `GET /api/v1/flower/drive_items/:id/download`
5. stream download to `%LOCALAPPDATA%\Mitsubachi\Flower\cache`
6. SHA-256 and file size verification
7. atomic cache commit
8. AE import through ExtendScript
9. `FootageItem.comment` flower metadata block write
10. JSONL audit logs in `%LOCALAPPDATA%\Mitsubachi\Flower\logs`

### Development config

Create this file locally. Do not commit it.

```text
%APPDATA%\Mitsubachi\Flower\config\development.json
```

Example shape:

```json
{
  "apiBaseUrl": "https://mitsubachi-api.shiosalt.com",
  "developmentAccessToken": "paste-development-token-here",
  "requestTimeoutMs": 20000,
  "downloadTimeoutMs": 300000,
  "maxConcurrentDownloads": 1
}
```

`developmentAccessToken` is for development/test only. It is intentionally rejected when `FLOWER_ENV=production` or `NODE_ENV=production`. Do not use this plaintext token config for production builds. Production auth should replace this path with the flower device-code flow and OS credential storage.

`apiBaseUrl` is normalized by removing trailing slashes. HTTPS is required except localhost development URLs such as `http://localhost:3001`.

### Cache structure

```text
%LOCALAPPDATA%\Mitsubachi\Flower\cache\
  sha256\
    ab\
      abcdef0123456789...\
        payload.mp4
        metadata.json
```

The original display name is stored in `metadata.json`; it is not used to build the payload path. Tokens, Authorization headers, download URLs, cookies, and internal redirect paths are not stored.

### AE metadata block

Imported footage receives a dedicated block in `FootageItem.comment`:

```text
[MITSUBACHI_FLOWER_BEGIN]
{"schema":"mitsubachi.flower/v1",...}
[MITSUBACHI_FLOWER_END]
```

Existing comments are preserved. Existing flower blocks are replaced. Multiple flower blocks are treated as an error.

### Windows PowerShell verification

```powershell
cd C:\Users\taku2\General\workspace\mitsubachi-flower\flower
npm install
npm run test
npm run doctor
npm run build
npm run install:dev
```

### AE manual integration checklist

1. Rails側でdevelopment/test限定access tokenを発行する。
2. `%APPDATA%\Mitsubachi\Flower\config\development.json`へ設定する。
3. AEを完全終了する。
4. `npm run install:dev` を実行する。
5. AEを起動する。
6. Windowメニューから `flower` panelを開く。
7. `Connect`を押す。
8. user / organizationが表示されることを確認する。
9. `Reload Files`を押す。
10. 一覧へ動画または画像が表示されることを確認する。
11. 小さい画像で `Download and Import` を実行する。
12. cacheへpayloadとmetadataが作成されることを確認する。
13. AE Project panelへFootageItemが追加されることを確認する。
14. `Scan Project Metadata`でdrive item IDとhashを確認する。
15. `.aep`を保存して閉じる。
16. 再度開きmetadataが復元されることを確認する。
17. 同じitemで再度操作し、cache hitになることを確認する。
18. tokenを無効化して401表示を確認する。
19. 一時的にhash metadataを変え、hash mismatch時にimportされないことを確認する。
20. logsへtokenが出ていないことを確認する。

AE GUIはこの自動テストでは操作していません。上記は人間が行う結合確認です。

## Device Authorization Sign in

The panel now supports OAuth 2.0 Device Authorization Grant sign-in. The access token is held only in memory while the CEP panel is running. It is not written to `localStorage`, `sessionStorage`, IndexedDB, files, Windows Credential Manager, logs, diagnostics, cache metadata, or AE project metadata. After After Effects or the panel exits, sign in again.

Sign-in flow:

1. Open the flower panel in After Effects.
2. Click `Sign in`.
3. The panel starts `POST /api/v1/flower/device_authorizations`.
4. If possible, the panel opens `verification_uri_complete` in the external browser.
5. If the browser does not open, copy the displayed verification URL and user code.
6. Sign in to Mitsubachi in the browser and allow Flower access.
7. Return to After Effects. The panel polls `POST /api/v1/flower/tokens` until authorization completes.
8. After the token is issued, the panel calls `/api/v1/flower/me` and then enables file listing, download, cache, and import.

Token polling behavior:

- `authorization_pending`: keep polling with the current interval.
- `slow_down`: increase the poll interval by 5 seconds and continue.
- `access_denied`, `expired_token`, `invalid_grant`, `invalid_request`: stop polling and show a concise error.
- `Sign out`, `Cancel Sign in`, panel teardown, a new sign-in attempt, or expiry stops the current polling loop.

`developmentAccessToken` remains supported for development and mock-server tests, but normal UI usage should prefer `Sign in`. In production builds, plaintext development tokens must not be used. Windows Credential Manager support is intentionally not implemented yet.


### CEP extension root layout

Development install links the whole lower directory as the CEP extension root. The manifest must live at lower/CSXS/manifest.xml; MainPath resolves to lower/panel/index.html and ScriptPath resolves to lower/jsx/flower.jsx. 
pm run install:dev validates all three paths after creating the junction and fails without printing [OK] if any path is missing.

