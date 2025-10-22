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
// 【変更】querySelectorAllはイベントリスナー設定時のみ使用
// const answerButtons = document.querySelectorAll('.answer-btn');
const questionSource = document.getElementById('question-source');
const resultsSummary = document.getElementById('results-summary');
const resultsList = document.getElementById('results-list');
const backToExerciseBtn = document.getElementById('back-to-exercise-btn');

// --- グローバル変数 ---
let pdfDoc = null;
let currentPageNum = 1; // 回数別モードでの現在の「問番号」
let currentAnswers = {}; // 現在読み込んでいる解答データ
let fieldsData = {}; // fields.json の全データ
let currentFieldQuestions = []; // 分野別モードでの現在の問題リスト
let currentFieldIndex = 0; // 分野別モードでの現在のリスト内インデックス
let correctCount = 0; // 現在のセッションの正答数
let answerHistory = {}; // { questionId: { selected: firstChoice, correct: isFirstChoiceCorrect, correctAnswer: actualCorrectAnswer } }
let currentSessionQuestions = []; // 表示ボタンが押された時点の問題リスト全体（成績表示用）

/** ローディング表示を制御する関数 */
function showLoading(show) { /* ... 変更なし ... */ }
/** 現在の問題情報から一意なIDを生成するヘルパー関数 */
function getCurrentQuestionId() { /* ... 変更なし ... */ }
/** 引数から一意なIDを生成するヘルパー関数 */
function getQuestionId(edition, subject, pageNum) { /* ... 変更なし ... */ }
/** 索引ファイル(editions.json)を読み込む */
async function setupEditionSelector() { /* ... 変更なし ... */ }
/** 分野別ファイル(fields.json)を読み込む */
async function loadFieldsData() { /* ... 変更なし ... */ }
/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) { /* ... 変更なし ... */ }
/** PDFを読み込んで表示する */
async function renderPdf(edition, subject, pageNum = 1) { /* ... 変更なし ... */ }
/** ジャンプ用プルダウンを生成する */
function populateJumpSelector(totalQuestions) { /* ... 変更なし ... */ }

/** 指定されたページを描画する（内部関数） */
async function renderPageInternal(pdfPageNum) {
    if (!pdfDoc) return;
    try {
        // 【変更】アクティブなパネル内のボタンのみリセット
        const activePanel = currentFieldQuestions.length > 0 ? panelByField : panelByEdition;
        const activeAnswerButtons = activePanel.querySelectorAll('.answer-btn');
        activeAnswerButtons.forEach(btn => { btn.className = 'answer-btn'; btn.disabled = false; });

        const page = await pdfDoc.getPage(pdfPageNum + 1);
        const viewport = page.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');
        canvas.height = viewport.height; canvas.width = viewport.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        // --- 表示更新 ---
        let currentQuestionId;
        if (currentFieldQuestions.length > 0) {
            // ... (分野別表示ロジックは変更なし) ...
            const question = currentFieldQuestions[currentFieldIndex];
            pageNumSpan.textContent = currentFieldIndex + 1;
            let editionDisplayText = `第${question.edition}回`;
             for (let i = 0; i < editionSelect.options.length; i++) {
                 if (editionSelect.options[i].value === question.edition) {
                     editionDisplayText = editionSelect.options[i].textContent; break;
                 }
             }
            questionSource.textContent = `出典: ${editionDisplayText} 問${question.pageNum}`;
            questionSource.style.display = 'inline';
            currentQuestionId = getQuestionId(question.edition, subjectSelectField.value, question.pageNum);
        } else {
            // ... (回数別表示ロジックは変更なし) ...
            pageNumSpan.textContent = pdfPageNum;
            questionSource.style.display = 'none';
            currentQuestionId = getQuestionId(editionSelect.value, subjectSelectEdition.value, pdfPageNum);
            jumpToSelect.value = pdfPageNum;
        }

        resultAreaEdition.textContent = ''; resultAreaField.textContent = '';
        updateNavButtons();

        // --- 解答履歴の復元 ---
        const history = answerHistory[currentQuestionId];
        const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;

        if (history) {
            // 【変更】アクティブなパネル内のボタンを対象にする
            const selectedButton = activePanel.querySelector(`.answer-btn[data-choice="${history.selected}"]`);
            const correctButton = activePanel.querySelector(`.answer-btn[data-choice="${history.correctAnswer}"]`);

            if (history.correct) {
                if(selectedButton) selectedButton.classList.add('correct-selection');
                resultArea.textContent = `正解！ 🎉`;
                resultArea.className = 'result-area correct';
            } else {
                if(selectedButton) selectedButton.classList.add('incorrect-selection');
                if(correctButton) correctButton.classList.add('correct-answer');
                resultArea.textContent = `不正解... (正解は ${history.correctAnswer}) ❌`;
                resultArea.className = 'result-area incorrect';
            }
            // 【変更】アクティブなパネル内のボタンのみ無効化
            activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
        } else {
             resultArea.textContent = ''; resultArea.className = 'result-area';
             // 【変更】アクティブなパネル内のボタンのみ有効化
             activeAnswerButtons.forEach(btn => { btn.disabled = false; btn.classList.remove('disabled'); });
        }

    } catch (error) { console.error("❌ ページ描画エラー:", error); }
}

/** 分野別プルダウンを生成する */
function populateFieldSelector() { /* ... 変更なし ... */ }
/** 分野別の問題を表示する */
async function displayFieldQuestion(index) { /* ... 変更なし ... */ }
/** 正答数表示を更新する関数 */
function updateScoreDisplay() { /* ... 変更なし ... */ }

/** 正誤を判定して結果を表示する */
function checkAnswer(selectedChoice) {
    const questionId = getCurrentQuestionId();
    const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;
    // 【変更】アクティブなパネルを取得
    const activePanel = currentFieldQuestions.length > 0 ? panelByField : panelByEdition;
    const activeAnswerButtons = activePanel.querySelectorAll('.answer-btn'); // アクティブパネル内のボタン

    if (answerHistory[questionId]) { return; } // 解答済み

    let correctAnswer;
    let subjectKey;
    let questionPageNum;

     if (currentFieldQuestions.length > 0) {
         const q = currentFieldQuestions[currentFieldIndex];
         subjectKey = subjectSelectField.value;
         questionPageNum = q.pageNum;
         correctAnswer = currentAnswers?.[subjectKey]?.[questionPageNum];
     } else {
         subjectKey = subjectSelectEdition.value;
         questionPageNum = currentPageNum;
         correctAnswer = currentAnswers?.[subjectKey]?.[questionPageNum];
     }

    if (correctAnswer === undefined) {
        resultArea.textContent = '解答データがありません。'; resultArea.className = 'result-area';
        answerHistory[questionId] = { selected: selectedChoice, correct: null, correctAnswer: '?' };
        // 【変更】アクティブパネル内のボタンを無効化
        activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
        return;
    }

    const isCorrect = parseInt(selectedChoice, 10) === correctAnswer;
    answerHistory[questionId] = { selected: selectedChoice, correct: isCorrect, correctAnswer: correctAnswer };

    // 【変更】アクティブパネル内のボタン要素を取得
    const selectedButton = activePanel.querySelector(`.answer-btn[data-choice="${selectedChoice}"]`);
    const correctButton = activePanel.querySelector(`.answer-btn[data-choice="${correctAnswer}"]`);

    if (isCorrect) {
        correctCount++; updateScoreDisplay();
        resultArea.textContent = `正解！ 🎉`; resultArea.className = 'result-area correct';
        if (selectedButton) selectedButton.classList.add('correct-selection');
    } else {
        resultArea.textContent = `不正解... (正解は ${correctAnswer}) ❌`; resultArea.className = 'result-area incorrect';
        if (selectedButton) selectedButton.classList.add('incorrect-selection');
        if (correctButton) correctButton.classList.add('correct-answer');
    }

    // 【変更】アクティブパネル内のボタンを無効化
    activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
}

/** ナビゲーションボタンの有効/無効を更新 */
function updateNavButtons() { /* ... 変更なし ... */ }
/** 成績ページを生成して表示する */
function showResults() { /* ... 変更なし ... */ }

// --- イベントリスナーの設定 ---
tabByEdition.addEventListener('click', () => { /* ... 変更なし ... */ });
tabByField.addEventListener('click', () => { /* ... 変更なし ... */ });
goBtnEdition.addEventListener('click', async () => { /* ... 変更なし ... */ });
goBtnField.addEventListener('click', async () => { /* ... 変更なし ... */ });
subjectSelectEdition.addEventListener('change', (e) => { /* 表示ボタンで更新 */ });
editionSelect.addEventListener('change', (e) => { /* 表示ボタンで更新 */ });
subjectSelectField.addEventListener('change', populateFieldSelector);
prevBtn.addEventListener('click', () => { /* ... 変更なし ... */ });
nextBtn.addEventListener('click', () => { /* ... 変更なし ... */ });

// 【変更】querySelectorAll をここで実行し、各ボタンにリスナーを設定
document.querySelectorAll('.answer-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        // イベントが発生したボタンが属するパネルがアクティブか確認
        const parentPanel = e.currentTarget.closest('.control-panel');
        if (!parentPanel || parentPanel.classList.contains('hidden')) {
            return; // 非アクティブなパネルのボタンは無視
        }
        if (e.currentTarget.disabled) return;
        checkAnswer(e.currentTarget.dataset.choice);
    });
});

jumpToSelect.addEventListener('change', (e) => { /* ... 変更なし ... */ });
showResultsBtnEdition.addEventListener('click', showResults);
showResultsBtnField.addEventListener('click', showResults);
backToExerciseBtn.addEventListener('click', () => { /* ... 変更なし ... */ });

/** 初期化処理 */
async function initialize() { /* ... 変更なし ... */ }

// --- アプリケーションの実行 ---
initialize();


// --- 変更がない関数のコード（念のため記載） ---
function showLoading(show) { loadingSpinner.classList.toggle('hidden', !show); }
function getCurrentQuestionId() { if (currentFieldQuestions.length > 0) { const question = currentFieldQuestions[currentFieldIndex]; return `${question.edition}-${subjectSelectField.value}-${question.pageNum}`; } else { return `${editionSelect.value}-${subjectSelectEdition.value}-${currentPageNum}`; } }
function getQuestionId(edition, subject, pageNum) { return `${edition}-${subject}-${pageNum}`; }
async function setupEditionSelector() {try {const url = './data/editions.json';const response = await fetch(url);if (!response.ok) throw new Error(`HTTPエラー`);const data = await response.json();const editions = data.available.sort((a, b) => b.value - a.value);editionSelect.innerHTML = '';editions.forEach(info => {const option = document.createElement('option');option.value = info.value;option.textContent = info.displayText;editionSelect.appendChild(option);});} catch (error) { console.error("❌ editions.json読込エラー:", error); }}
async function loadFieldsData() {try {const response = await fetch('./data/fields.json');if (!response.ok) throw new Error('HTTPエラー');fieldsData = await response.json();populateFieldSelector();} catch (error) { console.error("❌ fields.json読込エラー:", error); }}
async function loadAnswersForEdition(edition) {const url = `./pdf/${edition}/${edition}_answer.json`;try {const response = await fetch(url);if (!response.ok) throw new Error(`HTTPエラー`);currentAnswers = await response.json();} catch (error) {currentAnswers = {};console.error(`解答ファイルが見つかりません: ${url}`);}}
async function renderPdf(edition, subject, pageNum = 1) {currentPageNum = pageNum;const url = `./pdf/${edition}/${edition}_${subject}.pdf`;const loadingTaskOptions = { cMapUrl: './lib/pdfjs/web/cmaps/', cMapPacked: true, standardFontDataUrl: './lib/pdfjs/web/standard_fonts/' };showLoading(true);try {const loadingTask = pdfjsLib.getDocument(url, loadingTaskOptions);pdfDoc = await loadingTask.promise;const totalQuestions = pdfDoc.numPages > 1 ? pdfDoc.numPages - 1 : 0;if (currentFieldQuestions.length === 0) {pageCountSpan.textContent = totalQuestions;populateJumpSelector(totalQuestions);}await renderPageInternal(currentPageNum);} catch (error) {console.error("❌ PDF読込エラー:", error);alert(`PDFファイルが見つかりません:\n${url}`);const context = canvas.getContext('2d');if (context) context.clearRect(0, 0, canvas.width, canvas.height);pageCountSpan.textContent = '0';pageNumSpan.textContent = '0';populateJumpSelector(0);questionSource.style.display = 'none';} finally {showLoading(false);}}
function populateJumpSelector(totalQuestions) {jumpToSelect.innerHTML = '<option value="">移動...</option>';for (let i = 1; i <= totalQuestions; i++) {const option = document.createElement('option');option.value = i;option.textContent = `問${i}`;jumpToSelect.appendChild(option);}}
function populateFieldSelector() {const subject = subjectSelectField.value;const fields = fieldsData[subject] || [];fieldSelect.innerHTML = '';if (fields.length === 0) return;const maxQuestions = Math.max(...fields.map(field => field.questions.length), 1);fields.forEach((field, index) => {const option = document.createElement('option');const count = field.questions.length;const barChar = '█'; const maxBarLen = 10;const barLen = (maxQuestions > 0) ? Math.round((count / maxQuestions) * maxBarLen) : 0;const bar = barChar.repeat(barLen);option.value = index; option.textContent = `${field.fieldName} (${count}問) ${bar}`;fieldSelect.appendChild(option);});}
async function displayFieldQuestion(index) {if (!currentFieldQuestions[index]) return;const question = currentFieldQuestions[index];await loadAnswersForEdition(question.edition);await renderPdf(question.edition, subjectSelectField.value, parseInt(question.pageNum, 10));}
function updateScoreDisplay() {scoreCorrectEdition.textContent = correctCount;scoreCorrectField.textContent = correctCount;}
function updateNavButtons() {if (currentFieldQuestions.length > 0) {prevBtn.disabled = (currentFieldIndex <= 0);nextBtn.disabled = (currentFieldIndex >= currentFieldQuestions.length - 1);jumpToSelect.disabled = true;} else {const total = pdfDoc ? pdfDoc.numPages - 1 : 0;prevBtn.disabled = (currentPageNum <= 1);nextBtn.disabled = (currentPageNum >= total);jumpToSelect.disabled = false;}}
function showResults() {exerciseView.classList.add('hidden'); resultsPanel.classList.remove('hidden');window.scrollTo(0, 0);const totalQuestions = currentSessionQuestions.length;let answeredCount = 0; let sessionCorrectCount = 0;resultsList.innerHTML = '';const table = document.createElement('table');table.innerHTML = `<thead><tr><th>問題</th><th>結果</th><th>あなたの解答</th><th>正解</th><th>復習</th></tr></thead><tbody></tbody>`;const tbody = table.querySelector('tbody');currentSessionQuestions.forEach((qInfo, index) => {const questionId = getQuestionId(qInfo.edition, qInfo.subject, qInfo.pageNum);const history = answerHistory[questionId];const tr = document.createElement('tr');const questionNumDisplay = (currentFieldQuestions.length > 0)? `${index + 1} (第${qInfo.edition}回 問${qInfo.pageNum})`: `問 ${qInfo.pageNum}`;let statusText = '未解答'; let statusClass = '';let yourAnswer = '-'; let correctAnswer = currentAnswers?.[qInfo.subject]?.[qInfo.pageNum] ?? '?';if (history) {answeredCount++; yourAnswer = history.selected; correctAnswer = history.correctAnswer;if (history.correct === null) { statusText = '不明'; } else if (history.correct) { sessionCorrectCount++; statusText = '正解'; statusClass = 'result-status-correct'; } else { statusText = '不正解'; statusClass = 'result-status-incorrect'; }}tr.innerHTML = `<td>${questionNumDisplay}</td><td class="${statusClass}">${statusText}</td><td>${yourAnswer}</td><td>${correctAnswer}</td><td><button class="review-btn" data-index="${index}">解き直す</button></td>`;tbody.appendChild(tr);});resultsList.appendChild(table);const accuracy = totalQuestions > 0 ? ((sessionCorrectCount / totalQuestions) * 100).toFixed(1) : 0;resultsSummary.innerHTML = `総問題数: ${totalQuestions}問 / 解答済み: ${answeredCount}問<br>正答数: ${sessionCorrectCount}問 / 正答率: ${accuracy}%`;document.querySelectorAll('.review-btn').forEach(button => {button.addEventListener('click', (e) => {const index = parseInt(e.target.dataset.index, 10);const questionInfo = currentSessionQuestions[index];resultsPanel.classList.add('hidden'); exerciseView.classList.remove('hidden');if (currentFieldQuestions.length > 0) { tabByField.click(); subjectSelectField.value = questionInfo.subject; populateFieldSelector(); const fieldIdx = fieldsData[questionInfo.subject]?.findIndex(f => f.questions.some(q => q.edition === questionInfo.edition && q.pageNum === questionInfo.pageNum)); if(fieldIdx !== undefined && fieldIdx > -1) fieldSelect.value = fieldIdx; currentFieldIndex = index; displayFieldQuestion(index); } else { tabByEdition.click(); editionSelect.value = questionInfo.edition; subjectSelectEdition.value = questionInfo.subject; renderPdf(questionInfo.edition, questionInfo.subject, questionInfo.pageNum); }});});}
tabByEdition.addEventListener('click', () => {tabByEdition.classList.add('active'); tabByField.classList.remove('active');panelByEdition.classList.remove('hidden'); panelByField.classList.add('hidden');questionSource.style.display = 'none';});
tabByField.addEventListener('click', () => {tabByField.classList.add('active'); tabByEdition.classList.remove('active');panelByField.classList.remove('hidden'); panelByEdition.classList.add('hidden');});
goBtnEdition.addEventListener('click', async () => {welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);correctCount = 0; updateScoreDisplay(); answerHistory = {};currentFieldQuestions = [];const selectedEdition = editionSelect.value;const selectedSubject = subjectSelectEdition.value;currentSessionQuestions = [];const url = `./pdf/${selectedEdition}/${selectedEdition}_${selectedSubject}.pdf`;showLoading(true);try {const tempLoadingTask = pdfjsLib.getDocument(url);const tempPdfDoc = await tempLoadingTask.promise;const total = tempPdfDoc.numPages > 1 ? tempPdfDoc.numPages - 1 : 0;for (let i = 1; i <= total; i++) {currentSessionQuestions.push({ edition: selectedEdition, subject: selectedSubject, pageNum: i });}} catch (error) { console.error("セッションリスト生成PDF読込失敗", error); alert(`PDFファイルが見つかりません:\n${url}`); showLoading(false); return;}await loadAnswersForEdition(selectedEdition);await renderPdf(selectedEdition, selectedSubject);});
goBtnField.addEventListener('click', async () => {welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);correctCount = 0; updateScoreDisplay(); answerHistory = {};const subject = subjectSelectField.value;const fieldIndex = fieldSelect.value;if (fieldIndex === "" || !fieldsData[subject] || !fieldsData[subject][fieldIndex]) { alert("分野を選択してください。"); return; }currentFieldQuestions = fieldsData[subject][fieldIndex].questions;currentFieldIndex = 0;currentSessionQuestions = currentFieldQuestions.map(q => ({...q, subject: subject}));if (currentFieldQuestions.length === 0) {alert("この分野には問題が登録されていません。");pageCountSpan.textContent = '0'; pageNumSpan.textContent = '0';populateJumpSelector(0);const context = canvas.getContext('2d'); if(context) context.clearRect(0, 0, canvas.width, canvas.height);questionSource.style.display = 'none';return;}pageCountSpan.textContent = currentFieldQuestions.length;populateJumpSelector(0);showLoading(true);await displayFieldQuestion(currentFieldIndex);});
subjectSelectEdition.addEventListener('change', (e) => { /* 表示ボタンで更新 */ });
editionSelect.addEventListener('change', (e) => { /* 表示ボタンで更新 */ });
subjectSelectField.addEventListener('change', populateFieldSelector);
prevBtn.addEventListener('click', () => {if (currentFieldQuestions.length > 0) {if (currentFieldIndex > 0) { currentFieldIndex--; displayFieldQuestion(currentFieldIndex); }} else {if (currentPageNum > 1) { currentPageNum--; renderPageInternal(currentPageNum); }}});
nextBtn.addEventListener('click', () => {if (currentFieldQuestions.length > 0) {if (currentFieldIndex < currentFieldQuestions.length - 1) { currentFieldIndex++; displayFieldQuestion(currentFieldIndex); }} else {const total = pdfDoc ? pdfDoc.numPages - 1 : 0;if (currentPageNum < total) { currentPageNum++; renderPageInternal(currentPageNum); }}});
jumpToSelect.addEventListener('change', (e) => {if (currentFieldQuestions.length === 0) {const target = parseInt(e.target.value, 10);if (target) { currentPageNum = target; renderPageInternal(currentPageNum); }}});
showResultsBtnEdition.addEventListener('click', showResults);
showResultsBtnField.addEventListener('click', showResults);
backToExerciseBtn.addEventListener('click', () => {resultsPanel.classList.add('hidden');exerciseView.classList.remove('hidden');});
async function initialize() {await setupEditionSelector();await loadFieldsData();}
initialize();

