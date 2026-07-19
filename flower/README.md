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
- manifestの対象バージョン不一致: `manifest/CSXS/manifest.xml`の`Host Version`と`RequiredRuntime`を検証対象AEに合わせてください。
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
