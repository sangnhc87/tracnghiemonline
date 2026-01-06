// pdftotext_v3.js
document.addEventListener('DOMContentLoaded', () => {
    // === CONSTANTS & DOM ELEMENTS ===
    const SAVED_DRAFTS_KEY = 'latexEditorSavedDraftsTree';
    const CURRENT_FILE_ID_KEY = 'latexEditorCurrentFileId';
    const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
    const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

    // --- Main Layout ---
    const fileInput = document.getElementById('file-input');
    const statusMessage = document.getElementById('status-message');
    const editorContainer = document.getElementById('editor-container');
    const renderContainer = document.getElementById('render-container');
    const themeToggleButton = document.getElementById('theme-toggle');
    const questionCounterSpan = document.getElementById('question-counter');
    const clearDraftButton = document.getElementById('clear-draft-btn');

    // --- Sidebar Elements ---
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('resizer');
    const treeContainer = document.getElementById('drafts-tree-container');
    const addFileBtn = document.getElementById('add-file-btn');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const currentFileNameSpan = document.getElementById('current-file-name');

    // ... other elements ...
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');
    const replaceAllButton = document.getElementById('replace-all-btn');
    const includeSolutionCheckbox = document.getElementById('include-solution-checkbox');
    const exportPdfButton = document.getElementById('export-pdf-btn');

    let editor = null;
    let promptConfig = null;
    let customReplacements = [];
    let timerInterval = null;
    let draftsTree = [];
    let currentFileId = null;
    let activeNodeId = null;

    // === INITIALIZATION ===
    async function initializeApp() {
        loadDraftsTree();
        await loadPrompts();
        await loadCustomReplacements();
        initializeEditor();
        initializeEventListeners();
        setInitialTheme();
        initializeSidebarState(); // New function for sidebar
        renderTree(draftsTree, treeContainer);
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
            const initialContent = lastOpenFile ? lastOpenFile.content : `\\begin{ex}\n    Chào mừng! Tạo tệp mới từ thanh bên để bắt đầu.\n\\end{ex}`;
            
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
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    if (currentFileId) {
                        const fileNode = findNodeById(draftsTree, currentFileId);
                        if (fileNode) {
                            fileNode.content = currentCode;
                            persistDraftsTree();
                        }
                    }
                }, 500);
                updateRender(currentCode);
            });
            updateRender(editor.getValue());
        });
    }

    function initializeEventListeners() {
        themeToggleButton.addEventListener('click', toggleTheme);
        replaceAllButton.addEventListener('click', () => editor && editor.getAction('editor.action.startFindReplaceAction').run());
        clearDraftButton.addEventListener('click', handleClearAllData);
        fileInput.addEventListener('change', handleFileChange);
        renderContainer.addEventListener('click', handleSolutionToggle);
        exportPdfButton.addEventListener('click', handleExportPdf);
        
        // --- Sidebar Listeners ---
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
        addFileBtn.addEventListener('click', () => handleAdd('file'));
        addFolderBtn.addEventListener('click', () => handleAdd('folder'));
        resizer.addEventListener('mousedown', initResize, false);
        // Bắt sự kiện click ra ngoài để bỏ chọn active node
document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target)) {
        activeNodeId = null;
        renderTree(draftsTree, treeContainer);
    }
});
    }
    
    function initializeSidebarState() {
        const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
        if (savedWidth) {
            sidebar.style.width = savedWidth;
        }
        if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true') {
            document.body.classList.add('sidebar-collapsed');
        }
    }

    // === EVENT HANDLERS (Unchanged ones omitted for brevity) ===
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


    // ===== SIDEBAR & TREE VIEW LOGIC =====

    // --- Sidebar Resizing ---
    function initResize(e) {
        window.addEventListener('mousemove', startResizing, false);
        window.addEventListener('mouseup', stopResizing, false);
    }
    function startResizing(e) {
        const newWidth = e.clientX;
        if (newWidth > 180 && newWidth < window.innerWidth * 0.5) { // Min and max width
            sidebar.style.width = newWidth + 'px';
        }
    }
    function stopResizing(e) {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebar.style.width);
        window.removeEventListener('mousemove', startResizing, false);
        window.removeEventListener('mouseup', stopResizing, false);
    }
    function toggleSidebar() {
        const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed);
        // Trigger a layout update for Monaco editor
        window.dispatchEvent(new Event('resize'));
    }

    // --- Data Persistence ---
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
    
    // --- Node Finding ---
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

    /**
 * Tái cấu trúc lại việc render cây thư mục một cách đệ quy.
 * Hàm này chịu trách nhiệm cho việc hiển thị toàn bộ cây,
 * gắn các sự kiện và nút hành động.
 */
function renderTree(nodes, container) {
    // Xóa nội dung cũ để vẽ lại từ đầu
    container.innerHTML = '';

    // Hiển thị thông báo nếu cây rỗng
    if (nodes.length === 0) {
        container.innerHTML = '<div style="text-align:center; color: #888; padding: 20px 0;">Không có tài liệu.</div>';
        return; // Dừng hàm ở đây
    }

    // Lặp qua từng node (tệp hoặc thư mục) ở cấp hiện tại
    nodes.forEach(node => {
        // 1. TẠO CÁC PHẦN TỬ HTML CƠ BẢN
        const nodeElement = document.createElement('div');
        nodeElement.className = 'tree-node'; // Div bao ngoài, dùng để thụt lề

        const itemElement = document.createElement('div');
        itemElement.className = 'tree-item'; // Div chứa nội dung, có thể click

        // 2. ÁP DỤNG CÁC CLASS TRẠNG THÁI
        // 'current': file đang được mở trong editor (nền xanh đậm)
        if (node.id === currentFileId) {
            itemElement.classList.add('current');
        }
        // 'active': mục đang được người dùng chọn (nền xanh nhạt)
        if (node.id === activeNodeId) {
            itemElement.classList.add('active');
        }
        
        // 3. TẠO ICON VÀ TÊN
        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon';
        iconSpan.innerHTML = node.type === 'folder' ? '' : '📄'; // Thư mục dùng icon giả từ CSS, tệp dùng emoji
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = node.name;

        // 4. TẠO CÁC NÚT HÀNH ĐỘNG (HIỆN KHI HOVER)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'actions';
        
        // **Nâng cấp: Chỉ thêm nút "Tạo thư mục con" cho các thư mục**
        if (node.type === 'folder') {
            const addSubfolderBtn = document.createElement('button');
            addSubfolderBtn.className = 'action-btn';
            addSubfolderBtn.title = 'Thư mục con mới';
            addSubfolderBtn.innerHTML = '📁+';
            addSubfolderBtn.onclick = (e) => {
                e.stopPropagation(); // Ngăn sự kiện click lan ra itemElement
                handleAdd('folder', node.id); // Gọi hàm tạo mới với id của thư mục cha
            };
            actionsDiv.appendChild(addSubfolderBtn);
        }
        
        // Nút đổi tên (luôn có)
        const renameBtn = document.createElement('button');
        renameBtn.className = 'action-btn';
        renameBtn.title = 'Đổi tên';
        renameBtn.innerHTML = '✏️';
        renameBtn.onclick = (e) => { e.stopPropagation(); handleRename(node.id); };
        
        // Nút xóa (luôn có)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn';
        deleteBtn.title = 'Xóa';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.onclick = (e) => { e.stopPropagation(); handleDelete(node.id); };

        actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(deleteBtn);
        
        // 5. GHÉP CÁC PHẦN TỬ LẠI VỚI NHAU
        itemElement.appendChild(iconSpan);
        itemElement.appendChild(nameSpan);
        itemElement.appendChild(actionsDiv);
        nodeElement.appendChild(itemElement);

        // 6. GẮN SỰ KIỆN CLICK CHÍNH (LOGIC CỐT LÕI)
        itemElement.addEventListener('click', (e) => {
            e.stopPropagation(); // Rất quan trọng: ngăn sự kiện click lan ra document
            activeNodeId = node.id; // Luôn đặt mục được click là "active"

            if (node.type === 'folder') {
                // Nếu là thư mục, hành động chính là đóng/mở
                node.isOpen = !node.isOpen;
            } else {
                // Nếu là tệp, hành động chính là mở nó trong editor
                // Chỉ mở khi click vào một tệp khác với tệp đang mở
                if (currentFileId !== node.id) {
                    const fileNode = findNodeById(draftsTree, node.id);
                    if (fileNode) {
                        editor.setValue(fileNode.content || '');
                        currentFileId = node.id;
                        persistCurrentFileId(); // Lưu lại ID file đang mở
                        updateCurrentFileInfo(); // Cập nhật tên file ở footer
                    }
                }
            }
            
            persistDraftsTree(); // Lưu lại trạng thái của cây (ví dụ: thuộc tính isOpen)
            renderTree(draftsTree, treeContainer); // Vẽ lại toàn bộ cây để cập nhật UI
        });

        // 7. RENDER ĐỆ QUY CÁC NODE CON (NẾU LÀ THƯ MỤC)
        if (node.type === 'folder') {
            nodeElement.classList.add('tree-folder');
            if (node.isOpen) {
                nodeElement.classList.add('open');
            }
            
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children';
            nodeElement.appendChild(childrenContainer);
            
            // Chỉ gọi đệ quy nếu thư mục có con
            if (node.children && node.children.length > 0) {
                renderTree(node.children, childrenContainer);
            }
        }
        
        // 8. THÊM NODE HOÀN CHỈNH VÀO CONTAINER CHA
        container.appendChild(nodeElement);
    });
}
    function handleAdd(type, parentId = null) {
    // Nếu không có parentId được truyền trực tiếp,
    // hãy sử dụng thư mục đang active (nếu có) làm cha.
    if (!parentId && activeNodeId) {
        const activeNode = findNodeById(draftsTree, activeNodeId);
        if (activeNode?.type === 'folder') {
            parentId = activeNodeId;
        }
    }

    Swal.fire({
        title: `Tạo ${type === 'file' ? 'tệp' : 'thư mục'} mới`,
        input: 'text',
        inputValue: type === 'file' ? 'Tệp không tên' : 'Thư mục mới',
        showCancelButton: true,
        confirmButtonText: 'Tạo',
        inputValidator: (value) => !value && 'Tên không được để trống!'
    }).then(result => {
        if (result.isConfirmed) {
            const newNode = {
                id: `${type}-${Date.now()}`, type: type, name: result.value,
                ...(type === 'folder' ? { children: [], isOpen: true } : { content: `\\begin{ex}\n    % ${result.value}\n\\end{ex}` })
            };

            let container = draftsTree; // Mặc định là cấp root
            if (parentId) {
                const parentNode = findNodeById(draftsTree, parentId);
                if (parentNode) {
                    parentNode.isOpen = true; // Luôn mở thư mục cha khi thêm con
                    if (!parentNode.children) parentNode.children = []; // Khởi tạo mảng nếu chưa có
                    container = parentNode.children;
                }
            }
            container.unshift(newNode); // Thêm vào đầu danh sách
            
            activeNodeId = newNode.id; // Đặt mục mới là active
            
            if (type === 'file') {
                // Mở tệp mới ngay lập tức
                editor.setValue(newNode.content);
                currentFileId = newNode.id;
                persistCurrentFileId();
                updateCurrentFileInfo();
            }

            persistDraftsTree();
            renderTree(draftsTree, treeContainer);
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
                // Find and remove node
                function removeNode(nodes, nodeId) {
                    const index = nodes.findIndex(n => n.id === nodeId);
                    if (index > -1) {
                        nodes.splice(index, 1);
                        return true;
                    }
                    for (const node of nodes) {
                        if (node.type === 'folder' && removeNode(node.children, nodeId)) {
                            return true;
                        }
                    }
                    return false;
                }
                removeNode(draftsTree, id);
                
                if (id === currentFileId || (nodeToDelete.type === 'folder' && findNodeById([nodeToDelete], currentFileId))) {
                    editor.setValue(`% Chọn một tệp khác để bắt đầu.`);
                    currentFileId = null;
                    persistCurrentFileId();
                }
                persistDraftsTree();
                renderTree(draftsTree, treeContainer);
                updateCurrentFileInfo();
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

    // --- UI Update ---
    function updateCurrentFileInfo() {
        if (currentFileId) {
            const fileNode = findNodeById(draftsTree, currentFileId);
            currentFileNameSpan.textContent = fileNode ? fileNode.name : "Tệp không tìm thấy";
        } else {
            currentFileNameSpan.textContent = "Chưa mở tệp nào";
        }
    }

    // Bắt đầu ứng dụng
    initializeApp();
});