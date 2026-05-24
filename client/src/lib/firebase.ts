// Firebase app + Realtime Database singleton.
//
// Same project as SCHEDULE STUDIO (`schedule-studio-2b14f`), reused so the
// phone-staff page can read CDS countdown state without standing up a
// second Firebase instance. The config values here are the public
// client-side config (Firebase publishes these in the JS SDK; security
// is enforced by Realtime Database rules, not by hiding the apiKey).

import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB0g9NU2jHWLgHSpgxyvWjizdloLbkJ_aM",
  authDomain: "schedule-studio-2b14f.firebaseapp.com",
  databaseURL: "https://schedule-studio-2b14f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "schedule-studio-2b14f",
  storageBucket: "schedule-studio-2b14f.firebasestorage.app",
  messagingSenderId: "480145267674",
  appId: "1:480145267674:web:8d1a8e9b11d3ee69613ee3",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const realtimeDb = getDatabase(app);
