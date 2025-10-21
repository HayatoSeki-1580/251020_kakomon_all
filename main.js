// --- デバッグメッセージ ---
console.log("✅ main.js スクリプトの読み込み開始");

// --- モジュールのインポート ---
import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';
console.log("✅ PDF.jsライブラリのインポート成功");

// --- HTML要素の取得 ---
const welcomeOverlay = document.getElementById('welcome-overlay');
const canvas = document.getElementById('pdf-canvas');
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const jumpToSelect = document.getElementById('jump-to-select');
const tabByEdition = document.getElementById('tab-by-edition');
const tabByField = document.getElementById('tab-by-field');
const panelByEdition = document.getElementById('panel-by-edition');
const panelByField = document.getElementById('panel-by-field');
const editionSelect = document.getElementById('edition-select');
const subjectSelectEdition = document.getElementById('subject-select-edition');
const goBtnEdition = document.getElementById('go-btn-edition');
const resultAreaEdition = document.getElementById('result-area-edition');
const subjectSelectField = document.getElementById('subject-select-field');
const fieldSelect = document.getElementById('field-select');
const goBtnField = document.getElementById('go-btn-field');
const resultAreaField = document.getElementById('result-area-field');
const answerButtons = document.querySelectorAll('.answer-btn');
console.log("✅ HTML要素の取得完了");

// --- グローバル変数 ---
let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let fieldsData = {};
let currentFieldQuestions = [];
let currentFieldIndex = 0;
// 【修正】正しい要素から初期値を取得
let currentSubject = subjectSelectEdition.value;
let currentEdition = '';

/** 索引ファイル(editions.json)を読み込む */
async function setupEditionSelector() {
    console.log("🔄 setupEditionSelector 関数を開始");
    try {
        const url = './data/editions.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTPエラー！ ステータス: ${response.status}`);
        const data = await response.json();
        const editions = data.available.sort((a, b) => b.value - a.value);
        editionSelect.innerHTML = '';
        editions.forEach(editionInfo => {
            const option = document.createElement('option');
            option.value = editionInfo.value;
            option.textContent = editionInfo.displayText;
            editionSelect.appendChild(option);
        });
        currentEdition = editionSelect.value;
    } catch (error) {
        console.error("❌ setupEditionSelector 関数で致命的なエラー:", error);
    }
}

/** 分野別ファイル(fields.json)を読み込む */
async function loadFieldsData() {
    console.log("🔄 fields.jsonを読み込みます");
    try {
        const response = await fetch('./data/fields.json');
        if (!response.ok) throw new Error('HTTPエラー');
        fieldsData = await response.json();
        console.log("✅ fields.jsonの読み込み成功", fieldsData);
        populateFieldSelector();
    } catch (error) {
        console.error("❌ fields.jsonの読み込みに失敗", error);
    }
}

/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) {
    const url = `./pdf/${edition}/${edition}_answer.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTPエラー！ ステータス: ${response.status}`);
        currentAnswers = await response.json();
    } catch (error) {
        currentAnswers = {};
        console.error(`解答ファイルが見つかりません: ${url}`);
    }
}

/** PDFを読み込んで表示する */
async function renderPdf(edition, subject, pageNum = 1) {
    currentPageNum = pageNum;
    const url = `./pdf/${edition}/${edition}_${subject}.pdf`;
    const loadingTaskOptions = {
        cMapUrl: './lib/pdfjs/web/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: './lib/pdfjs/web/standard_fonts/'
    };
    try {
        const loadingTask = pdfjsLib.getDocument(url, loadingTaskOptions);
        pdfDoc = await loadingTask.promise;
        const totalQuestions = pdfDoc.numPages > 1 ? pdfDoc.numPages - 1 : 0;
        if (currentFieldQuestions.length === 0) {
            pageCountSpan.textContent = totalQuestions;
            populateJumpSelector(totalQuestions);
        }
        await renderPage(currentPageNum);
    } catch (error) {
        console.error("❌ PDFの読み込みに失敗:", error);
        alert(`PDFファイルが見つかりません。\nパス: ${url}`);
    }
}

/** ジャンプ用プルダウンを生成する */
function populateJumpSelector(totalQuestions) {
    jumpToSelect.innerHTML = '<option value="">移動...</option>';
    for (let i = 1; i <= totalQuestions; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `問${i}`;
        jumpToSelect.appendChild(option);
    }
}

/** 指定されたページを描画する */
async function renderPage(num) {
    if (!pdfDoc) return;
    try {
        const page = await pdfDoc.getPage(num + 1);
        const viewport = page.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        if (currentFieldQuestions.length > 0) {
            pageNumSpan.textContent = currentFieldIndex + 1;
        } else {
            pageNumSpan.textContent = num;
        }

        resultAreaEdition.textContent = '';
        resultAreaField.textContent = '';
        updateNavButtons();
        jumpToSelect.value = num;
    } catch (error) {
        console.error("❌ ページ描画中にエラー:", error);
    }
}

/** 分野別プルダウンを生成する */
function populateFieldSelector() {
    const subject = subjectSelectField.value;
    const fields = fieldsData[subject] || [];
    fieldSelect.innerHTML = '';
    fields.forEach((field, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = field.fieldName;
        fieldSelect.appendChild(option);
    });
}

/** 分野別の問題を表示する */
async function displayFieldQuestion(index) {
    const question = currentFieldQuestions[index];
    await loadAnswersForEdition(question.edition);
    await renderPdf(question.edition, subjectSelectField.value, parseInt(question.pageNum, 10));
}

/** 正誤を判定して結果を表示する */
function checkAnswer(selectedChoice) {
    const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;
    let correctAnswer;

    if (currentFieldQuestions.length > 0) {
        const question = currentFieldQuestions[currentFieldIndex];
        correctAnswer = currentAnswers?.[subjectSelectField.value]?.[question.pageNum];
    } else {
        correctAnswer = currentAnswers?.[subjectSelectEdition.value]?.[currentPageNum];
    }

    if (correctAnswer === undefined) {
        resultArea.textContent = '解答データがありません。';
        return;
    }
    if (parseInt(selectedChoice, 10) === correctAnswer) {
        resultArea.textContent = `正解！ 🎉`;
        resultArea.className = 'result-area correct';
    } else {
        resultArea.textContent = `不正解... (正解は ${correctAnswer}) ❌`;
        resultArea.className = 'result-area incorrect';
    }
}

/** ナビゲーションボタンの有効/無効を更新 */
function updateNavButtons() {
    if (currentFieldQuestions.length > 0) {
        prevBtn.disabled = (currentFieldIndex <= 0);
        nextBtn.disabled = (currentFieldIndex >= currentFieldQuestions.length - 1);
    } else {
        const totalQuestions = pdfDoc ? pdfDoc.numPages - 1 : 0;
        prevBtn.disabled = (currentPageNum <= 1);
        nextBtn.disabled = (currentPageNum >= totalQuestions);
    }
}

// --- イベントリスナーの設定 ---
tabByEdition.addEventListener('click', () => {
    tabByEdition.classList.add('active');
    tabByField.classList.remove('active');
    panelByEdition.classList.remove('hidden');
    panelByField.classList.add('hidden');
});
tabByField.addEventListener('click', () => {
    tabByField.classList.add('active');
    tabByEdition.classList.remove('active');
    panelByField.classList.remove('hidden');
    panelByEdition.classList.add('hidden');
});

goBtnEdition.addEventListener('click', async () => {
    welcomeOverlay.style.display = 'none';
    window.scrollTo(0, 0);
    currentFieldQuestions = [];
    currentEdition = editionSelect.value;
    currentSubject = subjectSelectEdition.value;
    await loadAnswersForEdition(currentEdition);
    await renderPdf(currentEdition, currentSubject);
});

goBtnField.addEventListener('click', async () => {
    welcomeOverlay.style.display = 'none';
    window.scrollTo(0, 0);
    const subject = subjectSelectField.value;
    const fieldIndex = fieldSelect.value;
    currentFieldQuestions = fieldsData[subject][fieldIndex].questions;
    currentFieldIndex = 0;

    pageCountSpan.textContent = currentFieldQuestions.length;
    populateJumpSelector(0);

    await displayFieldQuestion(currentFieldIndex);
});

subjectSelectEdition.addEventListener('change', (e) => { currentSubject = e.target.value; });
editionSelect.addEventListener('change', (e) => { currentEdition = e.target.value; });
subjectSelectField.addEventListener('change', populateFieldSelector);

prevBtn.addEventListener('click', () => {
    if (currentFieldQuestions.length > 0) {
        if (currentFieldIndex > 0) {
            currentFieldIndex--;
            displayFieldQuestion(currentFieldIndex);
        }
    } else {
        if (currentPageNum > 1) {
            currentPageNum--;
            renderPage(currentPageNum);
        }
    }
});
nextBtn.addEventListener('click', () => {
    if (currentFieldQuestions.length > 0) {
        if (currentFieldIndex < currentFieldQuestions.length - 1) {
            currentFieldIndex++;
            displayFieldQuestion(currentFieldIndex);
        }
    } else {
        const totalQuestions = pdfDoc ? pdfDoc.numPages - 1 : 0;
        if (currentPageNum < totalQuestions) {
            currentPageNum++;
            renderPage(currentPageNum);
        }
    }
});

answerButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        checkAnswer(e.target.dataset.choice);
    });
});

jumpToSelect.addEventListener('change', (e) => {
    if (currentFieldQuestions.length === 0) {
        const targetPage = parseInt(e.target.value, 10);
        if (targetPage) {
            currentPageNum = targetPage;
            renderPage(currentPageNum);
        }
    }
});

/** 初期化処理 */
async function initialize() {
    console.log("🔄 アプリケーションの初期化を開始...");
    await setupEditionSelector();
    await loadFieldsData();
    console.log("✅ 初期化完了。ユーザーの操作を待っています。");
}

// --- アプリケーションの実行 ---
initialize();
