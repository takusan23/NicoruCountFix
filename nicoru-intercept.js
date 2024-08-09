// @ts-check
// グローバルスコープを汚染しないよう即時実行関数式に閉じ込める
(() => {

    const COMMENT_API = 'https://public.nvcomment.nicovideo.jp/v1/threads'
    const COMMENT_RESPONSE_OWNER_COMMENT = 'owner'
    const COMMENT_LIST_FIND_INTERVAL_MS = 500
    const COMMENT_LIST_ITEM_ARIA_LABEL = 'ニコるボタン'
    // NG 設定とかを localStorage で読み出す
    const LOCAL_STORAGE_KEY_NG_SHARE_SETTING = 'nvpc:watch'
    const LOCAL_STORAGE_KEY_NG_USER_COMMENT = '@nvweb-packages/comments:userng:v2'

    /** MutationObserver 破棄用 @type {MutationObserver?} */
    let currentMutationObserver = null

    // fetch API を上書きして、レスポンスを傍聴出来るようにする。かなりグレーゾーン
    // ニコる数が HTML 内に埋め込まれなくなったため、コメント API のレスポンスを取得する
    // https://stackoverflow.com/questions/45425169/
    const { fetch: origFetch } = window;
    window.fetch = async (...args) => {
        const response = await origFetch(...args);

        // 影響を最小限にするため、コメント以外はなにもしない
        if (response.url === COMMENT_API) {
            response
                .clone()
                .json()
                .then(data => {
                    // コメントが取得（傍聴）できたら、コメント一覧のニコる数を正しい数に修正する処理を呼び出す
                    startFixNicoruCount(data);
                })
                .catch(err => console.error(err));
        }

        return response;
    }

    /**
     * ニコる数を正しい数に修正する
     * @param {*} commentObject コメント API のレスポンス JSON
     */
    async function startFixNicoruCount(commentObject) {
        const ngShare = getShareNg()
        const ngUserList = getUserNgList()
        const ngWordList = getCommentNgList()
        // コメント一覧の仕様。普通のコメント、かんたんコメントは全て同じ一覧になる
        // https://blog.nicovideo.jp/niconews/225274.html
        const commentList = commentObject['data']['threads']
            .filter(thread => thread['fork'] !== COMMENT_RESPONSE_OWNER_COMMENT) // 投稿者コメントは出ない？
            .flatMap(thread => thread['comments']) // コメントのオブジェクトにする
            .filter(comment => checkNgComment(Number(comment['score']), ngShare)) // 共有 NG を考慮
            .filter(comment => !ngUserList.includes(comment['userId'])) // NG ユーザーを考慮
            .filter(comment => !ngWordList.includes(comment['body'])) // NG コメントを考慮
            .sort((a, b) => a['vposMs'] - b['vposMs']) // 時間の早い順に

        /**
         * コメント一覧の各コメントを正しいニコる数に修正する
         * @param {Element[]} commentItemElementList コメント一覧の各コメント要素の配列
         */
        function fixNicoruCountElementList(commentItemElementList) {
            commentItemElementList.forEach(commentElement => {
                // コメント一覧の各コメント要素には data-index 属性が付いている。これが多分レスポンス JSON のコメント一覧に一致する
                const commentIndex = Number(commentElement.getAttribute('data-index'))
                let actualNicoruCount = commentList[commentIndex]['nicoruCount']
                const commentBody = commentList[commentIndex]['body']
                // ニコっていれば nicoruId が存在する
                const isNicotta = !!commentList[commentIndex]['nicoruId']
                // TODO デバッグ用
                // commentElement.setAttribute('comment-object', JSON.stringify(commentList[commentIndex]))
                // ニコる数を表示している要素を探す
                const nicoruCountElement = commentElement.getElementsByTagName('p')[0]
                const commentBodyElement = commentElement.getElementsByTagName('p')[1]
                const nicoruSvgElement = commentElement.getElementsByTagName('svg')[0]
                // ページが読み込まれた後にニコるボタンを押した、解除したとき
                // レスポンス JSON と SVG の CSS の rotate が一致しない場合は、読み込み後にニコるの操作をした判定をする
                const isLatestNicotta = nicoruSvgElement.classList.contains('transform_rotate(-90deg)')
                if (isLatestNicotta !== isNicotta) {
                    // ニコる数の修正をする。レスポンス JSON より +1 / -1 する
                    if (isLatestNicotta) {
                        actualNicoruCount += 1
                    } else {
                        actualNicoruCount -= 1
                    }
                }
                // ただ、合ってなかったら怖いので、一応コメントも一致しているか確認してから
                if (commentBodyElement.textContent === commentBody) {
                    nicoruCountElement.textContent = actualNicoruCount
                }
            })
        }

        // コメント一覧部分の要素を取得する
        // また、既に表示されている分のニコる数の修正をする
        const commentListElement = await awaitAddCommentListElement()
        fixNicoruCountElementList(Array.from(commentListElement.children))

        // コメントリストを MutationObserver で監視する。前回のがあれば破棄してから
        // これも setInterval はやっぱり良くないと思って
        currentMutationObserver?.disconnect()
        currentMutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutationRecord => {
                fixNicoruCountElementList(mutationRecord.addedNodes)
            })
        })
        currentMutationObserver.observe(commentListElement, { childList: true })
    }

    /**
     * コメント一覧の要素が表示されたかを setInterval で定期的に走査し、見つかり次第 Promise で返す
     * @returns {Promise<HTMLElement>}
     */
    function awaitAddCommentListElement() {
        return new Promise((resolve, reject) => {
            // TODO setInterval で探すの強行突破感があって嫌なんだけど、id 属性とかも付いてなくて手がかりが無い。aria-label からたどっていくしかなさそう
            let intervalId = null
            intervalId = setInterval(() => {
                // ニコるボタンを探して、4 つ上の要素まで戻ると、コメント一覧の要素
                const commentListElementOrNull = Array.from(document.getElementsByTagName('button'))
                    .filter(button => button.getAttribute('aria-label') === COMMENT_LIST_ITEM_ARIA_LABEL)
                    ?.[0]
                    ?.parentElement
                    ?.parentElement
                    ?.parentElement
                    ?.parentElement
                // 見つかった
                if (commentListElementOrNull) {
                    resolve(commentListElementOrNull)
                    clearInterval(intervalId)
                }
            }, COMMENT_LIST_FIND_INTERVAL_MS)
        })
    }

    /**
     * プレイヤーの共有 NG 設定に応じてコメントを表示できるか判定する
     * 判別は以下の方法で：https://dic.nicovideo.jp/t/a/ng共有機能
     * 
     * @param score {Number}
     * @param ngSetting {'none'|'low'|'middle'|'high'}
     * @returns 表示可能な場合は true
     */
    function checkNgComment(score, ngSetting) {
        switch (ngSetting) {
            case "none":
                return true
            case "low":
                return score > -10000
            case "middle":
                return score > -4800
            case "high":
                return score > -1000
        }
    }

    /**
     * プレイヤーの共有 NG 設定を読み出す
     * @returns {'none'|'low'|'middle'|'high'} のどれか、設定画面の NG 設定の順番通り
     */
    function getShareNg() {
        return getLocalStorageJson(LOCAL_STORAGE_KEY_NG_SHARE_SETTING)?.['data']?.['ngScoreThreshold']?.['data'] ?? 'none'
    }

    function getCommentNgList() {
        return Object.keys(getLocalStorageJson(LOCAL_STORAGE_KEY_NG_USER_COMMENT)?.['data']?.['lastMatchedTimeMap']?.['data']?.['word'])
    }

    function getUserNgList() {
        return Object.keys(getLocalStorageJson(LOCAL_STORAGE_KEY_NG_USER_COMMENT)?.['data']?.['lastMatchedTimeMap']?.['data']?.['id'])
    }

    /**
     * localStorage にある JSON でシリアライズされた値を取得する
     * @param {*} localStorageKey localStorage のキー
     * @returns JSON オブジェクト
     */
    function getLocalStorageJson(localStorageKey) {
        const jsonString = localStorage.getItem(localStorageKey)
        if (jsonString) {
            return JSON.parse(jsonString)
        } else {
            return {}
        }
    }

})()
