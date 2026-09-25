# Apple Sign-In — Testing Notes (Bolty)

## Overview
- Endpoint: `POST /api/auth/apple` with body `{ identity_token, name?, email? }`.
- Backend verifies the Apple `identity_token` (RS256) against Apple JWKS (`https://appleid.apple.com/auth/keys`), checking issuer `https://appleid.apple.com` and audience in `APPLE_AUDIENCES`.
- `APPLE_AUDIENCES` (backend/.env) = `com.emergent.utilityanalyzer.irxvru,host.exp.Exponent` (bundle id + Expo Go client).
- On success: upsert user by `apple_sub` (name/email only saved on first sign-in), create a 7-day session in `user_sessions`, return `{ token, session_token, user }`.

## Limitations
- The native Apple button + real identity token can ONLY be tested on a REAL iOS device (Expo Go on iOS, or a native build). Not available on Android, web, or iOS Simulator without an Apple ID.
- Frontend gates the button behind `AppleAuthentication.isAvailableAsync()` (iOS only).

## Automated/backend checks
1. Invalid/malformed `identity_token` → `401`.
2. Missing `APPLE_AUDIENCES` → `500` (guard).
3. Seed a session token in `user_sessions` and call `/api/auth/me` with `Authorization: Bearer <token>` → returns user.
4. Regression: existing email/password (JWT) and Google session flows unaffected.

## Manual device test (owner)
1. Build/run on a real iPhone.
2. Tap "Sign in with Apple", complete Face ID/Touch ID.
3. First sign-in returns name/email once — verify the user is created and lands in the app.
