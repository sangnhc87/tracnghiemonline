// --- PHIÊN BẢN GỠ LỖI (DEBUGGING VERSION) ---

document.addEventListener('DOMContentLoaded', () => {
    // === Firebase Services & Global Variables ===
    const auth = firebase.auth();
    const db = firebase.firestore();
    const functions = firebase.app().functions("asia-southeast1");
    const storage = firebase.storage();

    let editor;
    let currentUser = null;
    let currentOpenFile = { path: null, id: null };
    let isTreeDirty = false;

    // === DOM Elements ===
    const teacherNameSpan = document.getElementById('teacher-name');
    const treeContainer = $('#tree-container');
    const saveTreeBtn = document.getElementById('save-tree-btn');
    const saveContentBtn = document.getElementById('save-content-btn');
    const signOutBtn = document.getElementById('sign-out-btn');
    const previewContainer = document.getElementById('preview-container');

    // === UTILITY TO SET READONLY WITH LOGGING ===
    function setEditorReadOnly(isReadOnly, reason) {
        if (!editor) return;
        console.log(`%cEDITOR_LOCK: Setting readOnly to ${isReadOnly}. Reason: ${reason}`, `color: ${isReadOnly ? 'red' : 'green'}; font-weight: bold;`);
        editor.updateOptions({ readOnly: isReadOnly });
    }


    // === INITIALIZATION ===
    async function main() {
        try {
            await initMonacoEditor();
            console.log("Monaco Editor is ready.");

            attachEventListeners();
            
            auth.onAuthStateChanged(user => {
                if (user) {
                    currentUser = user;
                    teacherNameSpan.textContent = user.displayName || user.email;
                    loadAndInitTree();
                } else {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Vui lòng đăng nhập',
                        text: 'Bạn cần đăng nhập với tài khoản giáo viên để sử dụng chức năng này.',
                        confirmButtonText: 'OK'
                    }).then(() => {
                        window.location.href = '/index.html';
                    });
                }
            });

        } catch (error) {
            console.error("Failed to initialize Monaco Editor:", error);
            Swal.fire('Lỗi nghiêm trọng', 'Không thể tải trình soạn thảo. Vui lòng kiểm tra kết nối mạng và thử lại.', 'error');
        }
    }

    function initMonacoEditor() {
        return new Promise((resolve, reject) => {
            require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
            require(['vs/editor/editor.main'], () => {
                editor = monaco.editor.create(document.getElementById('editor-container'), {
                    value: '% Tải trình soạn thảo...',
                    language: 'latex',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    readOnly: true, // Khởi tạo ở chế độ chỉ đọc
                });
                setEditorReadOnly(true, "Initial setup"); // Log trạng thái ban đầu

                editor.onDidChangeModelContent(() => {
                    if (window.convertLatexToHtml) {
                        const { html } = convertLatexToHtml(editor.getValue()); 
                        previewContainer.innerHTML = html;
                        renderMathInElement(previewContainer, {
                            delimiters: [
                                {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false},
                                {left: '\\[', right: '\\]', display: true}, {left: '\\(', right: '\\)', display: false}
                            ],
                            throwOnError: false
                        });
                    }
                });
                
                resolve(); 
            }, (error) => {
                reject(error); 
            });
        });
    }

    function attachEventListeners() {
        signOutBtn.addEventListener('click', () => auth.signOut());
        saveTreeBtn.addEventListener('click', saveTree);
        saveContentBtn.addEventListener('click', saveContent);
    }
    
    // === JSTREE LOGIC ===
    async function loadAndInitTree() {
        showLoading();
        try {
            const getTreeCallable = functions.httpsCallable('getCurriculumTree');
            const result = await getTreeCallable();
            const treeData = result.data.treeData || [];
            initJsTree(treeData);
        } catch (error) {
            Swal.fire('Lỗi', `Không thể tải cây thư mục: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    // === HÃY THAY THẾ TOÀN BỘ HÀM initJsTree CŨ BẰNG PHIÊN BẢN NÀY ===

function initJsTree(data) {
    treeContainer.jstree('destroy'); 
    treeContainer.jstree({
        'core': { 
            'data': data, 
            'check_callback': true, 
            'themes': { 'dots': true, 'responsive': true }
        },
        'plugins': ['contextmenu', 'dnd', 'types'],
        'contextmenu': {
            'items': function(node) {
                const inst = $.jstree.reference(node); // Lấy instance của cây
                const obj = inst.get_node(node);    // Lấy đối tượng node

                const menuItems = {
                    'create_folder': {
                        'label': 'Tạo Thư Mục Mới',
                        'action': function () {
                            // Tạo node THƯ MỤC với ID duy nhất
                            const newFolderId = `folder_${Date.now()}`;
                            inst.create_node(obj, { id: newFolderId, type: 'default', text: 'Thư mục mới' }, 'last', function (new_node) {
                                setTimeout(function () { inst.edit(new_node); }, 0);
                            });
                        }
                    },
                    'create_file': {
                        'label': 'Tạo Bài Học Mới',
                        'action': function () {
                            // Tạo node BÀI HỌC với ID duy nhất
                            const newFileId = `file_${Date.now()}`;
                            inst.create_node(obj, { id: newFileId, type: 'file', text: 'Bài học mới' }, 'last', function (new_node) {
                                setTimeout(function () { inst.edit(new_node); }, 0);
                            });
                        }
                    },
                    'rename': {
                        'separator_before': true,
                        'label': 'Đổi Tên',
                        'action': function () {
                            inst.edit(obj);
                        }
                    },
                    'delete': {
                        'label': 'Xóa Mục Này',
                        'action': function () {
                            if(inst.is_selected(obj)) {
                                inst.delete_node(inst.get_selected());
                            } else {
                                inst.delete_node(obj);
                            }
                        }
                    }
                };

                if (node.type === "file") {
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

    // --- Phần lắng nghe sự kiện giữ nguyên như phiên bản trước ---
    treeContainer.on('changed.jstree', function (e, data) {
        if (data.action === 'select_node' && data.selected.length === 1) {
            const node = data.instance.get_node(data.selected[0]);
            onNodeSelect(node); 
        }
    });
    treeContainer.on('rename_node.jstree move_node.jstree delete_node.jstree create_node.jstree', () => {
        isTreeDirty = true;
        console.log("Tree structure changed. isTreeDirty is now true.");
    });
    treeContainer.on('ready.jstree', function (e, data) {
        console.log("JSTREE EVENT: 'ready.jstree' fired.");
        const tree = data.instance;
        const firstFileNodeId = findFirstFileNode(tree, '#');
        if (firstFileNodeId) {
            console.log(`Found first file node: ${firstFileNodeId}. Selecting it.`);
            tree.select_node(firstFileNodeId);
        } else {
            console.log("No file node found in the tree.");
            setEditorReadOnly(true, "Tree is ready but no file node found.");
            editor.setValue('% Cây thư mục trống hoặc chưa có bài học nào.\n\n% Chuột phải vào cây thư mục để "Tạo Bài Học Mới".');
            saveContentBtn.disabled = true;
        }
    });
}

    function findFirstFileNode(tree, parentNodeId) {
    const childrenIds = tree.get_children_dom(parentNodeId);
    if (!childrenIds) return null;

    for (const childId of childrenIds) {
        const node = tree.get_node(childId);
        if (node.type === 'file') {
            return node.id; // Tìm thấy! Trả về ngay lập tức.
        }
        // Nếu là thư mục, tìm kiếm đệ quy bên trong nó
        if (tree.is_parent(node)) {
            const foundInChild = findFirstFileNode(tree, node.id);
            if (foundInChild) {
                return foundInChild; // Tìm thấy trong thư mục con, trả về.
            }
        }
    }

    return null; // Không tìm thấy trong nhánh này.
}


function deleteNode(node) {
        Swal.fire({
        title: 'Bạn chắc chắn?',
        text: `Bạn có muốn xóa "${node.text}" không? Hành động này không thể hoàn tác.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa!',
        cancelButtonText: 'Hủy'
    }).then((result) => {
        if (result.isConfirmed) {
            treeContainer.jstree(true).delete_node(node);
        }
    });
}
    
    // === DATA HANDLING ===
    async function onNodeSelect(node) {
    // Dòng `const node = data.node;` đã được xóa
    console.log(`ACTION: Processing node selection: ${node.text} (ID: ${node.id}, Type: ${node.type})`);

        if (node.type !== 'file') {
            setEditorReadOnly(true, "Selected node is a folder.");
            editor.setValue(`% Đây là một thư mục.\n\n% Hãy chọn một bài học để soạn thảo hoặc chuột phải để tạo mục mới.`);
            saveContentBtn.disabled = true;
            currentOpenFile = { path: null, id: null };
            previewContainer.innerHTML = '';
            return;
        }

        const contentPath = `curriculum_content/${currentUser.uid}/${node.id}.tex`;
        currentOpenFile = { path: contentPath, id: node.id };
        showLoading();

        try {
            console.log(`Attempting to load content from: ${contentPath}`);
            const url = await storage.ref(contentPath).getDownloadURL();
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const content = await response.text();
            
            editor.setValue(content);
            console.log(`Successfully loaded content for: ${node.text}`);
        } catch (error) {
            if (error.code === 'storage/object-not-found') {
                console.log(`File not found in Storage. Creating default content for new file: ${node.text}`);
                const defaultContent = `\\begin{ex}\n\tNội dung cho bài học: ${node.text}\n\\end{ex}`;
                editor.setValue(defaultContent);
            } else {
                console.error("Error loading content:", error);
                editor.setValue(`% Lỗi khi tải nội dung cho file: ${node.text}`);
            }
        } finally {
            console.log("Entering 'finally' block of onNodeSelect.");
            hideLoading();
            setEditorReadOnly(false, "File selected, operation finished.");
            saveContentBtn.disabled = false;
        }
    }
    
    async function saveTree() {
    if (!isTreeDirty) {
        Swal.fire({icon: 'info', title: 'Không có gì thay đổi', text: 'Cây thư mục chưa có sự thay đổi nào.'});
        return;
    }
    
    showLoading();
    const treeData = treeContainer.jstree(true).get_json('#', { flat: false });

    try {
        const saveTreeCallable = functions.httpsCallable('saveCurriculumTree');
        await saveTreeCallable({ treeData });
        isTreeDirty = false;
        Swal.fire('Thành công', 'Đã lưu cấu trúc cây thư mục!', 'success');
    } catch (error) {
        Swal.fire('Lỗi', `Lỗi khi lưu cây: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

    // Phiên bản an toàn hơn của saveContent
async function saveContent() {
    if (!currentOpenFile || !currentOpenFile.path) {
        Swal.fire('Cảnh báo', 'Vui lòng chọn một bài học từ cây thư mục.', 'warning');
        return;
    }

    // Kiểm tra xem editor có đang ở chế độ chỉ đọc không
    // Đây là một bước kiểm tra kép để đảm bảo an toàn
    if (editor.getOptions().get(monaco.editor.EditorOption.readOnly)) {
        Swal.fire('Lỗi', 'Trình soạn thảo đang ở chế độ chỉ đọc. Không thể lưu.', 'error');
        return;
    }

    showLoading();
    const content = editor.getValue();
    const fileRef = storage.ref(currentOpenFile.path);

    try {
        await fileRef.putString(content, 'raw', { contentType: 'text/plain;charset=UTF-8' });
        Swal.fire('Thành công', 'Đã lưu nội dung bài học!', 'success');
    } catch(error) {
        console.error("Lỗi khi lưu nội dung:", error);
        Swal.fire('Lỗi', `Lỗi khi lưu nội dung: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}
    
    const showLoading = () => document.getElementById('loading-overlay').style.display = 'flex';
    const hideLoading = () => document.getElementById('loading-overlay').style.display = 'none';

    main();
});