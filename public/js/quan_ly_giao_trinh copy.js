document.addEventListener('DOMContentLoaded', () => {
    // === Firebase Services & Global Variables ===
    const auth = firebase.auth();
    const db = firebase.firestore();
    const functions = firebase.app().functions("asia-southeast1");
    const storage = firebase.storage();

    let editor;
    let currentUser = null;
    let currentOpenFile = { path: null, id: null };
    let isTreeDirty = false; // Cờ để kiểm tra cây có thay đổi không

    // === DOM Elements ===
    const teacherNameSpan = document.getElementById('teacher-name');
    const treeContainer = $('#tree-container'); // Dùng jQuery cho jsTree
    const saveTreeBtn = document.getElementById('save-tree-btn');
    const saveContentBtn = document.getElementById('save-content-btn');
    const signOutBtn = document.getElementById('sign-out-btn');
    const previewContainer = document.getElementById('preview-container');

    // === INITIALIZATION ===
    // Tìm hàm main và sửa nó thành async
async function main() {
    try {
        // CHỜ cho đến khi Monaco Editor khởi tạo xong
        await initMonacoEditor();
        console.log("Monaco Editor is ready.");

        // Các hàm còn lại chỉ được gọi sau khi editor đã sẵn sàng
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
    // Trả về một Promise mới
    return new Promise((resolve, reject) => {
        require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], () => {
            // Khi Monaco đã được tải, tạo editor
            editor = monaco.editor.create(document.getElementById('editor-container'), {
                value: '% Tải trình soạn thảo...',
                language: 'latex',
                theme: 'vs-dark',
                automaticLayout: true,
                readOnly: true,
            });

            // Cập nhật live preview khi gõ
            editor.onDidChangeModelContent(() => {
                // ... (phần này giữ nguyên)
                const content = editor.getValue();
                if (window.convertLatexToHtml) {
                    const { html } = convertLatexToHtml(content); 
                    previewContainer.innerHTML = html;
                    renderMathInElement(previewContainer, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false},
                            {left: '\\[', right: '\\]', display: true},
                            {left: '\\(', right: '\\)', display: false}
                        ],
                        throwOnError: false
                    });
                }
            });
            
            // Báo hiệu rằng Promise đã hoàn thành và editor đã sẵn sàng
            resolve(); 
        }, (error) => {
            // Nếu có lỗi khi tải Monaco, báo hiệu Promise thất bại
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

    // Phiên bản đã được nâng cấp của hàm initJsTree
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
                // ... (phần context menu giữ nguyên)
                return {
                    'create_folder': {
                        'label': 'Tạo Thư Mục Mới',
                        'action': (data) => createNode(node, 'folder')
                    },
                    'create_file': {
                        'label': 'Tạo Bài Học Mới',
                        'action': (data) => createNode(node, 'file')
                    },
                    'rename': {
                        'label': 'Đổi Tên',
                        'action': (data) => treeContainer.jstree(true).edit(node)
                    },
                    'delete': {
                        'label': 'Xóa',
                        'action': (data) => deleteNode(node)
                    }
                };
            }
        },
        'types': {
            'default': { 'icon': 'jstree-icon jstree-folder' },
            'file': { 'icon': 'jstree-icon jstree-file' }
        }
    })
    .on('select_node.jstree', onNodeSelect)
    .on('rename_node.jstree dnd_node.jstree delete_node.jstree create_node.jstree', () => {
        isTreeDirty = true;
    })
    // === ĐOẠN CODE MỚI THÊM VÀO ===
    .on('ready.jstree', function () {
        const tree = treeContainer.jstree(true);
        // Tìm node đầu tiên là 'file'
        const firstFileNodeId = findFirstFileNode(tree, '#'); // Bắt đầu tìm từ gốc

        if (firstFileNodeId) {
            // Nếu tìm thấy, chọn nó
            tree.select_node(firstFileNodeId);
        } else {
            // Nếu không có file nào, vẫn hiển thị thông báo
            editor.setValue('% Cây thư mục trống hoặc chưa có bài học nào.\n\n% Chuột phải vào cây thư mục để "Tạo Bài Học Mới".');
            editor.updateOptions({ readOnly: true });
            saveContentBtn.disabled = true;
        }
    });
}

// === THÊM HÀM HỖ TRỢ NÀY VÀO FILE ===
/**
 * Hàm đệ quy để tìm ID của node 'file' đầu tiên trong cây.
 * @param {object} tree - Instance của jsTree.
 * @param {string} parentNodeId - ID của node cha để bắt đầu tìm kiếm.
 * @returns {string|null} - ID của node file đầu tiên, hoặc null nếu không tìm thấy.
 */
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
function createNode(parentNode, type) {
    const tree = treeContainer.jstree(true);
    const newId = `node_${Date.now()}`;

    // Dòng này rất quan trọng. Nó quyết định node mới là thư mục hay là file.
    const nodeType = (type === 'file' ? 'file' : 'default');

    const newNodeData = {
        id: newId,
        type: nodeType, // Sử dụng biến đã tính toán ở trên
        text: `Mục mới`
    };

    console.log(`Creating new node. Type requested: ${type}, Resolved type: ${nodeType}`); // Thêm log để kiểm tra

    const parentNodeObj = tree.get_node(parentNode);
    tree.create_node(parentNodeObj, newNodeData, "last", (newNode) => {
        setTimeout(() => { tree.edit(newNode); }, 0);
    });
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
    
    // Thay thế TOÀN BỘ hàm onNodeSelect cũ bằng phiên bản cuối cùng này
async function onNodeSelect(e, data) {
    const node = data.node;

    // === Step 1: Handle Folder Selection ===
    if (node.type !== 'file') {
        editor.updateOptions({ readOnly: true }); // Lock the editor for folders
        editor.setValue(`% Đây là một thư mục.\n\n% Hãy chọn một bài học để soạn thảo hoặc chuột phải để tạo mục mới.`);
        saveContentBtn.disabled = true;
        currentOpenFile = { path: null, id: null };
        previewContainer.innerHTML = '';
        return;
    }

    // === Step 2: Prepare for File Opening ===
    const contentPath = `curriculum_content/${currentUser.uid}/${node.id}.tex`;
    currentOpenFile = { path: contentPath, id: node.id };
    
    // MỞ KHÓA NGAY LẬP TỨC (Điểm thay đổi quan trọng số 1)
    // Chúng ta không đợi tải file xong mới mở khóa. Miễn là nó là file, nó phải được mở khóa.
    editor.updateOptions({ readOnly: false });
    saveContentBtn.disabled = false;
    
    showLoading();
    
    // === Step 3: Asynchronously Load Content ===
    try {
        const url = await storage.ref(contentPath).getDownloadURL();
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const content = await response.text();
        
        editor.setValue(content);
        console.log(`Đã tải nội dung cho: ${node.text}`);

    } catch (error) {
        if (error.code === 'storage/object-not-found') {
            console.log(`File mới: "${node.text}". Tạo nội dung mặc định.`);
            const defaultContent = `\\begin{ex}\n\tNội dung cho bài học: ${node.text}\n\\end{ex}`;
            editor.setValue(defaultContent);
        } else {
            console.error("Lỗi khi tải nội dung:", error);
            Swal.fire('Lỗi', `Không thể tải nội dung bài học: ${error.message}`, 'error');
            editor.setValue(`% Lỗi khi tải nội dung cho file: ${node.text}`);
        }
    } finally {
        hideLoading();
        
        // DÙNG setTimeout ĐỂ ĐẢM BẢO VIỆC MỞ KHÓA LÀ LỆNH CUỐI CÙNG (Điểm thay đổi quan trọng số 2)
        // Đây là một "thủ thuật" để đảm bảo lệnh của chúng ta chạy sau bất kỳ sự kiện ngầm nào khác.
        setTimeout(() => {
            editor.updateOptions({ readOnly: false });
            editor.focus(); // Tự động focus vào trình soạn thảo cho người dùng
        }, 100); // 100ms là đủ
        
        // Trigger render preview
        const currentContent = editor.getValue();
        if (window.convertLatexToHtml) {
            const { html } = convertLatexToHtml(currentContent);
            previewContainer.innerHTML = html;
            if (window.renderMathInElement) {
                renderMathInElement(previewContainer, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false},
                        {left: '\\[', right: '\\]', display: true}, {left: '\\(', right: '\\)', display: false}
                    ],
                    throwOnError: false
                });
            }
        }
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

    // Start the app
    main();
});