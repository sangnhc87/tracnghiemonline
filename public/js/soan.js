// ==========================================================
// BƯỚC 1: KHỞI TẠO FIREBASE VÀ CÁC BIẾN TOÀN CỤC
// ==========================================================

// Lấy các dịch vụ Firebase (được init.js khởi tạo trong HTML)
const auth = firebase.auth();
const storage = firebase.storage();
// Quan trọng: Trỏ functions đến đúng region Singapore
const functions = firebase.app().functions("asia-southeast1"); 

// Các biến toàn cục
let timerInterval;
let startTime;

// ==========================================================
// BƯỚC 2: ĐỊNH NGHĨA TẤT CẢ CÁC HÀM
// ==========================================================

// --- CÁC HÀM TIỆN ÍCH CHO SWEETALERT ---
function startTimer(timerElement) {
    startTime = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const totalSeconds = Math.floor(elapsedTime / 1000);
        const milliseconds = String(elapsedTime % 1000).padStart(3, '0');
        const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        if (timerElement) {
            timerElement.textContent = `${hours}:${minutes}:${seconds}.${milliseconds}`;
        }
    }, 100);
}

function stopTimer() {
    clearInterval(timerInterval);
}

function updateSwalProgress(title, message = '') {
    if (Swal.isVisible()) {
        const titleEl = Swal.getTitle();
        if (titleEl) titleEl.textContent = title;
        const messageEl = document.getElementById('swal-message');
        if (messageEl) messageEl.innerHTML = message;
    }
}

// --- CÁC HÀM XỬ LÝ SOẠN THẢO VÀ TIKZ ---

async function handleIncludeGraphicsUpload(currentContent) {
    const imageRegex = /\\includegraphics(?:\[.*?\])?\{(.+?)\}/g;
    const matches = [...currentContent.matchAll(imageRegex)];
    if (matches.length === 0) return currentContent;

    updateSwalProgress('Xử lý ảnh có sẵn', `Phát hiện <strong>${matches.length}</strong> ảnh. Chuẩn bị giao diện...`);
    
    return new Promise((resolve) => {
        const foundImages = matches.map(match => ({ fullCommand: match[0], path: match[1].trim(), newUrl: null }));
        let uploadHtml = `<p style="margin-bottom: 10px;">Vui lòng tải lên các tệp ảnh tương ứng:</p><ul id="image-upload-list" style="list-style: none; padding: 0; text-align: left; max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px;">`;
        foundImages.forEach((img, index) => {
            uploadHtml += `<li style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #eee;"><span style="font-family: monospace; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${img.path}">${img.path}</span><div id="upload-status-${index}"><input type="file" accept="image/*" class="swal-upload-input" data-index="${index}" style="display:none;"><button onclick="document.querySelector('.swal-upload-input[data-index=\\'${index}\\']').click()" class="swal2-styled swal2-xs">Chọn</button></div></li>`;
        });
        uploadHtml += `</ul><button id="finish-upload-btn" class="swal2-styled swal2-confirm" style="display:none; margin-top:10px;">Hoàn tất Upload</button>`;
        
        const messageEl = document.getElementById('swal-message');
        if (messageEl) messageEl.innerHTML = uploadHtml;

        const style = document.createElement('style');
        style.innerHTML = `.swal2-xs { padding: 0.25em 0.5em; font-size: 0.875em; }`;
        document.head.appendChild(style);

        const finishBtn = document.getElementById('finish-upload-btn');
        document.querySelectorAll('.swal-upload-input').forEach(input => {
            input.addEventListener('change', async (evt) => {
                const fileToUpload = evt.target.files[0];
                if (!fileToUpload) return;
                const index = evt.target.dataset.index;
                const statusDiv = document.getElementById(`upload-status-${index}`);
                statusDiv.innerHTML = '<i>Đang tải...</i>';
                try {
                    const CLOUD_NAME = "dfprmep2p";
                    const UPLOAD_PRESET = "up2web";
                    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
                    const formData = new FormData();
                    formData.append('file', fileToUpload);
                    formData.append('upload_preset', UPLOAD_PRESET);
                    const response = await fetch(url, { method: 'POST', body: formData });
                    if (!response.ok) { const err = await response.json(); throw new Error(err.error.message); }
                    const data = await response.json();
                    foundImages[index].newUrl = data.secure_url;
                    statusDiv.innerHTML = '<span style="color: green;">✔</span>';
                    if (foundImages.every(img => img.newUrl) && finishBtn) finishBtn.style.display = 'inline-block';
                } catch (error) {
                    statusDiv.innerHTML = `<span style="color: red; cursor: pointer;" title="${error.message}">Lỗi!</span>`;
                }
            });
        });
        if (finishBtn) {
            finishBtn.addEventListener('click', () => {
                updateSwalProgress('Đang xử lý tệp...', 'Thay thế link ảnh...');
                let updatedContent = currentContent;
                foundImages.forEach(img => {
                    if (img.newUrl) updatedContent = updatedContent.replace(img.fullCommand, `<img class="inline-image img-center" src='${img.newUrl}'>`);
                });
                resolve(updatedContent);
            });
        }
    });
}

async function processTexFileWithTikZ(fileContent) {
    if (!window.app || !window.app.populateQuestionsFromText) {
        Swal.fire('Lỗi', 'Ứng dụng chưa sẵn sàng.', 'error');
        return;
    }
    Swal.fire({
        title: 'Đang xử lý tệp...',
        html: `<div id="swal-message" style="margin-top: 10px; min-height: 50px;">Bắt đầu...</div><div style="font-family: 'Courier New', Courier, monospace; font-size: 1.5rem; font-weight: bold; margin-top: 15px; color: #3085d6;"><span id="swal-timer">00:00:00.000</span></div>`,
        allowOutsideClick: false, showConfirmButton: false, showCancelButton: true,
        cancelButtonText: 'Dừng Xử Lý',
        didOpen: () => { Swal.showLoading(); startTimer(document.getElementById('swal-timer')); },
        willClose: () => stopTimer()
    });

    let content = fileContent;
    try {
        updateSwalProgress('Đang xử lý tệp...', 'Áp dụng quy tắc tiền xử lý...');
        const rulesResponse = await fetch('soanthao/replace.json').catch(() => null);
        if (rulesResponse && rulesResponse.ok && typeof TextPreprocessor !== 'undefined') {
            const rules = await rulesResponse.json();
            content = TextPreprocessor.process(content, rules);
        }

        updateSwalProgress('Đang xử lý tệp...', 'Phân tích hình vẽ TikZ...');
        const tikzRegex = /\\begin{tikzpicture}[\s\S]*?\\end{tikzpicture}/g;
        const tikzBlocks = content.match(tikzRegex);
        if (tikzBlocks && tikzBlocks.length > 0) {
            updateSwalProgress(`Đang dịch ${tikzBlocks.length} hình TikZ...`, 'Gửi yêu cầu đến server...');
            
            // SỬA Ở ĐÂY: Dùng biến `functions` đã được cấu hình đúng
            const processTikz = functions.httpsCallable('processTikzProxy');
            
            const tikzOnlyText = tikzBlocks.join('\n\n');
            const result = await processTikz({ fileContent: tikzOnlyText });
            const data = result.data;
            if (!data.success) throw new Error(data.error || 'Lỗi từ dịch vụ TikZ.');

            updateSwalProgress(`Đang dịch ${tikzBlocks.length} hình TikZ...`, 'Đã nhận link, đang thay thế...');
            data.images.forEach((image, index) => {
                if (tikzBlocks[index] && image.secure_url) {
                    const urlParts = image.secure_url.split('/upload/');
                    const transformedUrl = `${urlParts[0]}/upload/q_auto,f_auto,h_250/${urlParts[1]}`;
                    content = content.replace(tikzBlocks[index], `<img src='${transformedUrl}' class="img-center">`);
                }
            });
        }
        
        content = await handleIncludeGraphicsUpload(content);
        stopTimer();
        window.app.populateQuestionsFromText(content);
        Swal.fire({ icon: 'success', title: 'Hoàn tất!', text: 'Đã xử lý và tải tệp thành công.' });
    
    } catch (error) {
        stopTimer();
        Swal.fire({ icon: 'error', title: 'Xử lý thất bại', text: error ? error.message : 'Lỗi không xác định', footer: 'Nội dung gốc sẽ được tải vào các khung soạn thảo.' });
        window.app.populateQuestionsFromText(fileContent);
    }
}

// --- CÁC HÀM XỬ LÝ SAO LƯU CLOUD ---

function initializeCloudBackupFeature() {
    const saveToCloudBtn = document.getElementById('save-to-cloud-btn'); 
    if (saveToCloudBtn) {
        saveToCloudBtn.addEventListener('click', handleBackupToCloud);
    }
}

function extractBlocksAndInternalId_Client(content) {
    if (typeof content !== 'string') return [];
    const blocks = [];
    const blockRegex = /\\begin\{\s*(ex|vd|bt)\s*\}(.*?)\\end\{\s*\1\s*\}/gs;
    const matches = [...content.matchAll(blockRegex)];
    const allTagsRegex = /%\[(.*?)\]/g; 
    const specificIdContentRegex = /^\s*(\d[A-Z]\d[A-Z0-9]\d-\d+)\s*$/;
    matches.forEach((match) => {
        const fullBlock = match[0];
        const innerContent = match[2];
        let blockInternalId = null;
        const allTagMatches = [...innerContent.matchAll(allTagsRegex)];
        for (const tagMatch of allTagMatches) {
            const tagContent = tagMatch[1]; 
            const specificIdMatch = tagContent.match(specificIdContentRegex);
            if (specificIdMatch) { blockInternalId = specificIdMatch[1]; break; }
        }
        if (blockInternalId) {
            blocks.push({ internalId: blockInternalId.trim(), blockContent: fullBlock });
        }
    });
    return blocks;
}

function parseAllTextToBankData() {
    const editorContainer = document.getElementById('question-editor-container');
    if (!editorContainer) return null;
    const textareas = editorContainer.querySelectorAll('textarea.question-textarea');
    if (textareas.length === 0) return null;
    const allQuestionTexts = Array.from(textareas).map(ta => ta.value);
    const fullTextContent = allQuestionTexts.join('\n\n% --- End of a textarea --- %\n\n');
    if (!fullTextContent.trim()) return null;
    const bankData = {};
    const extractedBlocks = extractBlocksAndInternalId_Client(fullTextContent);
    extractedBlocks.forEach(({ internalId, blockContent }) => {
        if (!bankData[internalId]) bankData[internalId] = { id: internalId, desc: 'N/A', exList: [] };
        bankData[internalId].exList.push(blockContent);
    });
    return bankData;
}

async function handleBackupToCloud() {
    if (!auth.currentUser) {
        Swal.fire('Chưa đăng nhập', 'Bạn cần đăng nhập để lưu.', 'error');
        return;
    }
    const user = auth.currentUser;
    Swal.fire({ title: 'Đang chuẩn bị dữ liệu...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const bankData = parseAllTextToBankData();
    if (!bankData || Object.keys(bankData).length === 0) {
        Swal.fire('Trống', 'Không có câu hỏi hợp lệ nào để lưu.', 'warning');
        return;
    }
    Swal.update({ title: 'Đang lưu vào ngân hàng câu hỏi...' });
    try {
        const jsonString = JSON.stringify(bankData);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const firstId = Object.keys(bankData)[0];
        const backupFilePath = `question_bank_backups/${user.uid}/${firstId}_${Date.now()}.json`;
        
        // SỬA Ở ĐÂY: Dùng biến `storage` đã khai báo
        const storageRef = storage.ref(backupFilePath);
        
        await storageRef.put(blob);
        Swal.fire({ icon: 'success', title: 'Hoàn tất!', text: `Đã lưu thành công ${Object.keys(bankData).length} ID câu hỏi.` });
    } catch (error) {
        console.error("Lỗi khi lưu lên Cloud:", error);
        Swal.fire('Lỗi', `Không thể lưu: ${error.message}`, 'error');
    }
}


// ==========================================================
// BƯỚC 3: KHỞI CHẠY ỨNG DỤNG (PHIÊN BẢN ĐÃ SỬA LỖI)
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Lấy các phần tử DOM cần thiết cho việc xác thực ---
    const userInfoSpan = document.getElementById('user-info');
    const authBtn = document.getElementById('auth-btn');
    const saveToCloudBtn = document.getElementById('save-to-cloud-btn'); 

    // --- Gán sự kiện cho nút Đăng nhập/Đăng xuất chính ---
    if (authBtn) {
        authBtn.addEventListener('click', () => {
            // Kiểm tra trạng thái hiện tại để quyết định hành động
            if (auth.currentUser) {
                // Nếu đã đăng nhập, nút này sẽ thực hiện đăng xuất
                AuthHelper_signOut(auth);
            } else {
                // Nếu chưa đăng nhập, nút này sẽ thực hiện đăng nhập
                AuthHelper_signInWithGoogle(auth);
            }
        });
    }

    // --- KHỞI TẠO LOGIC XÁC THỰC ---
    // Gọi đến TÊN HÀM MỚI trong auth-manager.js: AuthHelper_initialize
    AuthHelper_initialize(
        auth, 
        (user) => { // onLogin Callback: Xử lý khi đăng nhập thành công
            if (userInfoSpan) userInfoSpan.innerHTML = `Đã đăng nhập: <strong>${user.email}</strong>`;
            if (authBtn) {
                authBtn.textContent = 'Đăng xuất';
                authBtn.style.display = 'inline-block';
            }
            // Kích hoạt các tính năng cần đăng nhập
            initializeCloudBackupFeature();
        },
        () => { // onLogout Callback: Xử lý khi đăng xuất
            if (userInfoSpan) userInfoSpan.textContent = 'Bạn cần đăng nhập để sử dụng các tính năng Cloud.';
            if (authBtn) {
                authBtn.textContent = 'Đăng nhập với Google';
                authBtn.style.display = 'inline-block';
            }
            // Vô hiệu hóa các tính năng cần đăng nhập
            if (saveToCloudBtn) {
                // Gán lại sự kiện click để hiện thông báo thay vì thực hiện hành động
                saveToCloudBtn.onclick = () => Swal.fire('Cảnh báo', 'Vui lòng đăng nhập để sử dụng tính năng này.', 'warning');
            }
        }
    );

    // --- KHỞI TẠO CÁC TÍNH NĂNG KHÁC CỦA TRANG ---
    // (Hàm này không thay đổi)
    function initializePageFeatures() {
        const loadAndProcessBtn = document.getElementById('load-and-process-tikz-btn');
        if (!loadAndProcessBtn) return;
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.tex,.txt';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        
        loadAndProcessBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => processTexFileWithTikZ(e.target.result);
                reader.readAsText(file);
            }
            event.target.value = null;
        });

        if (typeof window.initializeAppConverter === 'function') {
            window.initializeAppConverter();
        }
        
        console.log("Các tính năng của trang Soạn thảo đã sẵn sàng!");
    }
    
    // Chạy hàm khởi tạo các tính năng của trang
    initializePageFeatures();
});