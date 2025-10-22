// --- モジュールのインポート ---
import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';

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
const scoreCorrectEdition = panelByEdition.querySelector('.score-correct');
const subjectSelectField = document.getElementById('subject-select-field');
const fieldSelect = document.getElementById('field-select');
const goBtnField = document.getElementById('go-btn-field');
const resultAreaField = document.getElementById('result-area-field');
const scoreCorrectField = panelByField.querySelector('.score-correct');
const answerButtons = document.querySelectorAll('.answer-btn');
const questionSource = document.getElementById('question-source');

// --- グローバル変数 ---
let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let fieldsData = {};
let currentFieldQuestions = [];
let currentFieldIndex = 0;
let correctCount = 0;
let currentSubject = subjectSelectEdition.value;
let currentEdition = '';

/** 索引ファイル(editions.json)を読み込む */
async function setupEditionSelector() {
    try {
        const url = './data/editions.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTPエラー`);
        const data = await response.json();
        const editions = data.available.sort((a, b) => b.value - a.value);
        editionSelect.innerHTML = '';
        editions.forEach(info => {
            const option = document.createElement('option');
            option.value = info.value;
            option.textContent = info.displayText;
            editionSelect.appendChild(option);
        });
        if (editionSelect.options.length > 0) {
            currentEdition = editionSelect.value;
        }
    } catch (error) { console.error("❌ editions.json読込エラー:", error); }
}

/** 分野別ファイル(fields.json)を読み込む */
async function loadFieldsData() {
    try {
        const response = await fetch('./data/fields.json');
        if (!response.ok) throw new Error('HTTPエラー');
        fieldsData = await response.json();
        populateFieldSelector();
    } catch (error) { console.error("❌ fields.json読込エラー:", error); }
}

/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) {
    const url = `./pdf/${edition}/${edition}_answer.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTPエラー`);
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
    const loadingTaskOptions = { cMapUrl: './lib/pdfjs/web/cmaps/', cMapPacked: true, standardFontDataUrl: './lib/pdfjs/web/standard_fonts/' };
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
        console.error("❌ PDF読込エラー:", error);
        alert(`PDFファイルが見つかりません:\n${url}`);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        pageCountSpan.textContent = '0';
        pageNumSpan.textContent = '0';
        populateJumpSelector(0);
        questionSource.style.display = 'none';
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
        answerButtons.forEach(btn => btn.classList.remove('selected'));
        const page = await pdfDoc.getPage(num + 1);
        const viewport = page.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        if (currentFieldQuestions.length > 0) {
            const question = currentFieldQuestions[currentFieldIndex];
            pageNumSpan.textContent = currentFieldIndex + 1;
            let editionDisplayText = `第${question.edition}回`;
            for (let i = 0; i < editionSelect.options.length; i++) {
                if (editionSelect.options[i].value === question.edition) {
                    editionDisplayText = editionSelect.options[i].textContent;
                    break;
                }
            }
            questionSource.textContent = `出典: ${editionDisplayText} 問${question.pageNum}`;
            questionSource.style.display = 'inline';
        } else {
            pageNumSpan.textContent = num;
            questionSource.style.display = 'none';
        }

        resultAreaEdition.textContent = '';
        resultAreaField.textContent = '';
        updateNavButtons();
        // 回数別モードの時だけジャンププルダウンの値を更新
        if (currentFieldQuestions.length === 0) {
             jumpToSelect.value = num;
        }
    } catch (error) { console.error("❌ ページ描画エラー:", error); }
}

/** 分野別プルダウンを生成する */
function populateFieldSelector() {
    const subject = subjectSelectField.value;
    const fields = fieldsData[subject] || [];
    fieldSelect.innerHTML = '';
    if (fields.length === 0) return;
    const maxQuestions = Math.max(...fields.map(field => field.questions.length), 1);
    fields.forEach((field, index) => {
        const option = document.createElement('option');
        const count = field.questions.length;
        const barChar = '█';
        const maxBarLen = 10;
        const barLen = (maxQuestions > 0) ? Math.round((count / maxQuestions) * maxBarLen) : 0;
        const bar = barChar.repeat(barLen);
        option.value = index;
        option.textContent = `${field.fieldName} (${count}問) ${bar}`;
        fieldSelect.appendChild(option);
    });
}

/** 分野別の問題を表示する */
async function displayFieldQuestion(index) {
    if (!currentFieldQuestions[index]) return;
    const question = currentFieldQuestions[index];
    await loadAnswersForEdition(question.edition);
    await renderPdf(question.edition, subjectSelectField.value, parseInt(question.pageNum, 10));
}

/** 正答数表示を更新する関数 */
function updateScoreDisplay() {
    scoreCorrectEdition.textContent = correctCount;
    scoreCorrectField.textContent = correctCount;
}

/** 正誤を判定して結果を表示する */
function checkAnswer(selectedChoice) {
    const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;
    let correctAnswer;
    if (currentFieldQuestions.length > 0) {
        const q = currentFieldQuestions[currentFieldIndex];
        correctAnswer = currentAnswers?.[subjectSelectField.value]?.[q.pageNum];
    } else {
        correctAnswer = currentAnswers?.[subjectSelectEdition.value]?.[currentPageNum];
    }
    if (correctAnswer === undefined) {
        resultArea.textContent = '解答データがありません。';
        return;
    }
    if (parseInt(selectedChoice, 10) === correctAnswer) {
        // 【修正】単純に正解したらカウントアップ
        correctCount++;
        updateScoreDisplay();
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
        jumpToSelect.disabled = true;
    } else {
        const total = pdfDoc ? pdfDoc.numPages - 1 : 0;
        prevBtn.disabled = (currentPageNum <= 1);
        nextBtn.disabled = (currentPageNum >= total);
        jumpToSelect.disabled = false;
    }
}

// --- イベントリスナーの設定 ---
tabByEdition.addEventListener('click', () => {
    tabByEdition.classList.add('active'); tabByField.classList.remove('active');
    panelByEdition.classList.remove('hidden'); panelByField.classList.add('hidden');
    questionSource.style.display = 'none';
});
tabByField.addEventListener('click', () => {
    tabByField.classList.add('active'); tabByEdition.classList.remove('active');
    panelByField.classList.remove('hidden'); panelByEdition.classList.add('hidden');
});

goBtnEdition.addEventListener('click', async () => {
    welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
    correctCount = 0; updateScoreDisplay(); // スコアリセット
    currentFieldQuestions = [];
    await loadAnswersForEdition(editionSelect.value);
    await renderPdf(editionSelect.value, subjectSelectEdition.value);
});

goBtnField.addEventListener('click', async () => {
    welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
    correctCount = 0; updateScoreDisplay(); // スコアリセット
    const subject = subjectSelectField.value;
    const fieldIndex = fieldSelect.value;
    if (!fieldsData[subject] || !fieldsData[subject][fieldIndex]) {
        alert("分野を選択してください。"); return;
    }
    currentFieldQuestions = fieldsData[subject][fieldIndex].questions;
    currentFieldIndex = 0;
    if (currentFieldQuestions.length === 0) {
        alert("この分野には問題がありません。");
        pageCountSpan.textContent = '0'; pageNumSpan.textContent = '0';
        populateJumpSelector(0);
        const context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height);
        questionSource.style.display = 'none';
        return;
    }
    pageCountSpan.textContent = currentFieldQuestions.length;
    populateJumpSelector(0);
    await displayFieldQuestion(currentFieldIndex);
});

subjectSelectEdition.addEventListener('change', (e) => { currentSubject = e.target.value; });
editionSelect.addEventListener('change', (e) => { currentEdition = e.target.value; });
subjectSelectField.addEventListener('change', populateFieldSelector);

prevBtn.addEventListener('click', () => {
    if (currentFieldQuestions.length > 0) {
        if (currentFieldIndex > 0) { currentFieldIndex--; displayFieldQuestion(currentFieldIndex); }
    } else {
        if (currentPageNum > 1) { currentPageNum--; renderPage(currentPageNum); }
    }
});
nextBtn.addEventListener('click', () => {
    if (currentFieldQuestions.length > 0) {
        if (currentFieldIndex < currentFieldQuestions.length - 1) { currentFieldIndex++; displayFieldQuestion(currentFieldIndex); }
    } else {
        const total = pdfDoc ? pdfDoc.numPages - 1 : 0;
        if (currentPageNum < total) { currentPageNum++; renderPage(currentPageNum); }
    }
});
answerButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        answerButtons.forEach(btn => btn.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        checkAnswer(e.currentTarget.dataset.choice);
    });
});
jumpToSelect.addEventListener('change', (e) => {
    if (currentFieldQuestions.length === 0) {
        const target = parseInt(e.target.value, 10);
        if (target) { currentPageNum = target; renderPage(currentPageNum); }
    }
});

/** 初期化処理 */
async function initialize() {
    await setupEditionSelector();
    await loadFieldsData();
}

// --- アプリケーションの実行 ---
initialize();

