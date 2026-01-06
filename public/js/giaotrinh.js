document.addEventListener('DOMContentLoaded', () => {
    // === Firebase & Global Variables ===
    const functions = firebase.app().functions("asia-southeast1");
    
    // === DOM Elements ===
    const treeContainer = $('#tree-container');
    const previewContainer = document.getElementById('preview-container');

    // === INITIALIZATION ===
    function main() {
        const urlParams = new URLSearchParams(window.location.search);
        const teacherAlias = urlParams.get('gv');

        if (!teacherAlias) {
            previewContainer.innerHTML = '<p style="color:red; text-align:center;">Lỗi: Không tìm thấy mã giáo viên trong đường dẫn. Vui lòng truy cập theo link dạng `.../giaotrinh.html?gv=mã_giáo_viên`.</p>';
            return;
        }

        loadTreeForStudent(teacherAlias);
    }

    // === JSTREE LOGIC ===
    async function loadTreeForStudent(alias) {
        showLoading();
        try {
            const getTreeCallable = functions.httpsCallable('getCurriculumTreeForStudent');
            const result = await getTreeCallable({ teacherAlias: alias });
            const treeData = result.data.treeData || [];
            
            if (treeData.length === 0) {
                 previewContainer.innerHTML = `<p style="text-align: center; color: #888; margin-top: 50px;">Giáo viên này chưa có giáo trình nào.</p>`;
            }

            initJsTree(treeData);
        } catch (error) {
            previewContainer.innerHTML = `<p style="color:red; text-align:center;">Lỗi: ${error.message}</p>`;
        } finally {
            hideLoading();
        }
    }
    
    function initJsTree(data) {
        treeContainer.jstree('destroy');
        treeContainer.jstree({
            'core': {
                'data': data,
                'themes': { 'dots': true, 'responsive': true }
            },
            'plugins': ['types'],
            'types': {
                'default': { 'icon': 'jstree-icon jstree-folder' },
                'file': { 'icon': 'jstree-icon jstree-file' }
            }
        }).on('select_node.jstree', onNodeSelect);
    }
    
    // === DATA HANDLING ===
    async function onNodeSelect(e, data) {
        const node = data.node;
        if (node.type !== 'file' || !node.original.contentPath) {
            return; // Bỏ qua nếu là thư mục
        }
        
        showLoading();
        previewContainer.innerHTML = '';
        const contentPath = node.original.contentPath;

        try {
            const getContentCallable = functions.httpsCallable('getCurriculumContent');
            const result = await getContentCallable({ path: contentPath });
            const texContent = result.data.content;
            
            // Dùng lại parser để render
            const { html } = convertLatexToHtml(texContent);
            previewContainer.innerHTML = html;
            // Dòng đã sửa
renderMathInElement(previewContainer, {
    delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\[', right: '\\]', display: true},
        {left: '\\(', right: '\\)', display: false}
    ],
    throwOnError: false
});

        } catch(error) {
            previewContainer.innerHTML = `<p style="color:red;">Không thể tải nội dung bài học: ${error.message}</p>`;
        } finally {
            hideLoading();
        }
    }

    const showLoading = () => document.getElementById('loading-overlay').style.display = 'flex';
    const hideLoading = () => document.getElementById('loading-overlay').style.display = 'none';
    
    // Start
    main();
});