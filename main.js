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
let currentPageNum = 1; // この変数は「問題番号」として扱う (1-25)
let currentAnswers = {};
let currentSubject = subjectSelect.value;
let currentEdition = '';

// --- 関数定義 ---

/** 索引ファイルを読み込み、実施回のセレクトボックスを初期化する */
async function setupEditionSelector() {
    try {
        const response = await fetch('./data/editions.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
        alert('editions.jsonの読み込みに失敗しました。ファイルが存在するか確認してください。');
    }
}

/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) {
    try {
        const response = await fetch(`./pdf/${edition}/answer.json`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        currentAnswers = await response.json();
    } catch (error) {
        console.error(`第${edition}回の解答ファイル読み込みに失敗:`, error);
        alert(`第${edition}回のanswer.jsonが見つかりません。`);
        currentAnswers = {};
    }
}

/** PDFを読み込んで表示する */
async function renderPdf() {
    currentPageNum = 1;
    const url = `./pdf/${currentEdition}/${currentSubject}.pdf`;

    try {
        pdfDoc = await pdfjsLib.getDocument(url).promise;
        pageCountSpan.textContent = pdfDoc.numPages > 1 ? pdfDoc.numPages - 1 : 0;
        renderPage(currentPageNum);
    } catch (error) {
        console.error('PDFの読み込みに失敗:', error);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        pageCountSpan.textContent = '0';
        pageNumSpan.textContent = '0';
        alert(`PDFファイルが見つかりません。\nパス: ${url}`);
    }
}

/** 指定されたページを描画する */
async function renderPage(num) {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(num + 1); // 表紙をスキップ
    const viewport = page.getViewport({ scale: 1.8 });
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport }).promise;

    pageNumSpan.textContent = num;
    resultArea.textContent = '';
    updateNavButtons();
}

/** 正誤を判定して結果を表示する */
function checkAnswer(selectedChoice) {
    const correctAnswer = currentAnswers?.[currentSubject]?.[currentPageNum];
    if (correctAnswer === undefined) {
        resultArea.textContent = 'この問題の解答データがありません。';
        return;
    }

    if (parseInt(selectedChoice, 10) === correctAnswer) {
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
    if (currentPageNum > 1) {
        currentPageNum--;
        renderPage(currentPageNum);
    }
});

nextBtn.addEventListener('click', () => {
    const totalQuestions = pdfDoc ? pdfDoc.numPages - 1 : 0;
    if (currentPageNum < totalQuestions) {
        currentPageNum++;
        renderPage(currentPageNum);
    }
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
    } else {
        alert("利用可能な実施回がありません。data/editions.jsonを確認してください。");
    }
}

initialize();
