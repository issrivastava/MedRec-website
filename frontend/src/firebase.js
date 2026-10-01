// Firebase login for MedRec. Fill the VITE_FIREBASE_* vars in .env
// (see .env.example). Until then isFirebaseConfigured is false and the app
// falls back to the built-in local login.
//
// The SDK is loaded LAZILY via loadFirebase() (dynamic import) so its
// ~200KB never lands in the initial bundle — it downloads only when a
// Firebase auth action actually runs. `isFirebaseConfigured` stays
// synchronous (pure env check) so UI gating never needs the SDK.

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId)

let cached = null

export async function loadFirebase() {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured')
  if (cached) return cached
  const [{ initializeApp }, authMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ])
  const app = initializeApp(config)
  const auth = authMod.getAuth(app)
  const googleProvider = new authMod.GoogleAuthProvider()
  // Always show the Google account chooser so shared devices pick the right account.
  googleProvider.setCustomParameters({ prompt: 'select_account' })
  cached = {
    app,
    auth,
    googleProvider,
    signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
    createUserWithEmailAndPassword: authMod.createUserWithEmailAndPassword,
    signInWithPopup: authMod.signInWithPopup,
    signInWithRedirect: authMod.signInWithRedirect,
    getRedirectResult: authMod.getRedirectResult,
    signOut: authMod.signOut,
    onAuthStateChanged: authMod.onAuthStateChanged,
    updateProfile: authMod.updateProfile,
    sendPasswordResetEmail: authMod.sendPasswordResetEmail,
    sendSignInLinkToEmail: authMod.sendSignInLinkToEmail,
    isSignInWithEmailLink: authMod.isSignInWithEmailLink,
    signInWithEmailLink: authMod.signInWithEmailLink,
  }
  return cached
}
