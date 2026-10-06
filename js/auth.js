// ============================================================
//  auth.js  — Authentication Service
//  คลินิกวิชาการ PCCPT
// ============================================================

const AuthService = {
  // ─── Get effective credentials (with local overrides)
  getCredentials() {
    let custom = {};
    try {
      custom = JSON.parse(localStorage.getItem('pccpt_auth_overrides') || '{}');
    } catch (e) {
      custom = {};
    }
    return {
      teacher: {
        ...AUTH_CREDENTIALS.teacher,
        ...(custom.teacher || {})
      },
      admin: {
        ...AUTH_CREDENTIALS.admin,
        ...(custom.admin || {})
      }
    };
  },

  // ─── Login
  login(username, password) {
    const creds = this.getCredentials();
    const cred = Object.values(creds).find(
      c => c.username === username && c.password === password
    );
    if (!cred) return null;
    const session = { ...cred, loggedAt: Date.now() };
    localStorage.setItem('pccpt_session', JSON.stringify(session));
    return session;
  },

  // ─── Change Password
  changePassword(role, oldPassword, newPassword) {
    const creds = this.getCredentials();
    const cred = creds[role];
    if (!cred) return { success: false, message: 'ไม่พบบทบาทผู้ใช้นี้' };
    if (cred.password !== oldPassword) {
      return { success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
    }
    if (!newPassword || newPassword.length < 4) {
      return { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' };
    }

    let custom = {};
    try {
      custom = JSON.parse(localStorage.getItem('pccpt_auth_overrides') || '{}');
    } catch (e) {}
    custom[role] = custom[role] || {};
    custom[role].password = newPassword;
    localStorage.setItem('pccpt_auth_overrides', JSON.stringify(custom));

    // Update current session if matching role
    const currentSession = this.getSession();
    if (currentSession && currentSession.role === role) {
      currentSession.password = newPassword;
      localStorage.setItem('pccpt_session', JSON.stringify(currentSession));
    }
    return { success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
  },

  // ─── Admin update teacher password directly
  setTeacherPassword(newPassword) {
    if (!newPassword || newPassword.length < 4) {
      return { success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' };
    }
    let custom = {};
    try {
      custom = JSON.parse(localStorage.getItem('pccpt_auth_overrides') || '{}');
    } catch (e) {}
    custom.teacher = custom.teacher || {};
    custom.teacher.password = newPassword;
    localStorage.setItem('pccpt_auth_overrides', JSON.stringify(custom));
    return { success: true, message: 'ตั้งรหัสผ่านครูผู้สอนเรียบร้อยแล้ว' };
  },

  // ─── Logout
  logout() {
    localStorage.removeItem('pccpt_session');
    window.location.href = 'login.html';
  },

  // ─── Get current session
  getSession() {
    try {
      const s = JSON.parse(localStorage.getItem('pccpt_session'));
      // Session expires after 8 hours
      if (!s) return null;
      if (Date.now() - s.loggedAt > 8 * 3600 * 1000) {
        this.logout();
        return null;
      }
      return s;
    } catch { return null; }
  },

  // ─── Check if logged in
  isLoggedIn() { return !!this.getSession(); },

  // ─── Role checks
  isAdmin()   { const s = this.getSession(); return s && s.role === 'admin'; },
  isTeacher() { const s = this.getSession(); return s && (s.role === 'teacher' || s.role === 'admin'); },

  // ─── Require auth — redirects if not logged in
  requireAuth(allowedRoles) {
    const s = this.getSession();
    if (!s) { window.location.href = 'login.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(s.role)) {
      window.location.href = 'schedule.html';
      return null;
    }
    return s;
  }
};

// ─── Inject navbar login/logout button dynamically
function updateNavbarAuth() {
  const session = AuthService.getSession();
  const loginBtn = document.getElementById('nav-login-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  const userInfo = document.getElementById('nav-user-info');

  if (session) {
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (userInfo) {
      userInfo.textContent = session.displayName;
      userInfo.classList.remove('hidden');
    }
  } else {
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (userInfo) userInfo.classList.add('hidden');
  }
}

// ─── Toast notifications
function showToast(title, msg, type='info', duration=3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]||'ℹ️'}</span>
    <div>
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all .3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Format date Thai
function parseDateSafe(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  let str = String(dateInput).trim();
  if (!str || str.startsWith('NaN')) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(str + 'T00:00:00');
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function formatDateThai(dateStr) {
  if (!dateStr) return '';
  const monthsShort = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const d = parseDateSafe(dateStr);
  if (!d) return String(dateStr);
  return `${d.getDate()} ${monthsShort[d.getMonth()]} ${d.getFullYear()+543}`;
}

function formatDateThaiLong(dateStr) {
  if (!dateStr) return '';
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const d = parseDateSafe(dateStr);
  if (!d) return String(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()+543}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDayOfWeek(dateStr) {
  const d = parseDateSafe(dateStr);
  return d ? d.getDay() : 0; // 0=Sun,1=Mon,...6=Sat
}

// Subject icons map
const SUBJECT_ICONS = {
  'คณิตศาสตร์': '🔢', 'คณิตศาสตร์เพิ่มเติม': '📐', 'คณิตศาสตร์พื้นฐาน': '🧮',
  'ฟิสิกส์': '⚛️', 'เคมี': '🧪', 'ชีววิทยา': '🌿',
  'วิทยาศาสตร์': '🔬', 'ภาษาอังกฤษ': '🇬🇧', 'ภาษาไทย': '📖',
  'สังคมศึกษา': '🌏', 'ประวัติศาสตร์': '🏛️', 'ติวปฏิบัติ': '🔭',
  'ติวทฤษฎี': '📝', 'ภาษาต่างประเทศ': '🌐',
};
function getSubjectIcon(subject) {
  if (!subject) return '📚';
  const key = Object.keys(SUBJECT_ICONS).find(k => subject.includes(k));
  return key ? SUBJECT_ICONS[key] : '📚';
}

// Status labels
function getStatusLabel(status) {
  const labels = { active: { text: 'มีสอน', cls: 'status-active', icon: '✅' },
    cancelled: { text: 'งดสอน', cls: 'status-cancelled', icon: '⛔' },
    pending: { text: 'รอยืนยัน', cls: 'status-pending', icon: '⏳' }};
  return labels[status] || labels.pending;
}

// ─── GLOBAL MODAL HELPERS ─────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Close modals on Escape key or backdrop click
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

document.addEventListener('click', e => {
  if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

