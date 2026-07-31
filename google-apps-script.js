// Paste this into a new Google Apps Script project, set the two values below,
// then deploy it as a Web app. Setup details are in GOOGLE_SHEETS_SETUP.md.
const SPREADSHEET_ID = 'replace_with_your_google_spreadsheet_id';
const WEBHOOK_TOKEN = 'replace_with_a_long_random_secret';
const SHEET_NAME = 'Registrations';

const HEADERS = [
  'Submitted at', 'Registration ID', 'Full name', 'Profession', 'Country',
  'City', 'Marital status', 'Email', 'Contact number', 'Donation requested',
  'Donation amount', 'MoMo number', 'Challenge', 'Solution', 'Payment status',
  'Payment reference', 'Payment message', 'WhatsApp clicked', 'WhatsApp clicked at'
];

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    if (payload.token !== WEBHOOK_TOKEN) return jsonResponse(false, 'Unauthorized.');

    const registration = payload.registration || {};
    if (!registration.fullName || !registration.email) {
      return jsonResponse(false, 'A name and email address are required.');
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);

    sheet.appendRow([
      registration.timestamp || new Date().toISOString(), registration.registrationId || '',
      registration.fullName || '', registration.profession || '', registration.country || '',
      registration.city || '', registration.marital || '', registration.email || '',
      registration.contact || '', registration.donate || '', registration.donationAmount || '',
      registration.momoNumber || '', registration.challenge || '', registration.solution || '',
      registration.paymentStatus || '', registration.paymentReferenceId || '',
      registration.paymentMessage || '', registration.whatsappClicked ? 'Yes' : 'No',
      registration.whatsappClickedAt || ''
    ]);
    return jsonResponse(true, 'Registration saved.');
  } catch (error) {
    console.error(error);
    return jsonResponse(false, 'Unable to save registration.');
  }
}

function jsonResponse(success, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ success, message }))
    .setMimeType(ContentService.MimeType.JSON);
}
