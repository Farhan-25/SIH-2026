# Feature — Auth, onboarding, and preferences

**Files:**  
`frontend/src/context/AuthContext.jsx`  
`frontend/src/context/UserProfileContext.jsx`  
`frontend/src/context/PreferencesContext.jsx`  
`frontend/src/pages/LoginPage.jsx`  
`frontend/src/pages/OnboardingPage.jsx`  
`frontend/src/App.jsx`

---

## Gate order (`App.jsx`)

1. Path `/` → Landing only (no shell).  
2. Else if no session → Login (signup default).  
3. Else if no profile → Onboarding (ports → routes → cargoes).  
4. Else → sidebar shell; unknown paths redirect to `/dashboard`.

---

## Auth (demo)

- Signup stores `{ name, email, password, createdAt }` in `localStorage` key `freightiq_users`. Password min 4 characters.  
- Login matches email (lowercased) and password.  
- Session: `freightiq_session` + `freightiq_token` = `demo-{email}`. Axios sends `Authorization: Bearer`.  
- Logout clears session and token, not the user list.

**This is not production auth.** Passwords are plaintext in the browser.  
Backend `POST /api/v1/auth/login` only accepts `demo@freightiq.com` / `password123`; the React flow does **not** require that endpoint.

---

## Onboarding / profile

Per email: `freightiq_user_profile:{email}` with `ports`, `routes`, `cargoes`.

Catalogs in `UserProfileContext`:

- 7 East Coast destinations (draft + typical classes + cargoes)  
- 12 trade routes  
- Cargo list including Thermal/Coking coal, iron ore, bauxite, limestone, etc.

Routes offered on step 2 are filtered to selected discharge ports. Settings → **Reconfigure Profile** calls `resetProfile()` and returns the user to onboarding.

Forecast, vessels, and map **filter** to selected ports/routes when the profile is set; they fall back to the full catalog if the filter would be empty.

---

## Theme and currency

| Preference | Storage | Behaviour |
| --- | --- | --- |
| Theme | `freightiq-theme` | `dark` / `light`; sets `document.documentElement.dataset.theme` |
| Currency | `freightiq-currency` | USD or INR; display FX **83.5**, not a live rate |

`formatMoney` / `convertMoney` used on Forecast, Vessels, Strategy, Landing sandbox. Chart tick/grid colors switch with theme.

Header and settings both expose the same toggles.
