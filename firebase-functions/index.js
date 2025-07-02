// ===================================================================
// ==   FIREBASE FUNCTIONS - PHIÊN BẢN HOÀN CHỈNH & ỔN ĐỊNH        ==
// ===================================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require('cors')({origin: true});
// Khởi tạo Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// -------------------------------------------------------------------
// PHẦN 1: CÁC HÀM XÁC THỰC VÀ QUẢN LÝ USER (GIÁO VIÊN)
// -------------------------------------------------------------------

/**
 * Được gọi khi giáo viên đăng nhập lần đầu hoặc các lần sau.
 * Nếu là lần đầu, tạo một record user mới với thời gian dùng thử.
 * Nếu không, trả về dữ liệu user hiện có.
 */
exports.onTeacherSignIn = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    }
    const { uid, email, name } = context.auth.token;
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        // 180 ngày dùng thử cho người dùng mới
        const trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000);
        const newUserProfile = {
            email,
            name: name || email,
            role: "teacher",
            trialEndDate,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            teacherAlias: null
        };
        await userRef.set(newUserProfile);
        return newUserProfile;
    } else {
        return userDoc.data();
    }
});

/**
 * Cập nhật Alias (mã định danh duy nhất) cho giáo viên.
 */
exports.updateTeacherAlias = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    }
    const { uid } = context.auth.token;
    const newAlias = String(data.alias || "").trim().toLowerCase();

    if (!newAlias || newAlias.length < 3 || newAlias.length > 20 || !/^[a-z0-9]+$/.test(newAlias)) {
        throw new functions.https.HttpsError("invalid-argument", "Alias phải từ 3-20 ký tự, chỉ chứa chữ thường và số.");
    }

    const aliasCheck = await db.collection("users").where("teacherAlias", "==", newAlias).limit(1).get();
    if (!aliasCheck.empty && aliasCheck.docs[0].id !== uid) {
        throw new functions.https.HttpsError("already-exists", "Alias này đã có người dùng khác sử dụng.");
    }

    await db.collection("users").doc(uid).update({ teacherAlias: newAlias });
    return { success: true, message: "Cập nhật Alias thành công!" };
});

// -------------------------------------------------------------------
// PHẦN 2: CÁC HÀM CRUD CHO ĐỀ THI (Hợp nhất TEXT và PDF)
// -------------------------------------------------------------------

/**
 * Thêm một đề thi mới (TEXT hoặc PDF).
 */
exports.addExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    
    const { examData } = data;
    if (!examData || !examData.examCode || !examData.keys) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu Mã đề hoặc Đáp án.");
    }

    const newExam = {
        teacherId: context.auth.uid,
        examType: examData.examType || 'TEXT',
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys).split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (newExam.examType === 'TEXT') {
        if (!examData.content) throw new functions.https.HttpsError("invalid-argument", "Đề TEXT cần có nội dung.");
        newExam.content = examData.content;
    } else if (newExam.examType === 'PDF') {
        if (!newExam.examCode.toUpperCase().startsWith('PDF-')) {
            throw new functions.https.HttpsError("invalid-argument", "Mã đề PDF phải bắt đầu bằng 'PDF-'.");
        }
        if (!examData.examPdfUrl) throw new functions.https.HttpsError("invalid-argument", "Đề PDF cần có Link đề thi.");
        newExam.examPdfUrl = examData.examPdfUrl;
        newExam.solutionPdfUrl = examData.solutionPdfUrl || '';
    }

    await db.collection("exams").add(newExam);
    return { success: true, message: "Đã thêm đề thi thành công!" };
});

/**
 * Cập nhật một đề thi đã có (TEXT hoặc PDF).
 */
exports.updateExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    
    const { examId, examData } = data;
    if (!examId || !examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu đề thi.");
    
    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "Bạn không có quyền sửa đề thi này.");
    }
    
    const updatedExam = {
        examType: examData.examType || 'TEXT',
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys).split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (updatedExam.examType === 'TEXT') {
        updatedExam.content = examData.content || '';
        updatedExam.examPdfUrl = admin.firestore.FieldValue.delete();
        updatedExam.solutionPdfUrl = admin.firestore.FieldValue.delete();
    } else if (updatedExam.examType === 'PDF') {
        if (!updatedExam.examCode.toUpperCase().startsWith('PDF-')) {
            throw new functions.https.HttpsError("invalid-argument", "Mã đề PDF phải bắt đầu bằng 'PDF-'.");
        }
        updatedExam.examPdfUrl = examData.examPdfUrl || '';
        updatedExam.solutionPdfUrl = examData.solutionPdfUrl || '';
        updatedExam.content = admin.firestore.FieldValue.delete();
    }
    
    await examRef.update(updatedExam);
    return { success: true, message: "Đã cập nhật đề thi thành công!" };
});

/**
 * Xóa một đề thi.
 */
exports.deleteExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");

    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa đề thi này.");
    }
    await examRef.delete();
    return { success: true, message: "Đã xóa đề thi." };
});

/**
 * Lấy toàn bộ dữ liệu (đề thi, lớp học) cho dashboard của giáo viên.
 */
exports.getTeacherFullData = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { uid } = context.auth.token;

    const examsPromise = db.collection("exams").where("teacherId", "==", uid).get();
    const classesPromise = db.collection("classes").where("teacherId", "==", uid).get();

    const [examsSnapshot, classesSnapshot] = await Promise.all([examsPromise, classesPromise]);
    const exams = examsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const classes = classesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return { exams, classes };
});

/**
 * Lấy chi tiết một đề thi để sửa.
 */
exports.getTeacherFullExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");

    const doc = await db.collection("exams").doc(examId).get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "Không có quyền xem đề thi này.");
    }
    return { id: doc.id, ...doc.data() };
});

// -------------------------------------------------------------------
// PHẦN 3: CÁC HÀM CRUD CHO LỚP HỌC
// -------------------------------------------------------------------

exports.addClass = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { classData } = data;
    if (!classData || !classData.name) throw new functions.https.HttpsError("invalid-argument", "Tên lớp không được trống.");
    await db.collection("classes").add({
        teacherId: context.auth.token.uid,
        name: String(classData.name).trim(),
        students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : [],
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, message: "Đã thêm lớp học thành công!" };
});

exports.updateClass = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { classId, classData } = data;
    if (!classId || !classData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu lớp học.");
    const classRef = db.collection("classes").doc(classId);
    const doc = await classRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.token.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền sửa lớp học này.");
    await classRef.update({
        name: String(classData.name).trim(),
        students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : []
    });
    return { success: true, message: "Đã cập nhật lớp học thành công!" };
});

exports.deleteClass = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { classId } = data;
    if (!classId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID lớp học.");
    const classRef = db.collection("classes").doc(classId);
    const doc = await classRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.token.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa lớp học này.");
    await classRef.delete();
    return { success: true, message: "Đã xóa lớp học." };
});

exports.getTeacherFullClass = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { classId } = data;
    if (!classId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID lớp học.");
    const doc = await db.collection("classes").doc(classId).get();
    if (!doc.exists || doc.data().teacherId !== context.auth.token.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xem lớp học này.");
    return { id: doc.id, ...doc.data() };
});

// -------------------------------------------------------------------
// PHẦN 4: CÁC HÀM CHO HỌC SINH
// -------------------------------------------------------------------

/**
 * Lấy danh sách lớp của một giáo viên (dựa trên Alias).
 */
exports.getClassesForStudent = functions.https.onCall(async (data, context) => {
    const teacherAlias = String(data.teacherAlias).trim().toLowerCase();
    if (!teacherAlias) throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên là bắt buộc.");
    const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
    if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với Alias này.");
    const teacherDoc = teacherSnapshot.docs[0];
    const teacherData = teacherDoc.data();
    const trialEndDateMillis = teacherData.trialEndDate?.toMillis ? teacherData.trialEndDate.toMillis() : new Date(teacherData.trialEndDate).getTime();
    if (!teacherData.trialEndDate || trialEndDateMillis < Date.now()) {
        throw new functions.https.HttpsError("permission-denied", "Tài khoản của giáo viên này đã hết hạn dùng thử.");
    }
    const classesSnapshot = await db.collection("classes").where("teacherId", "==", teacherDoc.id).get();
    const classData = {};
    classesSnapshot.forEach((doc) => { classData[doc.data().name] = doc.data().students || []; });
    return classData;
});

// File: functions/index.js
// THAY THẾ TOÀN BỘ HÀM loadExamForStudent

exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
    const { teacherAlias, examCode } = data;
    if (!teacherAlias || !examCode) throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên và Mã đề là bắt buộc.");
    
    // ... (lấy teacherDoc và examSnapshot giữ nguyên) ...
    const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
    if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
    const teacherDoc = teacherSnapshot.docs[0];
    const examSnapshot = await db.collection("exams")
                                 .where("teacherId", "==", teacherDoc.id)
                                 .where("examCode", "==", examCode.trim())
                                 .limit(1).get();
    if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này.`);
    
    let examData = examSnapshot.docs[0].data();
    
    // === LOGIC NÂNG CẤP: TỰ LẤY NỘI DUNG TỪ STORAGE ===
    if (examData.storageVersion === 2 && examData.contentStoragePath) {
        try {
            const file = storage.bucket().file(examData.contentStoragePath);
            const [contentBuffer] = await file.download();
            examData.content = contentBuffer.toString('utf8');
        } catch (e) {
            console.error(`Không thể tải nội dung từ Storage cho đề ${examCode}:`, e.message);
            throw new functions.https.HttpsError("internal", "Lỗi tải nội dung đề thi từ máy chủ.");
        }
    }

    // Trả về dữ liệu đã được bổ sung content
    return {
        examType: examData.examType || 'TEXT',
        timeLimit: examData.timeLimit || 90,
        keys: examData.keys || [],
        cores: examData.cores || [],
        examPdfUrl: examData.examPdfUrl || null,
        solutionPdfUrl: examData.solutionPdfUrl || null,
        content: examData.content || '', // Bây giờ trường này sẽ luôn có dữ liệu nếu là đề Storage
        storageVersion: examData.storageVersion || 1, 
    };
});
exports.submitExam_GOC = functions.https.onCall(async (data, context) => {
    const { teacherAlias, examCode, studentName, className, answers, isCheating } = data;
    if (!teacherAlias || !examCode || !studentName || !className) throw new functions.https.HttpsError("invalid-argument", "Thiếu thông tin định danh.");
    if (!isCheating && !answers) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu câu trả lời.");

    const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
    if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
    const teacherDoc = teacherSnapshot.docs[0];

    const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode.trim()).limit(1).get();
    if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode}.`);
    const examData = examSnapshot.docs[0].data();
    
    if (isCheating === true) {
        await db.collection("submissions").add({ 
            teacherId: teacherDoc.id, timestamp: admin.firestore.FieldValue.serverTimestamp(), 
            examCode, studentName, className, score: 0, isCheating: true 
        });
        return { score: 0, examData: examData, detailedResults: {} };
    }

    const { keys, cores } = examData;
    if (!Array.isArray(keys) || !Array.isArray(cores)) {
        throw new functions.https.HttpsError("internal", "Dữ liệu đề thi bị lỗi: Keys hoặc Cores không hợp lệ.");
    }
    
    let totalScore = 0;
    const detailedResults = {};

    keys.forEach((key, i) => {
        let questionScore = 0;
        const userAnswer = answers[`q${i}`];
        const coreValue = parseFloat(cores[i]) || 0; 
        
        const questionType = (() => {
            if (typeof key !== 'string') return "Invalid";
            if (key.length === 1 && "ABCD".includes(key.toUpperCase())) return "MC";
            if (/^[TF]+$/i.test(key)) return "TF";
            if (!isNaN(parseFloat(key)) && String(parseFloat(key)) === key.trim()) return "Numeric";
            return "Unknown";
        })();
        
        if (questionType === "MC") {
            if (userAnswer === key) {
                questionScore = coreValue;
            }
        }
        // Thêm logic chấm TF, Numeric ở đây nếu cần

        totalScore += questionScore;
        detailedResults[`q${i}`] = { userAnswer: userAnswer || null, correctAnswer: key, scoreEarned: questionScore, type: questionType };
    });

    await db.collection("submissions").add({ 
        teacherId: teacherDoc.id, 
        timestamp: admin.firestore.FieldValue.serverTimestamp(), 
        examCode, studentName, className, answers,
        score: parseFloat(totalScore.toFixed(2)), 
        isCheating: false 
    });

    return {
        score: parseFloat(totalScore.toFixed(2)),
        examData: { ...examData, keysStr: keys, coreStr: cores },
        detailedResults: detailedResults,
    };
});
// File: functions/index.js

/**
 * [PHIÊN BẢN HOÀN CHỈNH] Nhận bài làm, chấm điểm, lưu CSDL và trả về đầy đủ dữ liệu.
 * - Chấm được câu hỏi trắc nghiệm (MC), điền số (Numeric) và bảng Đúng/Sai (TABLE_TF).
 * - Tự động tải nội dung đề thi từ Storage nếu cần, chỉ trong một lệnh gọi duy nhất.
 * - Xử lý lỗi mạnh mẽ, đảm bảo client luôn nhận được kết quả.
 */
exports.submitExam = functions.runWith({ timeoutSeconds: 60, memory: '256MB' }).https.onCall(async (data, context) => {
    // ---- 1. VALIDATE INPUT ----
    const { teacherAlias, examCode, studentName, className, answers, isCheating } = data;
    if (!teacherAlias || !examCode || !studentName || !className) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu thông tin định danh (giáo viên, mã đề, tên hoặc lớp).");
    }
    if (!isCheating && (answers === undefined || answers === null)) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu câu trả lời.");
    }

    // ---- 2. LẤY DỮ LIỆU TỪ FIRESTORE ----
    const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
    if (teacherSnapshot.empty) {
        throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với mã này.");
    }
    const teacherDoc = teacherSnapshot.docs[0];

    const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode.trim()).limit(1).get();
    if (examSnapshot.empty) {
        throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi '${examCode}' của giáo viên này.`);
    }
    
    // Dùng 'let' để có thể sửa đổi object này sau đó
    let examData = examSnapshot.docs[0].data();
    
    // ---- 3. XỬ LÝ TRƯỜNG HỢP GIAN LẬN ----
    if (isCheating === true) {
        await db.collection("submissions").add({ 
            teacherId: teacherDoc.id, 
            timestamp: admin.firestore.FieldValue.serverTimestamp(), 
            examCode, studentName, className, 
            score: 0, 
            answers: {}, 
            isCheating: true 
        });
        // Trả về dữ liệu trống nhưng vẫn có examData để client biết
        return { score: 0, examData, detailedResults: {} };
    }

    // ---- 4. CHẤM ĐIỂM ----
    const correctKeys = examData.keys || [];
    const cores = examData.cores || [];
    if (correctKeys.length !== cores.length || correctKeys.length === 0) {
        throw new functions.https.HttpsError("internal", "Dữ liệu đề thi bị lỗi: Số lượng đáp án và điểm không khớp hoặc rỗng.");
    }
    
    let totalScore = 0;
    const detailedResults = {};

    for (let i = 0; i < correctKeys.length; i++) {
        const correctAnswer = correctKeys[i];
        const coreValue = parseFloat(cores[i]) || 0;
        const userAnswer = answers[`q${i}`];
        let isCorrect = false;

        if (userAnswer !== undefined && userAnswer !== null) {
            // Xử lý câu MC và Numeric (dạng chuỗi)
            if (typeof userAnswer === 'string') {
                if (userAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) {
                    isCorrect = true;
                }
            } 
            // Xử lý câu TABLE_TF (dạng object)
            else if (typeof userAnswer === 'object' && typeof correctAnswer === 'string') {
                // Ví dụ: userAnswer = {a:'T', b:'F'}, correctAnswer = 'TF'
                const sortedUserAnswerKeys = Object.keys(userAnswer).sort();
                if (sortedUserAnswerKeys.length > 0 && sortedUserAnswerKeys.length === correctAnswer.length) {
                    const constructedAnswerString = sortedUserAnswerKeys.map(key => userAnswer[key]).join('');
                    if (constructedAnswerString.toUpperCase() === correctAnswer.toUpperCase()) {
                        isCorrect = true;
                    }
                }
            }
        }
        
        const questionScore = isCorrect ? coreValue : 0;
        totalScore += questionScore;
        detailedResults[`q${i}`] = { 
            userAnswer: userAnswer || null, 
            correctAnswer: correctAnswer, 
            scoreEarned: questionScore,
        };
    }

    const finalScore = parseFloat(totalScore.toFixed(2));
    
    // ---- 5. LƯU BÀI NỘP VÀO DATABASE ----
    await db.collection("submissions").add({ 
        teacherId: teacherDoc.id, 
        timestamp: admin.firestore.FieldValue.serverTimestamp(), 
        examCode, studentName, className, answers,
        score: finalScore,
        detailedResults: detailedResults,
        isCheating: false 
    });

    // ---- 6. [NÂNG CẤP] TỰ LẤY NỘI DUNG ĐỀ THI TỪ STORAGE NẾU CẦN ----
    if (examData.storageVersion === 2 && examData.contentStoragePath) {
        try {
            console.log(`Đề Storage, đang tải nội dung từ: ${examData.contentStoragePath}`);
            const file = storage.bucket().file(examData.contentStoragePath);
            const [contentBuffer] = await file.download();
            // Gán nội dung trực tiếp vào object examData sẽ được trả về
            examData.content = contentBuffer.toString('utf8');
            console.log("Tải nội dung chi tiết thành công.");
        } catch (e) {
            console.error(`Không thể tải nội dung từ Storage cho đề ${examCode} trong hàm submitExam:`, e.message);
            // Gửi một chuỗi lỗi đặc biệt về cho client để nó biết và hiển thị
            examData.content = `##LỖI## Không thể tải nội dung chi tiết: ${e.message}`;
        }
    }

    // ---- 7. TRẢ VỀ KẾT QUẢ HOÀN CHỈNH ----
    return {
        score: finalScore,
        examData: examData, // examData bây giờ đã được bổ sung 'content' nếu cần
        detailedResults,
    };
});

exports.getPdfFromGitLab = functions.https.onCall(async (data, context) => {
    const gitlabUrl = data.url;
    if (!gitlabUrl || !gitlabUrl.startsWith("https://gitlab.com")) {
        throw new functions.https.HttpsError("invalid-argument", "URL không hợp lệ hoặc không phải từ GitLab.");
    }
    try {
        const response = await axios.get(gitlabUrl, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return { base64Data: base64 };
    } catch (error) {
        console.error("Lỗi khi tải PDF từ GitLab:", error.message);
        throw new functions.https.HttpsError("internal", "Không thể tải file PDF từ GitLab.");
    }
});
// ===================================================================
// ==  HÀM MỚI: XỬ LÝ LINK PDF TỪ GOOGLE DRIVE, DROPBOX...         ==
// ===================================================================

exports.getPdfFromGeneralUrl = functions.https.onCall(async (data, context) => {
    let url = data.url;

    if (!url) {
        throw new functions.https.HttpsError("invalid-argument", "URL không được để trống.");
    }

    // --- XỬ LÝ CHO LINK GOOGLE DRIVE ---
    if (url.includes("drive.google.com")) {
        // Biến đổi link 'view' thành link 'export' để tải trực tiếp
        // Ví dụ: https://drive.google.com/file/d/FILE_ID/view
        //   ->  https://drive.google.com/uc?export=download&id=FILE_ID
        const match = url.match(/file\/d\/([^/]+)/);
        if (match && match[1]) {
            const fileId = match[1];
            url = `https://drive.google.com/uc?export=download&id=${fileId}`;
            console.log("Đã biến đổi URL Google Drive thành:", url);
        } else {
            throw new functions.https.HttpsError("invalid-argument", "Định dạng link Google Drive không hợp lệ.");
        }
    } 
    // --- XỬ LÝ CHO LINK DROPBOX ---
    else if (url.includes("dropbox.com")) {
        // Biến đổi link xem trước của Dropbox thành link tải trực tiếp
        // Ví dụ: https://www.dropbox.com/s/..../file.pdf?dl=0
        //   ->  https://www.dropbox.com/s/..../file.pdf?dl=1
        // Hoặc có thể thay 'www.dropbox.com' bằng 'dl.dropboxusercontent.com'
        if (url.includes("?dl=0")) {
            url = url.replace("?dl=0", "?dl=1");
        } else if (!url.endsWith("?dl=1")) {
            url += "?dl=1";
        }
        console.log("Đã biến đổi URL Dropbox thành:", url);
    }
    // Bạn có thể thêm các điều kiện else if khác cho các dịch vụ khác ở đây

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer'
        });
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return { base64Data: base64 };

    } catch (error) {
        console.error(`Lỗi khi tải PDF từ URL [${url}]:`, error.message);
        throw new functions.https.HttpsError("internal", "Không thể tải file PDF từ URL được cung cấp.");
    }
});

// -------------------------------------------------------------------
// PHẦN 6: CÁC HÀM DÀNH RIÊNG CHO TRANG THỐNG KÊ
// -------------------------------------------------------------------

/**
 * Lấy dữ liệu ban đầu (danh sách đề, lớp) cho các bộ lọc trên trang thống kê.
 */
exports.getStatsInitialData = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Bạn phải đăng nhập.');
    const teacherId = context.auth.uid;
    const examsPromise = db.collection('exams').where('teacherId', '==', teacherId).select('examCode').get();
    const classesPromise = db.collection('classes').where('teacherId', '==', teacherId).select('name').get();
    const [examsSnapshot, classesSnapshot] = await Promise.all([examsPromise, classesPromise]);
    const exams = examsSnapshot.docs.map(doc => doc.data());
    const classes = classesSnapshot.docs.map(doc => doc.data());
    return { exams, classes };
});

/**
 * Hàm xử lý thống kê chính, mạnh mẽ và an toàn.
 */
exports.getExamStatistics = functions.runWith({ timeoutSeconds: 120, memory: '256MB' }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Bạn phải đăng nhập.');
    
    const teacherId = context.auth.uid;
    const { examCode, className, duplicateHandling } = data;

    if (!examCode) throw new functions.https.HttpsError('invalid-argument', 'Mã đề thi là bắt buộc.');
    
    console.log(`Bắt đầu thống kê: Teacher=${teacherId}, Exam=${examCode}, Class=${className}, Handling=${duplicateHandling}`);

    try {
        let query = db.collection('submissions').where('teacherId', '==', teacherId).where('examCode', '==', examCode);
        if (className && className !== 'all') {
            query = query.where('className', '==', className);
        }
        
        const snapshot = await query.orderBy('timestamp', 'desc').get();
        if (snapshot.empty) return { summary: { count: 0 }, filters: data };
        const allSubmissions = snapshot.docs.map(doc => doc.data());

        let filteredSubmissions = [];
        if (duplicateHandling === 'all' || !duplicateHandling) {
            filteredSubmissions = allSubmissions;
        } else {
            const studentSubmissionsMap = new Map();
            for (const sub of allSubmissions) {
                const studentKey = `${sub.studentName || 'N/A'}|${sub.className || 'N/A'}`;
                const existingSub = studentSubmissionsMap.get(studentKey);
                if (!existingSub || (duplicateHandling === 'highest' && (sub.score || 0) > (existingSub.score || 0))) {
                    studentSubmissionsMap.set(studentKey, sub);
                }
            }
            filteredSubmissions = Array.from(studentSubmissionsMap.values());
        }

        if (filteredSubmissions.length === 0) return { summary: { count: 0 }, filters: data };
        
        const examDocSnapshot = await db.collection('exams').where('teacherId', '==', teacherId).where('examCode', '==', examCode).limit(1).get();
        if (examDocSnapshot.empty) throw new functions.https.HttpsError('not-found', `Không tìm thấy đề thi với mã ${examCode}.`);
        const correctKeys = examDocSnapshot.docs[0].data().keys || [];

        let totalScore = 0, highestScore = -1, lowestScore = 11;
        const performanceTiers = { gioi: 0, kha: 0, trungBinh: 0, yeu: 0 };
        const scoreDistribution = { '[0, 2]': 0, '(2, 4]': 0, '(4, 5]': 0, '(5, 6.5]': 0, '(6.5, 8]': 0, '(8, 9]': 0, '(9, 10]': 0 };
        const questionAnalysis = {};
        correctKeys.forEach((key, i) => { questionAnalysis[`q${i}`] = { totalAttempts: 0, correctAttempts: 0, choices: {} }; });

        for (const sub of filteredSubmissions) {
            const score = typeof sub.score === 'number' ? sub.score : 0;
            totalScore += score;
            if (score > highestScore) highestScore = score;
            if (score < lowestScore) lowestScore = score;

            if (score >= 8) performanceTiers.gioi++; else if (score >= 6.5) performanceTiers.kha++; else if (score >= 5.0) performanceTiers.trungBinh++; else performanceTiers.yeu++;
            if (score <= 2) scoreDistribution['[0, 2]']++; else if (score <= 4) scoreDistribution['(2, 4]']++; else if (score <= 5) scoreDistribution['(4, 5]']++; else if (score <= 6.5) scoreDistribution['(5, 6.5]']++; else if (score <= 8) scoreDistribution['(6.5, 8]']++; else if (score <= 9) scoreDistribution['(8, 9]']++; else scoreDistribution['(9, 10]']++;

            for (let i = 0; i < correctKeys.length; i++) {
                const qKey = `q${i}`;
                if (!questionAnalysis[qKey]) continue;
                const userAnswer = (sub.answers && sub.answers[qKey] !== undefined) ? sub.answers[qKey] : null;

                if (userAnswer !== null) {
                    questionAnalysis[qKey].totalAttempts++;
                    const choice = userAnswer === '' ? 'Bỏ trống' : String(userAnswer);
                    questionAnalysis[qKey].choices[choice] = (questionAnalysis[qKey].choices[choice] || 0) + 1;
                    if ((sub.detailedResults && sub.detailedResults[qKey]?.scoreEarned > 0) || (!sub.detailedResults && String(userAnswer) === String(correctKeys[i]))) {
                        questionAnalysis[qKey].correctAttempts++;
                    }
                }
            }
        }
        
        const count = filteredSubmissions.length;
        const average = count > 0 ? totalScore / count : 0;
        filteredSubmissions.sort((a, b) => (b.score || 0) - (a.score || 0));

        console.log(`Thống kê thành công cho ${examCode}. Trả về ${count} bản ghi.`);

        return {
            summary: { count, average, highest: highestScore, lowest: lowestScore },
            scoreDistribution, performanceTiers, detailedSubmissions: filteredSubmissions,
            questionAnalysis, filters: data
        };
    } catch (error) {
        console.error("Lỗi nghiêm trọng trong getExamStatistics:", error);
        throw new functions.https.HttpsError('internal', 'Đã có lỗi xảy ra trên máy chủ khi xử lý thống kê.', error.message);
    }
});

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

// thêm chức năng tận dụng 5G
// =====================================================================
// ==     CÁC HÀM MỚI - DÀNH RIÊNG CHO LUỒNG LƯU TRỮ TRÊN STORAGE    ==
// =====================================================================

// Đảm bảo bạn có các dòng này ở đầu file
const { getStorage } = require("firebase-admin/storage");
const storage = getStorage();

/**
 * [MỚI] Thêm đề thi TEXT và lưu nội dung vào Firebase Storage.
 */
exports.addExamWithStorage = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { uid } = context.auth.token;
    const { examData } = data;
    if (!examData || !examData.examCode || !examData.keys || !examData.content) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu (Mã đề, Đáp án, Nội dung).");
    }

    // 1. Upload nội dung lên Storage
    const fileName = `exam_content/${uid}/${examData.examCode.trim()}_${Date.now()}.txt`;
    const file = storage.bucket().file(fileName);
    await file.save(examData.content, { contentType: 'text/plain; charset=utf-8' });

    // 2. Chuẩn bị dữ liệu để lưu vào Firestore
    const newExam = {
        teacherId: uid,
        examType: 'TEXT',
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys).split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        // Lưu đường dẫn file thay vì nội dung
        contentStoragePath: fileName, 
        // Đánh dấu đây là đề thi thế hệ mới
        storageVersion: 2 
    };

    // 3. Lưu document vào Firestore
    await db.collection("exams").add(newExam);
    return { success: true, message: "Đã thêm đề thi và lưu nội dung lên Storage thành công!" };
});

/**
 * [MỚI] Cập nhật đề thi TEXT có nội dung trên Firebase Storage.
 */
exports.updateExamWithStorage = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { examId, examData } = data;
    if (!examId || !examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu.");

    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "Không có quyền sửa đề thi này.");
    }
    const oldExamData = doc.data();

    // 1. Xóa file content cũ trên Storage nếu có
    if (oldExamData.contentStoragePath) {
        try {
            await storage.bucket().file(oldExamData.contentStoragePath).delete();
        } catch (e) {
            console.warn(`Không thể xóa file cũ: ${oldExamData.contentStoragePath}`, e.message);
        }
    }
    
    // 2. Upload file mới
    const fileName = `exam_content/${context.auth.uid}/${examData.examCode.trim()}_${Date.now()}.txt`;
    const file = storage.bucket().file(fileName);
    await file.save(examData.content, { contentType: 'text/plain; charset=utf-8' });

    // 3. Chuẩn bị dữ liệu cập nhật
    const updatedExam = {
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys).split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        contentStoragePath: fileName,
        storageVersion: 2,
        content: admin.firestore.FieldValue.delete(), // Xóa trường content cũ nếu còn tồn tại
    };

    // 4. Cập nhật Firestore
    await examRef.update(updatedExam);
    return { success: true, message: "Đã cập nhật đề thi trên Storage thành công!" };
});
// File: functions/index.js
// THAY THẾ HOÀN TOÀN HÀM getContentUrl CŨ BẰNG PHIÊN BẢN NÀY

exports.getContentUrl = functions.runWith({ memory: '256MB' }).https.onCall(async (data, context) => {
    // Ghi log ngay khi hàm được gọi, trước cả khi check auth
    console.log("--- getContentUrl CALLED v3 ---");
    console.log("Data received from client:", JSON.stringify(data));

    if (!context.auth) {
        console.error("Authentication check failed. No context.auth.");
        throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    }
    const uid = context.auth.uid;
    const { examId } = data;

    console.log(`User [${uid}] is requesting URL for examId [${examId}]`);

    if (!examId) {
        console.error("Validation failed: examId is missing.");
        throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    }

    try {
        console.log(`Step 1: Accessing Firestore for exam doc: exams/${examId}`);
        const doc = await db.collection("exams").doc(examId).get();

        if (!doc.exists) {
            console.error(`Step 2 Error: Exam doc not found at exams/${examId}`);
            throw new functions.https.HttpsError("not-found", "Không tìm thấy đề thi.");
        }
        const examData = doc.data();
        console.log("Step 2 Success: Found exam doc. TeacherId is", examData.teacherId);

        if (examData.teacherId !== uid) {
            console.error(`Step 3 Error: Permission denied. Doc owner is ${examData.teacherId}, requester is ${uid}`);
            throw new functions.https.HttpsError("permission-denied", "Bạn không có quyền truy cập nội dung này.");
        }
        console.log("Step 3 Success: User is the owner.");

        const path = examData.contentStoragePath;
        if (!path) {
            console.error("Step 4 Error: contentStoragePath is missing in the doc.");
            throw new functions.https.HttpsError("not-found", "Đề thi này không có nội dung trên Storage.");
        }
        console.log(`Step 4 Success: Found storage path: ${path}`);
        
        const file = storage.bucket().file(path);
        console.log("Step 5: Calling file.getSignedUrl(). THIS IS THE CRITICAL STEP.");

        const [downloadURL] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000,
        });

        console.log("Step 6 Success: Signed URL generated. Returning to client.");
        return { contentUrl: downloadURL };

    } catch (error) {
        // GHI LẠI TOÀN BỘ LỖI GỐC
        console.error("!!! CRITICAL ERROR CAUGHT IN getContentUrl !!!");
        console.error("Error Code:", error.code);
        console.error("Error Message:", error.message);
        console.error("Full Error Object:", JSON.stringify(error, null, 2));
        
        throw new functions.https.HttpsError("internal", "Lỗi máy chủ khi lấy URL nội dung. Check a new log.");
    }
});
exports.checkTeacherAccess = functions.https.onRequest((req, res) => {
    // Bọc toàn bộ logic của bạn bằng cors handler
    cors(req, res, async () => {
        // Kiểm tra xem người dùng đã đăng nhập chưa bằng cách xác minh ID token từ header
        if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
            console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.');
            res.status(403).send('Unauthorized: Missing authorization token.');
            return;
        }

        let idToken;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            idToken = req.headers.authorization.split('Bearer ')[1];
        } else {
            res.status(403).send('Unauthorized: Invalid token format.');
            return;
        }
        
        try {
            // Xác thực token và lấy UID
            const decodedIdToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedIdToken.uid; 

            // --- Bắt đầu logic chính của hàm (giữ nguyên từ code cũ) ---
            const userRef = db.collection("users").doc(uid);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                console.error(`User with UID ${uid} not found in Firestore.`);
                // Dùng res.json để trả về object lỗi cho client dễ xử lý
                res.status(404).json({ error: "Không tìm thấy hồ sơ người dùng." });
                return;
            }

            const userData = userDoc.data();
            const trialEndDate = userData.trialEndDate;

            if (!trialEndDate) {
                // Dùng res.json để client nhận được object
                res.status(200).json({ hasAccess: false, daysRemaining: 0 });
                return;
            }

            const trialEndDateMillis = trialEndDate.toMillis();
            const nowMillis = Date.now();
            const daysRemaining = Math.max(0, Math.ceil((trialEndDateMillis - nowMillis) / (1000 * 60 * 60 * 24)));

            // Trả về kết quả thành công dưới dạng JSON
            res.status(200).json({
                hasAccess: nowMillis < trialEndDateMillis,
                daysRemaining: daysRemaining
            });

        } catch (error) {
            console.error('Error while verifying Firebase ID token or getting user data:', error);
            // Dùng res.json để trả về object lỗi
            res.status(403).json({ error: 'Unauthorized: Invalid token or server error.' });
        }
    });
});







// File: functions/index.js

// ... (các hàm cũ của bạn như onTeacherSignIn, addPdfExam, submitExam...) ...

// ==============================================================
// == [MỚI] HÀM CHO ADMIN DASHBOARD                         ==
// ==============================================================

/**
 * [ADMIN FUNCTION] Lấy danh sách người dùng (giáo viên).
 * Chỉ cho phép truy cập bởi một tài khoản admin cụ thể.
 */
exports.adminGetUsers = functions.https.onCall(async (data, context) => {
    // === BẢO MẬT: CHỈ CHO PHÉP ADMIN CỤ THỂ TRUY CẬP ===
    // Thay 'YOUR_ADMIN_EMAIL@gmail.com' bằng email tài khoản Google của bạn (admin)
    const ADMIN_EMAIL = 'nguyensangnhc@gmail.com'; 
    if (!context.auth || context.auth.token.email !== ADMIN_EMAIL) {
        throw new functions.https.HttpsError("permission-denied", "Bạn không có quyền truy cập chức năng này.");
    }

    const usersSnapshot = await db.collection("users").orderBy("email").get();
    const users = [];
    usersSnapshot.forEach(doc => {
        const userData = doc.data();
        // Chuyển đổi Timestamp sang định dạng dễ đọc cho client
        const trialEndDate = userData.trialEndDate ? userData.trialEndDate.toDate().toISOString() : null;
        users.push({
            id: doc.id, // UID của người dùng
            email: userData.email,
            name: userData.name,
            teacherAlias: userData.teacherAlias,
            trialEndDate: trialEndDate, // Dạng chuỗi ISO
            createdAt: userData.createdAt ? userData.createdAt.toDate().toISOString() : null,
            role: userData.role
        });
    });
    return users;
});

/**
 * [ADMIN FUNCTION] Cập nhật ngày hết hạn dùng thử cho một người dùng.
 * Chỉ cho phép truy cập bởi một tài khoản admin cụ thể.
 */
exports.adminUpdateUserTrialDate = functions.https.onCall(async (data, context) => {
    // === BẢO MẬT: CHỈ CHO PHÉP ADMIN CỤ THỂ TRUY CẬP ===
    const ADMIN_EMAIL = 'nguyensangnhc@gmail.com'; // Thay bằng email của bạn
    if (!context.auth || context.auth.token.email !== ADMIN_EMAIL) {
        throw new functions.https.HttpsError("permission-denied", "Bạn không có quyền thực hiện chức năng này.");
    }

    const { userId, newTrialEndDateISO } = data; // newTrialEndDateISO là chuỗi ISO date
    if (!userId || !newTrialEndDateISO) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu User ID hoặc Ngày hết hạn mới.");
    }

    try {
        const newDate = new Date(newTrialEndDateISO);
        if (isNaN(newDate.getTime())) { // Kiểm tra ngày có hợp lệ không
            throw new functions.https.HttpsError("invalid-argument", "Ngày hết hạn không hợp lệ.");
        }
        const newTimestamp = admin.firestore.Timestamp.fromDate(newDate);

        await db.collection("users").doc(userId).update({
            trialEndDate: newTimestamp,
            updatedAt: admin.firestore.FieldValue.serverTimestamp() // Cập nhật thời gian sửa đổi
        });
        return { success: true, message: "Đã cập nhật ngày hết hạn thành công!" };
    } catch (error) {
        console.error("Lỗi cập nhật ngày hết hạn:", error);
        throw new functions.https.HttpsError("internal", `Không thể cập nhật ngày hết hạn: ${error.message}`);
    }
});