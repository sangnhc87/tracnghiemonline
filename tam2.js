// Đảm bảo bạn có các dòng này ở đầu file
const { getStorage } = require("firebase-admin/storage");
const storage = getStorage();

// [NÂNG CẤP] Tự động lưu nội dung đề TEXT vào Storage
exports.addExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { uid } = context.auth.token;
    const { examData } = data;
    if (!examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu đề thi.");

    const newExam = {
        teacherId: uid,
        examType: examData.examType || 'TEXT',
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys).split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (newExam.examType === 'TEXT') {
        if (!examData.content) throw new functions.https.HttpsError("invalid-argument", "Đề TEXT cần có nội dung.");
        
        // Tự động tải nội dung lên Storage
        const fileName = `exam_content/${uid}/${newExam.examCode}_${Date.now()}.txt`;
        await storage.bucket().file(fileName).save(examData.content, { contentType: 'text/plain; charset=utf-8' });
        
        newExam.contentStoragePath = fileName; // Lưu đường dẫn file
        
    } else if (newExam.examType === 'PDF') {
        newExam.examPdfUrl = examData.examPdfUrl || '';
        newExam.solutionPdfUrl = examData.solutionPdfUrl || '';
    }

    await db.collection("exams").add(newExam);
    return { success: true, message: "Đã thêm đề thi thành công!" };
});

// [NÂNG CẤP] Tự động cập nhật nội dung đề TEXT lên Storage
exports.updateExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { examId, examData } = data;
    if (!examId || !examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu.");
    
    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền sửa đề thi này.");
    
    const oldExamData = doc.data();
    const updatedExam = { /* ... Lấy các trường chung như timeLimit, keys, cores ... */ };

    if (examData.examType === 'TEXT') {
        if (!examData.content) throw new functions.https.HttpsError("invalid-argument", "Đề TEXT cần có nội dung.");
        
        if (oldExamData.contentStoragePath) {
             await storage.bucket().file(oldExamData.contentStoragePath).delete().catch(e => console.warn("Lỗi xóa file cũ:", e.message));
        }
        
        const fileName = `exam_content/${context.auth.uid}/${examData.examCode.trim()}_${Date.now()}.txt`;
        await storage.bucket().file(fileName).save(examData.content, { contentType: 'text/plain; charset=utf-8' });
        
        updatedExam.contentStoragePath = fileName;
        updatedExam.content = admin.firestore.FieldValue.delete(); // Xóa trường content cũ nếu có
    } else if (examData.examType === 'PDF') {
        updatedExam.examPdfUrl = examData.examPdfUrl || '';
        updatedExam.solutionPdfUrl = examData.solutionPdfUrl || '';
        updatedExam.content = admin.firestore.FieldValue.delete();
        updatedExam.contentStoragePath = admin.firestore.FieldValue.delete();
    }
    
    await examRef.update(updatedExam);
    return { success: true, message: "Đã cập nhật đề thi thành công!" };
});

// [NÂNG CẤP] Tự động lấy URL tải về cho client
exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
    // ... code lấy examData ...
    const examData = examSnapshot.docs[0].data();
    
    const dataForStudent = { /* ... các trường metadata ... */ };
    
    if (examData.examType === 'TEXT') {
        // Nếu là đề mới lưu trên Storage
        if (examData.contentStoragePath) {
            const file = storage.bucket().file(examData.contentStoragePath);
            const [downloadURL] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });
            dataForStudent.contentUrl = downloadURL;
        } else { // Nếu là đề cũ lưu trong Firestore
            dataForStudent.content = examData.content || '';
        }
    } else if (examData.examType === 'PDF') {
        // Với đề PDF, chỉ trả về link gốc
        dataForStudent.examPdfUrl = examData.examPdfUrl;
    }
    
    return dataForStudent;
});











// Thay thế hàm startExam cũ bằng hàm này
async function startExam() {
    // ... code lấy thông tin teacherAlias, examCode... giữ nguyên ...

    showLoading();
    try {
        const result = await functions.httpsCallable("loadExamForStudent")({ teacherAlias, examCode });
        let examDetails = result.data;

        // Nếu là đề PDF, chuyển hướng ngay
        if (examDetails.examType === 'PDF') {
            const studentInfoForPdf = { teacherAlias, examCode, studentName, className, examPdfUrl: examDetails.examPdfUrl };
            sessionStorage.setItem('studentInfoForPdf', JSON.stringify(studentInfoForPdf));
            window.location.href = '/pdf-exam.html';
            return;
        }

        // Nếu là đề TEXT và có contentUrl, tải nội dung từ đó
        if (examDetails.examType === 'TEXT' && examDetails.contentUrl) {
            const response = await fetch(examDetails.contentUrl);
            if (!response.ok) throw new Error(`Không thể tải nội dung đề thi`);
            examDetails.content = await response.text();
        }
        
        hideLoading();

        if (examDetails.examType === 'TEXT' && !examDetails.content) {
            // ... báo lỗi ...
            return;
        }

        // ... code còn lại để bắt đầu thi TEXT (giữ nguyên) ...
        
    } catch (error) {
        // ... xử lý lỗi ...
    }
}