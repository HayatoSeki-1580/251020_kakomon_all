// --- モジュールのインポート ---
import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';

// --- HTML要素の取得 ---
// (主な要素)
const welcomeOverlay = document.getElementById('welcome-overlay');
const canvas = document.getElementById('pdf-canvas');
const tabByEdition = document.getElementById('tab-by-edition');
const tabByField = document.getElementById('tab-by-field');
const panelByEdition = document.getElementById('panel-by-edition');
const panelByField = document.getElementById('panel-by-field');

// 回数別
const editionSelect = document.getElementById('edition-select');
const subjectSelectEdition = document.getElementById('subject-select-edition');
const goBtnEdition = document.getElementById('go-btn-edition');
const resultAreaEdition = document.getElementById('result-area-edition');
const scoreCorrectEdition = panelByEdition.querySelector('.score-correct');

// 分野別
const subjectSelectField = document.getElementById('subject-select-field');
const goBtnField = document.getElementById('go-btn-field');
const customSelect = document.getElementById('field-select-custom');
const selectSelected = customSelect.querySelector('.select-selected');
const selectItems = customSelect.querySelector('.select-items');
const resultAreaField = document.getElementById('result-area-field');
const scoreCorrectField = panelByField.querySelector('.score-correct');

// 共通
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const jumpToSelect = document.getElementById('jump-to-select');
const answerButtons = document.querySelectorAll('.answer-btn');

// --- グローバル変数 ---
let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let fieldsData = {};
let currentFieldQuestions = [];
let currentFieldIndex = 0;
let correctCount = 0; // 【追加】正答数をカウントする変数

/** 索引ファイル(editions.json)を読み込む */
async function setupEditionSelector() { /* ... 変更なし ... */ }
/** 分野別ファイル(fields.json)を読み込む */
async function loadFieldsData() { /* ... 変更なし ... */ }
/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) { /* ... 変更なし ... */ }
/** PDFを読み込んで表示する */
async function renderPdf(edition, subject, pageNum = 1) { /* ... 変更なし ... */ }
/** 分野別プルダウンを生成する */
function populateFieldSelector() { /* ... 変更なし ... */ }

/** 指定されたページを描画する */
async function renderPage(num) {
    if (!pdfDoc) return;
    try {
        // 【追加】ページを移動したら、ボタンの選択状態をリセット
        answerButtons.forEach(btn => btn.classList.remove('selected'));

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
        
        resultAreaEdition.textContent = ''; resultAreaField.textContent = '';
        updateNavButtons();
        jumpToSelect.value = num;
    } catch (error) { console.error("❌ ページ描画中にエラー:", error); }
}

/** 分野別の問題を表示する */
async function displayFieldQuestion(index) { /* ... 変更なし ... */ }

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
        // 【追加】正解したらカウントを増やし、表示を更新
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
function updateNavButtons() { /* ... 変更なし ... */ }

// --- イベントリスナーの設定 ---
// 「表示」ボタンが押されたら、スコアをリセットする
goBtnEdition.addEventListener('click', async () => {
    correctCount = 0;
    updateScoreDisplay();
    // ... (以降の処理は変更なし)
});
goBtnField.addEventListener('click', async () => {
    correctCount = 0;
    updateScoreDisplay();
    // ... (以降の処理は変更なし)
});

// 解答ボタンが押された時の処理
answerButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        // 【追加】まず全てのボタンから選択状態を解除
        answerButtons.forEach(btn => btn.classList.remove('selected'));
        // 【追加】クリックされたボタンだけを選択状態にする
        e.currentTarget.classList.add('selected');

        checkAnswer(e.currentTarget.dataset.choice);
    });
});

// ... (他のイベントリスナーや初期化処理は変更なし) ...

// --- 変更がない関数のコード（念のため記載） ---
async function setupEditionSelector() {try {const url = './data/editions.json';const response = await fetch(url);if (!response.ok) throw new Error(`HTTPエラー！ ステータス: ${response.status}`);const data = await response.json();const editions = data.available.sort((a, b) => b.value - a.value);editionSelect.innerHTML = '';editions.forEach(editionInfo => {const option = document.createElement('option');option.value = editionInfo.value;option.textContent = editionInfo.displayText;editionSelect.appendChild(option);});} catch (error) {console.error("❌ setupEditionSelector 関数で致命的なエラー:", error);}}
async function loadFieldsData() {try {const response = await fetch('./data/fields.json');if (!response.ok) throw new Error('HTTPエラー');fieldsData = await response.json();populateFieldSelector();} catch (error) {console.error("❌ fields.jsonの読み込みに失敗", error);}}
async function loadAnswersForEdition(edition) {const url = `./pdf/${edition}/${edition}_answer.json`;try {const response = await fetch(url);if (!response.ok) throw new Error(`HTTPエラー！ ステータス: ${response.status}`);currentAnswers = await response.json();} catch (error) {currentAnswers = {};}}
async function renderPdf(edition, subject, pageNum = 1) {currentPageNum = pageNum;const url = `./pdf/${edition}/${edition}_${subject}.pdf`;const loadingTaskOptions = {cMapUrl: './lib/pdfjs/web/cmaps/',cMapPacked: true,standardFontDataUrl: './lib/pdfjs/web/standard_fonts/'};try {const loadingTask = pdfjsLib.getDocument(url, loadingTaskOptions);pdfDoc = await loadingTask.promise;const totalQuestions = pdfDoc.numPages > 1 ? pdfDoc.numPages - 1 : 0;if(currentFieldQuestions.length === 0) {pageCountSpan.textContent = totalQuestions; populateJumpSelector(totalQuestions);}await renderPage(currentPageNum);} catch (error) {console.error("❌ PDFの読み込みに失敗:", error);}}
function populateFieldSelector() {const subject = subjectSelectField.value;const fields = fieldsData[subject] || [];selectItems.innerHTML = '';selectSelected.textContent = fields.length > 0 ? '分野を選択...' : 'データがありません';selectSelected.dataset.value = "";if (fields.length === 0) return;const maxQuestions = Math.max(...fields.map(field => field.questions.length), 1);fields.forEach((field, index) => {const optionDiv = document.createElement('div');const questionCount = field.questions.length;const ratio = questionCount / maxQuestions;let colorClass = 'freq-low';if (ratio > 0.66) colorClass = 'freq-high';else if (ratio > 0.33) colorClass = 'freq-medium';const barWidth = Math.max(Math.round(ratio * 60), 5);optionDiv.innerHTML = `${field.fieldName} (${questionCount}問) <span class="freq-bar ${colorClass}" style="width: ${barWidth}px;"></span>`;optionDiv.dataset.value = index;optionDiv.dataset.text = `${field.fieldName} (${questionCount}問)`;optionDiv.addEventListener('click', function() {selectSelected.textContent = this.dataset.text;selectSelected.dataset.value = this.dataset.value;selectItems.classList.add('select-hide');selectSelected.classList.remove('select-arrow-active');});selectItems.appendChild(optionDiv);});}
function populateJumpSelector(totalQuestions) {jumpToSelect.innerHTML = '<option value="">移動...</option>';for (let i = 1; i <= totalQuestions; i++) {const option = document.createElement('option');option.value = i;option.textContent = `問${i}`;jumpToSelect.appendChild(option);}}
async function displayFieldQuestion(index) {const question = currentFieldQuestions[index];await loadAnswersForEdition(question.edition);await renderPdf(question.edition, subjectSelectField.value, parseInt(question.pageNum, 10));}
function updateNavButtons() {if (currentFieldQuestions.length > 0) {prevBtn.disabled = (currentFieldIndex <= 0);nextBtn.disabled = (currentFieldIndex >= currentFieldQuestions.length - 1);} else {const totalQuestions = pdfDoc ? pdfDoc.numPages - 1 : 0;prevBtn.disabled = (currentPageNum <= 1);nextBtn.disabled = (currentPageNum >= totalQuestions);}}
tabByEdition.addEventListener('click', () => {tabByEdition.classList.add('active');tabByField.classList.remove('active');panelByEdition.classList.remove('hidden');panelByField.classList.add('hidden');});
tabByField.addEventListener('click', () => {tabByField.classList.add('active');tabByEdition.classList.remove('active');panelByField.classList.remove('hidden');panelByEdition.classList.add('hidden');});
goBtnEdition.addEventListener('click', async () => {welcomeOverlay.style.display = 'none';window.scrollTo(0, 0);currentFieldQuestions = [];await loadAnswersForEdition(editionSelect.value);await renderPdf(editionSelect.value, subjectSelectEdition.value);});
goBtnField.addEventListener('click', async () => {welcomeOverlay.style.display = 'none';window.scrollTo(0, 0);const subject = subjectSelectField.value;const fieldIndex = selectSelected.dataset.value;if (fieldIndex === "") { alert("分野を選択してください。"); return; }currentFieldQuestions = fieldsData[subject][fieldIndex].questions;currentFieldIndex = 0;pageCountSpan.textContent = currentFieldQuestions.length;populateJumpSelector(0);await displayFieldQuestion(currentFieldIndex);});
subjectSelectField.addEventListener('change', populateFieldSelector);
prevBtn.addEventListener('click', () => {if (currentFieldQuestions.length > 0) {if (currentFieldIndex > 0) {currentFieldIndex--;displayFieldQuestion(currentFieldIndex);}} else {if (currentPageNum > 1) {currentPageNum--;renderPage(currentPageNum);}}});
nextBtn.addEventListener('click', () => {if (currentFieldQuestions.length > 0) {if (currentFieldIndex < currentFieldQuestions.length - 1) {currentFieldIndex++;displayFieldQuestion(currentFieldIndex);}} else {const totalQuestions = pdfDoc ? pdfDoc.numPages - 1 : 0;if (currentPageNum < totalQuestions) {currentPageNum++;renderPage(currentPageNum);}}});
jumpToSelect.addEventListener('change', (e) => {if (currentFieldQuestions.length === 0) {const targetPage = parseInt(e.target.value, 10);if (targetPage) {currentPageNum = targetPage;renderPage(currentPageNum);}}});
selectSelected.addEventListener('click', function() {selectItems.classList.toggle('select-hide');this.classList.toggle('select-arrow-active');});
document.addEventListener('click', function(e) {if (!customSelect.contains(e.target)) {selectItems.classList.add('select-hide');selectSelected.classList.remove('select-arrow-active');}});
async function initialize() {await setupEditionSelector();await loadFieldsData();}
initialize();
