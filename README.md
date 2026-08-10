# Full-Stack Architecture & Frontend-Backend Communication Guide

> **Interview Preparation & Learning Guide**  
> Detailed technical breakdown of how the React Frontend communicates with the Express Backend in this AI-Powered Interview Preparation application (`interview-ai-yt`).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Communication Layers (Clean Architecture)](#2-data-communication-layers-clean-architecture)
3. [Authentication & Session Flow (JWT + HTTP-Only Cookies)](#3-authentication--session-flow-jwt--http-only-cookies)
4. [Communication Protocols & Patterns Used](#4-communication-protocols--patterns-used)
   - [Pattern A: Standard JSON Payload Communication](#pattern-a-standard-json-payload-communication)
   - [Pattern B: Multipart Form-Data (File Upload + Text)](#pattern-b-multipart-form-data-file-upload--text)
   - [Pattern C: Binary Blob Stream (PDF Resume Download)](#pattern-c-binary-blob-stream-pdf-resume-download)
5. [Cross-Origin Resource Sharing (CORS) Configuration](#5-cross-origin-resource-sharing-cors-configuration)
6. [Backend Processing Pipelines (PDF Parsing, Gemini AI, Puppeteer)](#6-backend-processing-pipelines-pdf-parsing-gemini-ai-puppeteer)
7. [Top Interview Questions & Architectural Deep-Dives](#7-top-interview-questions--architectural-deep-dives)

---

## 1. Architecture Overview

This project follows a **decoupled Client-Server architecture**:

```
 ┌─────────────────────────────────────────────────────────┐
 │                  REACT 19 FRONTEND                      │
 │   (Vite + React Router 7 + SCSS + Context API + Axios)  │
 └────────────────────────────┬────────────────────────────┘
                              │
                    HTTP REST APIs (JSON / FormData / Blob)
                    CORS Credentials (Cookie-based Auth)
                              │
 ┌────────────────────────────▼────────────────────────────┐
 │                  EXPRESS 5 BACKEND                      │
 │      (Node.js + Mongoose + JWT + Multer + Puppeteer)    │
 └───────┬────────────────────┬────────────────────┬───────┘
         │                    │                    │
 ┌───────▼──────┐    ┌────────▼────────┐  ┌────────▼────────┐
 │   MongoDB    │    │ Google Gemini   │  │   Puppeteer     │
 │   Database   │    │ AI API (GenAI)  │  │   PDF Engine    │
 └──────────────┘    └─────────────────┘  └─────────────────┘
```

* **Frontend**: React 19 single-page application bundled with Vite. Serves user views, manages local & global state, and initiates HTTP calls via Axios.
* **Backend**: Node.js REST API with Express 5. Handles business logic, authentication, file processing, AI calls, and database operations.
* **Database**: MongoDB Atlas using Mongoose ORM for user schema, token blacklisting, and interview strategy reports.
* **Third-Party Services**: Google Gemini AI (`@google/genai`) for structured strategy/resume generation and Chromium (`puppeteer`) for PDF rendering.

---

## 2. Data Communication Layers (Clean Architecture)

The frontend separates concerns into 4 distinct layers:

```
[ View Layer ]        Component (Home.jsx / Login.jsx)
                            │
[ Custom Hooks ]      Hook (useAuth / useInterview)
                            │
[ Context State ]     Provider (AuthProvider / InterviewProvider)
                            │
[ API Service Layer ] Service (auth.api.js / interview.api.js) ──► Axios ──► Backend
```

### Layer Breakdown

1. **Service Layer (`src/features/*/services/*.api.js`)**:
   - Manages Axios instances with default configuration (`baseURL`, `withCredentials: true`).
   - Encapsulates low-level HTTP method calls (`api.post`, `api.get`).
   - Translates JavaScript objects into appropriate HTTP wire formats (`JSON`, `FormData`, `responseType: 'blob'`).

2. **Context Layer (`src/features/*/*.context.jsx`)**:
   - Holds centralized state (`user`, `reports`, `loading`) accessible across components without prop-drilling.

3. **Hook Layer (`src/features/*/hooks/*.js`)**:
   - Bridges UI components and the service layer.
   - Manages asynchronous states (`loading = true/false`), catches errors, and updates Context state upon API response.

4. **View/Component Layer (`src/features/*/pages/*.jsx`)**:
   - Renders UI elements and captures user input.
   - Invokes hook functions without caring about Axios configurations, endpoints, or header formats.

---

## 3. Authentication & Session Flow (JWT + HTTP-Only Cookies)

### End-to-End Auth Lifecycle

```
[ User Inputs Credentials ] ──► Login.jsx ──► handleLogin() ──► auth.api.js
                                                                    │
                                                           POST /api/auth/login
                                                                    │
[ Sets HTTP-Only Cookie ]  ◄── res.cookie('token', jwt) ◄── Express Backend
```

1. **Login Request**: User submits credentials on `Login.jsx`.
2. **JWT Generation**: Express verifies credentials (`bcrypt.compare`), creates a signed JWT using `jsonwebtoken` containing `{ id, username }`, and expires in 1 day.
3. **Cookie Setting**:
   ```javascript
   // Backend: controllers/auth.controller.js
   res.cookie("token", token)
   res.status(200).json({ message: "User loggedIn successfully.", user: ... })
   ```
4. **Cookie Security**: Setting `withCredentials: true` on Axios allows the browser to automatically store and attach the `token` cookie on every subsequent cross-origin request to `http://localhost:3000`.
5. **Route Protection (`authUser` Middleware)**:
   ```javascript
   // Backend: middlewares/auth.middleware.js
   const token = req.cookies.token;
   if (!token) return res.status(401).json({ message: "Token not provided." });

   // Blacklist check
   const isBlacklisted = await tokenBlacklistModel.findOne({ token });
   if (isBlacklisted) return res.status(401).json({ message: "token is invalid" });

   const decoded = jwt.verify(token, process.env.JWT_SECRET);
   req.user = decoded;
   next();
   ```
6. **Logout & Blacklisting**:
   When the user logs out, the backend inserts the active `token` string into the MongoDB `blacklistTokens` collection and clears the browser cookie (`res.clearCookie("token")`).

---

## 4. Communication Protocols & Patterns Used

### Pattern A: Standard JSON Payload Communication
Used for **Login, Register, Get Me, and Fetching Interview Reports**.

* **Frontend Request (`auth.api.js`)**:
  ```javascript
  const response = await api.post('/api/auth/login', { email, password });
  ```
* **Headers**: `Content-Type: application/json`
* **Backend Processing (`express.json()`)**: Express parses the JSON body into `req.body.email` and `req.body.password`.

---

### Pattern B: Multipart Form-Data (File Upload + Text)
Used for **Generating Strategy Reports (`POST /api/interview/`)** which accepts text inputs and an optional PDF resume file.

* **Frontend Request (`interview.api.js`)**:
  ```javascript
  const formData = new FormData();
  formData.append("jobDescription", jobDescription);
  formData.append("selfDescription", selfDescription);
  formData.append("resume", resumeFile); // File Object

  const response = await api.post("/api/interview/", formData, {
      headers: { "Content-Type": "multipart/form-data" }
  });
  ```
* **Backend Processing (`file.middleware.js` + `multer`)**:
  ```javascript
  // Multer stores the uploaded PDF directly in memory buffer (Memory Storage)
  const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024 } // 3MB limit
  });
  ```
* **Parsing Buffer (`interview.controller.js`)**:
  ```javascript
  if (req.file && req.file.buffer) {
      const resumeContent = await (new pdfParse.PDFParse(Uint8Array.from(req.file.buffer))).getText();
      resumeText = resumeContent.text;
  }
  ```

---

### Pattern C: Binary Blob Stream (PDF Resume Download)
Used when downloading a tailored PDF resume (**`POST /api/interview/resume/pdf/:interviewReportId`**).

* **Backend PDF Generation (`ai.service.js` + `puppeteer`)**:
  ```javascript
  // Puppeteer renders Gemini-generated HTML into PDF binary buffer
  const pdfBuffer = await page.pdf({ format: "A4", margin: ... });
  
  res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=resume_${id}.pdf`
  });
  res.send(pdfBuffer);
  ```
* **Frontend Binary Handling (`useInterview.js` + `interview.api.js`)**:
  ```javascript
  // 1. Tell Axios to expect raw binary Blob data instead of JSON
  const response = await api.post(`/api/interview/resume/pdf/${id}`, null, {
      responseType: "blob"
  });

  // 2. Convert binary Blob into temporary browser Object URL
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));

  // 3. Programmatically trigger browser download
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `resume_${id}.pdf`);
  document.body.appendChild(link);
  link.click();
  ```

---

## 5. Cross-Origin Resource Sharing (CORS) Configuration

Because the Frontend runs on port `5173` (Vite) and Backend on port `3000` (Express), cross-origin requests occur.

```javascript
// Backend: src/app.js
app.use(cors({
    origin: "http://localhost:5173", // Must explicitly match frontend origin (no wildcards '*')
    credentials: true                // Enables passing HTTP cookies across domains
}))
```

> **Interview Note**: When `credentials: true` is used in CORS, `origin` **cannot** be set to `*` (wildcard). It must be the explicit URL of the frontend client.

---

## 6. Backend Processing Pipelines (PDF Parsing, Gemini AI, Puppeteer)

```
[ User Input ] ──► Express Route ──► Multer MemoryStorage
                                           │
                                     pdf-parse (Extract Text)
                                           │
                                  Google Gemini 3 Flash
                           (Structured Zod Schema Output)
                                           │
                                     Save to MongoDB
                                           │
                               Puppeteer Headless Chrome
                                (HTML ──► PDF Buffer)
                                           │
                                  Client PDF Download
```

1. **Structured Output Enforcement**:
   The backend uses `zod` and `zod-to-json-schema` to enforce that Gemini AI returns strict, validated JSON for match score, questions, skill gaps, and preparation roadmaps.
   ```javascript
   const response = await ai.models.generateContent({
       model: "gemini-3-flash-preview",
       contents: prompt,
       config: {
           responseMimeType: "application/json",
           responseSchema: zodToJsonSchema(interviewReportSchema)
       }
   });
   ```

---

## 7. Top Interview Questions & Architectural Deep-Dives

### Q1: How does authentication state persist across page reloads in this SPA?
**Answer**: On app load, `App.jsx` initializes `AuthProvider`. Inside `useAuth.js`, a `useEffect` executes `getMe()` which sends a `GET /api/auth/get-me` request to the backend. Because `withCredentials: true` is configured, the browser automatically attaches the HTTP-Only `token` cookie. The backend verifies the token and returns the user object, updating React state.

### Q2: Why use `multer.memoryStorage()` instead of saving files to disk?
**Answer**: Storing files in RAM as Buffers is faster and stateless. Since we only need to extract text from the PDF via `pdf-parse` before passing it to Google Gemini, saving to disk creates unnecessary I/O overhead and requires cleanup/storage management.

### Q3: What is `withCredentials: true` and why is it necessary?
**Answer**: By default, browsers block sending cross-site credentials (cookies, HTTP authorization headers) in CORS requests. Setting `withCredentials: true` on Axios instructs the browser to send cookies with cross-origin requests. Correspondingly, the backend CORS config must specify `credentials: true` and explicit origin `http://localhost:5173`.

### Q4: How do you handle PDF downloading in React without opening a new tab?
**Answer**: We request the endpoint with Axios option `{ responseType: 'blob' }`. Once the server returns the binary stream, we wrap it in a `Blob` object, create an in-memory DOM URL via `window.URL.createObjectURL(blob)`, dynamically create an invisible `<a>` element with the `download` attribute set, programmatically trigger `.click()`, and remove the link.

### Q5: How do you handle token revocation with stateless JWTs?
**Answer**: JWTs are inherently stateless and valid until expiration. To enable immediate logout, this app implements a **Token Blacklist strategy**. Upon logout, the active JWT token string is stored in a MongoDB collection (`blacklistTokens`). The `authUser` middleware queries this collection on every request; if the token exists in the blacklist, the request is rejected with HTTP `401 Unauthorized`.

---

*File generated for interview preparation & codebase architecture reference.*
