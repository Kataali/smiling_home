# Google Sheets registration storage

1. Create a Google Sheet and copy its ID from the URL: the text between `/d/` and `/edit`.
2. Open [Google Apps Script](https://script.google.com), create a project, and paste in `google-apps-script.js`.
3. Replace `SPREADSHEET_ID` and `WEBHOOK_TOKEN`. Use a long, random token; it must match the token in your deployment environment.
4. Click **Deploy** → **New deployment** → select **Web app**. Set **Execute as** to yourself and **Who has access** to **Anyone**, then deploy. Authorize the script when prompted.
5. Copy the resulting `/exec` web-app URL. Do not use the `/dev` URL.
6. In Render, add these environment variables, then redeploy:

   ```text
   GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
   GOOGLE_SHEETS_WEBHOOK_TOKEN=the-same-long-random-token
   ```

The server sends registrations to the web app; the token is never sent to visitors. Existing browser storage is retained for the current in-page admin list, but the Sheet is now the durable record.

To test, submit a registration and confirm a row appears in the `Registrations` tab. If the Sheet cannot accept it, the form displays an error and does not show a successful registration.
