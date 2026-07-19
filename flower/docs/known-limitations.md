# 既知の制約と未確認事項

## 現在の制約

- 技術検証ハーネスであり、製品版ではない。
- Mitsubachi API接続、認証、検索UI、実ダウンロードは未実装。
- キャッシュ処理は小さいfixtureファイルのコピーで検証している。
- 大容量ダウンロード、HTTP Range再開、帯域制御、キャンセル、進捗永続化は未実装。
- ExtendScriptでは大容量I/O、SHA-256、ネットワーク処理を実装しない。
- `Item.comment`はハーネスではflower JSONで上書きする。既存コメントを保持する製品仕様は未設計。
- キャッシュファイル名はAE読み込み互換性を考えてfixture名の拡張子を`payload.ext`へ残している。同一ハッシュで拡張子メタデータが異なる場合の共有方針は未確定。
- 自動差し替えは行わない。更新反映は利用者の明示操作に限定する。
- 0バイト仮ファイルは使わない。
- ネイティブドラッグ&ドロップは未検証。
- 連番素材、プロキシ素材、オフライン素材、収集済みプロジェクトは別途検証が必要。
- UXP対応は前提にしない。

## 互換性リスク

- CEP runtime、同梱Chromium、同梱Node.jsはAfter Effectsバージョンで異なる。
- `CSInterface.js`の配置はプロジェクト内stubではなくAdobe提供版へ差し替えが必要になる可能性がある。
- CEPでNode.js native moduleを使う場合、CEP同梱Node/V8との互換性が問題になる可能性がある。
- macOSとWindowsでパス、権限、debug設定、拡張配置先が異なる。
- macOSのplist cacheにより`PlayerDebugMode`設定反映が遅れる場合がある。
- Windowsのレジストリ設定はCSXSバージョンごとに必要。
- After Effectsの言語設定により`Item.typeName`はローカライズされるため、型判定には`instanceof`を使う。

## 技術的不明点

- After EffectsでUXPがflower用途のパネルとして正式利用可能か。
- `FootageItem.replace()`後に`Item.comment`と`Item.id`が全バージョンで維持されるか。
- コンポジション上のレイヤー参照がreplace後にどの条件で維持されるか。
- フッテージ解釈、尺、解像度変更時の詳細挙動。
- Project保存、別名保存、別プロジェクトへのimport、Team Projectでの`Item.id`とcomment復元。
- 署名、配布、企業環境でのCEP extension許可ポリシー。
- 認証情報を安全に保存する最終方式。

## 次の実装候補

- Adobe提供`CSInterface.js`の導入方法を確定する。
- 実機検証結果を`docs/verification.md`へ記録する。
- Mitsubachi APIの読み取り専用fixture互換クライアントを追加する。
- キャッシュ処理へキャンセル、進捗、HTTP Range、破損キャッシュ隔離を追加する。
- `Item.comment`既存内容を保持するメタデータ格納形式を設計する。
- ローカル補助プロセスが必要か判断するため、大容量ダウンロードの実測を行う。
