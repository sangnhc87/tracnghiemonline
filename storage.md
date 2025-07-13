rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Ai cũng có thể xem thông tin giáo viên và danh sách lớp để vào thi
    match /users/{userId} {
      allow read: if true;
      // Chỉ chủ sở hữu mới được cập nhật alias
      allow write: if request.auth.uid == userId;
    }

    match /classes/{classId} {
      allow read: if true;
      // Chỉ chủ sở hữu mới được ghi
      allow write: if request.auth.uid == resource.data.teacherId;
    }

    // Đề thi: Chỉ chủ sở hữu mới được đọc/ghi trực tiếp. 
    // Học sinh sẽ lấy thông qua Cloud Function đã được bảo mật.
    match /exams/{examId} {
      allow read, write: if request.auth.uid == resource.data.teacherId;
    }

    // Bài nộp: Bất kỳ ai cũng có thể tạo (nộp bài), nhưng chỉ giáo viên chủ sở hữu mới được xem.
    match /submissions/{submissionId} {
      allow create: if true; // Cho phép học sinh nộp bài
      allow read, update, delete: if request.auth.uid == resource.data.teacherId;
    }
  }
}