// File: functions/stats.js
// PHIÊN BẢN HOÀN CHỈNH - ĐÃ BAO GỒM CÁC KHAI BÁO CẦN THIẾT
// ======================================================================

// --- 1. NẠP CÁC THƯ VIỆN CẦN THIẾT ---
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

// --- 2. CÁC HÀM HELPER (Cần thiết cho file này) ---
// Sao chép các hàm này từ file index.js của bạn
const verifyAuth = (context) => {
    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'Yêu cầu phải được xác thực.');
    }
};

const findNodeById = (nodes, id) => {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.type === 'folder' && Array.isArray(node.children)) {
            const found = findNodeById(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

// --- 3. CÁC CLOUD FUNCTIONS ---

/**
 * Lấy và tổng hợp dữ liệu thống kê ĐỀ THI và KẾT QUẢ HỌC SINH.
 */
exports.getQuizStatistics = onCall({ cors: true, region: "asia-southeast1" }, async (request) => {
    verifyAuth(request);
    const { alias } = request.data;
    if (!alias) throw new HttpsError("invalid-argument", "Thiếu alias.");

    try {
        const teacherDocRef = admin.firestore().collection("teachers").doc(alias);
        const teacherDoc = await teacherDocRef.get();
        if (!teacherDoc.exists) throw new HttpsError("not-found", "Không tìm thấy giáo viên.");
        if (request.auth.uid !== teacherDoc.data().uid) {
            throw new HttpsError("permission-denied", "Không có quyền xem dữ liệu này.");
        }

        const submissionsSnapshot = await teacherDocRef.collection("quizSubmissions").get();
        if (submissionsSnapshot.empty) {
            return { byQuiz: {}, byStudent: {} };
        }

        const submissions = submissionsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                quizId: data.quizId || "unknown_quiz",
                quizName: data.quizName || "Đề thi không tên",
                studentEmail: data.studentEmail || "unknown@email.com",
                studentName: data.studentName || "Học sinh ẩn danh",
                score: typeof data.score === 'number' ? data.score : 0,
                maxScore: typeof data.maxScore === 'number' && data.maxScore > 0 ? data.maxScore : 1,
                timeTaken: typeof data.timeTaken === 'number' ? data.timeTaken : 0,
                submittedAt: (data.submittedAt && typeof data.submittedAt.toDate === 'function')
                    ? data.submittedAt.toDate() : new Date(0),
            };
        });

        // --- Tính toán byQuiz ---
        const byQuiz = {};
        submissions.forEach(sub => {
            const id = sub.quizId;
            if (!byQuiz[id]) { byQuiz[id] = { quizName: sub.quizName, submissionCount: 0, scores: [], avgScore: 0, avgTime: 0, submissions: [] }; }
            byQuiz[id].submissionCount++;
            byQuiz[id].scores.push(sub.score);
            byQuiz[id].submissions.push(sub);
        });
        for (const quizId in byQuiz) {
            const quizStat = byQuiz[quizId];
            const scores = quizStat.scores;
            quizStat.avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
            const times = quizStat.submissions.map(s => s.timeTaken);
            quizStat.avgTime = times.length ? (times.reduce((a, b) => a + b, 0) / times.length) : 0;
        }

        // --- Tính toán byStudent ---
        const byStudent = {};
        submissions.forEach(sub => {
            const email = sub.studentEmail;
            if (!byStudent[email]) { byStudent[email] = { studentName: sub.studentName, submissionCount: 0, quizzesTaken: [], avgScorePercent: 0 }; }
            byStudent[email].submissionCount++;
            byStudent[email].quizzesTaken.push({ quizId: sub.quizId, quizName: sub.quizName, score: sub.score, maxScore: sub.maxScore, submittedAt: sub.submittedAt.toISOString() });
        });
        for (const email in byStudent) {
            const studentStat = byStudent[email];
            const percentages = studentStat.quizzesTaken.map(q => (q.maxScore > 0) ? (q.score / q.maxScore) * 100 : 0);
            studentStat.avgScorePercent = percentages.length ? (percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0;
        }

        return { byQuiz, byStudent };

    } catch (error) {
        logger.error(`Lỗi trong getQuizStatistics (alias: ${alias}):`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Máy chủ đã gặp lỗi khi xử lý thống kê.");
    }
});

/**
 * Lấy dữ liệu đã được xử lý để hiển thị ma trận tiến độ học tập.
 */
exports.getLearningProgress = onCall({ cors: true, region: "asia-southeast1" }, async (request) => {
    verifyAuth(request);
    const { alias } = request.data;
    if (!alias) throw new HttpsError("invalid-argument", "Thiếu alias.");
    
    try {
        const teacherDocRef = admin.firestore().collection("teachers").doc(alias);
        const teacherDoc = await teacherDocRef.get();
        if (!teacherDoc.exists) throw new HttpsError("not-found", "Không tìm thấy giáo viên.");
        if (request.auth.uid !== teacherDoc.data().uid) {
            throw new HttpsError("permission-denied", "Không có quyền xem dữ liệu này.");
        }
        
        const viewLogsSnapshot = await teacherDocRef.collection("viewLogs").get();
        const studentGroups = teacherDoc.data().studentGroups || [];
        const draftsTree = teacherDoc.data().appData?.editorData?.draftsTree || [];

        const allStudents = studentGroups.flatMap(g => g.students || []).sort((a, b) => a.name.localeCompare(b.name));
        
        const allFiles = [];
        const collectFiles = (nodes) => {
            (nodes || []).forEach(node => {
                if (node.type === 'file') allFiles.push({ id: node.id, name: node.name });
                if (node.type === 'folder' && Array.isArray(node.children)) collectFiles(node.children);
            });
        };
        collectFiles(draftsTree);
        
        const viewMatrix = {};
        if (!viewLogsSnapshot.empty) {
            viewLogsSnapshot.docs.forEach(doc => {
                const log = doc.data();
                if (!log.studentEmail || !log.fileId) return;
                if (!viewMatrix[log.studentEmail]) {
                    viewMatrix[log.studentEmail] = {};
                }
                viewMatrix[log.studentEmail][log.fileId] = true;
            });
        }

        return { allStudents, allFiles, viewMatrix };

    } catch (error) {
        logger.error(`Lỗi trong getLearningProgress (alias: ${alias}):`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Lỗi server khi lấy dữ liệu tiến độ.");
    }
});