# 日中小説オノマトペ対照分析検索インターフェース

JCFPC（Japanese-Chinese Fiction Parallel Corpus, ongoing）に基づく、日中小説オノマトペ対照分析のための研究プロトタイプです。

本インターフェースは、約200語の日本語オノマトペを対象に、日中対訳例を検索・閲覧するために開発されました。語彙項目、形態、後接用法から用例を絞り込み、KWIC表示と対訳表示を切り替えて確認できます。

## 概要

この公開版は、JCFPC 全体を自由検索できるシステムではなく、オノマトペ研究に対象を限定した検索インターフェースです。研究発表・デモンストレーションで利用しやすいよう、固定された対象語彙項目を中心に設計しています。

主な機能：

- 約200語の日本語オノマトペ対象語彙項目による検索
- 形態分類による絞り込み
- 後接用法による絞り込み
- 作品別フィルター
- KWIC一覧表示
- 日本語原文と中国語訳の対訳用例表示
- スマートフォン表示への対応

## JCFPCについて

JCFPC（Japanese-Chinese Fiction Parallel Corpus）は、日中小説対訳研究のために構築中のパラレルコーパスです。

本インターフェースは、JCFPC に含まれる日中小説対訳データのうち、日本語オノマトペの分析に関わる範囲を対象としています。JCFPC 本体は現在も構築・整備中です。

## 開発者

廉沢奇（LIAN ZEQI）  
神戸大学  国際文化学研究科
2026年

本ページは研究用プロトタイプであり、神戸大学の公式サービスではありません。

## 公開範囲

このインターフェースは、研究発表用の限定的な公開版として設計されています。全文検索システムではなく、オノマトペ研究に必要な用例確認を目的としたものです。

現在の公開版では、原文・訳文を全文閲覧する機能や、大量ダウンロード機能は提供していません。

## 利用方法

ブラウザで [`こちらのページ`](https://lzq628.github.io/jcfpc-onomatopoeia-interface/)を開くと利用できます。GitHub Pages などの静的ホスティングにもそのまま配置できます。


## English

This is a research prototype for Japanese-Chinese onomatopoeia contrastive analysis, based on JCFPC: Japanese-Chinese Fiction Parallel Corpus (ongoing).

The interface provides curated access to approximately 200 Japanese onomatopoeic items and their Japanese-Chinese parallel examples. It supports filtering by lexical item, morphological pattern, and following usage class, with both KWIC and parallel-example views.

Developed by LIAN ZEQI, Graduate School of Intercultural Studies, Kobe University, 2026.