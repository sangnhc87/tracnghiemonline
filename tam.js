// =====================================================================
// ==      CÁC HÀM CRUD ĐỀ THI - PHIÊN BẢN "ALL-IN-STORAGE"          ==
// =====================================================================

/**
 * [HOÀN CHỈNH] Thêm một đề thi mới.
 * Chỉ nhận và lưu metadata cùng đường dẫn file trên Storage.
 */
exports.addExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    }
    const { examData } = data;
    if (!examData || !examData.examCode || !examData.keys || !examData.contentStoragePath) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu bắt buộc (Mã đề, Đáp án, File nội dung).");
    }

    const newExam = {
        teacherId: context.auth.uid,
        examType: examData.examType || 'TEXT',
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys).split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
        contentStoragePath: examData.contentStoragePath, // Nhận đường dẫn file từ client
        solutionStoragePath: examData.solutionStoragePath || null, // Nhận đường dẫn file từ client (nếu có)
        storageVersion: 2, // Đánh dấu là đề thế hệ mới
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("exams").add(newExam);
    return { success: true, message: "Đã thêm đề thi thành công!" };
});

/**
 * [HOÀN CHỈNH] Cập nhật một đề thi đã có.
 * Sẽ xóa file cũ trên Storage nếu file mới được upload.
 */
exports.updateExam = functions.https.onCall(async (data, context) => {
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
    const oldExamData = doc.data();

    // Chuẩn bị các trường metadata sẽ được cập nhật
    const updatedExam = {
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys).split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Nếu client gửi lên đường dẫn file ĐỀ THI mới, cập nhật nó và xóa file cũ
    if (examData.contentStoragePath) {
        if(oldExamData.contentStoragePath) {
            await storage.bucket().file(oldExamData.contentStoragePath).delete().catch(e => console.warn("Lỗi xóa file đề cũ:", e.message));
        }
        updatedExam.contentStoragePath = examData.contentStoragePath;
    }

    // Nếu client gửi lên đường dẫn file LỜI GIẢI mới, cập nhật nó và xóa file cũ
    if (examData.solutionStoragePath) {
         if(oldExamData.solutionStoragePath) {
            await storage.bucket().file(oldExamData.solutionStoragePath).delete().catch(e => console.warn("Lỗi xóa file lời giải cũ:", e.message));
        }
        updatedExam.solutionStoragePath = examData.solutionStoragePath;
    }

    await examRef.update(updatedExam);
    return { success: true, message: "Đã cập nhật đề thi thành công!" };
});

/**
 * [HOÀN CHỈNH] Lấy thông tin đề thi cho học sinh.
 * Chỉ trả về các thông tin cần thiết và đường dẫn file, không trả về URL.
 */
exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
    const { teacherAlias, examCode } = data;
    if (!teacherAlias || !examCode) {
        throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên và Mã đề là bắt buộc.");
    }
    
    const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
    if (teacherSnapshot.empty) {
        throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
    }
    
    const teacherDoc = teacherSnapshot.docs[0];
    const examSnapshot = await db.collection("exams")
                                 .where("teacherId", "==", teacherDoc.id)
                                 .where("examCode", "==", examCode.trim())
                                 .limit(1).get();
                                 
    if (examSnapshot.empty) {
        throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này.`);
    }
    
    const examData = examSnapshot.docs[0].data();
    
    return {
        examType: examData.examType,
        timeLimit: examData.timeLimit,
        keys: examData.keys,
        cores: examData.cores,
        // Chỉ trả về đường dẫn, client sẽ tự lấy URL
        contentStoragePath: examData.contentStoragePath || null,
        solutionStoragePath: examData.solutionStoragePath || null,
    };
});