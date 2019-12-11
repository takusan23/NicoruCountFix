setInterval(function () {

    //ニコる数が表示されるspanを取得する
    const spanList = document.getElementsByClassName('NicoruCell-count')
    for (let index = 0; index < spanList.length; index++) {
        const span = spanList[index];
        // ニコる数は　data-nicoru-count 属性に入っている。
        const nicoruCount = span.getAttribute('data-nicoru-count')
        span.innerHTML = nicoruCount
    }

 }, 10)