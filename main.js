import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';

// --- HTML要素の取得 ---
const subjectSelect = document.getElementById('subject-select');
const editionSelect = document.getElementById('edition-select');
const goBtn = document.getElementById('go-btn');
const canvas = document.getElementById('pdf-canvas');
// ... (他の要素取得は省略) ...
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const resultArea = document.getElementById('result-area');
const answerButtons = document.querySelectorAll('.answer-btn');


// --- グローバル変数 ---
let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let currentSubject = subjectSelect.value;
let currentEdition = '';

// --- 関数定義 ---

/** 索引ファイルを読み込み、実施回のセレクトボックスを初期化する */
async function setupEditionSelector() {
    // ... (この関数は変更なし) ...
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
        alert('editions.jsonの読み込みに失敗しました。');
    }
}


/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) {
    // 【変更】解答ファイルのパスを修正
    const url = `./pdf/${edition}/${edition}_answer.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        currentAnswers = await response.json();
    } catch (error) {
        console.error(`解答ファイル読み込みに失敗:`, error);
        alert(`解答ファイルが見つかりません。\nパス: ${url}`);
        currentAnswers = {};
    }
}

/** PDFを読み込んで表示する */
async function renderPdf() {
    currentPageNum = 1;
    // 【最重要】PDFのパス生成ロジックを修正
    const url = `./pdf/${currentEdition}/${currentEdition}_${currentSubject}.pdf`;

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

// ... renderPage, checkAnswer, updateNavButtons の各関数は変更なし ...
async function renderPage(num) {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(num + 1);
    const viewport = page.getViewport({ scale: 1.8 });
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport }).promise;
    pageNumSpan.textContent = num;
    resultArea.textContent = '';
    updateNavButtons();
}
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
function updateNavButtons() {
    const totalQuestions = pdfDoc ? pdfDoc.numPages - 1 : 0;
    prevBtn.disabled = (currentPageNum <= 1);
    nextBtn.disabled = (currentPageNum >= totalQuestions);
}


// --- イベントリスナー (Goボタン方式) ---
subjectSelect.addEventListener('change', (e) => {
    currentSubject = e.target.value;
});

editionSelect.addEventListener('change', (e) => {
    currentEdition = e.target.value;
});

goBtn.addEventListener('click', async () => {
    await loadAnswersForEdition(currentEdition);
    await renderPdf();
});

// ... prevBtn, nextBtn, answerButtonsのリスナーは変更なし ...
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
        const context = canvas.getContext('2d');
        context.font = "20px sans-serif";
        context.textAlign = "center";
        context.fillText("科目と実施回を選択して「表示」ボタンを押してください。", canvas.width / 2, 50);
    } else {
        alert("利用可能な実施回がありません。data/editions.jsonを確認してください。");
    }
}

initialize();
