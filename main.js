// --- モジュールのインポート ---
import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';

// --- HTML要素の取得 ---
const exerciseView = document.getElementById('exercise-view');
const resultsPanel = document.getElementById('results-panel');
const welcomeOverlay = document.getElementById('welcome-overlay');
const canvas = document.getElementById('pdf-canvas');
const loadingSpinner = document.getElementById('loading-spinner');
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
const showResultsBtnEdition = document.getElementById('show-results-btn-edition');
const subjectSelectField = document.getElementById('subject-select-field');
const fieldSelect = document.getElementById('field-select');
const goBtnField = document.getElementById('go-btn-field');
const resultAreaField = document.getElementById('result-area-field');
const scoreCorrectField = panelByField.querySelector('.score-correct');
const showResultsBtnField = document.getElementById('show-results-btn-field');
const answerButtons = document.querySelectorAll('.answer-btn');
const questionSource = document.getElementById('question-source');
const resultsSummary = document.getElementById('results-summary');
const resultsList = document.getElementById('results-list');
const backToExerciseBtn = document.getElementById('back-to-exercise-btn');

// --- グローバル変数 ---
let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let fieldsData = {};
let currentFieldQuestions = [];
let currentFieldIndex = 0;
let correctCount = 0;
let answerHistory = {};
let currentSessionQuestions = [];
let currentSubject = subjectSelectEdition.value; // 初期値
let currentEdition = ''; // 初期値

/** ローディング表示を制御する関数 */
function showLoading(show) {
    loadingSpinner.classList.toggle('hidden', !show);
}

/** 問題IDを生成するヘルパー関数 */
function getQuestionId(edition, subject, pageNum) {
    return `${edition}-${subject}-${pageNum}`;
}

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
            // currentEdition は goBtnEdition クリック時に設定
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

    showLoading(true); // ローディング表示開始

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
    } finally {
        showLoading(false); // ローディング表示終了
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
        answerButtons.forEach(btn => {
            btn.classList.remove('selected', 'incorrect-first', 'disabled');
            btn.disabled = false;
        });

        const page = await pdfDoc.getPage(num + 1);
        const viewport = page.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        let questionEdition, questionSubject, questionPageNum;
        if (currentFieldQuestions.length > 0) {
            const question = currentFieldQuestions[currentFieldIndex];
            questionEdition = question.edition;
            questionSubject = subjectSelectField.value;
            questionPageNum = question.pageNum;
            pageNumSpan.textContent = currentFieldIndex + 1;
            let editionDisplayText = `第${question.edition}回`;
             for (let i = 0; i < editionSelect.options.length; i++) {
                 if (editionSelect.options[i].value === question.edition) {
                     editionDisplayText = editionSelect.options[i].textContent; break;
                 }
             }
            questionSource.textContent = `出典: ${editionDisplayText} 問${question.pageNum}`;
            questionSource.style.display = 'inline';
        } else {
            questionEdition = editionSelect.value;
            questionSubject = subjectSelectEdition.value;
            questionPageNum = num;
            pageNumSpan.textContent = num;
            questionSource.style.display = 'none';
        }

        resultAreaEdition.textContent = '';
        resultAreaField.textContent = '';
        updateNavButtons();
        if (currentFieldQuestions.length === 0) jumpToSelect.value = num;

        const questionId = getQuestionId(questionEdition, questionSubject, questionPageNum);
        const history = answerHistory[questionId];
        const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;

        if (history) {
            const selectedButton = document.querySelector(`.answer-btn[data-choice="${history.selected}"]`);
            if (selectedButton) {
                selectedButton.classList.add('selected');
                if (!history.correct) {
                    selectedButton.classList.add('incorrect-first');
                }
            }
            answerButtons.forEach(btn => {
                btn.disabled = true;
                btn.classList.add('disabled');
            });

             if (history.correct) {
                 resultArea.textContent = `正解！ 🎉`;
                 resultArea.className = 'result-area correct';
             } else {
                 resultArea.textContent = `不正解... (正解は ${history.correctAnswer}) ❌`;
                 resultArea.className = 'result-area incorrect';
             }
        } else {
             resultArea.textContent = '';
             resultArea.className = 'result-area';
             answerButtons.forEach(btn => {
                 btn.disabled = false;
                 btn.classList.remove('disabled');
             });
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
    let questionEdition, questionSubject, questionPageNum;
    if (currentFieldQuestions.length > 0) {
        const q = currentFieldQuestions[currentFieldIndex];
        questionEdition = q.edition;
        questionSubject = subjectSelectField.value;
        questionPageNum = q.pageNum;
    } else {
        questionEdition = editionSelect.value;
        questionSubject = subjectSelectEdition.value;
        questionPageNum = currentPageNum;
    }
    const questionId = getQuestionId(questionEdition, questionSubject, questionPageNum);
    const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;

    if (answerHistory[questionId]) { return; } // 解答済み

    const correctAnswer = currentAnswers?.[questionSubject]?.[questionPageNum];

    if (correctAnswer === undefined) {
        resultArea.textContent = '解答データがありません。';
        resultArea.className = 'result-area';
        answerHistory[questionId] = { selected: selectedChoice, correct: null, correctAnswer: '?' };
        answerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
        return;
    }

    const isCorrect = parseInt(selectedChoice, 10) === correctAnswer;
    answerHistory[questionId] = { selected: selectedChoice, correct: isCorrect, correctAnswer: correctAnswer };

    if (isCorrect) {
        correctCount++;
        updateScoreDisplay();
        resultArea.textContent = `正解！ 🎉`;
        resultArea.className = 'result-area correct';
    } else {
        resultArea.textContent = `不正解... (正解は ${correctAnswer}) ❌`;
        resultArea.className = 'result-area incorrect';
        const selectedButton = document.querySelector(`.answer-btn[data-choice="${selectedChoice}"]`);
        if (selectedButton) selectedButton.classList.add('incorrect-first');
    }

    answerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
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

/** 成績ページを生成して表示する */
function showResults() {
    exerciseView.classList.add('hidden');
    resultsPanel.classList.remove('hidden');
    window.scrollTo(0, 0);

    const totalQuestions = currentSessionQuestions.length;
    let answeredCount = 0;
    let sessionCorrectCount = 0;

    resultsList.innerHTML = '';
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>問題</th><th>結果</th><th>あなたの解答</th><th>正解</th><th>復習</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');

    currentSessionQuestions.forEach((qInfo, index) => {
        const questionId = getQuestionId(qInfo.edition, qInfo.subject, qInfo.pageNum);
        const history = answerHistory[questionId];
        const tr = document.createElement('tr');
        const questionNumDisplay = (currentFieldQuestions.length > 0) ? `${index + 1} (第${qInfo.edition}回 問${qInfo.pageNum})` : `問 ${qInfo.pageNum}`;
        let statusText = '未解答';
        let statusClass = '';
        let yourAnswer = '-';
        let correctAnswer = currentAnswers?.[qInfo.subject]?.[qInfo.pageNum] ?? '?';

        if (history) {
            answeredCount++;
            yourAnswer = history.selected;
            correctAnswer = history.correctAnswer;
            if (history.correct === null) { statusText = '不明'; }
            else if (history.correct) { sessionCorrectCount++; statusText = '正解'; statusClass = 'result-status-correct'; }
            else { statusText = '不正解'; statusClass = 'result-status-incorrect'; }
        }

        tr.innerHTML = `<td>${questionNumDisplay}</td><td class="${statusClass}">${statusText}</td><td>${yourAnswer}</td><td>${correctAnswer}</td><td><button class="review-btn" data-index="${index}">解き直す</button></td>`;
        tbody.appendChild(tr);
    });

    resultsList.appendChild(table);

    const accuracy = totalQuestions > 0 ? ((sessionCorrectCount / totalQuestions) * 100).toFixed(1) : 0;
    resultsSummary.innerHTML = `総問題数: ${totalQuestions}問 / 解答済み: ${answeredCount}問<br>正答数: ${sessionCorrectCount}問 / 正答率: ${accuracy}%`;

    document.querySelectorAll('.review-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            const questionInfo = currentSessionQuestions[index];
            resultsPanel.classList.add('hidden');
            exerciseView.classList.remove('hidden');
            if (currentFieldQuestions.length > 0) {
                currentFieldIndex = index;
                displayFieldQuestion(index);
            } else {
                renderPage(questionInfo.pageNum);
            }
        });
    });
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
    correctCount = 0; updateScoreDisplay();
    answerHistory = {};
    currentFieldQuestions = [];

    currentEdition = editionSelect.value; // 変数をここで更新
    currentSubject = subjectSelectEdition.value; // 変数をここで更新

    currentSessionQuestions = [];
    const url = `./pdf/${currentEdition}/${currentEdition}_${currentSubject}.pdf`;
    showLoading(true);
    try {
        const tempLoadingTask = pdfjsLib.getDocument(url);
        const tempPdfDoc = await tempLoadingTask.promise;
        const total = tempPdfDoc.numPages > 1 ? tempPdfDoc.numPages - 1 : 0;
        for (let i = 1; i <= total; i++) {
            currentSessionQuestions.push({ edition: currentEdition, subject: currentSubject, pageNum: i });
        }
    } catch (error) {
         console.error("セッションリスト生成PDF読込失敗", error);
         alert(`PDFファイルが見つかりません:\n${url}`);
         showLoading(false);
         return;
    }

    await loadAnswersForEdition(currentEdition);
    await renderPdf(currentEdition, currentSubject); // ここでローディング解除
});

goBtnField.addEventListener('click', async () => {
    welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
    correctCount = 0; updateScoreDisplay();
    answerHistory = {};
    const subject = subjectSelectField.value;
    const fieldIndex = fieldSelect.value;
    if (fieldIndex === "" || !fieldsData[subject] || !fieldsData[subject][fieldIndex]) {
         alert("分野を選択してください。"); return;
    }
    currentFieldQuestions = fieldsData[subject][fieldIndex].questions;
    currentFieldIndex = 0;
    currentSessionQuestions = currentFieldQuestions.map(q => ({...q, subject: subject}));

    if (currentFieldQuestions.length === 0) {
        alert("この分野には問題が登録されていません。");
        pageCountSpan.textContent = '0'; pageNumSpan.textContent = '0';
        populateJumpSelector(0);
        const context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height);
        questionSource.style.display = 'none';
        return;
    }
    pageCountSpan.textContent = currentFieldQuestions.length;
    populateJumpSelector(0);
    showLoading(true);
    await displayFieldQuestion(currentFieldIndex); // ここでローディング解除
});

subjectSelectEdition.addEventListener('change', (e) => { /* currentSubject は goBtnEdition で更新 */ });
editionSelect.addEventListener('change', (e) => { /* currentEdition は goBtnEdition で更新 */ });
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
        if (e.currentTarget.disabled) return;
        answerButtons.forEach(btn => btn.classList.remove('selected')); // 一旦クリアはしない方が良いかも？
        e.currentTarget.classList.add('selected'); // クリックしたものを選択状態に
        checkAnswer(e.currentTarget.dataset.choice);
    });
});
jumpToSelect.addEventListener('change', (e) => {
    if (currentFieldQuestions.length === 0) {
        const target = parseInt(e.target.value, 10);
        if (target) { currentPageNum = target; renderPage(currentPageNum); }
    }
});
showResultsBtnEdition.addEventListener('click', showResults);
showResultsBtnField.addEventListener('click', showResults);
backToExerciseBtn.addEventListener('click', () => {
    resultsPanel.classList.add('hidden');
    exerciseView.classList.remove('hidden');
});

/** 初期化処理 */
async function initialize() {
    await setupEditionSelector();
    await loadFieldsData();
}

// --- アプリケーションの実行 ---
initialize();
