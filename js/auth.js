// ============================================================
//  auth.js  — Authentication Service
//  คลินิกวิชาการ PCSHSPT
// ============================================================

const AuthService = {
  // ─── Supabase client (สร้างครั้งเดียว ใช้ร่วมกับ SupabaseAPI)
  getClient() {
    return SupabaseAPI.client || SupabaseAPI.init();
  },

  // ─── แปลง username ที่พิมพ์ → อีเมลในระบบ Supabase + บทบาทที่ต้องเป็น
  resolveLogin(username) {
    const u = String(username || '').trim().toLowerCase();
    if (u === AUTH_ADMIN.username) return { email: AUTH_ADMIN.email, role: 'admin' };
    // ครูผู้สอน: รับเฉพาะตัวอักษรที่ปลอดภัย ไม่รับอีเมลโดยตรง
    if (!/^[a-z0-9._-]{3,32}$/.test(u)) return null;
    return { email: `${u}@${AUTH_TEACHER_DOMAIN}`, role: 'teacher' };
  },

  // ─── Login (ตรวจรหัสที่ Supabase Auth)
  async login(username, password) {
    const target = this.resolveLogin(username);
    const client = this.getClient();
    if (!target || !client) return null;
    const { data, error } = await client.auth.signInWithPassword({ email: target.email, password });
    if (error || !data.user) {
      console.warn('[Auth] login failed:', error && error.message);
      return null;
    }
    // บทบาทอ่านจาก app_metadata (แก้ได้เฉพาะผ่าน SQL/Dashboard) และต้องตรงกับช่องทางที่ login
    const role = data.user.app_metadata && data.user.app_metadata.role;
    if (role !== target.role) {
      console.warn(`[Auth] role mismatch: account role="${role || ''}", expected="${target.role}"`);
      await client.auth.signOut();
      return null;
    }
    // pccpt_session ใช้เลือกเมนูที่แสดงเท่านั้น — สิทธิ์เขียนข้อมูลตรวจที่ Supabase (RLS)
    localStorage.removeItem('pccpt_auth_overrides');
    const session = {
      username: String(username).trim().toLowerCase(),
      role,
      displayName: AUTH_ROLE_NAMES[role],
      loggedAt: Date.now()
    };
    localStorage.setItem('pccpt_session', JSON.stringify(session));
    return session;
  },

  // ─── Change own password (ต้องยืนยันรหัสเดิม)
  async changePassword(role, oldPassword, newPassword) {
    const client = this.getClient();
    if (!client) return { success: false, message: 'ยังไม่ได้เชื่อมต่อ Supabase' };
    if (!newPassword || newPassword.length < 8) {
      return { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร' };
    }
    const { data: userData } = await client.auth.getUser();
    const user = userData && userData.user;
    if (!user || !user.app_metadata || user.app_metadata.role !== role) {
      return { success: false, message: 'กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่อีกครั้ง' };
    }
    const { error: authErr } = await client.auth.signInWithPassword({ email: user.email, password: oldPassword });
    if (authErr) return { success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
  },

  // ─── Admin update teacher password directly
  async setTeacherPassword(newPassword) {
    if (!newPassword || newPassword.length < 8) {
      return { success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' };
    }
    const client = this.getClient();
    if (!client) return { success: false, message: 'ยังไม่ได้เชื่อมต่อ Supabase' };
    const { error } = await client.rpc('admin_set_teacher_password', { p_new: newPassword });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'ตั้งรหัสผ่านครูผู้สอนเรียบร้อยแล้ว' };
  },

  // ─── Logout
  logout() {
    localStorage.removeItem('pccpt_session');
    const goLogin = () => { window.location.href = 'login.html'; };
    const client = SupabaseAPI.client;
    if (client) client.auth.signOut().finally(goLogin);
    else goLogin();
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
    // ตรวจหลังหน้าโหลดเสร็จ (รอให้หน้าเชื่อมต่อฐานข้อมูลก่อน)
    setTimeout(() => this.verifyServerSession(), 4000);
    return s;
  },

  // ถ้า session ของ Supabase หลุด (เช่น ล้างข้อมูลเบราว์เซอร์) การบันทึกทุกอย่างจะถูกฐานข้อมูลปฏิเสธ
  // → แจ้งให้เข้าสู่ระบบใหม่ทันที แทนที่จะปล่อยให้แก้ข้อมูลแล้วบันทึกไม่ขึ้น
  async verifyServerSession() {
    const client = (typeof SupabaseAPI !== 'undefined') ? SupabaseAPI.client : null;
    if (!client) return;
    try {
      const { data } = await client.auth.getSession();
      if (!data || !data.session) {
        showToast('หมดเวลาเข้าสู่ระบบ', 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง เพื่อให้บันทึกข้อมูลได้', 'warning', 6000);
        setTimeout(() => this.logout(), 2500);
      }
    } catch (e) { console.warn('[Auth] session check failed:', e); }
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

