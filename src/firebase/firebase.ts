import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDkW_OadK4Q1q7F5EZQIUIok6UxmDPkTuI",
  authDomain: "enviroclean-app.firebaseapp.com",
  projectId: "enviroclean-app",
  storageBucket: "enviroclean-app.firebasestorage.app",
  messagingSenderId: "459140521063",
  appId: "1:459140521063:web:bece0221c85ec58ef048c2",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
