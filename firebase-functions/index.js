// firebase-functions/index.js (Phiên bản cuối cùng - Đã sửa lỗi và hoàn thiện)

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// --- HÀM HELPER ---

/**
 * [SỬA LỖI] Phân tích content để TÁCH LỜI GIẢI, không làm thay đổi nội dung câu hỏi.
 * @param {string} rawText - Toàn bộ nội dung đề thi từ textarea.
 * @returns {{questions: string[], explanations: string[]}}
 */
function parseContentForExplanations(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return { questions: [], explanations: [] };
    }

    // Tách các câu hỏi dựa trên 2 dòng trống
    const questionBlocks = rawText.trim().split(/\n\s*\n/);
    const questions = [];
    const explanations = [];
    const loigiaiRegex = /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i;

    questionBlocks.forEach(block => {
        let questionText = block;
        let explanationText = '';
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


// --- HÀM XÁC THỰC VÀ QUẢN LÝ USER ---

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
    const { uid } = context.auth;
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


// --- CRUD CHO GIÁO VIÊN ---

exports.getTeacherFullData = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { uid } = context.auth;
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
    
    const { questions, explanations } = parseContentForExplanations(examData.content);
    if (questions.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Nội dung đề thi không được rỗng.");
    }

    const newExamData = {
        teacherId: context.auth.uid,
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
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "Bạn không có quyền sửa đề thi này.");
    }

    const { questions, explanations } = parseContentForExplanations(examData.content);
    if (questions.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Nội dung đề thi không được rỗng.");
    }

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
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa đề thi này.");
    await examRef.delete();
    return { success: true, message: "Đã xóa đề thi." };
});

exports.getTeacherFullExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    const doc = await db.collection("exams").doc(examId).get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xem đề thi này.");
    
    const examData = doc.data();
    if (!examData.content && Array.isArray(examData.questionTexts)) {
        examData.content = examData.questionTexts.map((q, index) => {
            const e = examData.explanations[index];
            if (e && e.trim() !== '') {
                return `${q}\n\\begin{loigiai}\n${e}\n\\end{loigiai}`;
            }
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
        teacherId: context.auth.uid,
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
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền sửa lớp học này.");
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
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa lớp học này.");
    await classRef.delete();
    return { success: true, message: "Đã xóa lớp học." };
});

exports.getTeacherFullClass = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { classId } = data;
    if (!classId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID lớp học.");
    const doc = await db.collection("classes").doc(classId).get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xem lớp học này.");
    return { id: doc.id, ...doc.data() };
});


// --- CÁC HÀM DÀNH CHO HỌC SINH ---

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

exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
    const { teacherAlias, examCode } = data;
    if (!teacherAlias || !examCode) throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên và Mã đề là bắt buộc.");
    
    const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
    if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
    
    const teacherDoc = teacherSnapshot.docs[0];
    const teacherData = teacherDoc.data();

    const trialEndDateMillis = teacherData.trialEndDate?.toMillis ? teacherData.trialEndDate.toMillis() : new Date(teacherData.trialEndDate).getTime();
    if (!teacherData.trialEndDate || trialEndDateMillis < Date.now()) {
        throw new functions.https.HttpsError("permission-denied", "Tài khoản của giáo viên này đã hết hạn dùng thử.");
    }

    const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode).limit(1).get();
    if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này.`);
    
    const examData = examSnapshot.docs[0].data();
    const keysArray = Array.isArray(examData.keys) ? examData.keys : [];
    
    const questionTypes = keysArray.map(k => {
        if (typeof k !== 'string') return "Invalid"; 
        if (k.length === 1 && "ABCD".includes(k.toUpperCase())) return "MC";
        if (/^[TF]+$/i.test(k)) return "TF";
        if (!isNaN(parseFloat(k)) && String(parseFloat(k)) === k.trim()) return "Numeric"; 
        return "Unknown";
    });
    
    const tfCounts = keysArray.map(k => (typeof k === 'string' && /^[TF]+$/i.test(k)) ? k.length : 0);
    
    return {
        content: examData.content || '', 
        explanations: examData.explanations || [], 
        timeLimit: examData.timeLimit || 90,
        questionTypes: questionTypes,
        tfCounts: tfCounts,
    };
});

exports.submitExam = functions.https.onCall(async (data, context) => {
    const { teacherAlias, examCode, studentName, className, answers, isCheating } = data;
    if (!teacherAlias || !examCode || !studentName || !className) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu thông tin định danh.");
    }
    if (!isCheating && !answers) {
        throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu câu trả lời.");
    }

    const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
    if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
    const teacherDoc = teacherSnapshot.docs[0];

    const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode).limit(1).get();
    if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode}.`);
    const examData = examSnapshot.docs[0].data();
    
    if (isCheating === true) {
        await db.collection("submissions").add({ 
            teacherId: teacherDoc.id, timestamp: admin.firestore.FieldValue.serverTimestamp(), 
            examCode, studentName, className, score: 0, isCheating: true 
        });
        return { 
            score: 0, 
            examData: {
                content: examData.content || '',
                explanations: examData.explanations || [],
                keysStr: examData.keys || [],
                coreStr: examData.cores || []
            }, 
            detailedResults: {}
        };
    }

    const { keys, cores, content, explanations } = examData;
    const questionCount = content.trim().split(/\n\s*\n/).length;

    if (!Array.isArray(keys) || !Array.isArray(cores) || keys.length !== questionCount) {
        throw new functions.https.HttpsError("internal", "Dữ liệu đề thi bị lỗi: Số lượng Keys hoặc Cores không khớp với số câu hỏi.");
    }

    const questionTypes = keys.map(k => {
        if (typeof k !== 'string') return "Invalid";
        if (k.length === 1 && "ABCD".includes(k.toUpperCase())) return "MC";
        if (/^[TF]+$/i.test(k)) return "TF";
        if (!isNaN(parseFloat(k)) && String(parseFloat(k)) === k.trim()) return "Numeric";
        return "Unknown";
    });
    
    let totalScore = 0;
    const detailedResults = {};

    keys.forEach((key, i) => {
        let questionScore = 0;
        const type = questionTypes[i];
        const coreValue = parseFloat(cores[i]) || 0; 
        
        if (type === "MC") {
            const userAnswer = answers[`q${i}`];
            if (userAnswer === key) {
                questionScore = coreValue;
            }
            detailedResults[`q${i}`] = { userAnswer: userAnswer || "", correctAnswer: key, scoreEarned: questionScore, type };
        } else if (type === "TF") {
            let countCorrect = 0;
            const userSubAnswers = [];
            const tfCoreValues = (cores[i] || "").split(",").map(x => parseFloat(x)).filter(n => !isNaN(n)); 
            for (let j = 0; j < key.length; j++) {
                const subAnswer = answers[`q${i}_sub${j}`];
                userSubAnswers.push(subAnswer);
                if (subAnswer === key[j]) {
                    countCorrect++;
                }
            }
            if (countCorrect > 0 && countCorrect <= tfCoreValues.length) {
                questionScore = tfCoreValues[countCorrect - 1];
            } else if (countCorrect > tfCoreValues.length && tfCoreValues.length > 0) {
                questionScore = tfCoreValues[tfCoreValues.length - 1];
            }
            detailedResults[`q${i}`] = { userAnswer: userSubAnswers, correctAnswer: key, scoreEarned: questionScore, type };
        } else if (type === "Numeric") {
            const userAnswer = answers[`q${i}`];
            const parsedUserAnswer = parseFloat(userAnswer);
            const parsedCorrectAnswer = parseFloat(key);
            if (!isNaN(parsedUserAnswer) && !isNaN(parsedCorrectAnswer) && Math.abs(parsedUserAnswer - parsedCorrectAnswer) < 1e-9) {
                questionScore = coreValue;
            }
            detailedResults[`q${i}`] = { userAnswer: userAnswer || "", correctAnswer: key, scoreEarned: questionScore, type };
        } else {
            detailedResults[`q${i}`] = { userAnswer: answers[`q${i}`] || "", correctAnswer: key, scoreEarned: 0, type: type };
        }
        totalScore += questionScore;
    });

    await db.collection("submissions").add({ 
        teacherId: teacherDoc.id, 
        timestamp: admin.firestore.FieldValue.serverTimestamp(), 
        examCode, 
        studentName, 
        className, 
        answers: answers,
        score: parseFloat(totalScore.toFixed(2)), 
        isCheating: false 
    });

    return {
        score: parseFloat(totalScore.toFixed(2)),
        examData: { 
            content: content || '',
            keysStr: keys,
            coreStr: cores,
            explanations: explanations || [],
            timeLimit: examData.timeLimit,
            questionTypes: questionTypes,
        },
        detailedResults: detailedResults,
    };
});