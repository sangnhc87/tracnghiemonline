//  <script>
    (function() {
        // Chạy sau khi toàn bộ trang đã tải xong để đảm bảo an toàn
        window.addEventListener('load', () => {
            // Chờ một chút để các script khác và `window.app` được khởi tạo
            setTimeout(initializeAdvancedFeatures, 500); 
        });

        function initializeAdvancedFeatures() {
            const loadAndProcessBtn = document.getElementById('load-and-process-tikz-btn');
            if (!loadAndProcessBtn) return;
            
            const tikzFileInput = document.createElement('input');
            tikzFileInput.type = 'file';
            tikzFileInput.accept = '.tex,.txt';
            tikzFileInput.style.display = 'none';
            document.body.appendChild(tikzFileInput);

            const processTexFileWithTikZ = async (fileContent) => {
                if (!window.app || typeof TextPreprocessor === 'undefined') {
                    Swal.fire('Lỗi', 'Ứng dụng hoặc bộ tiền xử lý chưa sẵn sàng.', 'error');
                    return;
                }

                const processingAlert = Swal.fire({ title: 'Đang chuẩn bị...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                let rules = null;
                try {
                    const response = await fetch('soanthao/replace.json');
                    rules = await response.json();
                } catch (e) { 
                    console.error("Không tải được replace.json, bỏ qua bước tiền xử lý.", e); 
                }
                
                let content = rules ? TextPreprocessor.process(fileContent, rules) : fileContent;
                if(rules) console.log("Tiền xử lý file đã hoàn tất.");

                try {
                    processingAlert.update({ text: 'Đang phân tích TikZ...' });
                    const tikzRegex = /\\begin{tikzpicture}[\s\S]*?\\end{tikzpicture}/g;
                    const tikzBlocks = content.match(tikzRegex);

                    if (!tikzBlocks) {
                        processingAlert.close();
                        window.app.populateQuestionsFromText(content);
                        Swal.fire('Đã tải tệp', 'Không tìm thấy hình TikZ.', 'info');
                        return;
                    }

                    processingAlert.update({ title: `Tìm thấy ${tikzBlocks.length} hình TikZ`, text: 'Đang gửi đến server để chuyển đổi...' });
                    const tikzOnlyText = tikzBlocks.join('\n\n');
                    
                    if (typeof firebase === 'undefined' || !firebase.functions) {
                        throw new Error("Firebase SDK chưa được tải hoặc cấu hình. Không thể gọi hàm xử lý.");
                    }
                    const functions = firebase.functions();
                    const processTikz = functions.httpsCallable('processTikzProxy');
                    const result = await processTikz({ fileContent: tikzOnlyText });
                    const data = result.data; 
                    
                    if (!data || !data.success) {
                        throw new Error(data.error || 'Lỗi không xác định từ dịch vụ chuyển đổi TikZ.');
                    }
                    
                    processingAlert.update({ text: 'Đã nhận được link ảnh, đang thay thế vào nội dung...' });
                    let updatedContent = content;
                    data.images.forEach((image, index) => {
                        if (tikzBlocks[index] && image.secure_url) {
                            const urlParts = image.secure_url.split('/upload/');
                            const transformedUrl = `${urlParts[0]}/upload/q_auto,f_auto,h_250/${urlParts[1]}`;
                            const replacementTag = `<img src='${transformedUrl}' alt='${image.original_filename}' class="img-center">`;
                            updatedContent = updatedContent.replace(tikzBlocks[index], replacementTag);
                        }
                    });

                    window.app.populateQuestionsFromText(updatedContent);
                    processingAlert.close();
                    Swal.fire({ icon: 'success', title: 'Thành công!', html: `Đã xử lý và thay thế <b>${data.images.length}</b> hình TikZ.` });

                } catch (error) {
                    processingAlert.close();
                    const errorMessage = error.details ? `${error.message} (Chi tiết: ${JSON.stringify(error.details)})` : error.message;
                    Swal.fire({ 
                        icon: 'error', 
                        title: 'Xử lý TikZ thất bại', 
                        text: errorMessage,
                        footer: 'Nội dung gốc (chưa xử lý) sẽ được tải vào các khung soạn thảo.'
                    });
                    window.app.populateQuestionsFromText(content);
                }
            };

            loadAndProcessBtn.addEventListener('click', () => tikzFileInput.click());
            tikzFileInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => processTexFileWithTikZ(e.target.result);
                    reader.readAsText(file);
                }
                event.target.value = null; 
            });
            console.log("Tích hợp TikZ Converter phiên bản Firebase đã sẵn sàng!");
        }
    })();
    // </script>

//<script>
document.addEventListener('DOMContentLoaded', () => {
    // 1. Lấy các phần tử UI cho việc xác thực
    const userInfoSpan = document.getElementById('user-info');
    const authBtn = document.getElementById('auth-btn');

    // 2. Sử dụng Trình quản lý xác thực (từ auth-manager.js)
    initializeAuth(
        (user) => {
            // HÀM ON-LOGIN: Chạy khi người dùng đã đăng nhập
            if (userInfoSpan) userInfoSpan.innerHTML = `Đã đăng nhập với: <strong>${user.email}</strong>`;
            if (authBtn) {
                authBtn.textContent = 'Đăng xuất';
                authBtn.style.display = 'inline-block';
                authBtn.onclick = () => signOut();
            }
            initializeCloudBackupFeature();
        },
        () => {
            // HÀM ON-LOGOUT: Chạy khi người dùng chưa đăng nhập
            if (userInfoSpan) userInfoSpan.textContent = 'Bạn cần đăng nhập để sử dụng các tính năng Cloud.';
            if (authBtn) {
                authBtn.textContent = 'Đăng nhập với Google';
                authBtn.style.display = 'inline-block';
                authBtn.onclick = () => signInWithGoogle();
            }
        }
    );
});

function initializeCloudBackupFeature() {
    console.log("Đang khởi tạo tính năng Sao lưu lên Cloud...");
    const saveToCloudBtn = document.getElementById('save-to-cloud-btn'); 
    if (saveToCloudBtn) {
        saveToCloudBtn.addEventListener('click', handleBackupToCloud);
    } else {
        console.error("Không tìm thấy nút 'save-to-cloud-btn'");
    }
}

/**
 * [HÀM ĐÃ SỬA] Nhận diện ID một cách linh hoạt.
 */
function extractBlocksAndInternalId_Client(content) {
    if (typeof content !== 'string') return [];
    const blocks = [];
    const blockRegex = /\\begin\{\s*(ex|vd|bt)\s*\}(.*?)\\end\{\s*\1\s*\}/gs;
    const matches = [...content.matchAll(blockRegex)];

    // [SỬA ĐỔI CHÍNH] Regex này tìm TẤT CẢ các chuỗi có dạng %[...]
    // Nó không quan tâm đến ký tự đứng trước.
    const allTagsRegex = /%\[(.*?)\]/g; 
    
    // Regex để kiểm tra NỘI DUNG bên trong cặp ngoặc có phải là định dạng ID hợp lệ hay không.
    const specificIdContentRegex = /^\s*(\d[A-Z]\d[A-Z0-9]\d-\d+)\s*$/;

    matches.forEach((match) => {
        const fullBlock = match[0];
        const innerContent = match[2]; // Nội dung bên trong \begin{} và \end{}
        let blockInternalId = null;
        
        // Tìm kiếm tất cả các tag %[...] trong nội dung của block
        const allTagMatches = [...innerContent.matchAll(allTagsRegex)];
        
        // Duyệt qua từng tag tìm được để tìm cái đầu tiên có nội dung hợp lệ
        for (const tagMatch of allTagMatches) {
            // tagMatch[1] là nội dung bên trong cặp ngoặc `[]`
            const tagContent = tagMatch[1]; 
            
            // Kiểm tra xem nội dung đó có khớp với định dạng ID không
            const specificIdMatch = tagContent.match(specificIdContentRegex);
            
            if (specificIdMatch) {
                // Nếu khớp, lấy nó làm ID và dừng vòng lặp
                blockInternalId = specificIdMatch[1]; // group 1 là ID đã được chuẩn hóa
                break; 
            }
        }
        
        if (blockInternalId) {
            blocks.push({ internalId: blockInternalId.trim(), blockContent: fullBlock });
        }
    });
    return blocks;
}

/**
 * [HÀM ĐÃ SỬA] Tự động lấy text từ các ô soạn thảo mà không cần window.app.
 */
function parseAllTextToBankData() {
    const editorContainer = document.getElementById('question-editor-container');
    if (!editorContainer) {
        console.error("Không tìm thấy container '#question-editor-container'.");
        return null;
    }
    const textareas = editorContainer.querySelectorAll('textarea.question-textarea');
    if (textareas.length === 0) {
        console.log("Không tìm thấy ô soạn thảo nào.");
        return null;
    }
    const allQuestionTexts = Array.from(textareas).map(ta => ta.value);
    const fullTextContent = allQuestionTexts.join('\n\n% --- End of a textarea --- %\n\n');

    if (!fullTextContent.trim()) {
        console.log("Các ô soạn thảo đều trống.");
        return null;
    }

    const bankData = {};
    const extractedBlocks = extractBlocksAndInternalId_Client(fullTextContent);

    extractedBlocks.forEach(({ internalId, blockContent }) => {
        if (!bankData[internalId]) {
            bankData[internalId] = { id: internalId, desc: 'N/A', exList: [] };
        }
        bankData[internalId].exList.push(blockContent);
    });

    return bankData;
}

// Thay thế hàm handleBackupToCloud trong soan_latex.html

async function handleBackupToCloud() {
    if (!firebase.auth().currentUser) {
        Swal.fire('Chưa đăng nhập', 'Bạn cần đăng nhập để lưu.', 'error');
        return;
    }
    const user = firebase.auth().currentUser;

    Swal.fire({ title: 'Đang chuẩn bị dữ liệu...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    // Hàm này vẫn giữ nguyên, nó chỉ phân tích các ô text hiện tại
    const bankData = parseAllTextToBankData();

    if (!bankData || Object.keys(bankData).length === 0) {
        Swal.fire('Trống', 'Không có câu hỏi hợp lệ nào để lưu.', 'warning');
        return;
    }

    Swal.update({ title: 'Đang lưu vào ngân hàng câu hỏi...', text: 'Thao tác này sẽ tạo một file mới.' });

    try {
        const jsonString = JSON.stringify(bankData);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        // Tạo tên file độc nhất, có thể dựa trên ID đầu tiên và timestamp
        const firstId = Object.keys(bankData)[0];
        const backupFilePath = `question_bank_backups/${user.uid}/${firstId}_${Date.now()}.json`;
        const storageRef = firebase.storage().ref(backupFilePath);
        
        await storageRef.put(blob);

        Swal.fire({
            icon: 'success',
            title: 'Hoàn tất!',
            text: `Đã lưu thành công ${Object.keys(bankData).length} ID câu hỏi vào một file mới trên Cloud.`
        });

    } catch (error) {
        console.error("Lỗi khi lưu lên Cloud:", error);
        Swal.fire('Lỗi', `Không thể lưu: ${error.message}`, 'error');
    }
}
// </script>