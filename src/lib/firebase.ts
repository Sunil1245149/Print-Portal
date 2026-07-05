import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD_OhLl6JjkR3QTD5k_6Y5LNlDoirwgV4s",
  authDomain: "capable-world-xpsvl.firebaseapp.com",
  projectId: "capable-world-xpsvl",
  storageBucket: "capable-world-xpsvl.firebasestorage.app",
  messagingSenderId: "962798708329",
  appId: "1:962798708329:web:a537469f63b967189aa4f8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-merchantandcusto-e8122a0c-a66f-437f-9228-51897a5cce0f");
