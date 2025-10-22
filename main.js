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
let answerHistory = {};
let currentSubject = subjectSelectEdition.value;
let currentEdition = '';

/** 問題IDを生成するヘルパー関数 */
function getQuestionId() {
    if (currentFieldQuestions.length > 0) {
        const question = currentFieldQuestions[currentFieldIndex];
        return `${question.edition}-${subjectSelectField.value}-${question.pageNum}`;
    } else {
        return `${editionSelect.value}-${subjectSelectEdition.value}-${currentPageNum}`;
    }
}

/** 索引ファイル(editions.json)を読み込む */
async function setupEditionSelector() {
    console.log("🔄 setupEditionSelector 関数を開始");
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
        console.log(`✅ プルダウンを生成完了。現在の選択: ${currentEdition}`);
    } catch (error) { console.error("❌ editions.json読込エラー:", error); }
}

/** 分野別ファイル(fields.json)を読み込む */
async function loadFieldsData() {
    console.log("🔄 fields.jsonを読み込みます");
    try {
        const response = await fetch('./data/fields.json');
        if (!response.ok) throw new Error('HTTPエラー');
        fieldsData = await response.json();
        console.log("✅ fields.jsonの読み込み成功");
        populateFieldSelector(); // 初期表示
    } catch (error) { console.error("❌ fields.jsonの読み込みに失敗", error); }
}

/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) {
    console.log(`🔄 loadAnswersForEdition 関数を開始: 第${edition}回`);
    const url = `./pdf/${edition}/${edition}_answer.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTPエラー`);
        currentAnswers = await response.json();
        console.log(`📄 第${edition}回の解答データ:`, currentAnswers);
    } catch (error) {
        currentAnswers = {};
        console.error(`❌ 解答ファイルが見つかりません: ${url}`, error);
    }
}

/** PDFを読み込んで表示する */
async function renderPdf(edition, subject, pageNum = 1) {
    console.log(`🔄 renderPdf 関数を開始: 第${edition}回 / ${subject} / 問${pageNum}`);
    currentPageNum = pageNum;
    const url = `./pdf/${edition}/${edition}_${subject}.pdf`;
    const loadingTaskOptions = { cMapUrl: './lib/pdfjs/web/cmaps/', cMapPacked: true, standardFontDataUrl: './lib/pdfjs/web/standard_fonts/' };
    try {
        const loadingTask = pdfjsLib.getDocument(url, loadingTaskOptions);
        pdfDoc = await loadingTask.promise;
        console.log("📄 PDFの読み込み成功。総ページ数:", pdfDoc.numPages);
        const totalQuestions = pdfDoc.numPages > 1 ? pdfDoc.numPages - 1 : 0;
        if (currentFieldQuestions.length === 0) {
            pageCountSpan.textContent = totalQuestions;
            populateJumpSelector(totalQuestions);
        }
        await renderPage(currentPageNum);
    } catch (error) {
        console.error("❌ PDFの読み込みに失敗:", error);
        alert(`PDFファイルが見つかりません。\nパス: ${url}\nコンソールを確認してください。`);
        const context = canvas.getContext('d');
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
    console.log(`🔄 ページを描画中: 問題${num} (PDFの${num + 1}ページ目)`);
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
        if (currentFieldQuestions.length === 0) {
            jumpToSelect.value = num;
        }

        const questionId = getQuestionId();
        if (answerHistory[questionId]) {
            const selectedButton = document.querySelector(`.answer-btn[data-choice="${answerHistory[questionId].selected}"]`);
            if (selectedButton) {
                selectedButton.classList.add('selected');
            }
            const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;
            if (answerHistory[questionId].correct) {
                resultArea.textContent = `正解！ 🎉`;
                resultArea.className = 'result-area correct';
            } else {
                let correctAnswerText = '';
                let correctAnswer;
                let subjectKey;
                 if (currentFieldQuestions.length > 0) {
                     const q = currentFieldQuestions[currentFieldIndex];
                     subjectKey = subjectSelectField.value;
                     correctAnswer = currentAnswers?.[subjectKey]?.[q.pageNum];
                 } else {
                     subjectKey = subjectSelectEdition.value;
                     correctAnswer = currentAnswers?.[subjectKey]?.[currentPageNum];
                 }
                 if(correctAnswer !== undefined) correctAnswerText = ` (正解は ${correctAnswer})`;

                 resultArea.textContent = `不正解...${correctAnswerText} ❌`;
                 resultArea.className = 'result-area incorrect';
             }
        }
        console.log("✅ ページ描画完了");
    } catch (error) { console.error("❌ ページ描画エラー:", error); }
}

/** 分野別プルダウンを生成する */
function populateFieldSelector() {
    console.log("🔄 分野プルダウン生成開始");
    const subject = subjectSelectField.value;
    const fields = fieldsData[subject] || [];
    fieldSelect.innerHTML = ''; // クリア
    if (fields.length === 0) {
        console.warn(`科目 ${subject} の分野データがありません。`);
        return;
    }
    const maxQuestions = Math.max(...fields.map(field => field.questions.length), 1); // ゼロ割防止
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
    console.log("✅ 分野プルダウン生成完了");
}

/** 分野別の問題を表示する */
async function displayFieldQuestion(index) {
    if (!currentFieldQuestions[index]) {
        console.error("指定されたインデックスの問題が見つかりません:", index);
        return;
    }
    const question = currentFieldQuestions[index];
    console.log(`🔄 分野別問題表示: ${question.edition}回 / 問${question.pageNum}`);
    await loadAnswersForEdition(question.edition);
    // PDF全体を読み込み直し、指定ページを表示
    await renderPdf(question.edition, subjectSelectField.value, parseInt(question.pageNum, 10));
}

/** 正答数表示を更新する関数 */
function updateScoreDisplay() {
    scoreCorrectEdition.textContent = correctCount;
    scoreCorrectField.textContent = correctCount;
}

/** 正誤を判定して結果を表示する */
function checkAnswer(selectedChoice) {
    const questionId = getQuestionId();
    const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;
    let correctAnswer;
    let subjectKey;

    if (currentFieldQuestions.length > 0) {
        const q = currentFieldQuestions[currentFieldIndex];
        subjectKey = subjectSelectField.value;
        correctAnswer = currentAnswers?.[subjectKey]?.[q.pageNum];
    } else {
        subjectKey = subjectSelectEdition.value;
        correctAnswer = currentAnswers?.[subjectKey]?.[currentPageNum];
    }

    console.log(`🔘 解答チェック: ID=${questionId}, 正解=${correctAnswer}, 選択=${selectedChoice}`);

    if (correctAnswer === undefined) {
        resultArea.textContent = '解答データがありません。';
        resultArea.className = 'result-area';
        return;
    }

    const isCorrect = parseInt(selectedChoice, 10) === correctAnswer;

    // 最初の解答の場合のみ履歴を記録し、スコアを更新
    if (!answerHistory[questionId]) {
        console.log(`📝 初回答を記録: ${questionId}`);
        answerHistory[questionId] = { selected: selectedChoice, correct: isCorrect };
        if (isCorrect) {
            correctCount++;
            updateScoreDisplay();
            console.log(`✅ 正解！ スコア: ${correctCount}`);
        } else {
            console.log(`❌ 不正解...`);
        }
    } else {
         console.log(`📝 再回答のためスコア更新なし: ${questionId}`);
    }

    // 正誤結果の表示
    if (isCorrect) {
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
    console.log("🔘 回数別「表示」ボタンクリック");
    welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
    correctCount = 0; updateScoreDisplay();
    answerHistory = {};
    currentFieldQuestions = [];
    currentEdition = editionSelect.value; // 値を確実に更新
    currentSubject = subjectSelectEdition.value; // 値を確実に更新
    await loadAnswersForEdition(currentEdition);
    await renderPdf(currentEdition, currentSubject);
});

goBtnField.addEventListener('click', async () => {
    console.log("🔘 分野別「表示」ボタンクリック");
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
    if (currentFieldQuestions.length === 0) {
        alert("この分野には問題が登録されていません。");
        pageCountSpan.textContent = '0'; pageNumSpan.textContent = '0';
        populateJumpSelector(0);
        const context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height);
        questionSource.style.display = 'none';
        return;
    }
    pageCountSpan.textContent = currentFieldQuestions.length;
    populateJumpSelector(0); // ジャンププルダウンは空にする
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
    console.log("🔄 アプリケーションの初期化を開始...");
    await setupEditionSelector();
    await loadFieldsData();
    console.log("✅ 初期化完了。ユーザーの操作を待っています。");
}

// --- アプリケーションの実行 ---
initialize();

