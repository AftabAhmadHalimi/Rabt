Rabط – Bulk Email System (Namecheap SMTP)
=======================================================

This project is a small bulk email system that uses **Namecheap Private Email (SMTP)** to send messages to many recipients at once. You upload a `.txt` file with one email address per line, write your email subject and content, and the system sends the email to all valid addresses while showing delivery logs on the frontend.

--------------------------------------------------------
1. Features
--------------------------------------------------------
- **TXT file upload**: Upload a `.txt` file that contains one email per line.
- **Per-recipient sending with delay**:
  - Each valid email address gets its **own SMTP send** (no BCC batching).
  - A **5 second delay** is applied between each recipient to throttle sending.
  - Simple rate limiting by max emails/hour.
- **Rich text frontend UI**:
  - Modern dark web page for:
    - selecting your `.txt` list
    - editing the email body in a **WYSIWYG editor** (bold, italic, underline, lists, highlight color `#F8843F`)
    - editing a separate **rich text signature** section
    - optionally selecting an **inline image** (embedded in the HTML) and
    - optionally attaching **documents** (PDF, Word, Excel, PowerPoint, TXT)
  - Live delivery log table shows per-recipient status.
- **Validation & logging**:
  - Invalid email addresses are detected and not sent.
  - Response includes which addresses were valid/invalid.
- **Basic anti‑spam care**:
  - Clean HTML wrapper template.
  - Plain‑text version is also sent.
  - Suggests short, clear messages with unsubscribe note.

--------------------------------------------------------
2. Project Structure (important files)
--------------------------------------------------------
- `server.js`
  - Creates the Express server.
  - Sets up CORS, JSON/body parsing, and serves static files from `public/`.
  - Mounts API routes under `/api/email`.

- `config/emailConfig.js`
  - Loads SMTP configuration from environment variables.
  - Exposes `host`, `port`, `secure`, `auth.user`, `auth.pass`, `fromName`, `rateLimit`, `bccLimit`.

- `services/NamecheapEmailService.js`
  - Creates a Nodemailer transporter using `emailConfig`.
  - `sendBulkEmail(recipients, subject, htmlContent, imageAttachment?, extraAttachments?)`:
    - Checks a simple rate limit (emails/hour).
    - Validates emails and filters out invalid ones.
    - Ensures the recipients do not exceed `bccLimit`.
    - Wraps HTML with the template from `utils/emailTemplates.js`.
    - Generates a plain‑text version by stripping HTML tags and converting `<br>`/paragraphs to line breaks.
    - For **each recipient individually**:
      - Builds a `mailOptions` object.
      - Adds an **inline image** attachment (by `cid`) if provided.
      - Adds any extra document attachments if provided.
      - Sends the email via Nodemailer.
      - Waits **5 seconds** before sending to the next recipient.
    - Returns `{ success, recipientsCount, timestamp, sandbox, results[] }` where `results` contains recipient + messageId.
  - `testConnection()` verifies SMTP connection.

- `utils/emailTemplates.js`
  - `wrapEmailTemplate(content)`
    - Wraps your content inside a styled HTML layout (Sand Box branding).

- `routes/emailRoutes.js`
  - Configures Express router for `/api/email`:
    - `POST /api/email/send-bulk` → `emailController.sendBulkEmail` (JSON recipients array).
    - `POST /api/email/send-from-file` → `emailController.sendBulkEmailFromFile` (TXT file upload).
    - `GET /api/email/test-connection` → `emailController.testConnection`.
  - Uses `multer` (memory storage) to accept:
    - one `.txt` file under the field name `recipientsFile`
    - an optional inline image under `image`
    - optional extra document attachments under `attachments` (PDF, Word, Excel, PowerPoint, TXT).

- `controllers/emailController.js`
  - `sendBulkEmail(req, res)`:
    - Expects JSON: `{ recipients: string[], subject: string, htmlContent: string }`.
    - Validates that recipients, subject, and content are present and long enough.
    - Calls `NamecheapEmailService.sendBulkEmail(...)` and returns a JSON response.
  - `sendBulkEmailFromFile(req, res)`:
    - Expects:
      - `multipart/form-data` with:
        - `recipientsFile` (TXT file – one email per line),
        - optional `image` (inline image),
        - optional `attachments` (extra documents),
      - body fields `subject`, `htmlContent`.
    - Reads file content, splits by line, trims, and validates each email.
    - Builds `validRecipients` and `invalidRecipients` arrays.
    - If there are valid recipients, calls:
      - `sendBulkEmail(validRecipients, subject, htmlContent, imageAttachment, extraAttachments)`.
    - Responds with JSON including which emails were valid/invalid and per-recipient send results.
  - `testConnection(req, res)`:
    - Calls `emailService.testConnection()` and returns result.

- `public/index.html`
  - A modern dark UI page served at the root of the server.
  - Lets you:
    - upload `.txt` file (one email per line),
    - type subject in a text input,
    - compose the email body in a **rich text editor** (bold, italic, underline, lists, highlight),
    - compose a **rich text signature** in a second editor,
    - optionally select an **inline image** and
    - optionally select multiple **document attachments**,
    - send the request to `/api/email/send-from-file`,
    - see a delivery log table (sent / skipped / errors).
  - Uses the `fetch` API with `FormData` to call the backend.

- `package.json`
  - Scripts:
    - `"start": "node server.js"`
    - `"dev": "nodemon server.js"`
  - Main dependencies: `express`, `nodemailer`, `dotenv`, `cors`, `uuid`, `multer`.

--------------------------------------------------------
3. Environment Variables (SMTP settings)
--------------------------------------------------------
Create a `.env` file in the project root (same folder as `server.js`) and set:

EMAIL_HOST=your.mailserver.host
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=your-mailbox@your-domain.com
EMAIL_PASSWORD=your-smtp-password
EMAIL_FROM_NAME=Rabط
EMAIL_RATE_LIMIT=100
EMAIL_BCC_LIMIT=50

Adjust the values to match your Namecheap Private Email SMTP info and desired rate limits.

--------------------------------------------------------
4. How to run the project
--------------------------------------------------------
1. Install dependencies:
   - `npm install`
2. Start the server:
   - For development with auto‑restart: `npm run dev`
   - Or normal run: `npm start`
3. The server listens on port `3001` (or `process.env.PORT` if set).

--------------------------------------------------------
5. How to use the TXT upload + frontend UI
--------------------------------------------------------
1. Create a `.txt` file with one email per line, for example:

   user1@example.com
   user2@example.org
   user3@example.net

2. Open your browser and go to:
   - `http://localhost:3001/index.html`

3. On the page:
   - Choose your `.txt` file.
   - Type an email subject (3+ characters).
   - Write your email content in the **main editor** (10+ characters).
   - Optionally format and fill in your **signature** in the signature editor.
   - Optionally select:
     - one inline image (shown inside the email body), and
     - extra attachments (PDF, Word, Excel, PowerPoint, TXT).
   - Click the “Send emails” button.

4. What happens when you click “Send emails”:
   - The frontend builds the final HTML as:
     - `finalHtml = mainEditorHTML + (optional inline <img> tag with cid) + (optional signature HTML)`.
   - The frontend sends a `POST` request to `/api/email/send-from-file` using `FormData`:
     - field `recipientsFile` = your `.txt` file
     - field `subject` = your subject text
     - field `htmlContent` = `finalHtml`
     - optional field `image` = selected inline image file
     - optional multiple fields `attachments` = selected document files
   - The backend:
     - Reads and validates emails from the file.
     - Builds inline image + extra attachment objects if provided.
     - Uses `NamecheapEmailService` to send **one email per recipient**, with:
       - HTML body wrapped in the template,
       - plain-text version derived from the HTML,
       - embedded inline image (via `cid`) if present,
       - document attachments if present,
       - 5-second delay between recipients and rate-limiting.
     - Returns JSON describing success, which emails were valid/invalid, and per-recipient results.
   - The frontend updates the delivery log table to show status for each address.

--------------------------------------------------------
9. System algorithm (high-level)
--------------------------------------------------------
1. **User input (frontend)**
   - User selects a `.txt` file with one email per line.
   - User types a subject.
   - User writes the main message in the rich text editor.
   - User optionally formats and fills the signature editor.
   - User optionally selects:
     - one inline image file and
     - up to several document attachments (pdf/docx/xlsx/pptx/txt).

2. **Request building (frontend)**
   - Concatenate:
     - `mainHtml = editorArea.innerHTML`
     - `imageHtml` = `<img src="cid:embedded-image@sandbox" ...>` if an image is selected, otherwise empty.
     - `signatureHtml` = `<br><br>` + signatureEditor HTML if provided, otherwise empty.
   - Build `finalHtml = mainHtml + imageHtml + signatureHtml`.
   - Create `FormData` with:
     - `recipientsFile`, `subject`, `htmlContent = finalHtml`,
     - optional `image`,
     - zero or more `attachments`.
   - Send `POST /api/email/send-from-file` with this `FormData`.

3. **Parsing + validation (backend controller)**
   - Multer parses multipart form:
     - `req.files.recipientsFile[0]` (TXT),
     - optional `req.files.image[0]` (inline image),
     - optional `req.files.attachments[]` (documents).
   - Controller reads the TXT file, splits on newlines, trims, and:
     - Adds valid addresses to `validRecipients`.
     - Adds invalid addresses to `invalidRecipients`.
   - If no valid recipients → respond 400.
   - Build:
     - `imageAttachment` (with `cid: embedded-image@sandbox`) if an image file was sent.
     - `extraAttachments[]` from all attachment files.

4. **Per-recipient sending (service layer)**
   - `NamecheapEmailService.sendBulkEmail(validRecipients, subject, htmlContent, imageAttachment, extraAttachments)`:
     - Filters/validates recipient list again.
     - For each `recipient` in `validRecipients`:
       - Enforces rate-limit (max emails/hour).
       - Builds `mailOptions`:
         - `from`, `to`, `subject`.
         - `html = wrapEmailTemplate(htmlContent)`.
         - `text` = plain-text version derived from HTML.
         - `attachments` = `[imageAttachment?, ...extraAttachments]`.
       - Calls `transporter.sendMail(mailOptions)`.
       - Records `{ recipient, messageId }` in `results[]`.
       - Waits **5 seconds** before the next recipient.
   - Returns `{ success, recipientsCount, timestamp, sandbox, results }`.

5. **Response + UI log**
   - Controller wraps the service result plus `validRecipients`/`invalidRecipients` and returns JSON.
   - Frontend:
     - If error → shows alert and logs invalid addresses.
     - If success → shows alert and populates the delivery log table with each valid/invalid email and status.

--------------------------------------------------------
6. API reference (for Postman / other clients)
--------------------------------------------------------
1) Test SMTP connection
   - Method: GET
   - URL: `/api/email/test-connection`
   - Response example:
     - `{ "success": true, "message": "Connected to Namecheap SMTP successfully" }`

2) Send bulk email (JSON list)
   - Method: POST
   - URL: `/api/email/send-bulk`
   - Body (JSON):
     - `{ "recipients": ["user1@example.com", "user2@example.com"], "subject": "Hi!", "htmlContent": "<p>Hello</p>" }`

3) Send bulk email from TXT file
   - Method: POST
   - URL: `/api/email/send-from-file`
   - Body: `multipart/form-data`
     - Field `recipientsFile`: TXT file (one email per line)
     - Field `subject`: subject string
     - Field `htmlContent`: HTML or plain‑text content string

--------------------------------------------------------
7. Tips to reduce spam / go to inbox
--------------------------------------------------------
- Use a clear, honest subject line (avoid ALL CAPS and spammy words).
- Keep the message short and to the point; don’t add many links or large images.
- Include a simple line like “If you no longer want emails, reply with ‘Unsubscribe’.”
- Make sure your sending domain has:
  - SPF record including your SMTP server.
  - DKIM correctly configured (Namecheap Private Email supports this).
  - DMARC record that aligns with your domain.
- Send reasonable volumes and avoid sending to many invalid or dead addresses.

--------------------------------------------------------
8. Short prompt you can reuse (for documentation or AI)
--------------------------------------------------------
You can paste this prompt to remind yourself or another AI what this project is:

“This is a Node.js/Express bulk email system using Namecheap SMTP. It exposes `/api/email/send-bulk` for JSON recipient lists and `/api/email/send-from-file` for `.txt` uploads (one email per line). The backend uses `NamecheapEmailService` with Nodemailer, HTML + text templates, basic rate limiting, and BCC sending to reduce spam flags. A static frontend in `public/index.html` lets me upload the TXT file, write subject and message, send emails, and see per‑email logs of valid vs invalid addresses. Explain, modify, or extend this system based on that structure.”

#   e m a i l _ m a r k i t i n g _ s y s t e m 
 
 #   r a b t  
 #   r a a b t  
 # raabt
#   R a b t  
 