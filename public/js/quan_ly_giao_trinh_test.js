// === PHIÊN BẢN XÂY DỰNG LẠI TỪ FILE TEST - HOÀN CHỈNH ===

document.addEventListener('DOMContentLoaded', () => {
    // === Firebase & Global Vars ===
    const auth = firebase.auth();
    const db = firebase.firestore();
    const functions = firebase.app().functions("asia-southeast1");
    const storage = firebase.storage();

    let editor;
    let currentUser = null;
    let isTreeDirty = false; // Cờ theo dõi thay đổi cây
    let currentOpenFileId = null; // Chỉ lưu ID của file đang mở

    // === DOM Elements ===
    const teacherNameSpan = document.getElementById('teacher-name');
    const treeContainer = $('#tree-container');
    const saveTreeBtn = document.getElementById('save-tree-btn');
    const saveContentBtn = document.getElementById('save-content-btn');
    const signOutBtn = document.getElementById('sign-out-btn');
    const previewContainer = document.getElementById('preview-container');

    // === INITIALIZATION ===
    async function main() {
        await initMonacoEditor();
        attachEventListeners();

        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                teacherNameSpan.textContent = user.displayName || user.email;
                loadAndInitTree(); // Bước 1: Tải dữ liệu từ Firestore
            } else {
                window.location.href = '/index.html';
            }
        });
    }

    function initMonacoEditor() {
        return new Promise((resolve) => {
            require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
            require(['vs/editor/editor.main'], () => {
                editor = monaco.editor.create(document.getElementById('editor-container'), {
                    value: '% Chào mừng! Vui lòng chọn hoặc tạo một bài học.',
                    language: 'latex',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    readOnly: true
                });
                editor.onDidChangeModelContent(() => {
                    if (window.convertLatexToHtml) {
                        const { html } = convertLatexToHtml(editor.getValue());
                        previewContainer.innerHTML = html;
                        renderMathInElement(previewContainer, { delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}, {left: '\\[', right: '\\]', display: true}, {left: '\\(', right: '\\)', display: false}], throwOnError: false });
                    }
                });
                resolve();
            });
        });
    }

    function attachEventListeners() {
        signOutBtn.addEventListener('click', () => auth.signOut());
        saveTreeBtn.addEventListener('click', saveTree);
        saveContentBtn.addEventListener('click', saveContent);
    }

    // === JSTREE LOGIC ===

    // Bước 1: Tải cây từ Firestore
    async function loadAndInitTree() {
        showLoading();
        try {
            const getTreeCallable = functions.httpsCallable('getCurriculumTree');
            const result = await getTreeCallable();
            const treeData = result.data.treeData || [];
            initJsTree(treeData); // Bước 2: Khởi tạo cây với dữ liệu đã tải
        } catch (error) {
            Swal.fire('Lỗi', `Không thể tải cây thư mục: ${error.message}`, 'error');
            initJsTree([]); // Nếu lỗi, khởi tạo cây rỗng
        } finally {
            hideLoading();
        }
    }

    // Bước 2: Khởi tạo jsTree (kết hợp những gì hoạt động từ file test)
    function initJsTree(data) {
        treeContainer.jstree('destroy');
        treeContainer.jstree({
            'core': {
                'data': data,
                'check_callback': true // Cho phép mọi thay đổi
            },
            'plugins': ['contextmenu', 'dnd', 'types'],
            'contextmenu': {
                'items': (node) => {
                    const tree = treeContainer.jstree(true);
                    const menuItems = {
                        'create_folder': {
                            'label': 'Tạo Thư Mục Mới',
                            'action': () => {
                                const newNode = tree.create_node(node, { type: 'default', text: 'Thư mục mới' });
                                setTimeout(() => tree.edit(newNode), 0);
                            }
                        },
                        'create_file': {
                            'label': 'Tạo Bài Học Mới',
                            'action': () => {
                                const newNode = tree.create_node(node, { type: 'file', text: 'Bài học mới' });
                                setTimeout(() => tree.edit(newNode), 0);
                            }
                        },
                        'rename': { 'label': 'Đổi Tên', 'action': () => tree.edit(node) },
                        'delete': { 'label': 'Xóa', 'action': () => tree.delete_node(node) }
                    };
                    if (node.type === 'file') {
                        delete menuItems.create_folder;
                        delete menuItems.create_file;
                    }
                    return menuItems;
                }
            },
            'types': {
                'default': { 'icon': 'jstree-icon jstree-folder' },
                'file': { 'icon': 'jstree-icon jstree-file' }
            }
        });

        // Bước 3: Lắng nghe sự kiện (Logic đã được kiểm chứng từ file test)
        treeContainer.on('changed.jstree', (e, data) => {
            if (data.action === 'select_node' && data.selected.length) {
                const node = data.instance.get_node(data.selected[0]);
                handleNodeSelection(node);
            }
        });
        
        // Theo dõi sự thay đổi của cây để bật/tắt nút Lưu
        treeContainer.on('create_node.jstree delete_node.jstree rename_node.jstree move_node.jstree', () => {
            isTreeDirty = true;
        });

        // Mở tất cả các node khi cây sẵn sàng để dễ nhìn
        treeContainer.on('ready.jstree', (e, data) => {
             data.instance.open_all();
        });
    }
    
    // Bước 4: Xử lý khi một node được chọn (Logic đã được kiểm chứng)
    async function handleNodeSelection(node) {
        // Khóa hoặc mở khóa editor dựa trên loại node
        const isFile = node.type === 'file';
        editor.updateOptions({ readOnly: !isFile });
        saveContentBtn.disabled = !isFile;

        if (!isFile) {
            editor.setValue(`% Đây là thư mục "${node.text}".`);
            currentOpenFileId = null;
            return;
        }

        // Nếu là file, tiến hành tải nội dung
        currentOpenFileId = node.id;
        const contentPath = `curriculum_content/${currentUser.uid}/${node.id}.tex`;
        
        showLoading();
        try {
            const url = await storage.ref(contentPath).getDownloadURL();
            const response = await fetch(url);
            editor.setValue(await response.text());
        } catch (error) {
            if (error.code === 'storage/object-not-found') {
                // File mới, chưa có nội dung trên storage
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
            return Swal.fire({icon: 'info', title: 'Không có gì thay đổi', text: 'Cấu trúc cây chưa được thay đổi.', showConfirmButton: false, timer: 1500});
        }
        
        showLoading();
        // Lấy dữ liệu JSON từ cây
        const treeData = treeContainer.jstree(true).get_json('#', { no_state: true });
        
        try {
            const saveTreeCallable = functions.httpsCallable('saveCurriculumTree');
            await saveTreeCallable({ treeData: treeData });
            isTreeDirty = false; // Reset cờ sau khi lưu thành công
            Swal.fire('Thành công', 'Đã lưu cấu trúc cây thư mục!', 'success');
        } catch (error) {
            Swal.fire('Lỗi', `Lỗi khi lưu cây: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    async function saveContent() {
        if (!currentOpenFileId) {
            return Swal.fire('Cảnh báo', 'Vui lòng chọn một bài học đang mở để lưu.', 'warning');
        }
        
        const contentPath = `curriculum_content/${currentUser.uid}/${currentOpenFileId}.tex`;
        
        showLoading();
        try {
            await storage.ref(contentPath).putString(editor.getValue(), 'raw', { contentType: 'text/plain;charset=UTF-8' });
            Swal.fire('Thành công', 'Đã lưu nội dung bài học!', 'success');
        } catch (error) {
            Swal.fire('Lỗi', `Lỗi khi lưu nội dung: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    const showLoading = () => document.getElementById('loading-overlay').style.display = 'flex';
    const hideLoading = () => document.getElementById('loading-overlay').style.display = 'none';

    main();
});