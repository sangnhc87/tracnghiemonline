// firebase-functions/index.js (Phiên bản Nâng cấp Hoàn chỉnh - Hỗ trợ KaTeX & Tự động nhận dạng câu)

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * @param {string} rawText Chuỗi văn bản thô từ textarea.
 * @return {{questions: string[], explanations: string[]}} Một object chứa mảng câu hỏi và mảng lời giải.
 */
function parseExamContent(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return { questions: [], explanations: [] };
    }

    const questions = [];
    const explanations = [];
    rawText = rawText.replace(/\r\n/g, '\n');

    const questionStartPattern = /(?:^|\n\s*)([Cc][âĂaA][uUu]|[Bb][àÀaA][iI]|[Qq][uUu][eE][sS][tT][iI][oO][nN])\s*\d+[:.]?/g;

    // Use matchAll to get all occurrences of question starts and their indices.
    const matches = [...rawText.matchAll(questionStartPattern)];

    // 3. If no explicit question patterns are found, treat the entire content as one single question.
    if (matches.length === 0) {
        questions.push(rawText.trim());
        explanations.push('');
        return { questions, explanations };
    }

    // 4. Iterate through the matches to extract each question block.
    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const startIndex = currentMatch.index;

        // The end index for the current block is the start of the next match,
        // or the end of the entire rawText if it's the last question.
        const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : rawText.length;

        // Extract the raw block of text for the current question.
        let block = rawText.substring(startIndex, endIndex).trim();

        // Skip if the block is empty after trimming (e.g., just whitespace between patterns)
        if (!block) continue;

        let questionText = block;
        let explanationText = '';

        // 5. Extract the explanation part from the current question block.
        //    \\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\} : Matches the exact tags and captures content.
        //    [\s\S]*? : Matches any character (including newlines) non-greedily.
        const loigiaiRegex = /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i;
        const matchExplanation = questionText.match(loigiaiRegex);

        if (matchExplanation && matchExplanation[1]) {
            explanationText = matchExplanation[1].trim();
            // Remove the explanation part from the question text to get pure question content.
            questionText = questionText.replace(loigiaiRegex, '').trim();
        }

        // Add the parsed question and its explanation to the respective arrays.
        questions.push(questionText);
        explanations.push(explanationText);
    }

    return { questions, explanations };
}


// --- CÁC HÀM XÁC THỰC & QUẢN LÝ TÀI KHOẢN GIÁO VIÊN ---
exports.onTeacherSignIn = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { uid, email, name } = context.auth.token;
  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    const trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000);
    await userRef.set({ email, name: name || email, role: "teacher", trialEndDate, createdAt: admin.firestore.FieldValue.serverTimestamp(), teacherAlias: null });
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
    throw new functions.https.HttpsError("invalid-argument", "Alias phải từ 3-20 ký tự, chỉ chứa chữ và số.");
  }
  const aliasCheck = await db.collection("users").where("teacherAlias", "==", newAlias).limit(1).get();
  if (!aliasCheck.empty && aliasCheck.docs[0].id !== uid) {
    throw new functions.https.HttpsError("already-exists", "Alias này đã có người dùng khác sử dụng.");
  }
  await db.collection("users").doc(uid).update({ teacherAlias: newAlias });
  return { success: true, message: "Cập nhật Alias thành công!" };
});

// --- CÁC HÀM QUẢN LÝ DỮ LIỆU (CRUD) ---
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

// --- Quản lý Đề thi (ĐÃ NÂNG CẤP) ---
exports.addExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examData } = data;
    if (!examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu đề thi.");
    
    const { questions, explanations } = parseExamContent(examData.content);
    
    if (questions.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Không tìm thấy câu hỏi nào. Hãy chắc chắn bạn đã dùng định dạng 'Câu 1:', 'Bài 2:', v.v...");
    }

    const newExamData = {
        teacherId: context.auth.uid,
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys || "").split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => c.trim()),
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

    const { questions, explanations } = parseExamContent(examData.content);

    if (questions.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Không tìm thấy câu hỏi nào trong nội dung bạn cung cấp.");
    }

    const updatedExamData = {
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys || "").split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => c.trim()),
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
    return { id: doc.id, ...doc.data() };
});

// --- Quản lý Lớp học ---
exports.addClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { classData } = data;
  if (!classData || !classData.name) throw new functions.https.HttpsError("invalid-argument", "Tên lớp không được trống.");
  await db.collection("classes").add({ teacherId: context.auth.uid, name: String(classData.name).trim(), students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : [], createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return { success: true, message: "Đã thêm lớp học thành công!" };
});

exports.updateClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { classId, classData } = data;
  if (!classId || !classData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu lớp học.");
  const classRef = db.collection("classes").doc(classId);
  const doc = await classRef.get();
  if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền sửa lớp học này.");
  await classRef.update({ name: String(classData.name).trim(), students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : [] });
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
  if (!teacherData.trialEndDate || teacherData.trialEndDate.toMillis() < Date.now()) throw new functions.https.HttpsError("permission-denied", "Tài khoản của giáo viên này đã hết hạn dùng thử.");
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
  if (!teacherData.trialEndDate || teacherData.trialEndDate.toMillis() < Date.now()) throw new functions.https.HttpsError("permission-denied", "Tài khoản của giáo viên này đã hết hạn dùng thử.");
  const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode).limit(1).get();
  if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này.`);
  const examData = examSnapshot.docs[0].data();
  const keysArray = Array.isArray(examData.keys) ? examData.keys : [];
  const questionTypes = keysArray.map(k => "ABCD".includes(k) ? "MC" : /^[TF]+$/.test(k) ? "TF" : "Numeric");
  const tfCounts = keysArray.map(k => /^[TF]+$/.test(k) ? k.length : 0);
  return {
    questionTexts: processImagePlaceholders(examData.questionTexts || []),
    timeLimit: examData.timeLimit || 90,
    questionTypes: questionTypes,
    tfCounts: tfCounts,
  };
});

exports.submitExam = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode, studentName, className, answers, isCheating } = data;
  if (!teacherAlias || !examCode || !studentName || !className) throw new functions.https.HttpsError("invalid-argument", "Thiếu thông tin định danh (học sinh, đề thi...).");
  if (!isCheating && !answers) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu câu trả lời của bài làm.");

  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
  const teacherDoc = teacherSnapshot.docs[0];

  if (isCheating === true) {
    await db.collection("submissions").add({ teacherId: teacherDoc.id, timestamp: admin.firestore.FieldValue.serverTimestamp(), examCode, studentName, className, score: 0, isCheating: true });
    return { score: 0, examData: {}, detailedResults: {} };
  }

  const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode).limit(1).get();
  if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} để chấm điểm.`);

  const examData = examSnapshot.docs[0].data();
  const { keys, cores, questionTexts, explanations } = examData;
  const questionTypes = keys.map(k => "ABCD".includes(k) ? "MC" : /^[TF]+$/.test(k) ? "TF" : "Numeric");
  
  let totalScore = 0;
  const detailedResults = {};

  keys.forEach((key, i) => {
    let questionScore = 0;
    const type = questionTypes[i];
    
    if (type === "MC") {
        const userAnswer = answers.answers[`q${i}`];
        if (userAnswer === key) questionScore = parseFloat(cores[i] || 0);
        detailedResults[`q${i}`] = { userAnswer, correctAnswer: key, scoreEarned: questionScore, type };
    } else if (type === "TF") {
        let countCorrect = 0;
        const userSubAnswers = [];
        for (let j = 0; j < key.length; j++) {
            const subAnswer = answers.answers[`q${i}_sub${j}`];
            userSubAnswers.push(subAnswer);
            if (subAnswer === key[j]) countCorrect++;
        }
        const tfScores = (cores[i] || "").split(",").map(x => parseFloat(x));
        if (countCorrect > 0 && countCorrect <= tfScores.length) questionScore = tfScores[countCorrect - 1] || 0;
        detailedResults[`q${i}`] = { userAnswer: userSubAnswers, correctAnswer: key, scoreEarned: questionScore, type };
    } else if (type === "Numeric") {
        const userAnswer = answers.answers[`q${i}`];
        if (Math.abs(parseFloat(userAnswer) - parseFloat(key)) < 1e-9) questionScore = parseFloat(cores[i] || 0);
        detailedResults[`q${i}`] = { userAnswer, correctAnswer: key, scoreEarned: questionScore, type };
    }
    totalScore += questionScore;
  });

  await db.collection("submissions").add({ teacherId: teacherDoc.id, timestamp: admin.firestore.FieldValue.serverTimestamp(), examCode, studentName, className, answers: answers.answers, score: parseFloat(totalScore.toFixed(2)), isCheating: false });

  return {
    score: parseFloat(totalScore.toFixed(2)),
    examData: {
      keysStr: keys,
      coreStr: cores,
      questionTexts: processImagePlaceholders(questionTexts || []),
      explanations: processImagePlaceholders(explanations || []),
      timeLimit: examData.timeLimit,
    },
    detailedResults: detailedResults,
  };
});