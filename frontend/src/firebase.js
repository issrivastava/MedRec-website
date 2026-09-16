// Firebase login for MedRec. Fill the VITE_FIREBASE_* vars in .env
// (see .env.example). Until then isFirebaseConfigured is false and the app
// falls back to the built-in local login.
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId)

let app = null
let auth = null
if (isFirebaseConfigured) {
  app = initializeApp(config)
  auth = getAuth(app)
}

export { app, auth }
export const googleProvider = new GoogleAuthProvider()
