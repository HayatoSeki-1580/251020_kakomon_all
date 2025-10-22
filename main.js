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
const goBtnField = document.getElementById('go-btn-field');
const customSelect = document.getElementById('field-select-custom');
const selectSelected = customSelect.querySelector('.select-selected');
const selectItems = customSelect.querySelector('.select-items');
const resultAreaField = document.getElementById('result-area-field');
const scoreCorrectField = panelByField.querySelector('.score-correct');
const answerButtons = document.querySelectorAll('.answer-btn');

// --- グローバル変数 ---
let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let fieldsData = {};
let currentFieldQuestions = [];
let currentFieldIndex = 0;
let correctCount = 0;
let currentSubject = subjectSelectEdition.value; // 初期値
let currentEdition = ''; // 初期値は initialize で設定

/** 索引ファイル(editions.json)を読み込み、実施回のセレクトボックスを初期化する */
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
        // 初期値を設定 (存在すれば)
        if (editionSelect.options.length > 0) {
            currentEdition = editionSelect.value;
        }
        console.log(`✅ プルダウンを生成完了。現在の選択: ${currentEdition}`);
    } catch (error) {
        console.error("❌ setupEditionSelector 関数で致命的なエラー:", error);
        alert('editions.jsonの読み込みに失敗しました。コンソールを確認してください。');
    }
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
    } catch (error) {
        console.error("❌ fields.jsonの読み込みに失敗", error);
        alert('fields.jsonの読み込みに失敗しました。コンソールを確認してください。');
    }
}

/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) {
    console.log(`🔄 loadAnswersForEdition 関数を開始: 第${edition}回`);
    const url = `./pdf/${edition}/${edition}_answer.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTPエラー！ ステータス: ${response.status}`);
        currentAnswers = await response.json();
        console.log(`📄 第${edition}回の解答データ:`, currentAnswers);
    } catch (error) {
        console.error(`❌ 解答ファイルが見つかりません: ${url}`, error);
        currentAnswers = {}; // エラー時は空にする
    }
}

/** PDFを読み込んで表示する */
async function renderPdf(edition, subject, pageNum = 1) {
    console.log(`🔄 renderPdf 関数を開始: 第${edition}回 / ${subject} / 問${pageNum}`);
    currentPageNum = pageNum; // 引数で指定されたページ番号を使う
    const url = `./pdf/${edition}/${edition}_${subject}.pdf`;
    const loadingTaskOptions = {
        cMapUrl: './lib/pdfjs/web/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: './lib/pdfjs/web/standard_fonts/'
    };
    try {
        const loadingTask = pdfjsLib.getDocument(url, loadingTaskOptions);
        pdfDoc = await loadingTask.promise;
        console.log("📄 PDFの読み込み成功。総ページ数:", pdfDoc.numPages);
        const totalQuestions = pdfDoc.numPages > 1 ? pdfDoc.numPages - 1 : 0;
        // 回数別モードの時だけ総問題数とジャンププルダウンを更新
        if (currentFieldQuestions.length === 0) {
            pageCountSpan.textContent = totalQuestions;
            populateJumpSelector(totalQuestions);
        }
        await renderPage(currentPageNum);
    } catch (error) {
        console.error("❌ PDFの読み込みに失敗:", error);
        alert(`PDFファイルが見つかりません。\nパス: ${url}\nコンソールを確認してください。`);
        // エラー時も表示をリセット
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        pageCountSpan.textContent = '0';
        pageNumSpan.textContent = '0';
        populateJumpSelector(0);
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
    if (!pdfDoc) {
        console.warn("描画しようとしましたが、pdfDocがありません。");
        return;
    }
    console.log(`🔄 ページを描画中: 問題${num} (PDFの${num + 1}ページ目)`);
    try {
        // ページ移動前にボタン選択状態をリセット
        answerButtons.forEach(btn => btn.classList.remove('selected'));

        const page = await pdfDoc.getPage(num + 1);
        const viewport = page.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        if (currentFieldQuestions.length > 0) {
            pageNumSpan.textContent = currentFieldIndex + 1; // 分野別はインデックス+1
        } else {
            pageNumSpan.textContent = num; // 回数別はページ番号
        }

        resultAreaEdition.textContent = '';
        resultAreaField.textContent = '';
        updateNavButtons();
        jumpToSelect.value = num; // ジャンププルダウンの表示も更新
        console.log("✅ ページ描画完了");
    } catch (error) {
        console.error("❌ ページ描画中にエラー:", error);
        alert("ページの描画中にエラーが発生しました。コンソールを確認してください。");
    }
}

/** 分野別プルダウンを生成する */
function populateFieldSelector() {
    const subject = subjectSelectField.value;
    const fields = fieldsData[subject] || [];
    selectItems.innerHTML = '';
    selectSelected.textContent = fields.length > 0 ? '分野を選択...' : 'データがありません';
    selectSelected.dataset.value = "";

    if (fields.length === 0) return;

    const maxQuestions = Math.max(...fields.map(field => field.questions.length), 1); // ゼロ割防止

    fields.forEach((field, index) => {
        const optionDiv = document.createElement('div');
        const questionCount = field.questions.length;
        const ratio = questionCount / maxQuestions;

        let colorClass = 'freq-low';
        if (ratio > 0.66) colorClass = 'freq-high';
        else if (ratio > 0.33) colorClass = 'freq-medium';

        const barWidth = Math.max(Math.round(ratio * 60), 5); // 最低幅5px

        optionDiv.innerHTML = `
            ${field.fieldName} (${questionCount}問)
            <span class="freq-bar ${colorClass}" style="width: ${barWidth}px;"></span>
        `;
        optionDiv.dataset.value = index;
        optionDiv.dataset.text = `${field.fieldName} (${questionCount}問)`;

        optionDiv.addEventListener('click', function() {
            selectSelected.textContent = this.dataset.text;
            selectSelected.dataset.value = this.dataset.value;
            selectItems.classList.add('select-hide');
            selectSelected.classList.remove('select-arrow-active');
        });
        selectItems.appendChild(optionDiv);
    });
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
    const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;
    let correctAnswer;
    let questionIdentifier; // デバッグ用

    if (currentFieldQuestions.length > 0) {
        const question = currentFieldQuestions[currentFieldIndex];
        correctAnswer = currentAnswers?.[subjectSelectField.value]?.[question.pageNum];
        questionIdentifier = `${subjectSelectField.value} - ${question.pageNum}`;
    } else {
        correctAnswer = currentAnswers?.[subjectSelectEdition.value]?.[currentPageNum];
        questionIdentifier = `${subjectSelectEdition.value} - ${currentPageNum}`;
    }
    
    console.log(`🔘 解答チェック: ${questionIdentifier}, 正解=${correctAnswer}, 選択=${selectedChoice}`);

    if (correctAnswer === undefined) {
        resultArea.textContent = '解答データがありません。';
        resultArea.className = 'result-area';
        return;
    }
    if (parseInt(selectedChoice, 10) === correctAnswer) {
        // 前回間違えて今回正解した場合のみカウントアップ（連続正解防止）
        if (!resultArea.classList.contains('correct')) {
             correctCount++;
             updateScoreDisplay();
        }
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
        jumpToSelect.disabled = true; // 分野別モードではジャンプ無効
    } else {
        const totalQuestions = pdfDoc ? pdfDoc.numPages - 1 : 0;
        prevBtn.disabled = (currentPageNum <= 1);
        nextBtn.disabled = (currentPageNum >= totalQuestions);
        jumpToSelect.disabled = false; // 回数別モードではジャンプ有効
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
    console.log("🔘 回数別「表示」ボタンクリック");
    welcomeOverlay.style.display = 'none';
    window.scrollTo(0, 0);
    correctCount = 0; updateScoreDisplay(); // スコアリセット
    currentFieldQuestions = []; // 分野別モード状態をリセット
    currentEdition = editionSelect.value;
    currentSubject = subjectSelectEdition.value;
    await loadAnswersForEdition(currentEdition);
    await renderPdf(currentEdition, currentSubject);
});

goBtnField.addEventListener('click', async () => {
    console.log("🔘 分野別「表示」ボタンクリック");
    welcomeOverlay.style.display = 'none';
    window.scrollTo(0, 0);
    correctCount = 0; updateScoreDisplay(); // スコアリセット
    const subject = subjectSelectField.value;
    const fieldIndex = selectSelected.dataset.value;
    if (fieldIndex === "" || !fieldsData[subject] || !fieldsData[subject][fieldIndex]) {
         alert("分野を選択してください。");
         return;
    }
    currentFieldQuestions = fieldsData[subject][fieldIndex].questions;
    currentFieldIndex = 0;
    
    if (currentFieldQuestions.length === 0) {
        alert("この分野には問題が登録されていません。");
        pageCountSpan.textContent = '0';
        pageNumSpan.textContent = '0';
        populateJumpSelector(0);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    pageCountSpan.textContent = currentFieldQuestions.length; // 総問題数を更新
    populateJumpSelector(0); // ジャンププルダウンは空にする

    await displayFieldQuestion(currentFieldIndex);
});

// 各セレクトボックスの値変更イベント
subjectSelectEdition.addEventListener('change', (e) => { currentSubject = e.target.value; });
editionSelect.addEventListener('change', (e) => { currentEdition = e.target.value; });
subjectSelectField.addEventListener('change', populateFieldSelector); // 科目が変わったら分野プルダウンを更新

// 前へ/次へボタン
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

// 解答ボタン
answerButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        // 選択状態の更新
        answerButtons.forEach(btn => btn.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        // 正誤判定
        checkAnswer(e.currentTarget.dataset.choice);
    });
});

// ジャンププルダウン
jumpToSelect.addEventListener('change', (e) => {
    // 回数別モードでのみ動作
    if (currentFieldQuestions.length === 0) {
        const targetPage = parseInt(e.target.value, 10);
        if (targetPage) {
            currentPageNum = targetPage;
            renderPage(currentPageNum);
        }
    }
});

// カスタムプルダウンの開閉ロジック
selectSelected.addEventListener('click', function() {
    selectItems.classList.toggle('select-hide');
    this.classList.toggle('select-arrow-active');
});
document.addEventListener('click', function(e) {
    if (!customSelect.contains(e.target)) {
        selectItems.classList.add('select-hide');
        selectSelected.classList.remove('select-arrow-active');
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

