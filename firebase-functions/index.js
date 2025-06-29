// ===================================================================
// ==   FIREBASE FUNCTIONS - PHIÊN BẢN HOÀN CHỈNH & ỔN ĐỊNH        ==
// ===================================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

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

/**
 * Lấy dữ liệu của một đề thi để học sinh bắt đầu làm bài.
 */
exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
    const { teacherAlias, examCode } = data;
    if (!teacherAlias || !examCode) throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên và Mã đề là bắt buộc.");
    
    const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
    if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
    
    const teacherDoc = teacherSnapshot.docs[0];
    const examSnapshot = await db.collection("exams")
                                 .where("teacherId", "==", teacherDoc.id)
                                 .where("examCode", "==", examCode.trim())
                                 .limit(1).get();
                                 
    if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này.`);
    
    const examData = examSnapshot.docs[0].data();
    
    return {
        examType: examData.examType || 'TEXT',
        content: examData.content || '', 
        timeLimit: examData.timeLimit || 90,
        keysStr: examData.keys || [],
        coresStr: examData.cores || [],
        examPdfUrl: examData.examPdfUrl || null,
        solutionPdfUrl: examData.solutionPdfUrl || null,
    };
});

/**
 * Nhận bài làm của học sinh, chấm điểm và lưu vào CSDL.
 */
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
// ===================================================================
// ==           HÀM NÂNG CẤP: submitExam                        ==
// ===================================================================

/**
 * [NÂNG CẤP] Nhận bài làm của học sinh, chấm điểm và lưu vào CSDL.
 * Có khả năng chấm câu hỏi TABLE_TF dưới dạng object.
 */
exports.submitExam = functions.https.onCall(async (data, context) => {
    const { teacherAlias, examCode, studentName, className, answers, isCheating } = data;
    if (!teacherAlias || !examCode || !studentName || !className) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu thông tin định danh.");
    }
    if (!isCheating && (answers === undefined || answers === null)) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu câu trả lời.");
    }

    const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
    if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
    const teacherDoc = teacherSnapshot.docs[0];

    const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode.trim()).limit(1).get();
    if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode}.`);
    const examData = examSnapshot.docs[0].data();
    
    if (isCheating === true) {
        await db.collection("submissions").add({ 
            teacherId: teacherDoc.id, timestamp: admin.firestore.FieldValue.serverTimestamp(), 
            examCode, studentName, className, score: 0, answers: {}, isCheating: true 
        });
        return { score: 0, examData, detailedResults: {} };
    }

    const correctKeys = examData.keys || [];
    const cores = examData.cores || [];
    if (correctKeys.length !== cores.length) {
        throw new functions.https.HttpsError("internal", "Dữ liệu đề thi bị lỗi: Số lượng đáp án và điểm không khớp.");
    }
    
    let totalScore = 0;
    const detailedResults = {};

    for (let i = 0; i < correctKeys.length; i++) {
        const correctAnswer = correctKeys[i];
        const coreValue = parseFloat(cores[i]) || 0;
        const userAnswer = answers[`q${i}`];
        let questionScore = 0;
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
                // Giả định correctAnswer là một chuỗi như 'TFFT'
                // và userAnswer là một object như {a: 'T', b: 'F', c: 'F', d: 'T'}
                
                const sortedUserAnswerKeys = Object.keys(userAnswer).sort();
                if (sortedUserAnswerKeys.length === correctAnswer.length) {
                    let constructedAnswerString = sortedUserAnswerKeys.map(key => userAnswer[key]).join('');
                    if (constructedAnswerString.toUpperCase() === correctAnswer.toUpperCase()) {
                        isCorrect = true;
                    }
                }
            }
        }
        
        if (isCorrect) {
            questionScore = coreValue;
        }

        totalScore += questionScore;
        detailedResults[`q${i}`] = { 
            userAnswer: userAnswer || null, 
            correctAnswer: correctAnswer, 
            scoreEarned: questionScore,
        };
    }

    const finalScore = parseFloat(totalScore.toFixed(2));
    
    await db.collection("submissions").add({ 
        teacherId: teacherDoc.id, 
        timestamp: admin.firestore.FieldValue.serverTimestamp(), 
        examCode, studentName, className, answers,
        score: finalScore,
        detailedResults: detailedResults, // Rất quan trọng cho việc thống kê sau này
        isCheating: false 
    });

    return {
        score: finalScore,
        examData,
        detailedResults,
    };
});
// -------------------------------------------------------------------
// PHẦN 5: CÁC HÀM TIỆN ÍCH (PROXY LẤY PDF)
// -------------------------------------------------------------------

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