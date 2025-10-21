// --- デバッグメッセージ ---
console.log("✅ main.js スクリプトの読み込み開始");

// --- モジュールのインポート ---
import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib.pdfjs/build/pdf.worker.mjs';

console.log("✅ PDF.jsライブラリのインポート成功");

// --- HTML要素の取得 ---
const subjectSelect = document.getElementById('subject-select');
const editionSelect = document.getElementById('edition-select');
const goBtn = document.getElementById('go-btn');
const canvas = document.getElementById('pdf-canvas');
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const resultArea = document.getElementById('result-area');
const answerButtons = document.querySelectorAll('.answer-btn');

console.log("✅ HTML要素の取得完了");

// --- グローバル変数 ---
let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let currentSubject = subjectSelect.value;
let currentEdition = '';

/** 索引ファイルを読み込み、実施回のセレクトボックスを初期化する */
async function setupEditionSelector() {
    console.log("🔄 setupEditionSelector 関数を開始");
    try {
        const url = './data/editions.json';
        console.log(`📄 editions.json を読み込みます: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTPエラー！ ステータス: ${response.status}`);
        }
        const data = await response.json();
        console.log("📄 editions.json のデータ:", data);

        const editions = data.available.sort((a, b) => b - a);
        editionSelect.innerHTML = '';
        editions.forEach(edition => {
            const option = document.createElement('option');
            option.value = edition;
            option.textContent = `第${edition}回`;
            editionSelect.appendChild(option);
        });
        currentEdition = editionSelect.value;
        console.log(`✅ プルダウンを生成完了。現在の選択: 第${currentEdition}回`);
    } catch (error) {
        console.error("❌ setupEditionSelector 関数で致命的なエラー:", error);
        alert('editions.jsonの読み込みに失敗しました。コンソールを確認してください。');
    }
}

/** 指定された回の解答JSONを読み込む */
async function loadAnswersForEdition(edition) {
    console.log(`🔄 loadAnswersForEdition 関数を開始: 第${edition}回`);
    const url = `./pdf/${edition}/${edition}_answer.json`;
    console.log(`📄 解答ファイルを読み込みます: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTPエラー！ ステータス: ${response.status}`);
        }
        currentAnswers = await response.json();
        console.log(`📄 第${edition}回の解答データ:`, currentAnswers);
    } catch (error) {
        console.error("❌ 解答ファイルの読み込みに失敗:", error);
        alert(`解答ファイルが見つかりません。\nパス: ${url}\nコンソールを確認してください。`);
        currentAnswers = {};
    }
}

/** PDFを読み込んで表示する */
async function renderPdf() {
    console.log(`🔄 renderPdf 関数を開始: 第${currentEdition}回 / ${currentSubject}`);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);

    currentPageNum = 1;
    const url = `./pdf/${currentEdition}/${currentEdition}_${currentSubject}.pdf`;
    console.log(`📄 PDFを読み込みます: ${url}`);
    try {
        pdfDoc = await pdfjsLib.getDocument(url).promise;
        console.log("📄 PDFの読み込み成功。総ページ数:", pdfDoc.numPages);
        pageCountSpan.textContent = pdfDoc.numPages > 1 ? pdfDoc.numPages - 1 : 0;
        await renderPage(currentPageNum);
    } catch (error) {
        console.error("❌ PDFの読み込みに失敗:", error);
        alert(`PDFファイルが見つかりません。\nパス: ${url}\nコンソールを確認してください。`);
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
        const page = await pdfDoc.getPage(num + 1);
        const viewport = page.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        context.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: context, viewport }).promise;

        pageNumSpan.textContent = num;
        resultArea.textContent = '';
        updateNavButtons();
        console.log("✅ ページ描画完了");

    } catch (error) {
        console.error("❌ ページ描画中に致命的なエラーが発生しました:", error);
        alert("ページの描画中にエラーが発生しました。コンソールを確認してください。");
    }
}

/** 正誤を判定して結果を表示する */
function checkAnswer(selectedChoice) {
    console.log(`🔘 解答ボタンクリック: ${selectedChoice}番`);
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


// --- イベントリスナーの設定 ---
console.log("🔄 イベントリスナーを設定します");

subjectSelect.addEventListener('change', (e) => {
    currentSubject = e.target.value;
    console.log(`🔘 科目変更: ${currentSubject}`);
});

editionSelect.addEventListener('change', (e) => {
    currentEdition = e.target.value;
    console.log(`🔘 実施回変更: 第${currentEdition}回`);
});

goBtn.addEventListener('click', async () => {
    console.log("🔘 表示ボタンがクリックされました");
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

/** 初期化処理 */
async function initialize() {
    console.log("🔄 アプリケーションの初期化を開始...");
    await setupEditionSelector();
    if (currentEdition) {
        const context = canvas.getContext('2d');
        context.font = "20px sans-serif";
        context.textAlign = "center";
        context.fillText("科目と実施回を選択して「表示」ボタンを押してください。", canvas.width / 2, 50);
        console.log("✅ 初期化完了。ユーザーの操作を待っています。");
    } else {
        console.error("❌ 初期化に失敗。利用可能な実施回がありません。");
    }
}

// --- アプリケーションの実行 ---
initialize();
