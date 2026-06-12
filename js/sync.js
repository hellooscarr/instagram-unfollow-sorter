/*
 * Cross-device sync via Firebase Firestore.
 *
 * There's no real user-account system here — instead, like the PANAM FC
 * bracket app, you pick a "sync code" (a passphrase only you know). The
 * code is hashed into a document ID, and your sorter state (the list of
 * non-reciprocal follows + your keep/unfollow decisions) is stored under
 * that ID. Enter the same code on another device to pick up where you
 * left off.
 *
 * Note: this means your follow/following usernames and decisions DO get
 * stored in this project's Firestore database (so they can sync across
 * devices) — they are no longer purely local-only. Nothing is ever sent
 * to Instagram, and only someone with your exact sync code could read or
 * write that document.
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDJGBCJ2N8RXIkKayQ4j_XpkIHka4zovBQ",
  authDomain: "project-unfollow-f6ad2.firebaseapp.com",
  projectId: "project-unfollow-f6ad2",
  storageBucket: "project-unfollow-f6ad2.firebasestorage.app",
  messagingSenderId: "963864285194",
  appId: "1:963864285194:web:f45bdbc53a1c0d4bbacff3"
};

const Sync = (() => {
  let db = null;

  function init() {
    if (db) return db;
    if (typeof firebase === 'undefined') return null;
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    return db;
  }

  // Simple deterministic string hash (same approach as the PANAM FC app).
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  function idFromCode(code) {
    const normalized = code.trim().toLowerCase().replace(/\s+/g, ' ');
    return 'sorter_' + hashStr(normalized);
  }

  async function load(id) {
    const database = init();
    if (!database) return null;
    const doc = await database.collection('sorters').doc(id).get();
    return doc.exists ? doc.data() : null;
  }

  async function save(id, data) {
    const database = init();
    if (!database) throw new Error('Firebase not available');
    await database.collection('sorters').doc(id).set(
      Object.assign({}, data, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }),
      { merge: true }
    );
  }

  async function clear(id) {
    const database = init();
    if (!database) return;
    await database.collection('sorters').doc(id).delete();
  }

  return { idFromCode, load, save, clear };
})();
