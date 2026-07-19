# flower After Effects連携 技術調査

調査日: 2026-07-20

## 調査対象

- CEPパネル
- ExtendScript
- ScriptUI
- UXP
- C++プラグイン
- ローカル補助プロセスとの連携
- After Effects DOM操作
- CEPとExtendScriptの通信
- ネットワーク、ファイル、配布、開発手順

## 確認済み事項

### 拡張方式

- CEPはHTML/CSS/JavaScriptでAdobeアプリケーション内パネルを作る仕組みで、Panel型の拡張をmanifestで定義できる。Adobe CEP CookbookにCEP拡張、Panel型、manifest、`MainPath`、`ScriptPath`、`CEFCommandLine`の説明がある。
- After EffectsのCEPホスト名は`AEFT`。Adobe CEP CookbookのCEP 12対応表ではAfter Effects 25.0がCEP 12、After Effects 18.4がCEP 11として記載されている。
- CEPからホストアプリのExtendScriptを呼ぶには`CSInterface.evalScript()`を使う。Cookbookは`evalScript`がホストアプリのExtendScriptエンジンで実行されること、ホストアプリのメインスレッドに関わることを説明している。
- CEP 6.1以降ではNode.js APIはデフォルト無効で、manifestの`--enable-nodejs`で有効化する。CEP 7以降では`--mixed-context`が利用できる。
- 開発時の未署名拡張読み込みには`PlayerDebugMode=1`が必要。Windowsは`HKCU\Software\Adobe\CSXS.<version>`、macOSは`defaults write com.adobe.CSXS.<version> PlayerDebugMode 1`。
- 開発用拡張の配置先は一般に、macOSは`~/Library/Application Support/Adobe/CEP/extensions`、Windowsは`%APPDATA%\Adobe\CEP\extensions`。

### After Effects DOM操作

- `app.project.importFile(importOptions)`は`ImportOptions`で指定したファイルを読み込み、`FootageItem`を返す。
- `ImportOptions`は読み込みオプションを保持し、コンストラクタにExtendScriptの`File`を渡せる。
- `FootageItem.replace(file)`は指定ファイルにソースを差し替える。新しい`FileSource`を作り、`name`、`width`、`height`、`frameDuration`、`duration`をファイル内容に基づき設定し、既存のフッテージ解釈パラメータを保持すると説明されている。
- `LayerCollection.add(item[, duration])`は`AVItem`をコンポジションのレイヤーとして追加し、`AVLayer`を返す。
- `FolderItem`はProject panel内フォルダを表し、各種アイテムを含められる。
- `Item.parentFolder`は読み書き可能で、`ItemCollection.addFolder()`で作ったフォルダへアイテムを移動できる。
- `Item.comment`は読み書き可能な文字列で、最大15,999 bytes。表示や挙動には影響しないユーザー用コメント。
- `Item.id`は内部識別用の永続IDで、プロジェクト保存と再オープン後も維持される。ただし別プロジェクトへ読み込むと新IDが割り当てられる。
- `Project.selection`でProject panelの選択中アイテム配列を取得できる。
- `Project.activeItem`で現在のアクティブアイテムを取得できる。

### CEPとExtendScript通信

- CEP側は`CSInterface.evalScript(script, callback)`で文字列のExtendScriptを実行し、戻り値をcallbackで受け取る。
- 引数はJSONを一度文字列化し、その文字列を`JSON.stringify`でExtendScript文字列リテラルにする方針が安全。改行、引用符、バックスラッシュ、日本語、Windows/macOSパスは自動テストでエスケープ確認する。
- 戻り値はExtendScript側で`{ ok: true, data }`または`{ ok: false, error }`をJSON文字列として返す。CEP側はJSON parseに失敗した場合もブリッジエラーとして扱う。

### ネットワークとファイル操作

- CEP側でNode.js APIを有効化すれば、Node標準APIによるファイルI/O、HTTP処理、SHA-256計算、stream、renameが利用候補になる。
- 大容量ダウンロード、HTTP Range再開、SHA-256計算、一時ファイル、atomic renameはCEP/Nodeまたはローカル補助プロセス側で扱うべきであり、ExtendScriptへ実装しない。
- 認証情報はログへ出さない。保存先はOSの資格情報ストア連携を優先候補とし、CEP単体のローカルファイル保存を前提にしない。

### 配布と開発

- CEP開発ではmanifest、CSXS runtime version、Host version range、`MainPath`、`ScriptPath`、Panel UI設定が必要。
- パッケージングと署名は製品化時の課題。開発ハーネスは未署名のため`PlayerDebugMode`を使う。
- WindowsとmacOSでは拡張配置場所、debug設定、パス表現が異なる。

## 推測事項

- flowerの製品版UIはCEPパネルが現実的。After Effects DOM操作はExtendScriptに寄せ、重いI/OはCEP/Nodeまたは補助プロセスに分離する構成が適切と思われる。
- 数GBファイルのダウンロードはCEP内Node streamでも可能と思われるが、CEP同梱Nodeのバージョン差や長時間処理時の安定性は未検証。必要ならローカル補助プロセスへ切り出す。
- 認証情報保存はOS credential storeを使うNodeモジュール、またはMitsubachi本体側の既存認証導線との連携が候補。ただしCEP同梱Nodeでnative moduleを使う場合は互換性リスクがある。
- `Item.comment`へflower JSONだけを上書き保存するのはハーネスとして単純だが、製品版では既存コメントを保持するラッパー形式または別管理の検討が必要。
- `Item.id`と`Item.comment`の組み合わせでプロジェクト再オープン後の対応復元は可能と思われる。ただしファイル差し替え、プロジェクト読み込み、複製、収集、別名保存での挙動は実機検証が必要。

## 実機検証が必要な事項

- 対象After EffectsバージョンごとのCEP manifest表示可否。
- `CSInterface.js`の実配置と今回の開発stub差し替え要否。
- 日本語ファイル名、改行、引用符、バックスラッシュを含む値を`evalScript`経由で渡した時の実挙動。
- `File.openDialog()`の安定性、OS別パスの`fsName`表現。
- `app.project.importFile()`で動画、静止画、音声、連番素材を読み込んだ時の返却値と属性。
- `Item.comment`に既存コメントがある場合の上書き可否、文字数制限、保存再オープン後の復元。
- `FootageItem.replace()`後に`Item.id`、`Item.comment`、コンポジション上の参照、フッテージ解釈、尺、解像度がどう変化するか。
- `CompItem.layers.add()`がアクティブコンポジションに対して期待通り動作するか。
- CEP/Nodeでの数GBダウンロード、Range再開、atomic renameのOS別挙動。
- macOS Gatekeeper、Windows SmartScreen、ZXP署名、Adobe Exchange外配布の実運用。
- UXPがAfter Effectsでflower用途に正式利用可能か。今回の調査では採用根拠なし。

## 採用候補

- 開発ハーネス: CEPパネル + ExtendScript + CEP内Node.js。
- 製品版の第一候補: CEPパネル + ExtendScript + Nodeまたはローカル補助プロセス。
- ローカル補助プロセスは、大容量ダウンロード、認証情報管理、native credential store、長時間処理の安定化が必要になった段階で検討する。

## 不採用候補

- ScriptUI単体: UIが古く、Mitsubachi検索、状態表示、大容量処理との統合に向かない。
- ExtendScript単体: 古いECMAScript環境で、大容量ダウンロードやSHA-256実装に不向き。
- UXP: After Effectsで正式利用可能と確認できていないため、現時点では前提にしない。
- C++プラグイン: AE DOM操作や素材管理パネルというflowerの目的に対して初期コストが高い。低レベルレンダリングやエフェクト処理が必要になった場合の選択肢。

## 参考資料

- Adobe CEP Resources / CEP 12 HTML Extension Cookbook: https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md
- Adobe CEP Getting Started guides: https://github.com/Adobe-CEP/Getting-Started-guides
- After Effects Scripting Guide / Project: https://ae-scripting.docsforadobe.dev/general/project/
- After Effects Scripting Guide / ImportOptions: https://ae-scripting.docsforadobe.dev/other/importoptions/
- After Effects Scripting Guide / Item: https://ae-scripting.docsforadobe.dev/item/item/
- After Effects Scripting Guide / FootageItem: https://ae-scripting.docsforadobe.dev/item/footageitem/
- After Effects Scripting Guide / FolderItem: https://ae-scripting.docsforadobe.dev/item/folderitem/
- After Effects Scripting Guide / LayerCollection: https://ae-scripting.docsforadobe.dev/layer/layercollection/
- Adobe Help / Importing and interpreting footage items: https://helpx.adobe.com/after-effects/using/importing-interpreting-footage-items.html
