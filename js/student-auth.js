// ============================================================
//  student-auth.js — ระบบบัญชีนักเรียน
//  คลินิกวิชาการ PCSHSPT
//  username = รหัสประจำตัว · ตรวจรหัสผ่านที่ฐานข้อมูล (ฟังก์ชัน student_* ใน Supabase)
// ============================================================

const StudentAuth = {
  SESSION_KEY: 'pccpt_student_session',
  PENDING_KEY: 'pccpt_pending_reg_clinic',

  rpc(name, params) {
    const client = SupabaseAPI.client || SupabaseAPI.init();
    if (!client) throw new Error('ยังไม่ได้เชื่อมต่อฐานข้อมูล');
    return client.rpc(name, params);
  },

  // ─── Session (token จากฐานข้อมูล หมดอายุใน 8 ชั่วโมง)
  getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(this.SESSION_KEY));
      if (!s || !s.token || Date.now() > s.expiresAt) {
        localStorage.removeItem(this.SESSION_KEY);
        return null;
      }
      return s;
    } catch { return null; }
  },

  clearSession() {
    localStorage.removeItem(this.SESSION_KEY);
  },

  // คืนค่าเป็น { ok: true, session } หรือ { ok: false, error: 'invalid' | 'locked', minutes }
  async login(code, password) {
    const { data, error } = await this.rpc('student_login', { p_code: String(code || '').trim(), p_password: password });
    if (error) throw error;
    if (!data || !data.ok) return data || { ok: false, error: 'invalid' };
    const session = {
      token: data.token,
      student: data.student,
      mustChange: Boolean(data.must_change),
      expiresAt: Date.now() + 8 * 3600 * 1000
    };
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    return { ok: true, session };
  },

  async logout() {
    const s = this.getSession();
    this.clearSession();
    if (s) {
      try { await this.rpc('student_logout', { p_token: s.token }); } catch (e) {}
    }
  },

  // ─── เรียกฟังก์ชันที่ต้องใช้ token — ถ้า session หมดอายุจะล้าง session ให้
  async callWithToken(name, params) {
    const s = this.getSession();
    if (!s) return 'session_expired';
    const { data, error } = await this.rpc(name, { p_token: s.token, ...params });
    if (error) throw error;
    const expired = data === 'session_expired' || (data && data.error === 'session_expired');
    if (expired) this.clearSession();
    return data;
  },

  async changePassword(oldPassword, newPassword) {
    const result = await this.callWithToken('student_change_password', { p_old: oldPassword, p_new: newPassword });
    if (result === 'ok') {
      const s = this.getSession();
      if (s) {
        s.mustChange = false;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(s));
      }
    }
    return result;
  },

  register(clinicId) { return this.callWithToken('student_register', { p_clinic_id: String(clinicId) }); },
  cancel(clinicId)   { return this.callWithToken('student_cancel',   { p_clinic_id: String(clinicId) }); },
  history()          { return this.callWithToken('student_history',  {}); },

  // ─── สำหรับครู/Admin (ต้อง login ระบบครูอยู่)
  async staffResetPassword(code) {
    const { data, error } = await this.rpc('staff_reset_student_password', { p_code: String(code || '').trim() });
    if (error) throw error;
    return data;
  },

  async staffAccountStatus() {
    const { data, error } = await this.rpc('staff_student_account_status', {});
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }
};

// ─── แถบเมนูหน้าสาธารณะ: นักเรียนที่ login อยู่ → ปุ่ม "เข้าสู่ระบบ" กลายเป็นชื่อนักเรียน + ปุ่มออกจากระบบ
//     (ถ้าครู/Admin login อยู่ ใช้แถบเมนูของครูตามเดิม)
function updateNavbarStudent() {
  if (typeof AuthService !== 'undefined' && AuthService.getSession()) return;
  const s = StudentAuth.getSession();
  if (!s || !s.student) return;
  const loginBtn = document.getElementById('nav-login-btn');
  if (loginBtn) {
    loginBtn.textContent = `🎓 ${s.student.name}`;
    loginBtn.href = 'student.html';
    loginBtn.title = 'ประวัติการลงทะเบียน / เปลี่ยนรหัสผ่าน';
  }
  const logoutBtn = document.getElementById('nav-logout-btn');
  if (logoutBtn) {
    logoutBtn.classList.remove('hidden');
    logoutBtn.onclick = async () => {
      await StudentAuth.logout();
      window.location.reload();
    };
  }
}

// ─── ใช้ในหน้าครู/Admin: รีเซ็ตรหัสนักเรียน แล้วแสดงรหัสใหม่ให้ครูดูครั้งเดียว
async function staffResetStudentPasswordUI(code, name) {
  const label = name ? `${name} (รหัสประจำตัว ${code})` : `รหัสประจำตัว ${code}`;
  if (!confirm(`รีเซ็ตรหัสผ่านของ ${label} ใช่หรือไม่?\n\nรหัสผ่านเดิมจะใช้ไม่ได้ทันที`)) return false;
  try {
    const res = await StudentAuth.staffResetPassword(code);
    if (!res || !res.ok) {
      const msg = res && res.error === 'no_student'
        ? 'ไม่พบรหัสประจำตัวนี้ในระบบ'
        : 'ไม่มีสิทธิ์ หรือหมดเวลาเข้าสู่ระบบ (ลองออกจากระบบแล้วเข้าใหม่)';
      showToast('รีเซ็ตไม่สำเร็จ', msg, 'error');
      return false;
    }
    alert(
      `รหัสผ่านใหม่${name ? 'ของ ' + name : ''}\n\n` +
      `รหัสประจำตัว (username): ${res.code}\n` +
      `รหัสผ่านใหม่: ${res.password}\n\n` +
      `แจ้งนักเรียนโดยตรง — นักเรียนต้องตั้งรหัสใหม่เมื่อเข้าสู่ระบบ\n` +
      `(รหัสนี้แสดงครั้งเดียว ถ้าลืมให้รีเซ็ตใหม่)`
    );
    return true;
  } catch (e) {
    console.error('[StudentAuth] reset error:', e);
    showToast('เกิดข้อผิดพลาด', 'เชื่อมต่อระบบไม่สำเร็จ', 'error');
    return false;
  }
}

// ข้อความแจ้งผลจากฟังก์ชันลงทะเบียน/ยกเลิก
const STUDENT_RESULT_MESSAGES = {
  session_expired: 'หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบนักเรียนอีกครั้ง',
  must_change: 'กรุณาเปลี่ยนรหัสผ่านก่อนลงทะเบียน',
  no_student: 'ไม่พบข้อมูลนักเรียนในระบบ',
  not_found: 'ไม่พบคลินิกนี้ในระบบ',
  wrong_grade: 'วิชานี้ไม่ได้เปิดสำหรับระดับชั้นของคุณ',
  closed: 'รายวิชานี้ปิดรับลงทะเบียนแล้ว',
  past: 'คลินิกนี้ผ่านไปแล้ว',
  duplicate: 'คุณลงทะเบียนวิชานี้ไปแล้ว',
  full: 'ที่นั่งเต็มแล้ว',
  not_registered: 'คุณไม่ได้ลงทะเบียนวิชานี้'
};
