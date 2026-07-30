const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const ROOT_DIR = __dirname;
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

function loadEnvFile() {
  const envPaths = [path.join(ROOT_DIR, '.env'), path.join(ROOT_DIR, '.env.example')];
  const existingPath = envPaths.find(envPath => fs.existsSync(envPath));
  if (!existingPath) return;

  const lines = fs.readFileSync(existingPath, 'utf8').split(/\r?\n/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

// Read raw body (Buffer) and parsed JSON; used by webhook verification which
// requires the exact raw bytes to compute the HMAC signature.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      if (!raw || raw.length === 0) return resolve({ raw: Buffer.from(''), json: {} });
      try {
        const json = JSON.parse(raw.toString());
        resolve({ raw, json });
      } catch (err) {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

function getStaticFilePath(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const safePath = decoded === '/' ? '/registration-form.html' : decoded;
  const relativePath = safePath.startsWith('/') ? safePath.slice(1) : safePath;
  return path.join(ROOT_DIR, relativePath);
}

const CALLBACK_LOG_FILE = path.join(ROOT_DIR, 'paystack-callbacks.json');
const PAYMENTS_STORE_FILE = path.join(ROOT_DIR, 'paystack-payments.json');

function saveCallbackData(payload, verified = false) {
  const existing = fs.existsSync(CALLBACK_LOG_FILE)
    ? JSON.parse(fs.readFileSync(CALLBACK_LOG_FILE, 'utf8') || '[]')
    : [];
  existing.push({ receivedAt: new Date().toISOString(), verified, payload });
  fs.writeFileSync(CALLBACK_LOG_FILE, JSON.stringify(existing, null, 2), 'utf8');
}

function loadPaymentsStore() {
  if (!fs.existsSync(PAYMENTS_STORE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PAYMENTS_STORE_FILE, 'utf8') || '{}');
  } catch (e) {
    return {};
  }
}

function savePaymentsStore(store) {
  fs.writeFileSync(PAYMENTS_STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function initializePaystackPayment(payment) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured.');
  }

  const amount = Math.round(Number(payment.amount) * 100);
  const email = String(payment.email || '').trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Please provide a valid donation amount.');
  }
  if (!email) {
    throw new Error('Please provide an email address for the payment.');
  }

  const reference = payment.reference || crypto.randomUUID();
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      amount,
      currency: payment.currency || 'GHS',
      reference,
      callback_url: process.env.PAYSTACK_CALLBACK_URL || '',
      metadata: {
        fullName: payment.fullName || '',
        registrationId: payment.registrationId || '',
        donationAmount: payment.amount
      }
    })
  });

  const data = await response.json();
  if (!response.ok || !data?.status) {
    throw new Error(data?.message || 'Paystack initialization failed.');
  }

  return {
    success: true,
    reference,
    authorizationUrl: data?.data?.authorization_url || '',
    message: 'Paystack payment initialized.'
  };
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  console.log('[request]', req.method, reqUrl.pathname);

  if (req.method === 'GET' && reqUrl.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/paystack/initialize') {
    try {
      const payload = await readBody(req);
      const amount = Number(payload.amount);
      const email = String(payload.email || '').trim();

      if (!payload.amount || !Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { success: false, message: 'Please provide a valid donation amount.' });
        return;
      }

      if (!email) {
        sendJson(res, 400, { success: false, message: 'Please provide an email address for the payment.' });
        return;
      }

      const result = await initializePaystackPayment({
        amount,
        email,
        currency: payload.currency || 'GHS',
        fullName: payload.fullName || '',
        registrationId: payload.registrationId || ''
      });

      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        success: false,
        message: error.message || 'The payment request could not be completed.'
      });
    }
    return;
  }

  // Paystack opens the configured callback URL in the customer's browser after
  // checkout, which is a GET request. Payment events are delivered separately
  // to the POST handler below when this URL is used as a webhook endpoint.
  if (req.method === 'GET' && reqUrl.pathname === '/api/paystack/callback') {
    const reference = reqUrl.searchParams.get('reference') || '';
    const destination = reference
      ? `/?payment=returned&reference=${encodeURIComponent(reference)}`
      : '/?payment=returned';
    res.writeHead(302, { Location: destination });
    res.end();
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/paystack/callback') {
    try {
      // Capture raw body for signature verification
      const { raw, json: payload } = await readRawBody(req);

      // Verify signature if secret is configured
      const secret = process.env.PAYSTACK_SECRET_KEY || '';
      const signature = (req.headers['x-paystack-signature'] || '').toString();
      let verified = false;
      if (secret) {
        const expected = crypto.createHmac('sha512', secret).update(raw).digest('hex');
        verified = signature === expected;
      }

      // Save callback log (including whether verification passed)
      saveCallbackData(payload, verified);

      if (!verified && process.env.PAYSTACK_REQUIRE_VALID_SIGNATURE === 'true') {
        sendJson(res, 400, { success: false, message: 'Invalid signature' });
        return;
      }

      // Process payment event idempotently using reference
      const reference = payload?.data?.reference || payload?.reference || '';
      const status = payload?.event || payload?.data?.status || '';
      const metadata = payload?.data?.metadata || {};
      const registrationId = metadata.registrationId || metadata.registration_id || '';

      if (reference) {
        const store = loadPaymentsStore();
        if (store[reference] && store[reference].status === status) {
          // Already processed same status -> idempotent
          sendJson(res, 200, { success: true, message: 'Already processed' });
          return;
        }

        store[reference] = {
          reference,
          status,
          registrationId,
          receivedAt: new Date().toISOString(),
          rawPayload: payload
        };
        savePaymentsStore(store);
      }

      sendJson(res, 200, { success: true, message: 'Callback received.' });
    } catch (error) {
      sendJson(res, 500, {
        success: false,
        message: error.message || 'Failed to process callback.'
      });
    }
    return;
  }

  const filePath = getStaticFilePath(reqUrl.pathname);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
