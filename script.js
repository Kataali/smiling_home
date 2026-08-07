  const CODE = "smilinghome2026"; // change this before sharing the admin link/access

  function ensureStorageAdapter(){
    if(window.storage && typeof window.storage.get === 'function' && typeof window.storage.set === 'function' && typeof window.storage.list === 'function'){
      if(typeof window.storage.remove !== 'function'){
        window.storage.remove = async (key) => {
          if(typeof window.localStorage !== 'undefined'){
            window.localStorage.removeItem(key);
            return true;
          }
          return false;
        };
      }
      return;
    }

    window.storage = {
      async get(key){
        if(typeof window.localStorage === 'undefined') return { value: null };
        return { value: window.localStorage.getItem(key) };
      },
      async set(key, value){
        if(typeof window.localStorage === 'undefined') return false;
        window.localStorage.setItem(key, value);
        return true;
      },
      async list(prefix){
        if(typeof window.localStorage === 'undefined') return { keys: [] };
        const keys = Object.keys(window.localStorage).filter(k => k.startsWith(prefix)).sort();
        return { keys };
      },
      async remove(key){
        if(typeof window.localStorage === 'undefined') return false;
        window.localStorage.removeItem(key);
        return true;
      }
    };
  }

  ensureStorageAdapter();

  const API_ORIGIN = (window.location.protocol === 'file:' || ((window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') && window.location.port === '5500'))
    ? 'http://127.0.0.1:3001'
    : '';

  // Show/hide donation amount field
  document.querySelectorAll('input[name="donate"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('donationAmountWrap').style.display =
        document.querySelector('input[name="donate"]:checked').value === 'Yes' ? 'block' : 'none';
    });
  });

  const form = document.getElementById('regForm');
  const PENDING_PAYMENT_KEY = 'smiling-home:pending-paystack-payment';
  let completedPayment = null;

  function createPaymentSuccessSection(){
    const section = document.createElement('div');
    section.id = 'paymentSuccessSection';
    section.className = 'payment-success-card';
    section.setAttribute('role', 'status');
    section.setAttribute('aria-live', 'polite');
    section.hidden = true;
    section.innerHTML = `
      <div class="payment-success-header">
        <div class="payment-success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.2 4.2L19.5 6"/></svg>
        </div>
        <div>
          <span class="payment-success-kicker">Donation received</span>
          <h3>Payment successful</h3>
        </div>
        <div class="verified-pill"><span aria-hidden="true">✓</span> Verified</div>
      </div>
      <p class="payment-success-copy">Thank you — your donation has been successfully received. Your support helps keep the course free and accessible.</p>
      <div class="payment-summary">
        <div class="payment-summary-item">
          <span>Donation amount</span>
          <strong id="paymentSuccessAmount"></strong>
        </div>
        <div class="payment-summary-item payment-reference">
          <span>Payment reference</span>
          <strong id="paymentSuccessReference"></strong>
        </div>
      </div>
      <p class="payment-success-next"><span aria-hidden="true">→</span> Your donation choice has been saved. Please continue with the remaining questions and submit your registration.</p>`;
    document.querySelector('.donation-box').insertAdjacentElement('afterend', section);
    return section;
  }

  const paymentSuccessSection = createPaymentSuccessSection();

  function restoreFormValues(values){
    Object.entries(values || {}).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);
      if(!field) return;
      if(field instanceof RadioNodeList){
        field.value = value;
      }else{
        field.value = value;
      }
    });

    const donating = document.querySelector('input[name="donate"]:checked')?.value === 'Yes';
    document.getElementById('donationAmountWrap').style.display = donating ? 'block' : 'none';
  }

  function showPaymentSuccess(reference, amount){
    document.querySelector('.donation-box').style.display = 'none';
    paymentSuccessSection.hidden = false;
    document.getElementById('paymentSuccessReference').textContent = reference || '—';
    document.getElementById('paymentSuccessAmount').textContent = amount || 'Donation confirmed';
  }

  async function restoreReturnedPayment(){
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || '';
    if(params.get('payment') !== 'returned' || !reference) return;

    let pending;
    try{
      pending = JSON.parse(window.sessionStorage.getItem(PENDING_PAYMENT_KEY) || 'null');
    }catch(e){
      window.sessionStorage.removeItem(PENDING_PAYMENT_KEY);
      return;
    }
    if(!pending || pending.referenceId !== reference) return;

    restoreFormValues(pending.formValues);
    try{
      const res = await fetch(`${API_ORIGIN}/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
      const result = await res.json();
      if(!res.ok || !result.success){
        alert(result.message || 'Your payment could not be verified. Please try again.');
        return;
      }

      document.querySelector('input[name="donate"][value="Yes"]').checked = true;
      completedPayment = {
        referenceId: result.reference || reference,
        amount: pending.formValues?.donationAmount || ''
      };
      showPaymentSuccess(completedPayment.referenceId, completedPayment.amount);
      window.sessionStorage.removeItem(PENDING_PAYMENT_KEY);
      window.history.replaceState({}, '', window.location.pathname);
    }catch(err){
      console.error(err);
      alert('Your payment could not be verified right now. Please refresh the page and try again.');
    }
  }

  function setFieldError(input, errorElement, show){
    if(input){
      input.classList.toggle('input-error', show);
    }
    if(errorElement){
      errorElement.style.display = show ? 'block' : 'none';
    }
  }

  function validateFieldValue(input){
    if(!input) return true;
    if(input.type === 'hidden' || input.type === 'button' || input.type === 'submit') return true;

    const value = input.value.trim();
    if(input.hasAttribute('required')){
      if(input.type === 'email'){
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      }
      if(input.type === 'tel'){
        return value.length >= 6;
      }
      return value.length > 0;
    }

    return true;
  }

  function validate(){
    let valid = true;

    form.querySelectorAll('input, textarea').forEach((input) => {
      if(input.type === 'hidden' || input.type === 'button' || input.type === 'submit') return;

      const fieldset = input.closest('fieldset');
      const errorElement = fieldset?.querySelector('.field-error') || document.getElementById(`${input.id}Error`);
      const isRequired = input.hasAttribute('required');
      const shouldValidate = isRequired || input.id === 'donationAmount' || input.id === 'momoNumber';

      if(!shouldValidate){
        setFieldError(input, errorElement, false);
        return;
      }

      const donateYes = document.querySelector('input[name="donate"]:checked')?.value === 'Yes';
      let ok = validateFieldValue(input);

      if(input.id === 'donationAmount'){
        ok = donateYes ? !!parseDonationAmount(input.value) : true;
      }

      if(input.id === 'momoNumber'){
        ok = donateYes ? input.value.trim().length > 0 : true;
      }

      setFieldError(input, errorElement, !ok);
      if(!ok) valid = false;
    });

    return valid;
  }

  function validatePaymentInputs(){
    const donateYes = document.querySelector('input[name="donate"]:checked')?.value === 'Yes';
    const emailField = document.getElementById('email');
    const amountField = document.getElementById('donationAmount');
    const momoField = document.getElementById('momoNumber');
    const emailError = emailField?.closest('fieldset')?.querySelector('.field-error');
    const amountError = document.getElementById('donationAmountError');
    const momoError = document.getElementById('momoNumberError');

    let valid = true;

    const emailOk = !emailField || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField.value.trim());
    setFieldError(emailField, emailError, !emailOk);
    if(!emailOk) valid = false;

    if(donateYes){
      const amountOk = !!parseDonationAmount(amountField?.value);
      setFieldError(amountField, amountError, !amountOk);
      if(!amountOk) valid = false;

      const momoOk = !!momoField?.value.trim();
      setFieldError(momoField, momoError, !momoOk);
      if(!momoOk) valid = false;
    } else {
      setFieldError(amountField, amountError, false);
      setFieldError(momoField, momoError, false);
    }

    return valid;
  }

  function parseDonationAmount(rawValue){
    const cleaned = String(rawValue || '').replace(/[^\d.]/g, '');
    if(!cleaned) return null;
    const amount = Number(cleaned);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  async function maybeProcessPayment(entry){
    if(entry.donate !== 'Yes') return { success: true, skipped: true, message: '' };

    const amount = parseDonationAmount(entry.donationAmount);
    if(!amount){
      return { success: false, skipped: false, message: 'Please enter a valid donation amount for the payment request.' };
    }

    try{
      const res = await fetch(`${API_ORIGIN}/api/paystack/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount.toFixed(2)),
          email: entry.email,
          fullName: entry.fullName,
          registrationId: entry.registrationId || currentEntryKey || '',
          momoNumber: entry.momoNumber || ''
        })
      });
      const data = await res.json();
      if(!res.ok || !data?.success){
        return { success: false, skipped: false, message: data?.message || 'The Paystack payment could not be started.' };
      }
      return { success: true, skipped: false, referenceId: data.reference || '', authorizationUrl: data.authorizationUrl || '', message: 'You will be redirected to Paystack to complete the donation.' };
    }catch(err){
      console.error(err);
      return { success: false, skipped: false, message: 'The Paystack payment could not be started right now.' };
    }
  }

  async function startPaystackPayment(){
    if(!validatePaymentInputs()) return;

    const fd = new FormData(form);
    const entry = {
      timestamp: new Date().toISOString(),
      fullName: fd.get('fullName')?.trim(),
      profession: fd.get('profession')?.trim(),
      country: fd.get('country')?.trim(),
      city: fd.get('city')?.trim(),
      marital: fd.get('marital'),
      email: fd.get('email')?.trim(),
      contact: fd.get('contact')?.trim(),
      donate: fd.get('donate'),
      donationAmount: fd.get('donationAmount')?.trim() || '',
      momoNumber: fd.get('momoNumber')?.trim() || '',
      paymentStatus: 'not-requested',
      paymentReferenceId: '',
      paymentMessage: ''
    };

    const payBtn = document.getElementById('payNowBtn');
    const originalText = payBtn.textContent;
    payBtn.disabled = true;
    payBtn.textContent = 'Processing...';

    try{
      const paymentResult = await maybeProcessPayment(entry);
      if(paymentResult.success && paymentResult.authorizationUrl){
        window.sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({
          formValues: Object.fromEntries(new FormData(form).entries()),
          referenceId: paymentResult.referenceId
        }));
        window.location.assign(paymentResult.authorizationUrl);
        return;
      }

      alert(paymentResult.message || 'Could not start payment.');
    }catch(err){
      console.error(err);
      alert('Could not start payment. Please try again.');
    }finally{
      payBtn.disabled = false;
      payBtn.textContent = originalText;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!validate()) return;

    const fd = new FormData(form);
    const entry = {
      timestamp: new Date().toISOString(),
      fullName: fd.get('fullName')?.trim(),
      profession: fd.get('profession')?.trim(),
      country: fd.get('country')?.trim(),
      city: fd.get('city')?.trim(),
      marital: fd.get('marital'),
      email: fd.get('email')?.trim(),
      contact: fd.get('contact')?.trim(),
      donate: completedPayment ? 'Yes' : fd.get('donate'),
      donationAmount: fd.get('donationAmount')?.trim() || '',
      momoNumber: fd.get('momoNumber')?.trim() || '',
      challenge: fd.get('challenge')?.trim(),
      solution: fd.get('solution')?.trim(),
      paymentStatus: completedPayment ? 'success' : 'not-requested',
      paymentReferenceId: completedPayment?.referenceId || '',
      paymentMessage: completedPayment ? 'Payment verified by Paystack.' : ''
    };

    const id = Date.now() + '-' + Math.random().toString(36).slice(2,8);
    entry.registrationId = id;
    entry.whatsappClicked = false;
    currentEntryKey = 'registrations:' + id;
    const submitBtn = form.querySelector('.submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try{
      const registrationResponse = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      const registrationResult = await registrationResponse.json();
      if(!registrationResponse.ok || !registrationResult.success){
        throw new Error(registrationResult.message || 'Could not save your registration.');
      }

      await window.storage.set(currentEntryKey, JSON.stringify(entry), true);

      const successMessage = document.getElementById('successMessage');
      const paymentStatusNote = document.getElementById('paymentStatusNote');
      if (entry.donate === 'Yes') successMessage.textContent = 'Thank you for registering. We look forward to having you on the course. Jazakallahu Khayran for your donation. Click the button below to join the WhatsApp group.';
      else successMessage.textContent = 'Thank you for registering. We look forward to having you on the course. Click the button below to join the WhatsApp group.';

      document.getElementById('registrationView').style.display = 'none';
      document.getElementById('successView').style.display = 'block';
    }catch(err){
      alert(err.message || 'Something went wrong submitting your registration. Please try again.');
      console.error(err);
    }finally{
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Registration';
    }
  });

  let currentEntryKey = null;
  restoreReturnedPayment();

  async function markWhatsappClicked(){
    if(!currentEntryKey) return;
    try{
      const res = await window.storage.get(currentEntryKey, true);
      if(res?.value){
        const entry = JSON.parse(res.value);
        entry.whatsappClicked = true;
        entry.whatsappClickedAt = new Date().toISOString();
        await window.storage.set(currentEntryKey, JSON.stringify(entry), true);
      }
    }catch(e){ console.error(e); }
  }

  function resetForm(){
    form.reset();
    currentEntryKey = null;
    completedPayment = null;
    document.querySelector('.donation-box').style.display = 'block';
    paymentSuccessSection.hidden = true;
    document.getElementById('donationAmountWrap').style.display = 'none';
    document.getElementById('registrationView').style.display = 'block';
    document.getElementById('successView').style.display = 'none';
    document.getElementById('paymentStatusNote').style.display = 'none';
    document.getElementById('paymentStatusNote').textContent = '';
    document.getElementById('successMessage').textContent = 'Jazakumullahu khayran — thank you for registering. We look forward to having you on the course.';
  }

  // ---------- Admin ----------
  function openAdmin(){
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('adminPanel').scrollIntoView({behavior:'smooth'});
  }

  function checkPasscode(){
    const val = document.getElementById('passcodeInput').value;
    if(val === CODE){
      document.getElementById('passcodeGate').style.display = 'none';
      document.getElementById('adminTable').style.display = 'block';
      loadRegistrations();
    }else{
      document.getElementById('passcodeError').style.display = 'block';
    }
  }

  let allEntries = [];

  async function loadRegistrations(){
    try{
      const listResult = await window.storage.list('registrations:', true);
      const keys = listResult?.keys || [];
      const entries = [];
      for(const k of keys){
        try{
          const res = await window.storage.get(k, true);
          if(res?.value) entries.push(JSON.parse(res.value));
        }catch(e){ /* skip unreadable entry */ }
      }
      entries.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
      allEntries = entries;
      renderTable(entries);
    }catch(e){
      console.error(e);
      document.getElementById('adminTbody').innerHTML = '<tr><td colspan="16">Could not load registrations.</td></tr>';
    }
  }

  function renderTable(entries){
    document.getElementById('regCount').textContent = entries.length + ' registration' + (entries.length === 1 ? '' : 's');
    const tbody = document.getElementById('adminTbody');
    if(!entries.length){
      tbody.innerHTML = '<tr><td colspan="16" class="empty-state">No registrations to show yet.</td></tr>';
      return;
    }
    tbody.innerHTML = entries.map((e, i) => `
      <tr>
        <td>${i+1}</td>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td>${escapeHtml(e.fullName)}</td>
        <td>${escapeHtml(e.profession)}</td>
        <td>${escapeHtml(e.country)}</td>
        <td>${escapeHtml(e.city)}</td>
        <td>${escapeHtml(e.marital)}</td>
        <td>${escapeHtml(e.email)}</td>
        <td>${escapeHtml(e.contact)}</td>
        <td>${escapeHtml(e.donate)}</td>
        <td>${escapeHtml(e.donationAmount)}</td>
        <td>${escapeHtml(e.paymentStatus || 'not-requested')}</td>
        <td>${escapeHtml(e.paymentReferenceId || '')}</td>
        <td>${e.whatsappClicked ? 'Yes' : 'No'}</td>
        <td>${escapeHtml(e.challenge)}</td>
        <td>${escapeHtml(e.solution)}</td>
      </tr>
    `).join('');
  }

  function escapeHtml(str){
    if(str === undefined || str === null) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  async function clearRegistrations(){
    if(!allEntries.length){
      alert('There are no registrations to clear yet.');
      return;
    }

    const confirmed = window.confirm('Clear all registrations? This action cannot be undone.');
    if(!confirmed) return;

    try{
      const listResult = await window.storage.list('registrations:', true);
      const keys = listResult?.keys || [];
      await Promise.all(keys.map(k => window.storage.remove(k, true)));
      allEntries = [];
      renderTable([]);
    }catch(e){
      console.error(e);
      alert('Could not clear registrations. Please try again.');
    }
  }

  function exportCSV(){
    if(!allEntries.length){ alert('No registrations to export yet.'); return; }
    const headers = ['Date','Name','Profession','Country','City/Town','Marital Status','Email','Contact','Donate?','Amount','Payment Status','Payment Ref','WhatsApp Joined?','Biggest Challenge','Suggested Solution'];
    const rows = allEntries.map(e => [
      new Date(e.timestamp).toLocaleString(), e.fullName, e.profession, e.country, e.city,
      e.marital, e.email, e.contact, e.donate, e.donationAmount, e.paymentStatus || 'not-requested', e.paymentReferenceId || '', e.whatsappClicked ? 'Yes' : 'No', e.challenge, e.solution
    ]);
    const csv = [headers, ...rows].map(r =>
      r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smiling-home-registrations.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
