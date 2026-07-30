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

  // Show/hide donation amount field
  document.querySelectorAll('input[name="donate"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('donationAmountWrap').style.display =
        document.querySelector('input[name="donate"]:checked').value === 'Yes' ? 'block' : 'none';
    });
  });

  const form = document.getElementById('regForm');

  function showError(fieldset, show){
    const err = fieldset.querySelector('.field-error');
    if(err) err.style.display = show ? 'block' : 'none';
  }

  function validate(){
    let valid = true;
    document.querySelectorAll('#regForm fieldset').forEach(fs=>{
      const req = fs.querySelector('[required]');
      if(!req) return;
      let ok = true;
      if(req.type === 'radio'){
        ok = !!fs.querySelector(`input[name="${req.name}"]:checked`);
      } else if(req.tagName === 'TEXTAREA' || req.type === 'text'){
        ok = req.value.trim().length > 0;
      } else if(req.type === 'email'){
        ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.value.trim());
      } else if(req.type === 'tel'){
        ok = req.value.trim().length >= 6;
      }
      showError(fs, !ok);
      if(!ok) valid = false;
    });
    return valid;
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
      donate: fd.get('donate'),
      donationAmount: fd.get('donationAmount')?.trim() || '',
      challenge: fd.get('challenge')?.trim(),
      solution: fd.get('solution')?.trim()
    };

    const id = Date.now() + '-' + Math.random().toString(36).slice(2,8);
    entry.whatsappClicked = false;
    currentEntryKey = 'registrations:' + id;
    const submitBtn = form.querySelector('.submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try{
      await window.storage.set(currentEntryKey, JSON.stringify(entry), true);
      document.getElementById('registrationView').style.display = 'none';
      document.getElementById('successView').style.display = 'block';
    }catch(err){
      alert('Something went wrong submitting your registration. Please try again.');
      console.error(err);
    }finally{
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Registration';
    }
  });

  let currentEntryKey = null;

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
    document.getElementById('donationAmountWrap').style.display = 'none';
    document.getElementById('registrationView').style.display = 'block';
    document.getElementById('successView').style.display = 'none';
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
      document.getElementById('adminTbody').innerHTML = '<tr><td colspan="13">Could not load registrations.</td></tr>';
    }
  }

  function renderTable(entries){
    document.getElementById('regCount').textContent = entries.length + ' registration' + (entries.length === 1 ? '' : 's');
    const tbody = document.getElementById('adminTbody');
    if(!entries.length){
      tbody.innerHTML = '<tr><td colspan="14" class="empty-state">No registrations to show yet.</td></tr>';
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
    const headers = ['Date','Name','Profession','Country','City/Town','Marital Status','Email','Contact','Donate?','Amount','WhatsApp Joined?','Biggest Challenge','Suggested Solution'];
    const rows = allEntries.map(e => [
      new Date(e.timestamp).toLocaleString(), e.fullName, e.profession, e.country, e.city,
      e.marital, e.email, e.contact, e.donate, e.donationAmount, e.whatsappClicked ? 'Yes' : 'No', e.challenge, e.solution
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
