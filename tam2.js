// File: functions/index.js
// THÊM các hàm này vào cuối file

// [MỚI] Thêm đề thi PDF
exports.addPdfExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { examData } = data;
    if (!examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu.");
    
    const examCode = String(examData.examCode || "").trim();
    if (!examCode.toUpperCase().startsWith('PDF-')) {
        throw new functions.https.HttpsError("invalid-argument", "Mã đề PDF phải bắt đầu bằng 'PDF-'.");
    }

    const newPdfExam = {
        teacherId: context.auth.uid,
        examType: 'PDF',
        examCode: examCode,
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys || "").split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => c.trim()),
        examPdfUrl: String(examData.examPdfUrl || "").trim(),
        solutionPdfUrl: String(examData.solutionPdfUrl || "").trim(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await db.collection("exams").add(newPdfExam);
    return { success: true, message: "Đã thêm đề thi PDF thành công!" };
});

// [MỚI] Lấy danh sách đề PDF
exports.getPdfExams = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { uid } = context.auth.token;
    
    const snapshot = await db.collection("exams")
                             .where("teacherId", "==", uid)
                             .where("examType", "==", "PDF")
                             .orderBy("createdAt", "desc")
                             .get();
                             
    const exams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return exams;
});

// [MỚI] Lấy chi tiết 1 đề PDF
exports.getSinglePdfExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    const doc = await db.collection("exams").doc(examId).get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "Không có quyền xem đề thi này.");
    }
    return { id: doc.id, ...doc.data() };
});

// [HOÀN CHỈNH] Cập nhật một đề thi PDF đã có
exports.updatePdfExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    }
    const { examId, examData } = data;
    if (!examId || !examData) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu đề thi.");
    }

    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "Bạn không có quyền sửa đề thi này.");
    }

    const examCode = String(examData.examCode || "").trim();
    if (!examCode.toUpperCase().startsWith('PDF-')) {
        throw new functions.https.HttpsError("invalid-argument", "Mã đề PDF phải bắt đầu bằng 'PDF-'.");
    }

    const updatedPdfExam = {
        examCode: examCode,
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys || "").split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => c.trim()),
        examPdfUrl: String(examData.examPdfUrl || "").trim(),
        solutionPdfUrl: String(examData.solutionPdfUrl || "").trim(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await examRef.update(updatedPdfExam);
    return { success: true, message: "Đã cập nhật đề thi PDF thành công!" };
});

// [HOÀN CHỈNH] Xóa một đề thi PDF
exports.deletePdfExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    }
    const { examId } = data;
    if (!examId) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    }

    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    
    // Kiểm tra quyền sở hữu và đúng loại đề thi
    if (!doc.exists || doc.data().teacherId !== context.auth.uid || doc.data().examType !== 'PDF') {
        throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa hoặc đây không phải đề PDF.");
    }

    await examRef.delete();
    return { success: true, message: "Đã xóa đề thi PDF." };
});