// --- モジュールのインポート ---
import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';

// --- グローバル変数 (宣言のみ) ---
let exerciseView, resultsPanel, welcomeOverlay, canvas, loadingSpinner,
    pageNumSpan, pageCountSpan, prevBtn, nextBtn, jumpToSelect,
    tabByEdition, tabByField, panelByEdition, panelByField,
    editionSelect, subjectSelectEdition, goBtnEdition, resultAreaEdition, scoreCorrectEdition, showResultsBtnEdition,
    subjectSelectField, fieldSelect, goBtnField, resultAreaField, scoreCorrectField, showResultsBtnField,
    answerButtons, // これは NodeList なので initialize で取得
    questionSource, resultsSummary, resultsList, backToExerciseBtn;

let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let fieldsData = {};
let currentFieldQuestions = [];
let currentFieldIndex = 0;
let correctCount = 0;
let answerHistory = {};
let currentSessionQuestions = [];
// currentSubject と currentEdition は initialize で初期化

/** ローディング表示を制御する関数 */
function showLoading(show) {
    if(loadingSpinner) loadingSpinner.classList.toggle('hidden', !show);
}

/** 問題IDを生成するヘルパー関数 */
function getQuestionId(edition, subject, pageNum) {
    return `${edition}-${subject}-${pageNum}`;
}

/** 現在の問題情報から一意なIDを生成するヘルパー関数 */
function getCurrentQuestionId() {
    // 要素の存在を確認してから値を取得
    const currentSubjectVal = subjectSelectEdition ? subjectSelectEdition.value : '';
    const currentEditionVal = editionSelect ? editionSelect.value : '';
    const currentFieldSubjectVal = subjectSelectField ? subjectSelectField.value : '';

    if (currentFieldQuestions.length > 0) {
        const question = currentFieldQuestions[currentFieldIndex];
        return getQuestionId(question.edition, currentFieldSubjectVal, question.pageNum);
    } else {
        return getQuestionId(currentEditionVal, currentSubjectVal, currentPageNum);
    }
}


/** 索引ファイル(editions.json)を読み込む */
async function setupEditionSelector() {
    if (!editionSelect) return; // 要素がなければ何もしない
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
    } catch (error) { console.error("❌ editions.json読込エラー:", error); }
}

/** 分野別ファイル(fields.json)を読み込む */
async function loadFieldsData() {
    if (!fieldSelect) return; // 要素がなければ何もしない
    try {
        const response = await fetch('./data/fields.json');
        if (!response.ok) throw new Error('HTTPエラー');
        fieldsData = await response.json();
        populateFieldSelector(); // 初期科目で分野を生成
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
    if (!canvas) return; // canvasがなければ処理中断
    currentPageNum = pageNum;
    const url = `./pdf/${edition}/${edition}_${subject}.pdf`;
    const loadingTaskOptions = { cMapUrl: './lib/pdfjs/web/cmaps/', cMapPacked: true, standardFontDataUrl: './lib/pdfjs/web/standard_fonts/' };

    showLoading(true);

    try {
        const loadingTask = pdfjsLib.getDocument(url, loadingTaskOptions);
        pdfDoc = await loadingTask.promise;
        const totalQuestions = pdfDoc.numPages > 1 ? pdfDoc.numPages - 1 : 0;
        if (currentFieldQuestions.length === 0) { // 回数別モードの時のみ更新
            if(pageCountSpan) pageCountSpan.textContent = totalQuestions;
            populateJumpSelector(totalQuestions);
        }
        await renderPageInternal(currentPageNum); // 内部描画関数を呼ぶ
    } catch (error) {
        console.error("❌ PDF読込エラー:", error);
        alert(`PDFファイルが見つかりません:\n${url}`);
        const context = canvas.getContext('2d');
        if (context) context.clearRect(0, 0, canvas.width, canvas.height);
        if(pageCountSpan) pageCountSpan.textContent = '0';
        if(pageNumSpan) pageNumSpan.textContent = '0';
        populateJumpSelector(0);
        if(questionSource) questionSource.style.display = 'none';
    } finally {
        showLoading(false);
    }
}

/** ジャンプ用プルダウンを生成する */
function populateJumpSelector(totalQuestions) {
    if (!jumpToSelect) return;
    jumpToSelect.innerHTML = '<option value="">移動...</option>';
    for (let i = 1; i <= totalQuestions; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `問${i}`;
        jumpToSelect.appendChild(option);
    }
}

/** 指定されたページを描画する（内部関数） */
async function renderPageInternal(pdfPageNum) {
    if (!pdfDoc || !canvas) return;
    try {
        const activePanel = currentFieldQuestions.length > 0 ? panelByField : panelByEdition;
        const activeAnswerButtons = activePanel ? activePanel.querySelectorAll('.answer-btn') : [];
        activeAnswerButtons.forEach(btn => { btn.className = 'answer-btn'; btn.disabled = false; });

        const page = await pdfDoc.getPage(pdfPageNum + 1);
        const viewport = page.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');
        canvas.height = viewport.height; canvas.width = viewport.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        let currentQuestionId;
        let questionEdition, questionSubject, questionPageNum;
        if (currentFieldQuestions.length > 0) {
            const question = currentFieldQuestions[currentFieldIndex];
            questionEdition = question.edition;
            questionSubject = subjectSelectField ? subjectSelectField.value : '';
            questionPageNum = question.pageNum;
            if(pageNumSpan) pageNumSpan.textContent = currentFieldIndex + 1;
            let editionDisplayText = `第${question.edition}回`;
             if (editionSelect) {
                 for (let i = 0; i < editionSelect.options.length; i++) {
                     if (editionSelect.options[i].value === question.edition) {
                         editionDisplayText = editionSelect.options[i].textContent; break;
                     }
                 }
             }
            if(questionSource) {
                questionSource.textContent = `出典: ${editionDisplayText} 問${question.pageNum}`;
                questionSource.style.display = 'inline';
            }
            currentQuestionId = getQuestionId(question.edition, questionSubject, question.pageNum);
        } else {
            questionEdition = editionSelect ? editionSelect.value : '';
            questionSubject = subjectSelectEdition ? subjectSelectEdition.value : '';
            questionPageNum = pdfPageNum;
            if(pageNumSpan) pageNumSpan.textContent = pdfPageNum;
            if(questionSource) questionSource.style.display = 'none';
            currentQuestionId = getQuestionId(questionEdition, questionSubject, pdfPageNum);
            if(jumpToSelect) jumpToSelect.value = pdfPageNum;
        }

        if(resultAreaEdition) resultAreaEdition.textContent = '';
        if(resultAreaField) resultAreaField.textContent = '';
        updateNavButtons();

        const history = answerHistory[currentQuestionId];
        const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;

        if (history && activePanel) {
            const selectedButton = activePanel.querySelector(`.answer-btn[data-choice="${history.selected}"]`);
            const correctButton = activePanel.querySelector(`.answer-btn[data-choice="${history.correctAnswer}"]`);

            if (history.correct) {
                if(selectedButton) selectedButton.classList.add('correct-selection');
                if(resultArea) { resultArea.textContent = `正解！ 🎉`; resultArea.className = 'result-area correct'; }
            } else {
                if(selectedButton) selectedButton.classList.add('incorrect-selection');
                if(correctButton) correctButton.classList.add('correct-answer');
                if(resultArea) { resultArea.textContent = `不正解... (正解は ${history.correctAnswer}) ❌`; resultArea.className = 'result-area incorrect'; }
            }
            activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
        } else if (resultArea) {
             resultArea.textContent = ''; resultArea.className = 'result-area';
             activeAnswerButtons.forEach(btn => { btn.disabled = false; btn.classList.remove('disabled'); });
        }

    } catch (error) { console.error("❌ ページ描画エラー:", error); }
}


/** 分野別プルダウンを生成する */
function populateFieldSelector() {
    if (!fieldSelect || !subjectSelectField) return;

    const subject = subjectSelectField.value;
    const fields = fieldsData[subject] || [];
    fieldSelect.innerHTML = '';
    if (fields.length === 0) return;
    const maxQuestions = Math.max(...fields.map(field => field.questions.length), 1);
    fields.forEach((field, index) => {
        const option = document.createElement('option');
        const count = field.questions.length;
        const barChar = '█'; const maxBarLen = 10;
        const barLen = (maxQuestions > 0) ? Math.round((count / maxQuestions) * maxBarLen) : 0;
        const bar = barChar.repeat(barLen);
        option.value = index; option.textContent = `${field.fieldName} (${count}問) ${bar}`;
        fieldSelect.appendChild(option);
    });
}

/** 分野別の問題を表示する */
async function displayFieldQuestion(index) {
    if (!currentFieldQuestions[index]) return;
    const question = currentFieldQuestions[index];
    await loadAnswersForEdition(question.edition);
    const subject = subjectSelectField ? subjectSelectField.value : '';
    await renderPdf(question.edition, subject, parseInt(question.pageNum, 10));
}

/** 正答数表示を更新する関数 */
function updateScoreDisplay() {
    if(scoreCorrectEdition) scoreCorrectEdition.textContent = correctCount;
    if(scoreCorrectField) scoreCorrectField.textContent = correctCount;
}

/** 正誤を判定して結果を表示する */
function checkAnswer(selectedChoice) {
    const questionId = getCurrentQuestionId();
    const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;
    const activePanel = currentFieldQuestions.length > 0 ? panelByField : panelByEdition;
    if (!resultArea || !activePanel) return;
    const activeAnswerButtons = activePanel.querySelectorAll('.answer-btn');

    if (answerHistory[questionId]) { return; }

    let correctAnswer;
    let subjectKey;
    let questionPageNum;

     if (currentFieldQuestions.length > 0) {
         const q = currentFieldQuestions[currentFieldIndex];
         subjectKey = subjectSelectField ? subjectSelectField.value : '';
         questionPageNum = q.pageNum;
         correctAnswer = currentAnswers?.[subjectKey]?.[questionPageNum];
     } else {
         subjectKey = subjectSelectEdition ? subjectSelectEdition.value : '';
         questionPageNum = currentPageNum;
         correctAnswer = currentAnswers?.[subjectKey]?.[questionPageNum];
     }

    if (correctAnswer === undefined) {
        resultArea.textContent = '解答データがありません。'; resultArea.className = 'result-area';
        answerHistory[questionId] = { selected: selectedChoice, correct: null, correctAnswer: '?' };
        activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
        return;
    }

    const isCorrect = parseInt(selectedChoice, 10) === correctAnswer;
    answerHistory[questionId] = { selected: selectedChoice, correct: isCorrect, correctAnswer: correctAnswer };

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

    activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
}

/** ナビゲーションボタンの有効/無効を更新 */
function updateNavButtons() {
    if (!prevBtn || !nextBtn || !jumpToSelect) return;
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
    if(!exerciseView || !resultsPanel || !resultsList || !resultsSummary) return;

    exerciseView.classList.add('hidden'); resultsPanel.classList.remove('hidden');
    window.scrollTo(0, 0);
    const totalQuestions = currentSessionQuestions.length;
    let answeredCount = 0; let sessionCorrectCount = 0;
    resultsList.innerHTML = '';
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>問題</th><th>結果</th><th>あなたの解答</th><th>正解</th><th>復習</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    currentSessionQuestions.forEach((qInfo, index) => {
        const questionId = getQuestionId(qInfo.edition, qInfo.subject, qInfo.pageNum);
        const history = answerHistory[questionId];
        const tr = document.createElement('tr');
        const questionNumDisplay = (currentFieldQuestions.length > 0)? `${index + 1} (第${qInfo.edition}回 問${qInfo.pageNum})`: `問 ${qInfo.pageNum}`;
        let statusText = '未解答'; let statusClass = '';
        let yourAnswer = '-'; let correctAnswer = currentAnswers?.[qInfo.subject]?.[qInfo.pageNum] ?? '?';
        if (history) {
            answeredCount++; yourAnswer = history.selected; correctAnswer = history.correctAnswer;
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
            if (index < 0 || index >= currentSessionQuestions.length) return;
            const questionInfo = currentSessionQuestions[index];
            resultsPanel.classList.add('hidden'); exerciseView.classList.remove('hidden');
            if (currentFieldQuestions.length > 0) {
                 if(tabByField) tabByField.click();
                 if(subjectSelectField) subjectSelectField.value = questionInfo.subject;
                 populateFieldSelector();
                 const fieldIdx = fieldsData[questionInfo.subject]?.findIndex(f => f.questions.some(q => q.edition === questionInfo.edition && q.pageNum === questionInfo.pageNum));
                 if(fieldIdx !== undefined && fieldIdx > -1 && fieldSelect) fieldSelect.value = fieldIdx;
                 currentFieldIndex = index;
                 displayFieldQuestion(index);
            } else {
                 if(tabByEdition) tabByEdition.click();
                 if(editionSelect) editionSelect.value = questionInfo.edition;
                 if(subjectSelectEdition) subjectSelectEdition.value = questionInfo.subject;
                 renderPdf(questionInfo.edition, questionInfo.subject, questionInfo.pageNum);
            }
        });
    });
}


// --- イベントリスナーの設定 ---
function setupEventListeners() {
    if (tabByEdition) tabByEdition.addEventListener('click', () => {
        tabByEdition.classList.add('active'); if(tabByField) tabByField.classList.remove('active');
        if(panelByEdition) panelByEdition.classList.remove('hidden'); if(panelByField) panelByField.classList.add('hidden');
        if(questionSource) questionSource.style.display = 'none';
    });
    if (tabByField) tabByField.addEventListener('click', () => {
        tabByField.classList.add('active'); if(tabByEdition) tabByEdition.classList.remove('active');
        if(panelByField) panelByField.classList.remove('hidden'); if(panelByEdition) panelByEdition.classList.add('hidden');
    });

    if (goBtnEdition) goBtnEdition.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {};
        currentFieldQuestions = [];
        const selectedEdition = editionSelect ? editionSelect.value : '';
        const selectedSubject = subjectSelectEdition ? subjectSelectEdition.value : '';
        currentSessionQuestions = [];
        const url = `./pdf/${selectedEdition}/${selectedEdition}_${selectedSubject}.pdf`;
        showLoading(true);
        try {
            const tempLoadingTask = pdfjsLib.getDocument(url);
            const tempPdfDoc = await tempLoadingTask.promise;
            const total = tempPdfDoc.numPages > 1 ? tempPdfDoc.numPages - 1 : 0;
            for (let i = 1; i <= total; i++) {
                currentSessionQuestions.push({ edition: selectedEdition, subject: selectedSubject, pageNum: i });
            }
        } catch (error) {
             console.error("セッションリスト生成PDF読込失敗", error); alert(`PDFファイルが見つかりません:\n${url}`);
             showLoading(false); return;
        }
        await loadAnswersForEdition(selectedEdition);
        await renderPdf(selectedEdition, selectedSubject);
    });

    if (goBtnField) goBtnField.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {};
        const subject = subjectSelectField ? subjectSelectField.value : '';
        const fieldIndex = fieldSelect ? fieldSelect.value : '';
        if (fieldIndex === "" || !fieldsData[subject] || !fieldsData[subject][fieldIndex]) {
             alert("分野を選択してください。"); return;
        }
        currentFieldQuestions = fieldsData[subject][fieldIndex].questions;
        currentFieldIndex = 0;
        currentSessionQuestions = currentFieldQuestions.map(q => ({...q, subject: subject}));
        if (currentFieldQuestions.length === 0) {
            alert("この分野には問題が登録されていません。");
            if(pageCountSpan) pageCountSpan.textContent = '0'; if(pageNumSpan) pageNumSpan.textContent = '0';
            populateJumpSelector(0);
            const context = canvas ? canvas.getContext('2d') : null; if(context) context.clearRect(0, 0, canvas.width, canvas.height);
            if(questionSource) questionSource.style.display = 'none';
            return;
        }
        if(pageCountSpan) pageCountSpan.textContent = currentFieldQuestions.length;
        populateJumpSelector(0);
        showLoading(true);
        await displayFieldQuestion(currentFieldIndex);
    });

    if (subjectSelectEdition) subjectSelectEdition.addEventListener('change', (e) => { /* 表示ボタンで更新 */ });
    if (editionSelect) editionSelect.addEventListener('change', (e) => { /* 表示ボタンで更新 */ });
    if (subjectSelectField) subjectSelectField.addEventListener('change', populateFieldSelector);

    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentFieldQuestions.length > 0) {
            if (currentFieldIndex > 0) { currentFieldIndex--; displayFieldQuestion(currentFieldIndex); }
        } else {
            if (currentPageNum > 1) { currentPageNum--; renderPageInternal(currentPageNum); }
        }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentFieldQuestions.length > 0) {
            if (currentFieldIndex < currentFieldQuestions.length - 1) { currentFieldIndex++; displayFieldQuestion(currentFieldIndex); }
        } else {
            const total = pdfDoc ? pdfDoc.numPages - 1 : 0;
            if (currentPageNum < total) { currentPageNum++; renderPageInternal(currentPageNum); }
        }
    });

    // answerButtons は NodeList なので initialize で取得する必要あり
    answerButtons = document.querySelectorAll('.answer-btn');
    answerButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const parentPanel = e.currentTarget.closest('.control-panel');
            if (!parentPanel || parentPanel.classList.contains('hidden')) return;
            if (e.currentTarget.disabled) return;
            checkAnswer(e.currentTarget.dataset.choice);
        });
    });

    if (jumpToSelect) jumpToSelect.addEventListener('change', (e) => {
        if (currentFieldQuestions.length === 0) {
            const target = parseInt(e.target.value, 10);
            if (target) { currentPageNum = target; renderPageInternal(currentPageNum); }
        }
    });
    if (showResultsBtnEdition) showResultsBtnEdition.addEventListener('click', showResults);
    if (showResultsBtnField) showResultsBtnField.addEventListener('click', showResults);
    if (backToExerciseBtn) backToExerciseBtn.addEventListener('click', () => {
        if(resultsPanel) resultsPanel.classList.add('hidden');
        if(exerciseView) exerciseView.classList.remove('hidden');
    });
}

/** 初期化処理 */
async function initialize() {
    console.log("🔄 アプリケーションの初期化を開始...");

    // --- HTML要素の取得 (DOMContentLoaded後に実行) ---
    exerciseView = document.getElementById('exercise-view');
    resultsPanel = document.getElementById('results-panel');
    welcomeOverlay = document.getElementById('welcome-overlay');
    canvas = document.getElementById('pdf-canvas');
    loadingSpinner = document.getElementById('loading-spinner');
    pageNumSpan = document.getElementById('page-num');
    pageCountSpan = document.getElementById('page-count');
    prevBtn = document.getElementById('prev-btn');
    nextBtn = document.getElementById('next-btn');
    jumpToSelect = document.getElementById('jump-to-select');
    tabByEdition = document.getElementById('tab-by-edition');
    tabByField = document.getElementById('tab-by-field');
    panelByEdition = document.getElementById('panel-by-edition');
    panelByField = document.getElementById('panel-by-field');
    editionSelect = document.getElementById('edition-select');
    subjectSelectEdition = document.getElementById('subject-select-edition');
    goBtnEdition = document.getElementById('go-btn-edition');
    resultAreaEdition = document.getElementById('result-area-edition');
    scoreCorrectEdition = panelByEdition ? panelByEdition.querySelector('.score-correct') : null;
    showResultsBtnEdition = document.getElementById('show-results-btn-edition');
    subjectSelectField = document.getElementById('subject-select-field');
    fieldSelect = document.getElementById('field-select');
    goBtnField = document.getElementById('go-btn-field');
    resultAreaField = document.getElementById('result-area-field');
    scoreCorrectField = panelByField ? panelByField.querySelector('.score-correct') : null;
    showResultsBtnField = document.getElementById('show-results-btn-field');
    // answerButtons は setupEventListeners で取得・設定
    questionSource = document.getElementById('question-source');
    resultsSummary = document.getElementById('results-summary');
    resultsList = document.getElementById('results-list');
    backToExerciseBtn = document.getElementById('back-to-exercise-btn');

    // --- 必須要素の存在チェック (より詳細に) ---
    const requiredElements = {
        editionSelect,
        fieldSelect,
        subjectSelectField,
        canvas,
        subjectSelectEdition,
        goBtnEdition, // イベントリスナー設定に必要
        goBtnField,   // イベントリスナー設定に必要
        // 他にも動作に必須な要素があれば追加
    };

    let missingElementId = null;
    for (const id in requiredElements) {
        if (!requiredElements[id]) {
            missingElementId = id; // 見つからなかった要素の変数名を記録
            break;
        }
    }

    if (missingElementId) {
        console.error(`❌ 初期化失敗: HTML要素 '${missingElementId}' が見つかりません。index.htmlのIDを確認してください。`);
        alert(`ページの読み込みに失敗しました。HTML構造を確認してください。(要素: ${missingElementId})`);
        return; // 処理を中断
    }
    // --- チェックここまで ---

    // 初期値設定 (要素が存在することが保証された後)
    currentSubject = subjectSelectEdition.value;

    // 非同期処理の実行
    await setupEditionSelector(); // editions.json を読み込んでから currentEdition を設定
    if (editionSelect && editionSelect.options.length > 0) {
        currentEdition = editionSelect.value; // 初期値を設定
    }
    await loadFieldsData(); // fields.json を読み込み、分野プルダウンを生成

    // イベントリスナーの設定
    setupEventListeners();

    console.log("✅ 初期化完了。ユーザーの操作を待っています。");
}

// --- アプリケーションの実行 ---
// DOMが完全に読み込まれてから初期化処理を実行
document.addEventListener('DOMContentLoaded', initialize);

// setupEventListeners 関数も initialize 内で要素を取得した後に呼び出す必要があるので、
// initialize の最後ではなく、 setupEventListeners 関数自体を initialize の最後に呼び出すか、
// setupEventListeners の中でも要素取得を行う必要があります。
// 今回は initialize の最後で setupEventListeners を呼び出す形にします。

// --- イベントリスナー設定関数 ---
function setupEventListeners() {
    // answerButtons は NodeList なのでここで取得・設定
    answerButtonsNodeList = document.querySelectorAll('.answer-btn');

    // 各要素の存在を確認してからリスナーを設定
    if (tabByEdition) tabByEdition.addEventListener('click', () => { /* ... */ });
    if (tabByField) tabByField.addEventListener('click', () => { /* ... */ });
    if (goBtnEdition) goBtnEdition.addEventListener('click', async () => { /* ... */ });
    if (goBtnField) goBtnField.addEventListener('click', async () => { /* ... */ });
    if (subjectSelectEdition) subjectSelectEdition.addEventListener('change', (e) => { /* 表示ボタンで更新 */ });
    if (editionSelect) editionSelect.addEventListener('change', (e) => { /* 表示ボタンで更新 */ });
    if (subjectSelectField) subjectSelectField.addEventListener('change', populateFieldSelector);
    if (prevBtn) prevBtn.addEventListener('click', () => { /* ... */ });
    if (nextBtn) nextBtn.addEventListener('click', () => { /* ... */ });
    if (answerButtonsNodeList) answerButtonsNodeList.forEach(button => { /* ... */ });
    if (jumpToSelect) jumpToSelect.addEventListener('change', (e) => { /* ... */ });
    if (showResultsBtnEdition) showResultsBtnEdition.addEventListener('click', showResults);
    if (showResultsBtnField) showResultsBtnField.addEventListener('click', showResults);
    if (backToExerciseBtn) backToExerciseBtn.addEventListener('click', () => { /* ... */ });

    // --- イベントリスナー内のコード (変更なし部分) ---
     if (tabByEdition) tabByEdition.addEventListener('click', () => {
         tabByEdition.classList.add('active'); if(tabByField) tabByField.classList.remove('active');
         if(panelByEdition) panelByEdition.classList.remove('hidden'); if(panelByField) panelByField.classList.add('hidden');
         if(questionSource) questionSource.style.display = 'none';
     });
     if (tabByField) tabByField.addEventListener('click', () => {
         tabByField.classList.add('active'); if(tabByEdition) tabByEdition.classList.remove('active');
         if(panelByField) panelByField.classList.remove('hidden'); if(panelByEdition) panelByEdition.classList.add('hidden');
     });
     if (goBtnEdition) goBtnEdition.addEventListener('click', async () => {
         if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
         correctCount = 0; updateScoreDisplay(); answerHistory = {};
         currentFieldQuestions = [];
         const selectedEdition = editionSelect.value;
         const selectedSubject = subjectSelectEdition.value;
         currentSessionQuestions = [];
         const url = `./pdf/${selectedEdition}/${selectedEdition}_${selectedSubject}.pdf`;
         showLoading(true);
         try {
             const tempLoadingTask = pdfjsLib.getDocument(url);
             const tempPdfDoc = await tempLoadingTask.promise;
             const total = tempPdfDoc.numPages > 1 ? tempPdfDoc.numPages - 1 : 0;
             for (let i = 1; i <= total; i++) {
                 currentSessionQuestions.push({ edition: selectedEdition, subject: selectedSubject, pageNum: i });
             }
         } catch (error) {
              console.error("セッションリスト生成PDF読込失敗", error); alert(`PDFファイルが見つかりません:\n${url}`);
              showLoading(false); return;
         }
         await loadAnswersForEdition(selectedEdition);
         await renderPdf(selectedEdition, selectedSubject);
     });
     if (goBtnField) goBtnField.addEventListener('click', async () => {
         if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
         correctCount = 0; updateScoreDisplay(); answerHistory = {};
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
             if(pageCountSpan) pageCountSpan.textContent = '0'; if(pageNumSpan) pageNumSpan.textContent = '0';
             populateJumpSelector(0);
             const context = canvas ? canvas.getContext('2d') : null; if(context) context.clearRect(0, 0, canvas.width, canvas.height);
             if(questionSource) questionSource.style.display = 'none';
             return;
         }
         if(pageCountSpan) pageCountSpan.textContent = currentFieldQuestions.length;
         populateJumpSelector(0);
         showLoading(true);
         await displayFieldQuestion(currentFieldIndex);
     });
     if (prevBtn) prevBtn.addEventListener('click', () => {
         if (currentFieldQuestions.length > 0) {
             if (currentFieldIndex > 0) { currentFieldIndex--; displayFieldQuestion(currentFieldIndex); }
         } else {
             if (currentPageNum > 1) { currentPageNum--; renderPageInternal(currentPageNum); }
         }
     });
     if (nextBtn) nextBtn.addEventListener('click', () => {
         if (currentFieldQuestions.length > 0) {
             if (currentFieldIndex < currentFieldQuestions.length - 1) { currentFieldIndex++; displayFieldQuestion(currentFieldIndex); }
         } else {
             const total = pdfDoc ? pdfDoc.numPages - 1 : 0;
             if (currentPageNum < total) { currentPageNum++; renderPageInternal(currentPageNum); }
         }
     });
     if (answerButtonsNodeList) answerButtonsNodeList.forEach(button => {
         button.addEventListener('click', (e) => {
             const parentPanel = e.currentTarget.closest('.control-panel');
             if (!parentPanel || parentPanel.classList.contains('hidden')) return;
             if (e.currentTarget.disabled) return;
             checkAnswer(e.currentTarget.dataset.choice);
         });
     });
     if (jumpToSelect) jumpToSelect.addEventListener('change', (e) => {
         if (currentFieldQuestions.length === 0) {
             const target = parseInt(e.target.value, 10);
             if (target) { currentPageNum = target; renderPageInternal(currentPageNum); }
         }
     });
     if (showResultsBtnEdition) showResultsBtnEdition.addEventListener('click', showResults);
     if (showResultsBtnField) showResultsBtnField.addEventListener('click', showResults);
     if (backToExerciseBtn) backToExerciseBtn.addEventListener('click', () => {
         if(resultsPanel) resultsPanel.classList.add('hidden');
         if(exerciseView) exerciseView.classList.remove('hidden');
     });
}

// --- アプリケーションの実行 ---
// DOMが完全に読み込まれてから初期化処理を実行
document.addEventListener('DOMContentLoaded', initialize);

