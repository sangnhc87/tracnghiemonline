// File: editor-main.js
// Logic hợp nhất cho Trình Soạn Thảo Giáo Trình

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================
    // PHẦN 1: KHAI BÁO BIẾN VÀ DOM ELEMENTS
    // ==========================================================

    // === Firebase & Global Vars ===
    const auth = firebase.auth();
    const db = firebase.firestore();
    const functions = firebase.app().functions("asia-southeast1");
    const storage = firebase.storage();

    let editor; // Monaco Editor instance
    let currentUser = null; // Thông tin người dùng đăng nhập
    let promptConfig = null; // Cấu hình prompt cho AI
    let isTreeDirty = false; // Cờ theo dõi thay đổi cây
    let currentOpenFileId = null; // ID của file đang mở trong editor

    // === DOM Elements ===
    // AI Editor
    const fileInput = document.getElementById('file-input');
    const questionCounterSpan = document.getElementById('question-counter');
    const themeToggleButton = document.getElementById('theme-toggle');
    // Curriculum Manager
    const treeContainer = $('#tree-container');
    const saveTreeBtn = document.getElementById('save-tree-btn');
    const saveContentBtn = document.getElementById('save-content-btn');
    const authBtn = document.getElementById('auth-btn');
    // Shared
    const previewContainer = document.getElementById('preview-container');


    // ==========================================================
    // PHẦN 2: CÁC HÀM KHỞI TẠO VÀ LẮNG NGHE SỰ KIỆN
    // ==========================================================

    async function main() {
        // 1. Khởi tạo các thành phần giao diện chính
        await initMonacoEditor();
        
        // 2. Tải các cấu hình phụ
        await loadPrompts();

        // 3. Gán các sự kiện tĩnh (luôn hoạt động)
        attachStaticEventListeners();

        // 4. Xử lý trạng thái đăng nhập
        auth.onAuthStateChanged(handleAuthStateChanged);
    }

    function initMonacoEditor() {
        return new Promise((resolve) => {
            require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
            require(['vs/editor/editor.main'], () => {
                editor = monaco.editor.create(document.getElementById('editor-container'), {
                    value: '% Chào mừng đến với Trình Soạn Thảo Giáo Trình!\n\n% Vui lòng đăng nhập để bắt đầu.',
                    language: 'latex',
                    theme: 'vs',
                    automaticLayout: true,
                    readOnly: true
                });
                // Sự kiện render live-preview
                editor.onDidChangeModelContent(() => {
                    if (window.convertLatexToHtml) {
                        const { html, count } = convertLatexToHtml(editor.getValue());
                        previewContainer.innerHTML = html;
                        questionCounterSpan.textContent = `${count} câu hỏi`;
                        renderMathInElement(previewContainer, { delimiters: [/*...*/], throwOnError: false });
                    }
                });
                resolve();
            });
        });
    }

    function attachStaticEventListeners() {
        themeToggleButton.addEventListener('click', toggleTheme);
        fileInput.addEventListener('change', handleFileChange); // Chức năng AI Editor
    }

    function handleAuthStateChanged(user) {
        const header = document.getElementById('main-header');
        if (user) {
            // === ĐÃ ĐĂNG NHẬP ===
            currentUser = user;
            header.classList.add('logged-in');
            authBtn.textContent = 'Đăng xuất';
            authBtn.onclick = () => auth.signOut();

            // Gán các sự kiện chỉ dành cho người đã đăng nhập
            saveTreeBtn.addEventListener('click', saveTree);
            saveContentBtn.addEventListener('click', saveContent);

            // Tải cây thư mục
            loadAndInitTree();

        } else {
            // === CHƯA ĐĂNG NHẬP / ĐÃ ĐĂNG XUẤT ===
            currentUser = null;
            header.classList.remove('logged-in');
            authBtn.textContent = 'Đăng nhập';
            authBtn.onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
            
            // Dọn dẹp giao diện
            treeContainer.jstree('destroy');
            editor.updateOptions({ readOnly: true });
            editor.setValue('% Vui lòng đăng nhập để sử dụng chức năng quản lý giáo trình.');
            saveContentBtn.disabled = true;
        }
    }
    
    // ==========================================================
    // PHẦN 3: LOGIC CỦA JSTREE (QUẢN LÝ GIÁO TRÌNH)
    // ==========================================================

    async function loadAndInitTree() {
        showLoading();
        try {
            const getTreeCallable = functions.httpsCallable('getCurriculumTree');
            const result = await getTreeCallable();
            initJsTree(result.data.treeData || []);
        } catch (error) {
            Swal.fire('Lỗi', `Không thể tải cây thư mục: ${error.message}`, 'error');
            initJsTree([]);
        } finally {
            hideLoading();
        }
    }

    function initJsTree(data) {
        treeContainer.jstree('destroy');
        treeContainer.jstree({
            'core': { 'data': data, 'check_callback': true },
            'plugins': ['contextmenu', 'dnd', 'types'],
            'contextmenu': {
                'items': (node) => {
                    const tree = $.jstree.reference(node);
                    const menuItems = {
                        "createFolder": { "label": "Tạo Thư Mục", "action": () => tree.create_node(node, { type: 'default', text: 'Thư mục mới' })},
                        "createFile": { "label": "Tạo Bài Học", "action": () => tree.create_node(node, { type: 'file', text: 'Bài học mới' })},
                        "rename": { "label": "Đổi Tên", "action": () => tree.edit(node) },
                        "delete": { "label": "Xóa", "action": () => tree.delete_node(node) }
                    };
                    if (node.type === 'file') {
                        delete menuItems.createFolder;
                        delete menuItems.createFile;
                    }
                    return menuItems;
                }
            },
            'types': {
                'default': { 'icon': 'jstree-folder' },
                'file': { 'icon': 'jstree-file' }
            }
        });

        // Lắng nghe các sự kiện
        treeContainer.on('changed.jstree', (e, data) => {
            if (data.action === 'select_node' && data.selected.length) {
                handleNodeSelection(data.instance.get_node(data.selected[0]));
            }
        });

        treeContainer.on('create_node.jstree', (e, data) => {
            isTreeDirty = true;
            data.instance.edit(data.node);
        });

        treeContainer.on('rename_node.jstree move_node.jstree delete_node.jstree', () => { isTreeDirty = true; });
        treeContainer.on('ready.jstree', (e, data) => { data.instance.open_all(); });
    }

    async function handleNodeSelection(node) {
        const isFile = node.type === 'file';
        editor.updateOptions({ readOnly: !isFile });
        saveContentBtn.disabled = !isFile;

        if (!isFile) {
            editor.setValue(`% Đây là thư mục "${node.text}".`);
            currentOpenFileId = null;
            return;
        }

        currentOpenFileId = node.id;
        const contentPath = `curriculum_content/${currentUser.uid}/${node.id}.tex`;
        
        showLoading();
        try {
            const url = await storage.ref(contentPath).getDownloadURL();
            editor.setValue(await (await fetch(url)).text());
        } catch (error) {
            if (error.code === 'storage/object-not-found') {
                editor.setValue(`\\begin{ex}\n\tNội dung cho: ${node.text}\n\\end{ex}`);
            } else {
                editor.setValue(`% Lỗi tải nội dung: ${error.message}`);
            }
        } finally {
            hideLoading();
            editor.focus();
        }
    }
    
    // === DATA SAVING ===
    async function saveTree() {
        if (!isTreeDirty) {
            return Swal.fire({icon: 'info', title: 'Không có gì thay đổi', showConfirmButton: false, timer: 1500});
        }
        showLoading();
        const treeData = treeContainer.jstree(true).get_json('#', { no_state: true });
        
        try {
            const saveTreeCallable = functions.httpsCallable('saveCurriculumTree');
            await saveTreeCallable({ treeData });
            isTreeDirty = false;
            Swal.fire('Thành công', 'Đã lưu cấu trúc cây!', 'success');
        } catch (error) {
            Swal.fire('Lỗi', `Lỗi khi lưu cây: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    async function saveContent() {
        if (!currentOpenFileId) return;
        showLoading();
        const contentPath = `curriculum_content/${currentUser.uid}/${currentOpenFileId}.tex`;
        try {
            await storage.ref(contentPath).putString(editor.getValue(), 'raw', { contentType: 'text/plain;charset=UTF-8' });
            Swal.fire('Thành công', 'Đã lưu nội dung!', 'success');
        } catch (error) {
            Swal.fire('Lỗi', `Lỗi khi lưu nội dung: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    // ==========================================================
    // PHẦN 4: CÁC HÀM CŨ CỦA AI EDITOR (giữ lại nếu cần)
    // ==========================================================

    async function loadPrompts() {
        if (!window.jsyaml) {
            statusMessage.textContent = 'Lỗi: Thư viện js-yaml chưa được tải.';
            return;
        }
        try {
            const response = await fetch('prompts.yaml');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const yamlText = await response.text();
            promptConfig = jsyaml.load(yamlText);
        } catch (error) {
            statusMessage.textContent = `Lỗi tải prompts.yaml: ${error.message}`;
        }
    }

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

    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        if (editor) monaco.editor.setTheme(isDarkMode ? 'vs-dark' : 'vs');
        themeToggleButton.querySelector('.icon').textContent = isDarkMode ? '☀️' : '🌙';
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }

    const showLoading = () => document.getElementById('loading-overlay').style.display = 'flex';
    const hideLoading = () => document.getElementById('loading-overlay').style.display = 'none';

    // === BẮT ĐẦU ỨNG DỤNG ===
    main();
});