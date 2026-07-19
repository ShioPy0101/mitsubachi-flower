# flower アーキテクチャ

## 現在の範囲

このディレクトリはAfter Effects連携の技術検証ハーネスです。Mitsubachi本番API、製品版UI、認証、実ダウンロードは実装しません。

## 責務分離

```text
Mitsubachi
↓
flower client
↓
hash-based cache
↓
ExtendScript bridge
↓
After Effects project
```

### Mitsubachi

- `drive_item_id`でMitsubachi上の論理ファイルを識別する。
- `file_hash`でファイル内容を識別する。
- 権限、検索、ダウンロードURL発行、更新判定を担当する。
- このハーネスではfixture JSONで代替する。

### flower client

- CEPパネルとしてAfter Effects内に表示する。
- UI、状態表示、ユーザー操作、処理ログを担当する。
- After Effects DOMには直接触らず、ExtendScript bridgeへJSON文字列で依頼する。
- SHA-256やキャッシュ処理はNode.js側で行う。

### hash-based cache

- `file_hash`からローカルキャッシュパスを生成する。
- 例: `flower/cache/sha256/ab/abcdef.../payload.mp4`
- 一時ファイルへ書き込み、SHA-256検証後に正式パスへrenameする。
- 同じ`file_hash`なら、異なる`drive_item_id`やファイル名でも同じ実体を再利用できる。
- ハッシュ不一致時は一時ファイルを削除してAfter Effectsへ読み込ませない。

### ExtendScript bridge

- After Effects DOM操作だけを担当する。
- `app.project.importFile()`、`ImportOptions`、`FootageItem.replace()`、`CompItem.layers.add()`、`FolderItem`、`Item.comment`、`Item.id`を検証する。
- 例外は握りつぶさず、`{ ok: false, error: { code, message } }`のJSON文字列で返す。
- 古いECMAScript環境として扱い、現代的な構文を避ける。

### After Effects project

- 読み込まれた実ファイルだけを保持する。
- 0バイト仮ファイルは読み込ませない。
- `Item.comment`へflowerメタデータを保存し、プロジェクト再オープン後の復元候補にする。

## `drive_item_id`と`file_hash`

- `drive_item_id`: Mitsubachi上の論理アイテムのID。権限、名前、階層、更新履歴、UI上の選択対象に使う。
- `file_hash`: ファイル内容のID。キャッシュキー、重複排除、ダウンロード後検証、AEへ読み込ませる実ファイルの同一性判定に使う。

同じ`drive_item_id`でも更新されれば`file_hash`は変わる。同じ`file_hash`なら、複数の`drive_item_id`が同じローカルキャッシュを共有できる。

## データフロー

1. CEPパネルでfixture素材を選ぶ。
2. `file_hash`からキャッシュパスを計算する。
3. キャッシュがあれば再利用する。
4. キャッシュがなければfixtureを一時ファイルへコピーする。
5. SHA-256を計算し、fixtureの`file_hash`と照合する。
6. 一致したら正式キャッシュパスへrenameする。
7. CEPからExtendScriptへキャッシュ済み実ファイルの読み込みを依頼する。
8. ExtendScriptがAfter Effects projectへ読み込む。
9. `Item.comment`へ`driveItemId`と`fileHash`を保存する。

## ログ

- CEP UIログ: ボタン操作、bridge呼び出し。
- ExtendScriptログ: AE DOM操作の戻り値JSON。
- キャッシュ処理ログ: ハッシュ計算、一時ファイル、再利用、拒否。
- エラーログ: UI、bridge、キャッシュの失敗。

認証トークン、署名付きURL、Authorizationヘッダーはログへ出さない。
