// @ts-check
// グローバルスコープを汚染しないよう即時実行関数式に閉じ込める
(() => {

    const COMMENT_API = 'https://public.nvcomment.nicovideo.jp/v1/threads'
    const COMMENT_RESPONSE_OWNER_COMMENT = 'owner'
    const COMMENT_LIST_FIND_INTERVAL_MS = 500
    const COMMENT_LIST_ITEM_ARIA_LABEL = 'ニコるボタン'

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
        // コメント一覧の仕様。普通のコメント、かんたんコメントは全て同じ一覧になる
        // https://blog.nicovideo.jp/niconews/225274.html
        // ので、レスポンスからそれらを取り出して結合し、時間の早い順で並び替えする
        // ただし投稿者コメントは出ない？
        const commentList = commentObject['data']['threads']
            .filter(thread => thread['fork'] !== COMMENT_RESPONSE_OWNER_COMMENT)
            .flatMap(thread => thread['comments'])
            .sort((a, b) => a['vposMs'] - b['vposMs'])

        /**
         * コメント一覧の各コメントを正しいニコる数に修正する
         * @param {Element[]} commentItemElementList コメント一覧の各コメント要素の配列
         */
        function fixNicoruCountElementList(commentItemElementList) {
            commentItemElementList.forEach(commentElement => {
                // コメント一覧の各コメント要素には data-index 属性が付いている。これが多分レスポンス JSON のコメント一覧に一致する
                const commentIndex = Number(commentElement.getAttribute('data-index'))
                const actualNicoruCount = commentList[commentIndex]['nicoruCount']
                const commentBody = commentList[commentIndex]['body']
                commentElement.setAttribute('comment-object', JSON.stringify(commentList[commentIndex]))
                // ニコる数を表示している要素を探す
                const nicoruCountElement = commentElement.getElementsByTagName('p')[0]
                const commentBodyElement = commentElement.getElementsByTagName('p')[1]
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

        // コメントリストを MutationObserver で監視する
        // これも setInterval はやっぱり良くないと思って
        const mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutationRecord => {
                fixNicoruCountElementList(mutationRecord.addedNodes)
            })
        })
        mutationObserver.observe(commentListElement, { childList: true })
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
                    .filter(button => button.getAttribute('aria-label') === COMMENT_LIST_ITEM_ARIA_LABEL)[0]
                    .parentElement
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

})()
