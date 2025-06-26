rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    match /users/{userId} {

      allow read, update: if request.auth.uid == userId;
      allow create: if request.auth.uid == userId;
      allow delete: if false;
    }


    match /exams/{examId} {

      allow read, write: if request.auth.uid != null && request.auth.uid == resource.data.teacherId;

    }


    match /classes/{classId} {

      allow read, write: if request.auth.uid != null && request.auth.uid == resource.data.teacherId;

    }


    match /submissions/{submissionId} {

      allow read: if request.auth.uid != null && request.auth.uid == resource.data.teacherId;

      allow write: if false;
    }


    match /{document=**} {
      allow read, write: if false;
    }
  }
}
