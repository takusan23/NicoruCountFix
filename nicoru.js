// @ts-check

// nicoru-intercept.js の JS コードを <script> で差し込んでロードする
// コンテンツスクリプトでやろうとすると、視聴ページの window オブジェクトにアクセスできない
//（拡張機能別に window オブジェクトが用意されていて、視聴ページの window オブジェクトは隔離されてアクセスできない）

// これの解決策として、<script> を差し込む方法がある。これなら視聴ページの window オブジェクトを書き換えることが出来る
// 参考：https://stackoverflow.com/questions/9515704/
// nicoru-intercept.js が正しいニコる数に書き換えるコードです。nicoru.js は nicoru-intercept.js のコードを視聴ページへ差し込むだけです。
// manifest.json に登録が必要です。

const interceptScriptElement = document.createElement('script')
interceptScriptElement.setAttribute('type', 'text/javascript')
interceptScriptElement.src = chrome.runtime.getURL('nicoru-intercept.js')
interceptScriptElement.onload = () => { interceptScriptElement.remove() }
document.documentElement.appendChild(interceptScriptElement)