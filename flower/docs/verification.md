# flower 実機検証チェックリスト

状態は`未確認`、`成功`、`失敗`、`一部成功`のいずれかを記録する。

## 実行記録

| 項目 | 記録 |
| --- | --- |
| 実行日時 | 未確認 |
| OS | 未確認 |
| After Effects version | 未確認 |
| CEP version | 未確認 |
| flower commit | 未確認 |
| ログ参照 | 未確認 |

## チェックリスト

| 状態 | 項目 | 手順 | 結果メモ |
| --- | --- | --- | --- |
| 未確認 | CEPパネル表示 | Window > ExtensionsまたはExtensions (Legacy)からflowerを開く | |
| 未確認 | CEP runtime表示 | パネル上の`CEP runtime`がOKになる | |
| 未確認 | ExtendScript bridge疎通 | `Probe AE`を押す | |
| 未確認 | AE version取得 | probe結果に`app.version`が表示される | |
| 未確認 | Project path取得 | 保存済み/未保存プロジェクトの両方でprobeする | |
| 未確認 | item count取得 | Project panelのアイテム数と一致するか確認する | |
| 未確認 | selection取得 | Project panelで複数選択してprobeする | |
| 未確認 | 日本語パス | 日本語名フォルダ内のファイルを読み込む | |
| 未確認 | Windowsバックスラッシュ | Windowsでローカルファイル読み込みを行う | |
| 未確認 | macOSパス | macOSでローカルファイル読み込みを行う | |
| 未確認 | ImportOptions | `Import Local File`でファイルを選ぶ | |
| 未確認 | app.project.importFile() | 読み込み後にFootageItemがProject panelへ追加される | |
| 未確認 | FolderItem | 読み込んだアイテムが`flower`フォルダに格納される | |
| 未確認 | FootageItem属性 | id、name、width、height、duration、frameRate、filePathを確認する | |
| 未確認 | Item.comment書き込み | `Write Metadata`を押す | |
| 未確認 | 既存commentの扱い | 既存commentがある素材にメタデータを書き込む | |
| 未確認 | comment再オープン復元 | 保存、AE終了、再オープン後にcommentを確認する | |
| 未確認 | FootageItem.replace() | FootageItemを1つ選択し`Replace Selected Footage`を押す | |
| 未確認 | replace後Item.id | 差し替え前後でidが維持されるか確認する | |
| 未確認 | replace後Item.comment | 差し替え前後でcommentが維持されるか確認する | |
| 未確認 | comp参照維持 | 素材を配置したComp上でreplace後も参照が維持されるか確認する | |
| 未確認 | フッテージ解釈維持 | alpha、frame rate、pixel aspectなどを変更後にreplaceする | |
| 未確認 | 尺変更 | 短い素材/長い素材へreplaceする | |
| 未確認 | 解像度変更 | 異なる解像度の素材へreplaceする | |
| 未確認 | CompItem.layers.add() | アクティブCompで`Add To Active Comp`を押す | |
| 未確認 | 非Compエラー | Active itemがCompでない状態で`Add To Active Comp`を押す | |
| 未確認 | キャッシュfixture | `Run Cache Fixture`を押す | |
| 未確認 | キャッシュ再利用 | 2回連続で`Run Cache Fixture`を押す | |
| 未確認 | ハッシュ不一致 | fixture hashを不正値にして拒否されることを確認する | |
| 未確認 | ログ分離 | CEP UI、ExtendScript、Cache、Errorsの各ログを確認する | |
| 未確認 | トークン非表示 | 将来の署名付きURLやAuthorizationをログへ出さないことを確認する | |

## 自動成功扱いにしない項目

- `FootageItem.replace()`後のコンポジション参照維持。
- フッテージ解釈維持。
- 尺、解像度変更時のタイムライン挙動。
- 連番素材。
- プロキシ素材。
- 数GB規模のダウンロードとHTTP Range再開。
- After Effectsバージョン差、CEPバージョン差。
