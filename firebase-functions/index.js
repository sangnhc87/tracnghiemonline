// firebase-functions/index.js (PHIÊN BẢN CUỐI CÙNG - TÁCH BIỆT HOÀN TOÀN)

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// -------------------------------------------------------------------
// --- PHẦN 1: CÁC HÀM CHO HỆ THỐNG CŨ (ĐỀ THI DẠNG TEXT) ---
// --- CÁC HÀM NÀY ĐƯỢC GIỮ NGUYÊN ĐỂ ĐẢM BẢO AN TOÀN ---
// -------------------------------------------------------------------

function parseContentForExplanations(rawText) {
    if (!rawText || typeof rawText !== 'string') return { questions: [], explanations: [] };
    const questionBlocks = rawText.trim().split(/\n\s*\n/);
    const questions = [], explanations = [];
    const loigiaiRegex = /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i;
    questionBlocks.forEach(block => {
        let questionText = block, explanationText = '';
        const matchExplanation = block.match(loigiaiRegex);
        if (matchExplanation) {
            explanationText = matchExplanation[1].trim();
            questionText = block.replace(loigiaiRegex, '').trim();
        }
        questions.push(questionText);
        explanations.push(explanationText);
    });
    return { questions, explanations };
}

exports.onTeacherSignIn = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { uid, email, name } = context.auth.token;
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        const trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000); // 180 ngày
        await userRef.set({
            email,
            name: name || email,
            role: "teacher",
            trialEndDate,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            teacherAlias: null
        });
        return { trialEndDate: trialEndDate.toDate().toISOString(), teacherAlias: null };
    } else {
        const existingData = userDoc.data();
        if (existingData.trialEndDate && !(existingData.trialEndDate instanceof admin.firestore.Timestamp)) {
            existingData.trialEndDate = admin.firestore.Timestamp.fromDate(new Date(existingData.trialEndDate));
        }
        return existingData;
    }
});

exports.updateTeacherAlias = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { uid } = context.auth.token;
    const newAlias = String(data.alias).trim().toLowerCase();
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

exports.addExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examData } = data;
    if (!examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu đề thi.");
    if (examData.examType && examData.examType !== 'TEXT') {
        throw new functions.https.HttpsError("invalid-argument", "Hàm này chỉ dành cho đề thi loại TEXT.");
    }
    const { questions, explanations } = parseContentForExplanations(examData.content);
    if (questions.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Nội dung đề thi không được rỗng.");
    }
    const newExamData = {
        teacherId: context.auth.token.uid,
        examType: 'TEXT',
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys || "").split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => c.trim()),
        content: examData.content.trim(),
        questionTexts: questions,
        explanations: explanations,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("exams").add(newExamData);
    return { success: true, message: `Đã thêm thành công ${questions.length} câu hỏi!` };
});

exports.updateExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examId, examData } = data;
    if (!examId || !examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu đề thi.");
    
    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.token.uid) {
        throw new functions.https.HttpsError("permission-denied", "Bạn không có quyền sửa đề thi này.");
    }
    if (examData.examType && examData.examType !== 'TEXT') {
        throw new functions.https.HttpsError("invalid-argument", "Hàm này chỉ dành cho đề thi loại TEXT.");
    }
    const { questions, explanations } = parseContentForExplanations(examData.content);
    if (questions.length === 0) throw new functions.https.HttpsError("invalid-argument", "Nội dung đề thi không được rỗng.");

    const updatedExamData = {
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys || "").split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => c.trim()),
        content: examData.content.trim(),
        questionTexts: questions,
        explanations: explanations,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await examRef.update(updatedExamData);
    return { success: true, message: `Đã cập nhật thành công ${questions.length} câu hỏi!` };
});

exports.deleteExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.token.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa đề thi này.");
    await examRef.delete();
    return { success: true, message: "Đã xóa đề thi." };
});

exports.getTeacherFullExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    const doc = await db.collection("exams").doc(examId).get();
    if (!doc.exists || doc.data().teacherId !== context.auth.token.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xem đề thi này.");
    const examData = doc.data();
    if (!examData.content && Array.isArray(examData.questionTexts)) {
        examData.content = examData.questionTexts.map((q, index) => {
            const e = examData.explanations[index];
            if (e && e.trim() !== '') return `${q}\n\\begin{loigiai}\n${e}\n\\end{loigiai}`;
            return q;
        }).join('\n\n');
    }
    return { id: doc.id, ...examData };
});

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

exports.submitExam = functions.https.onCall(async (data, context) => {
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

// -------------------------------------------------------------------
// --- PHẦN 2: CÁC HÀM MỚI DÀNH RIÊNG CHO HỆ THỐNG PDF ---
// -------------------------------------------------------------------

exports.addPdfExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { uid } = context.auth.token;
    const { examData } = data;
    if (!examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu.");
    
    const examCode = String(examData.examCode || "").trim();
    if (!examCode.toUpperCase().startsWith('PDF-')) {
        throw new functions.https.HttpsError("invalid-argument", "Mã đề PDF phải bắt đầu bằng 'PDF-'.");
    }

    const newPdfExam = {
        teacherId: uid,
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

exports.getSinglePdfExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    const doc = await db.collection("exams").doc(examId).get();
    if (!doc.exists || doc.data().teacherId !== context.auth.token.uid) {
        throw new functions.https.HttpsError("permission-denied", "Không có quyền xem đề thi này.");
    }
    return { id: doc.id, ...doc.data() };
});

exports.updatePdfExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { examId, examData } = data;
    if (!examId || !examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu.");
    
    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.token.uid) {
        throw new functions.https.HttpsError("permission-denied", "Không có quyền sửa đề thi này.");
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

exports.deletePdfExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.token.uid || doc.data().examType !== 'PDF') {
        throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa hoặc đây không phải đề PDF.");
    }
    await examRef.delete();
    return { success: true, message: "Đã xóa đề thi PDF." };
});

// -------------------------------------------------------------------
// --- PHẦN 3: HÀM CHUNG CHO CẢ HAI HỆ THỐNG ---
// -------------------------------------------------------------------

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


// Dán hàm này vào cuối file firebase-functions/index.js

const axios = require("axios"); // Thêm dòng này vào đầu file nếu chưa có

// [MỚI] Hàm này hoạt động như một proxy để lấy file PDF từ GitLab
exports.getPdfFromGitLab = functions.https.onCall(async (data, context) => {
    const gitlabUrl = data.url;

    if (!gitlabUrl || !gitlabUrl.startsWith("https://gitlab.com")) {
        throw new functions.https.HttpsError("invalid-argument", "URL không hợp lệ hoặc không phải từ GitLab.");
    }

    try {
        // Dùng axios để tải file PDF dưới dạng một array buffer
        const response = await axios.get(gitlabUrl, {
            responseType: 'arraybuffer'
        });

        // Chuyển đổi buffer thành chuỗi base64
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        
        // Trả về dữ liệu base64 cho client
        return { base64Data: base64 };

    } catch (error) {
        console.error("Lỗi khi tải PDF từ GitLab:", error);
        throw new functions.https.HttpsError("internal", "Không thể tải file PDF từ GitLab.", error.message);
    }
});



// Thêm vào file functions/index.js

// Hàm 1: Lấy danh sách đề thi và lớp học để đổ vào bộ lọc
exports.getStatsInitialData = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Bạn phải đăng nhập.');
    }
    const teacherId = context.auth.uid;

    const examsPromise = db.collection('exams')
        .where('teacherId', '==', teacherId)
        .select('examCode').get();
        
    const classesPromise = db.collection('classes')
        .where('teacherId', '==', teacherId)
        .select('name').get();

    const [examsSnapshot, classesSnapshot] = await Promise.all([examsPromise, classesPromise]);

    const exams = examsSnapshot.docs.map(doc => doc.data());
    const classes = classesSnapshot.docs.map(doc => doc.data());

    return { exams, classes };
});

// Hàm 2: Hàm xử lý dữ liệu thống kê chính
// Thay thế toàn bộ hàm getExamStatistics cũ bằng hàm này
exports.getExamStatistics = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Bạn phải đăng nhập.');
    }
    const teacherId = context.auth.uid;
    const { examCode, className } = data;

    if (!examCode) {
        throw new functions.https.HttpsError('invalid-argument', 'Mã đề thi là bắt buộc.');
    }

    let query = db.collection('submissions')
        .where('teacherId', '==', teacherId)
        .where('examCode', '==', examCode);

    if (className && className !== 'all') {
        query = query.where('className', '==', className);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
        return { 
            summary: { count: 0 },
            filters: { examCode, className }
        };
    }
    
    let totalScore = 0;
    let highestScore = -1;
    let lowestScore = 11;
    const detailedSubmissions = [];

    // Dữ liệu cho biểu đồ phổ điểm (chi tiết)
    const scoreDistribution = {
        '[0, 2]': 0, '(2, 4]': 0, '(4, 5]': 0, '(5, 6.5]': 0, 
        '(6.5, 8]': 0, '(8, 9]': 0, '(9, 10]': 0
    };
    
    // Dữ liệu cho biểu đồ phân loại (tổng quan)
    const performanceTiers = {
        gioi: 0,   // >= 8.0
        kha: 0,    // [6.5, 8.0)
        trungBinh: 0, // [5.0, 6.5)
        yeu: 0     // < 5.0
    };

    snapshot.forEach(doc => {
        const sub = doc.data();
        const score = sub.score;

        totalScore += score;
        if (score > highestScore) highestScore = score;
        if (score < lowestScore) lowestScore = score;
        detailedSubmissions.push(sub);

        // Phân loại phổ điểm chi tiết
        if (score <= 2) scoreDistribution['[0, 2]']++;
        else if (score <= 4) scoreDistribution['(2, 4]']++;
        else if (score <= 5) scoreDistribution['(4, 5]']++;
        else if (score <= 6.5) scoreDistribution['(5, 6.5]']++;
        else if (score <= 8) scoreDistribution['(6.5, 8]']++;
        else if (score <= 9) scoreDistribution['(8, 9]']++;
        else scoreDistribution['(9, 10]']++;

        // Phân loại kết quả tổng quan
        if (score >= 8) performanceTiers.gioi++;
        else if (score >= 6.5) performanceTiers.kha++;
        else if (score >= 5.0) performanceTiers.trungBinh++;
        else performanceTiers.yeu++;
    });

    const count = snapshot.size;
    const average = count > 0 ? totalScore / count : 0;
    
    detailedSubmissions.sort((a, b) => b.score - a.score);

    return {
        summary: { count, average, highest: highestScore, lowest: lowestScore },
        scoreDistribution,
        performanceTiers, // <-- Trả về dữ liệu mới
        detailedSubmissions,
        filters: { examCode, className }
    };
});