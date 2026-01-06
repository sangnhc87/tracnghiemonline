// pdftotext_v3.js
document.addEventListener('DOMContentLoaded', () => {
    // === CONSTANTS & DOM ELEMENTS ===
    const SAVED_DRAFTS_KEY = 'latexEditorSavedDraftsTree';
    const CURRENT_FILE_ID_KEY = 'latexEditorCurrentFileId';
    const fileInput = document.getElementById('file-input');
    const statusMessage = document.getElementById('status-message');
    const questionCounterSpan = document.getElementById('question-counter');
    const editorContainer = document.getElementById('editor-container');
    const renderContainer = document.getElementById('render-container');
    const themeToggleButton = document.getElementById('theme-toggle');
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');
    const replaceAllButton = document.getElementById('replace-all-btn');
    const clearDraftButton = document.getElementById('clear-draft-btn');
    const includeSolutionCheckbox = document.getElementById('include-solution-checkbox');
    const exportPdfButton = document.getElementById('export-pdf-btn');

    // --- Elements for Tree View Modal ---
    const manageDraftsBtn = document.getElementById('manage-drafts-btn');
    const draftsModal = document.getElementById('drafts-modal');
    const closeModalBtn = draftsModal.querySelector('.modal-close-btn');
    const treeContainer = document.getElementById('drafts-tree-container');
    const addFileBtn = document.getElementById('add-file-btn');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const currentFileNameSpan = document.getElementById('current-file-name');

    let editor = null;
    let promptConfig = null;
    let customReplacements = [];
    let timerInterval = null;
    let draftsTree = [];
    let currentFileId = null;

    // === INITIALIZATION ===
    async function initializeApp() {
        loadDraftsTree();
        await loadPrompts();
        await loadCustomReplacements();
        initializeEditor();
        initializeEventListeners();
        setInitialTheme();
        updateCurrentFileInfo();
    }

    // === DATA LOADING FUNCTIONS ===
    async function loadPrompts() {
        if (!window.jsyaml) { statusMessage.textContent = 'Lỗi: Thư viện js-yaml chưa được tải.'; return; }
        try {
            const response = await fetch('prompts.yaml');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const yamlText = await response.text();
            promptConfig = jsyaml.load(yamlText);
        } catch (error) { statusMessage.textContent = `Lỗi tải prompts.yaml: ${error.message}`; }
    }

    async function loadCustomReplacements() {
        try {
            const response = await fetch('pdf_replace.json');
            if (!response.ok) return;
            customReplacements = await response.json();
        } catch (error) { console.warn("Could not load pdf_replace.json", error); }
    }

    // === CORE FUNCTIONS ===
    function updateRender(latexCode) {
        const result = convertLatexToHtml(latexCode);
        renderContainer.innerHTML = result.html;
        questionCounterSpan.textContent = `${result.count} câu hỏi`;
        if (window.renderMathInElement) {
            renderMathInElement(renderContainer, {
                delimiters: [
                    {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false},
                    {left: '\\[', right: '\\]', display: true}, {left: '\\(', right: '\\)', display: false}
                ], throwOnError: false
            });
        }
    }

    function applyCustomReplacements(text) {
        if (!customReplacements || customReplacements.length === 0) return text;
        let newText = text;
        customReplacements.forEach(rule => {
            try {
                const regex = rule.isRegex ? new RegExp(rule.find, 'g') : new RegExp(escapeRegExp(rule.find), 'g');
                newText = newText.replace(regex, rule.replace);
            } catch (e) { console.error(`Invalid regex in replacement rule:`, rule, e); }
        });
        return newText;
    }

    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // === INITIALIZERS ===
    function initializeEditor() {
        require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], function () {
            monaco.languages.register({ id: 'latex-enhanced' });
            monaco.languages.setMonarchTokensProvider('latex-enhanced', {
                tokenizer: {
                    root: [
                        [/\\begin\{[a-zA-Z\d*]+\}/, 'keyword.control'],
                        [/\\end\{[a-zA-Z\d*]+\}/, 'keyword.control'],
                        [/(\\[a-zA-Z\d]+)/, 'keyword'],
                        [/[\{\}]/, 'delimiter.bracket'],
                        [/\$.*?\$/, 'string.special'],
                        [/%%.*$/, 'comment'],
                        [/\%.*$/, 'comment'],
                    ],
                },
            });

            // SỬA LỖI TẠI ĐÂY: Viết lại FoldingRangeProvider một cách chính xác
            monaco.languages.registerFoldingRangeProvider('latex-enhanced', {
                provideFoldingRanges: function (model, context, token) {
                    const ranges = [];
                    const stack = []; // Lưu các dòng bắt đầu của khối
                    const beginRegex = /\\begin\{ex\}/;
                    const endRegex = /\\end\{ex\}/;

                    for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
                        const line = model.getLineContent(lineNumber);

                        if (beginRegex.test(line)) {
                            stack.push(lineNumber);
                        } else if (endRegex.test(line)) {
                            if (stack.length > 0) {
                                const startLine = stack.pop();
                                // Vùng thu gọn kết thúc ở dòng ngay TRƯỚC dòng có \end{ex}
                                // Điều này giữ cho dòng \end{ex} luôn hiển thị, là hành vi chuẩn
                                if (lineNumber > startLine) {
                                    ranges.push({
                                        start: startLine,
                                        end: lineNumber - 1,
                                        kind: monaco.languages.FoldingRangeKind.Region,
                                    });
                                }
                            }
                        }
                    }
                    return ranges;
                },
            });

            const lastOpenFile = currentFileId ? findNodeById(draftsTree, currentFileId) : null;
            const initialContent = lastOpenFile ? lastOpenFile.content : `\\begin{ex}\n    Chào mừng! Tạo tệp mới từ menu 'Quản lý' để bắt đầu.\n\\end{ex}`;
            
            editor = monaco.editor.create(editorContainer, {
                value: initialContent,
                language: 'latex-enhanced',
                theme: 'vs',
                fontSize: '14px',
                folding: true, foldingStrategy: 'auto', showFoldingControls: 'mouseover',
                minimap: { enabled: true },
                automaticLayout: true, wordWrap: 'on'
            });

            let saveTimeout;
            editor.onDidChangeModelContent(() => {
                const currentCode = editor.getValue();
                // Auto-save with debounce
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    if (currentFileId) {
                        const fileNode = findNodeById(draftsTree, currentFileId);
                        if (fileNode) {
                            fileNode.content = currentCode;
                            persistDraftsTree();
                        }
                    }
                }, 500); // Lưu sau 500ms không gõ
                updateRender(currentCode);
            });
            updateRender(editor.getValue());
        });
    }

    function initializeEventListeners() {
        themeToggleButton.addEventListener('click', toggleTheme);
        replaceAllButton.addEventListener('click', handleReplaceAll);
        clearDraftButton.addEventListener('click', handleClearAllData); // Đổi tên hàm
        fileInput.addEventListener('change', handleFileChange);
        renderContainer.addEventListener('click', handleSolutionToggle);
        exportPdfButton.addEventListener('click', handleExportPdf);
        // --- Tree View Listeners ---
        manageDraftsBtn.addEventListener('click', openDraftsModal);
        closeModalBtn.addEventListener('click', closeDraftsModal);
        addFileBtn.addEventListener('click', () => handleAdd('file'));
        addFolderBtn.addEventListener('click', () => handleAdd('folder'));
        draftsModal.addEventListener('click', (event) => {
            if (event.target === draftsModal) closeDraftsModal();
        });
    }

    // === EVENT HANDLERS & HELPERS ===

    async function handleFileChange(event) {
        const file = event.target.files[0];
        if (!file) return;

        setControlsEnabled(false);
        startTimer();

        try {
            const base64Data = await fileToBase64(file);
            const includeSolution = includeSolutionCheckbox.checked;
            const promptKey = includeSolution ? 'with_solution' : 'without_solution';
            const promptText = promptConfig.prompts[promptKey];

            if (!promptText) throw new Error(`Không tìm thấy prompt '${promptKey}'`);

            const latexResult = await getLatexFromFile(base64Data, file.type, promptText);
            const processedLatex = applyCustomReplacements(latexResult);

            editor.setValue(processedLatex);

            Swal.fire({
                icon: 'success',
                title: 'Hoàn tất!',
                text: 'Đã xử lý tệp thành công.',
                timer: 2000,
                showConfirmButton: false
            });

        } catch (error) {
            console.error("File Processing Error:", error);
            Swal.fire({
                icon: 'error',
                title: 'Đã xảy ra lỗi',
                text: error.message,
            });
        } finally {
            stopTimer();
            setControlsEnabled(true);
            fileInput.value = '';
        }
    }

    async function getLatexFromFile(base64Data, mimeType, promptText) {
        if (!promptConfig || !promptConfig.config.apiUrl || !promptConfig.config.geminiApiKey) {
            throw new Error("Cấu hình API (prompts.yaml) bị thiếu hoặc không hợp lệ.");
        }
        
        const pureBase64 = base64Data.split(',')[1];
        const payload = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType, data: pureBase64 } }
                ]
            }]
        };

        const response = await fetch(`${promptConfig.config.apiUrl}?key=${promptConfig.config.geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message || `Lỗi API ${response.status}`);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content.parts) {
            throw new Error("Phản hồi từ API không hợp lệ hoặc không có nội dung.");
        }
        return data.candidates[0].content.parts[0].text.replace(/```latex|```/g, '').trim();
    }
    
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    function handleReplaceAll() {
        if (!editor) return;
        let processedContent = editor.getValue();
        processedContent = applyCustomReplacements(processedContent);
        const findText = findInput.value;
        const replaceText = replaceInput.value;
        if (findText) {
            processedContent = processedContent.replace(new RegExp(escapeRegExp(findText), 'g'), replaceText);
        }
        editor.setValue(processedContent);
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'Đã áp dụng thay thế',
            showConfirmButton: false,
            timer: 1500
        });
    }

    function handleClearDraft() {
        Swal.fire({
            title: 'Bạn có chắc chắn?',
            text: "Bạn sẽ xóa bản nháp hiện tại và không thể hoàn tác!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Vâng, xóa nó!',
            cancelButtonText: 'Hủy'
        }).then((result) => {
            if (result.isConfirmed) {
                localStorage.removeItem(EDITOR_CONTENT_KEY);
                const defaultContent = `\\begin{ex}\n    Chào mừng! Tải tệp Ảnh hoặc PDF để bắt đầu.\n\\end{ex}`;
                if (editor) editor.setValue(defaultContent);
                Swal.fire(
                    'Đã xóa!',
                    'Bản nháp của bạn đã được xóa.',
                    'success'
                )
            }
        });
    }
    
    function handleSolutionToggle(event) {
        const target = event.target;
        if (target.classList.contains('solution-link')) {
            event.preventDefault();
            target.classList.toggle('expanded');
            const solutionContent = target.nextElementSibling;
            if (solutionContent) solutionContent.style.display = solutionContent.style.display === 'block' ? 'none' : 'block';
        }
    }

    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        if (editor) monaco.editor.setTheme(isDarkMode ? 'vs-dark' : 'vs');
        themeToggleButton.querySelector('.icon').textContent = isDarkMode ? '☀️' : '🌙';
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }

    function setInitialTheme() {
        if (localStorage.getItem('theme') === 'dark' && !document.body.classList.contains('dark-mode')) {
            toggleTheme();
        }
    }

    function startTimer() {
        const startTime = Date.now();
        statusMessage.textContent = '00:00.00';
        timerInterval = setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            const minutes = String(Math.floor(elapsedTime / 60000)).padStart(2, '0');
            const seconds = String(Math.floor((elapsedTime % 60000) / 1000)).padStart(2, '0');
            const hundredths = String(Math.floor((elapsedTime % 1000) / 10)).padStart(2, '0');
            statusMessage.textContent = `${minutes}:${seconds}.${hundredths}`;
        }, 100);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        statusMessage.textContent = 'Sẵn sàng';
    }

    function setControlsEnabled(enabled) {
        fileInput.disabled = !enabled;
        replaceAllButton.disabled = !enabled;
        clearDraftButton.disabled = !enabled;
        exportPdfButton.disabled = !enabled;
        const label = document.querySelector('label[for="file-input"]');
        if (label) {
            label.style.pointerEvents = enabled ? 'auto' : 'none';
            label.style.opacity = enabled ? '1' : '0.5';
        }
    }
    function handleExportPdf() {
    // Tự động nạp module và gọi hàm từ file pdf-exporter.js
    import('./pdf-exporter.js')
        .then(module => {
            module.exportRenderToPdf();
        })
        .catch(err => {
            console.error('Failed to load PDF exporter module', err);
            Swal.fire('Lỗi', 'Không thể tải module xuất PDF.', 'error');
        });
        }
    

    // ===== CÁC HÀM MỚI CHO QUẢN LÝ CÂY THƯ MỤC =====

    // --- Data & Persistence ---
    function loadDraftsTree() {
        const treeData = localStorage.getItem(SAVED_DRAFTS_KEY);
        draftsTree = treeData ? JSON.parse(treeData) : [];
        currentFileId = localStorage.getItem(CURRENT_FILE_ID_KEY);
    }
    function persistDraftsTree() { localStorage.setItem(SAVED_DRAFTS_KEY, JSON.stringify(draftsTree)); }
    function persistCurrentFileId() {
        if (currentFileId) localStorage.setItem(CURRENT_FILE_ID_KEY, currentFileId);
        else localStorage.removeItem(CURRENT_FILE_ID_KEY);
    }
    
    // --- Node Finding Helpers ---
    function findNodeById(nodes, id) {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.type === 'folder') {
                const found = findNodeById(node.children, id);
                if (found) return found;
            }
        }
        return null;
    }
    function findParentNode(nodes, childId, parent = null) {
        for (const node of nodes) {
            if (node.id === childId) return parent;
            if (node.type === 'folder') {
                const found = findParentNode(node.children, childId, node);
                if (found) return found;
            }
        }
        return null;
    }

    // --- Rendering ---
    function renderTree(nodes, container) {
        container.innerHTML = '';
        if (nodes.length === 0) {
            container.innerHTML = '<div style="text-align:center; color: #888; padding: 20px 0;">Không có tài liệu nào.</div>';
        }
        nodes.forEach(node => {
            const nodeElement = document.createElement('div');
            nodeElement.className = 'tree-node';
            nodeElement.dataset.id = node.id;
    
            const itemElement = document.createElement('div');
            itemElement.className = 'tree-item';
            if (node.id === currentFileId) itemElement.classList.add('active');
    
            const iconSpan = document.createElement('span');
            iconSpan.className = 'icon';
            iconSpan.innerHTML = node.type === 'folder' ? '' : ''; // 📄
    
            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.textContent = node.name;
    
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'actions';
            const renameBtn = document.createElement('button');
            renameBtn.className = 'action-btn';
            renameBtn.title = 'Đổi tên';
            renameBtn.innerHTML = '✎'; // ✏️
            renameBtn.onclick = (e) => { e.stopPropagation(); handleRename(node.id); };
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn';
            deleteBtn.title = 'Xóa';
            deleteBtn.innerHTML = ''; // 🗑️
            deleteBtn.onclick = (e) => { e.stopPropagation(); handleDelete(node.id); };
    
            actionsDiv.appendChild(renameBtn);
            actionsDiv.appendChild(deleteBtn);
            
            itemElement.appendChild(iconSpan);
            itemElement.appendChild(nameSpan);
            itemElement.appendChild(actionsDiv);
            nodeElement.appendChild(itemElement);
    
            if (node.type === 'folder') {
                nodeElement.classList.add('tree-folder');
                if (node.isOpen) nodeElement.classList.add('open');
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'children';
                nodeElement.appendChild(childrenContainer);
                if (node.children) renderTree(node.children, childrenContainer);
                itemElement.onclick = () => {
                    node.isOpen = !node.isOpen;
                    persistDraftsTree();
                    renderTree(draftsTree, treeContainer);
                };
            } else { // It's a file
                itemElement.onclick = () => {
                    const fileNode = findNodeById(draftsTree, node.id);
                    if (fileNode) {
                        editor.setValue(fileNode.content || '');
                        currentFileId = node.id;
                        persistCurrentFileId();
                        updateCurrentFileInfo();
                        closeDraftsModal();
                    }
                };
            }
            container.appendChild(nodeElement);
        });
    }

    // --- CRUD Handlers ---
    function handleAdd(type) {
        Swal.fire({
            title: type === 'file' ? 'Tạo tệp mới' : 'Tạo thư mục mới',
            input: 'text',
            inputValue: type === 'file' ? 'Tệp không tên' : 'Thư mục mới',
            showCancelButton: true, confirmButtonText: 'Tạo', cancelButtonText: 'Hủy',
            inputValidator: (value) => !value && 'Tên không được để trống!'
        }).then(result => {
            if (result.isConfirmed) {
                const newNode = {
                    id: `${type}-${Date.now()}`, type: type, name: result.value,
                    ...(type === 'folder' ? { children: [], isOpen: true } : 
                                            { content: `\\begin{ex}\n    % ${result.value}\n\\end{ex}` })
                };
                draftsTree.unshift(newNode);
                persistDraftsTree();
                renderTree(draftsTree, treeContainer);
                // If it's a new file, open it immediately
                if (type === 'file') {
                    editor.setValue(newNode.content);
                    currentFileId = newNode.id;
                    persistCurrentFileId();
                    updateCurrentFileInfo();
                    closeDraftsModal();
                }
            }
        });
    }

    function handleDelete(id) {
        const nodeToDelete = findNodeById(draftsTree, id);
        if (!nodeToDelete) return;
        Swal.fire({
            title: `Xóa "${nodeToDelete.name}"?`,
            text: nodeToDelete.type === 'folder' ? "Tất cả nội dung bên trong cũng sẽ bị xóa vĩnh viễn!" : "Hành động này không thể hoàn tác!",
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#d33', confirmButtonText: 'Vâng, xóa nó!'
        }).then(result => {
            if (result.isConfirmed) {
                const parent = findParentNode(draftsTree, id);
                const container = parent ? parent.children : draftsTree;
                const index = container.findIndex(n => n.id === id);
                if (index > -1) container.splice(index, 1);
                
                if (id === currentFileId || (nodeToDelete.type === 'folder' && findNodeById([nodeToDelete], currentFileId))) {
                    editor.setValue(`% Chọn một tệp khác để bắt đầu.`);
                    currentFileId = null;
                    persistCurrentFileId();
                    updateCurrentFileInfo();
                }
                persistDraftsTree();
                renderTree(draftsTree, treeContainer);
                Swal.fire('Đã xóa!', `"${nodeToDelete.name}" đã được xóa.`, 'success');
            }
        });
    }

    function handleRename(id) {
        const nodeToRename = findNodeById(draftsTree, id);
        if (!nodeToRename) return;
        Swal.fire({
            title: 'Đổi tên', input: 'text', inputValue: nodeToRename.name,
            showCancelButton: true, confirmButtonText: 'Lưu',
            inputValidator: (value) => !value && 'Tên không được để trống!'
        }).then(result => {
            if (result.isConfirmed) {
                nodeToRename.name = result.value;
                persistDraftsTree();
                renderTree(draftsTree, treeContainer);
                updateCurrentFileInfo();
            }
        });
    }

    function handleClearAllData() {
        Swal.fire({
            title: 'Bạn có chắc chắn?',
            text: "Toàn bộ cây thư mục và các tệp sẽ bị xóa vĩnh viễn!",
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#d33', confirmButtonText: 'Vâng, xóa tất cả!'
        }).then((result) => {
            if (result.isConfirmed) {
                draftsTree = [];
                currentFileId = null;
                persistDraftsTree();
                persistCurrentFileId();
                if (editor) editor.setValue(`\\begin{ex}\n    Toàn bộ dữ liệu đã được xóa. Tạo tệp mới để bắt đầu.\n\\end{ex}`);
                updateCurrentFileInfo();
                Swal.fire('Đã xóa!', 'Toàn bộ dữ liệu của bạn đã được xóa.', 'success');
            }
        });
    }

    // --- UI Update & Modal Control ---
    function updateCurrentFileInfo() {
        if (currentFileId) {
            const fileNode = findNodeById(draftsTree, currentFileId);
            currentFileNameSpan.textContent = fileNode ? fileNode.name : "Không tìm thấy";
        } else {
            currentFileNameSpan.textContent = "Chưa có";
        }
    }
    function openDraftsModal() {
        renderTree(draftsTree, treeContainer);
        draftsModal.style.display = 'flex';
    }
    function closeDraftsModal() { draftsModal.style.display = 'none'; }

    // Bắt đầu ứng dụng
    initializeApp();
});