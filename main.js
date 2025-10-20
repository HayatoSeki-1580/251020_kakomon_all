import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';

// --- HTML要素の取得 ---
const subjectSelect = document.getElementById('subject-select');
const editionSelect = document.getElementById('edition-select');
const canvas = document.getElementById('pdf-canvas');
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const resultArea = document.getElementById('result-area');
const answerButtons = document.querySelectorAll('.answer-btn');

// --- グローバル変数 ---
let pdfDoc = null;
let currentPageNum = 1; // この変数は「問題番号」として扱います (1-25)
let currentAnswers = {};
let currentSubject = subjectSelect.value;
let currentEdition = '';

// --- 関数定義 ---

/** 索引ファイルを読み込み、実施回のセレクトボックスを初期化する */
async function setupEditionSelector() {
    // ... (この関数は変更なし)
    try {
        const response = await fetch('./data/editions.json');
        const data = await response.json();
        const editions = data.available.sort((a, b) => b - a);

        editionSelect.innerHTML = '';
        editions.forEach(edition => {
            const option = document.createElement('option');
            option.value = edition;
            option.textContent = `第${edition}回`;
            editionSelect.appendChild(option);
        });
        currentEdition = editionSelect.value;
    } catch (error) {
        console.error('索引ファイル(editions.json)の読み込みに失敗:', error);
        alert('editions.jsonの読み込みに失敗しました。');
    }
}

/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) {
    // ... (この関数は変更なし)
    try {
        const response = await fetch(`./pdf/${edition}/answer.json`);
        currentAnswers = await response.json();
    } catch (error) {
        console.error(`第${edition}回の解答ファイル読み込みに失敗:`, error);
        alert(`第${edition}回のanswer.jsonが見つかりません。`);
        currentAnswers = {};
    }
}

/** PDFを読み込んで表示する */
async function renderPdf() {
    currentPageNum = 1; // 常に問題1からスタート
    const url = `./pdf/${currentEdition}/${currentSubject}.pdf`;

    try {
        const loadingTask = pdfjsLib.getDocument(url);
        pdfDoc = await loadingTask.promise;
        
        // 【変更】総問題数を (総ページ数 - 1) で表示
        pageCountSpan.textContent = pdfDoc.numPages - 1;
        
        renderPage(currentPageNum);
    } catch (error) {
        console.error('PDFの読み込みに失敗:', error);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        // 【変更】総問題数を0に
        pageCountSpan.textContent = '0';
        pageNumSpan.textContent = '0';
        alert('PDFファイルが見つかりません。');
    }
}

/** 指定されたページを描画する */
async function renderPage(num) {
    if (!pdfDoc) return;
    
    // 【最重要ポイント】問題番号に1を足して、実際のページ番号を指定する
    const page = await pdfDoc.getPage(num + 1);
    
    const viewport = page.getViewport({ scale: 1.8 });
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport }).promise;
    
    // UI上の表示はあくまで「問題番号」
    pageNumSpan.textContent = num;
    resultArea.textContent = '';
    updateNavButtons();
}

/** 正誤を判定して結果を表示する */
function checkAnswer(selectedChoice) {
    // 【ポイント】このロジックは変更不要。
    // currentPageNumは問題番号(1-25)なので、そのまま解答JSONのキーとして使える。
    if (!currentAnswers[currentSubject]?.[currentPageNum]) {
        resultArea.textContent = 'この問題の解答データがありません。';
        return;
    }
    const correctAnswer = currentAnswers[currentSubject][currentPageNum];
    if (parseInt(selectedChoice) === correctAnswer) {
        resultArea.textContent = `問${currentPageNum}: 正解！ 🎉`;
        resultArea.className = 'correct';
    } else {
        resultArea.textContent = `問${currentPageNum}: 不正解... (正解は ${correctAnswer}) ❌`;
        resultArea.className = 'incorrect';
    }
}

/** ナビゲーションボタンの有効/無効を更新 */
function updateNavButtons() {
    const totalQuestions = pdfDoc ? pdfDoc.numPages - 1 : 0;
    prevBtn.disabled = (currentPageNum <= 1);
    // 【変更】最後の問題かどうかを (総ページ数 - 1) で判定
    nextBtn.disabled = (currentPageNum >= totalQuestions);
}

// --- イベントリスナー ---
subjectSelect.addEventListener('change', (e) => {
    currentSubject = e.target.value;
    renderPdf();
});

editionSelect.addEventListener('change', async (e) => {
    currentEdition = e.target.value;
    await loadAnswersForEdition(currentEdition);
    await renderPdf();
});

prevBtn.addEventListener('click', () => {
    if (currentPageNum <= 1) return;
    currentPageNum--;
    renderPage(currentPageNum);
});

nextBtn.addEventListener('click', () => {
    const totalQuestions = pdfDoc ? pdfDoc.numPages - 1 : 0;
    if (currentPageNum >= totalQuestions) return;
    currentPageNum++;
    renderPage(currentPageNum);
});

answerButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        checkAnswer(e.target.dataset.choice);
    });
});


// --- 初期化処理 ---
async function initialize() {
    await setupEditionSelector();
    if (currentEdition) {
        await loadAnswersForEdition(currentEdition);
        await renderPdf();
    }
}

initialize();
