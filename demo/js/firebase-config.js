import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, collection, doc, setDoc, getDoc, getDocs, query, where, addDoc, updateDoc, onSnapshot, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { firebaseConfig } from './config.js';

// Check if credentials are still placeholder templates
const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY_HERE";

let auth = null;
let db = null;

if (isConfigured) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // Enable offline persistence via IndexedDB
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code == 'failed-precondition') {
        console.warn("Firestore persistence failed-precondition: multiple tabs open.");
      } else if (err.code == 'unimplemented') {
        console.warn("Firestore persistence unimplemented: browser not supported.");
      }
    });
  } catch (err) {
    console.error("Firebase initialization failed:", err);
  }
}

export {
  auth,
  db,
  isConfigured,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};
