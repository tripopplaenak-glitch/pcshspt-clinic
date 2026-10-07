// ============================================================
//  supabase-api.js — Supabase Real-time Database Client
//  ระบบตารางสอนเสริมคลินิกวิชาการ PCCPT
// ============================================================

const SupabaseAPI = {
  client: null,
  realtimeChannel: null,

  // รับค่าการตั้งค่า Supabase
  getConfig() {
    const saved = LocalDB.get('supabase_settings') || {};
    const defaultCfg = (typeof SUPABASE_CONFIG !== 'undefined') ? SUPABASE_CONFIG : {};
    return {
      url: saved.url || defaultCfg.url || 'https://tzxhffzlblkehyzmggdu.supabase.co',
      anonKey: saved.anonKey || defaultCfg.anonKey || 'sb_publishable_UnAxE0Dr5Z6fGf1zo-nd2g_QKqXOIc9'
    };
  },

  isConfigured() {
    const cfg = this.getConfig();
    return Boolean(cfg.url && cfg.anonKey && typeof supabase !== 'undefined');
  },

  // เริ่มต้นเชื่อมต่อ Supabase & ระบบ Real-time
  init(onChangeCallback) {
    const cfg = this.getConfig();
    if (!cfg.url || !cfg.anonKey || typeof supabase === 'undefined') {
      return null;
    }

    try {
      this.client = supabase.createClient(cfg.url, cfg.anonKey, {
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      // ตั้งค่า Real-time WebSockets
      this.subscribeRealtime(onChangeCallback);
      return this.client;
    } catch (err) {
      console.warn('[SupabaseAPI] init error:', err);
      return null;
    }
  },

  // ดักจับการเปลี่ยนแปลงแบบ Real-time ทุกตาราง
  subscribeRealtime(onChangeCallback) {
    if (!this.client) return;
    if (this.realtimeChannel) {
      try { this.client.removeChannel(this.realtimeChannel); } catch (e) {}
    }

    this.realtimeChannel = this.client
      .channel('clinic-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, async (payload) => {
        console.log('[Supabase Realtime] Change received:', payload.table, payload.eventType);
        // เมื่อมีการเปลี่ยนแปลงตารางใดๆ ให้ดึงข้อมูลมาอัปเดต LocalDB
        await this.handleRealtimeEvent(payload);
        if (typeof onChangeCallback === 'function') {
          onChangeCallback(payload);
        }
        window.dispatchEvent(new CustomEvent('supabase-data-changed', { detail: payload }));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Supabase Realtime] Connected successfully! 🟢');
        }
      });
  },

  // จัดการข้อมูลที่ได้รับจาก Realtime Payload
  async handleRealtimeEvent(payload) {
    const table = payload.table;
    const eventType = payload.eventType; // INSERT, UPDATE, DELETE
    const newRecord = payload.new;
    const oldRecord = payload.old;

    if (table === 'clinics') {
      const clinics = LocalDB.getClinics();
      if (eventType === 'DELETE') {
        LocalDB.setList('clinics', clinics.filter(c => String(c.id) !== String(oldRecord.id)));
      } else {
        const mapped = this.mapClinicFromDb(newRecord);
        const customData = LocalDB.get('clinic_custom_data') || {};
        const custom = customData[String(mapped.id)] || {};
        if (custom.time) mapped.time = custom.time;
        if (custom.notes !== undefined && (!mapped.notes || custom.notes)) mapped.notes = custom.notes;
        if (custom.topic !== undefined) mapped.topic = custom.topic;
        if (custom.subject) { mapped.subject = custom.subject; mapped.subjectName = custom.subject; }
        const idx = clinics.findIndex(c => String(c.id) === String(mapped.id));
        if (idx >= 0) clinics[idx] = mapped;
        else clinics.push(mapped);
        LocalDB.setList('clinics', clinics);
      }
    } else if (table === 'weeks') {
      const weeks = LocalDB.getWeeks();
      if (eventType === 'DELETE') {
        LocalDB.setList('weeks', weeks.filter(w => String(w.id) !== String(oldRecord.id)));
      } else {
        const mapped = this.mapWeekFromDb(newRecord);
        const idx = weeks.findIndex(w => String(w.id) === String(mapped.id) || (mapped.weekId && w.weekId === mapped.weekId));
        if (idx >= 0) weeks[idx] = mapped;
        else weeks.push(mapped);
        weeks.sort((a, b) => (toYMD(a.startDate) || '') > (toYMD(b.startDate) || '') ? 1 : -1);
        LocalDB.setList('weeks', weeks);
      }
    } else if (table === 'teachers') {
      const teachers = LocalDB.getTeachers();
      if (eventType === 'DELETE') {
        LocalDB.setList('teachers', teachers.filter(t => String(t.id) !== String(oldRecord.id)));
      } else {
        const mapped = this.mapTeacherFromDb(newRecord);
        const idx = teachers.findIndex(t => String(t.id) === String(mapped.id));
        if (idx >= 0) teachers[idx] = mapped;
        else teachers.push(mapped);
        LocalDB.setList('teachers', teachers);
      }
    } else if (table === 'students') {
      const students = LocalDB.getStudents();
      if (eventType === 'DELETE') {
        LocalDB.setList('students', students.filter(s => String(s.id) !== String(oldRecord.id)));
      } else {
        const mapped = this.mapStudentFromDb(newRecord);
        const idx = students.findIndex(s => String(s.id) === String(mapped.id));
        if (idx >= 0) students[idx] = mapped;
        else students.push(mapped);
        LocalDB.setList('students', students);
      }
    } else if (table === 'staff') {
      const staff = LocalDB.getStaff();
      if (eventType === 'DELETE') {
        LocalDB.setList('staff', staff.filter(s => String(s.id) !== String(oldRecord.id)));
      } else {
        const mapped = this.mapStaffFromDb(newRecord);
        const idx = staff.findIndex(s => String(s.id) === String(mapped.id));
        if (idx >= 0) staff[idx] = mapped;
        else staff.push(mapped);
        LocalDB.setList('staff', staff);
      }
    } else if (table === 'duty_staff') {
      const dutyMap = LocalDB.getDutyStaffMap() || {};
      if (eventType === 'DELETE') {
        delete dutyMap[toYMD(oldRecord.date)];
      } else {
        dutyMap[toYMD(newRecord.date)] = newRecord.officer;
      }
      LocalDB.setDutyStaffMap(dutyMap);
    } else if (table === 'settings') {
      if (newRecord && newRecord.key) {
        if (newRecord.key === 'school_settings') LocalDB.set('school_settings', newRecord.value);
        if (newRecord.key === 'announcements_config') LocalDB.saveAnnouncementsConfig(newRecord.value);
        if (newRecord.key === 'clinic_custom_data') {
          LocalDB.set('clinic_custom_data', newRecord.value || {});
          const customData = newRecord.value || {};
          const clinics = LocalDB.getClinics().map(c => {
            const custom = customData[String(c.id)] || {};
            if (custom.time) c.time = custom.time;
            if (custom.notes !== undefined && (!c.notes || custom.notes)) c.notes = custom.notes;
            if (custom.topic !== undefined) c.topic = custom.topic;
            if (custom.subject) { c.subject = custom.subject; c.subjectName = custom.subject; }
            return c;
          });
          LocalDB.setList('clinics', clinics);
        }
      }
    } else if (table === 'attendance') {
      const att = LocalDB.getAttendance();
      if (eventType === 'DELETE') {
        LocalDB.setList('attendance', att.filter(a => String(a.id) !== String(oldRecord.id)));
      } else {
        const mapped = this.mapAttendanceFromDb(newRecord);
        const idx = att.findIndex(a => String(a.id) === String(mapped.id));
        if (idx >= 0) att[idx] = mapped;
        else att.push(mapped);
        LocalDB.setList('attendance', att);
      }
    }
  },

  // ดึงข้อมูลทั้งหมดจาก Supabase ลงสู่ LocalDB
  async fetchAll() {
    if (!this.client) this.init();
    if (!this.client) return false;

    try {
      const [
        { data: weeksData },
        { data: clinicsData },
        { data: teachersData },
        { data: studentsData },
        { data: staffData },
        { data: dutyData },
        { data: settingsData },
        { data: attendanceData }
      ] = await Promise.all([
        this.client.from('weeks').select('*'),
        this.client.from('clinics').select('*'),
        this.client.from('teachers').select('*'),
        this.client.from('students').select('*'),
        this.client.from('staff').select('*'),
        this.client.from('duty_staff').select('*'),
        this.client.from('settings').select('*'),
        this.client.from('attendance').select('*')
      ]);

      if (Array.isArray(teachersData) && teachersData.length) {
        LocalDB.setList('teachers', teachersData.map(t => this.mapTeacherFromDb(t)));
      }
      if (Array.isArray(studentsData) && studentsData.length) {
        LocalDB.setList('students', studentsData.map(s => this.mapStudentFromDb(s)));
      }
      if (Array.isArray(staffData) && staffData.length) {
        LocalDB.setList('staff', staffData.map(s => this.mapStaffFromDb(s)));
      }
      if (Array.isArray(weeksData) && weeksData.length) {
        const weeks = weeksData.map(w => this.mapWeekFromDb(w));
        weeks.sort((a, b) => (toYMD(a.startDate) || '') > (toYMD(b.startDate) || '') ? 1 : -1);
        LocalDB.setList('weeks', weeks);
      }
      if (Array.isArray(dutyData)) {
        const dutyMap = LocalDB.getDutyStaffMap() || {};
        dutyData.forEach(d => {
          if (d && d.date) dutyMap[toYMD(d.date)] = d.officer;
        });
        LocalDB.setDutyStaffMap(dutyMap);
      }
      if (Array.isArray(settingsData)) {
        settingsData.forEach(row => {
          if (row.key === 'school_settings') LocalDB.set('school_settings', row.value);
          if (row.key === 'announcements_config') LocalDB.saveAnnouncementsConfig(row.value);
          if (row.key === 'clinic_custom_data') LocalDB.set('clinic_custom_data', row.value || {});
        });
      }
      if (Array.isArray(clinicsData)) {
        const customData = LocalDB.get('clinic_custom_data') || {};
        const clinics = clinicsData.map(c => {
          const item = this.mapClinicFromDb(c);
          const custom = customData[String(item.id)] || {};
          if (custom.time) item.time = custom.time;
          if (custom.notes !== undefined && (!item.notes || custom.notes)) item.notes = custom.notes;
          if (custom.topic !== undefined) item.topic = custom.topic;
          if (custom.subject) { item.subject = custom.subject; item.subjectName = custom.subject; }
          return item;
        });
        LocalDB.setList('clinics', clinics);
      }
      if (Array.isArray(attendanceData)) {
        LocalDB.setList('attendance', attendanceData.map(a => this.mapAttendanceFromDb(a)));
      }

      return true;
    } catch (err) {
      console.warn('[SupabaseAPI] fetchAll error:', err);
      return false;
    }
  },

  // อัปโหลดข้อมูลทั้งหมดจาก LocalDB ขึ้น Supabase (Initial Migration)
  async uploadAll() {
    if (!this.client) this.init();
    if (!this.client) return { success: false, message: 'ยังไม่ได้เชื่อมต่อ Supabase' };

    try {
      const teachers = (LocalDB.getTeachers() || []).map(t => this.mapTeacherToDb(t));
      const students = (LocalDB.getStudents() || []).map(s => this.mapStudentToDb(s));
      const staff = (LocalDB.getStaff() || []).map(s => this.mapStaffToDb(s));
      const weeks = (LocalDB.getWeeks() || []).map(w => this.mapWeekToDb(w));
      const clinics = (LocalDB.getClinics() || []).map(c => this.mapClinicToDb(c));
      const dutyMap = LocalDB.getDutyStaffMap() || {};
      const dutyRows = Object.entries(dutyMap).map(([date, officer]) => ({ date, officer }));

      const schoolSettings = LocalDB.get('school_settings') || { semester: '1', academicYear: '2569' };
      const annConfig = LocalDB.get('announcements_config') || {};
      const customData = LocalDB.get('clinic_custom_data') || {};
      (LocalDB.getClinics() || []).forEach(c => {
        if (c.id && (c.time || c.notes)) {
          customData[String(c.id)] = { time: c.time || '18:30–20:30', notes: c.notes || '' };
        }
      });

      if (teachers.length) await this.client.from('teachers').upsert(teachers);
      if (students.length) await this.client.from('students').upsert(students);
      if (staff.length) await this.client.from('staff').upsert(staff);
      if (weeks.length) await this.client.from('weeks').upsert(weeks);
      if (clinics.length) {
        const { error } = await this.client.from('clinics').upsert(clinics);
        if (error && (error.code === '42703' || String(error.message).includes('time') || String(error.message).includes('notes'))) {
          const safeClinics = clinics.map(c => {
            const sc = { ...c };
            delete sc.time;
            delete sc.notes;
            return sc;
          });
          await this.client.from('clinics').upsert(safeClinics);
        }
      }
      if (dutyRows.length) await this.client.from('duty_staff').upsert(dutyRows);

      const attendance = (LocalDB.getAttendance() || []).map(a => this.mapAttendanceToDb(a));
      if (attendance.length) await this.client.from('attendance').upsert(attendance);

      await this.client.from('settings').upsert([
        { key: 'school_settings', value: schoolSettings, updated_at: new Date() },
        { key: 'announcements_config', value: annConfig, updated_at: new Date() },
        { key: 'clinic_custom_data', value: customData, updated_at: new Date() }
      ]);

      return { success: true, message: 'ส่งข้อมูลทั้งหมดขึ้น Supabase เรียบร้อยแล้ว' };
    } catch (err) {
      console.error('[SupabaseAPI] uploadAll error:', err);
      return { success: false, message: err.message };
    }
  },

  // --- CRUD Operations ---
  async saveClinic(c) {
    if (!this.client) return;
    try {
      // 1. Sync custom time, notes, topic & subject to Supabase settings table (works 100% across all devices)
      const customData = LocalDB.get('clinic_custom_data') || {};
      customData[String(c.id)] = {
        time: c.time || '18:30–20:30',
        notes: c.notes || '',
        topic: c.topic || '',
        subject: c.subject || c.subjectName || ''
      };
      LocalDB.set('clinic_custom_data', customData);
      await this.client.from('settings').upsert({
        key: 'clinic_custom_data',
        value: customData,
        updated_at: new Date()
      });

      // 2. Upsert to clinics table (including time, notes & topic if columns exist, with safe fallback)
      const dbRow = this.mapClinicToDb(c);
      const { error } = await this.client.from('clinics').upsert(dbRow);
      if (error && (error.code === '42703' || String(error.message).includes('time') || String(error.message).includes('notes') || String(error.message).includes('topic'))) {
        const safeRow = { ...dbRow };
        delete safeRow.time;
        delete safeRow.notes;
        delete safeRow.topic;
        await this.client.from('clinics').upsert(safeRow);
      }
    } catch (e) { console.warn('Supabase saveClinic error:', e); }
  },

  async deleteClinic(id) {
    if (!this.client) return;
    try {
      const customData = LocalDB.get('clinic_custom_data') || {};
      if (customData[String(id)]) {
        delete customData[String(id)];
        LocalDB.set('clinic_custom_data', customData);
        await this.client.from('settings').upsert({
          key: 'clinic_custom_data',
          value: customData,
          updated_at: new Date()
        });
      }
      await this.client.from('clinics').delete().eq('id', String(id));
    } catch (e) { console.warn('Supabase deleteClinic error:', e); }
  },

  async saveWeek(w) {
    if (!this.client) return;
    try {
      await this.client.from('weeks').upsert(this.mapWeekToDb(w));
    } catch (e) { console.warn('Supabase saveWeek error:', e); }
  },

  async deleteWeek(id) {
    if (!this.client) return;
    try {
      await this.client.from('weeks').delete().eq('id', String(id));
    } catch (e) { console.warn('Supabase deleteWeek error:', e); }
  },

  async saveTeacher(t) {
    if (!this.client) return;
    try {
      await this.client.from('teachers').upsert(this.mapTeacherToDb(t));
    } catch (e) { console.warn('Supabase saveTeacher error:', e); }
  },

  async deleteTeacher(id) {
    if (!this.client) return;
    try {
      await this.client.from('teachers').delete().eq('id', String(id));
    } catch (e) { console.warn('Supabase deleteTeacher error:', e); }
  },

  async saveStudent(s) {
    if (!this.client) return;
    try {
      await this.client.from('students').upsert(this.mapStudentToDb(s));
    } catch (e) { console.warn('Supabase saveStudent error:', e); }
  },

  async deleteStudent(id) {
    if (!this.client) return;
    try {
      await this.client.from('students').delete().eq('id', String(id));
    } catch (e) { console.warn('Supabase deleteStudent error:', e); }
  },

  async saveStaff(s) {
    if (!this.client) return;
    try {
      if (Array.isArray(s)) {
        await this.client.from('staff').upsert(s.map(x => this.mapStaffToDb(x)));
      } else {
        await this.client.from('staff').upsert(this.mapStaffToDb(s));
      }
    } catch (e) { console.warn('Supabase saveStaff error:', e); }
  },

  async deleteStaff(id) {
    if (!this.client) return;
    try {
      await this.client.from('staff').delete().eq('id', String(id));
    } catch (e) { console.warn('Supabase deleteStaff error:', e); }
  },

  async clearTable(tableName) {
    if (!this.client) return;
    try {
      if (tableName === 'duty_staff') {
        await this.client.from('duty_staff').delete().neq('date', '___none___');
      } else if (tableName === 'settings') {
        await this.client.from('settings').delete().neq('key', '___none___');
      } else {
        await this.client.from(tableName).delete().neq('id', '___none___');
      }
    } catch (e) {
      console.warn(`Supabase clearTable(${tableName}) error:`, e);
    }
  },

  async saveDutyStaff(dutyMap, weeks) {
    if (!this.client) return;
    try {
      const dutyRows = Object.entries(dutyMap || {}).map(([date, officer]) => ({ date, officer }));
      if (dutyRows.length) {
        await this.client.from('duty_staff').upsert(dutyRows);
      }
      if (Array.isArray(weeks) && weeks.length) {
        await this.client.from('weeks').upsert(weeks.map(w => this.mapWeekToDb(w)));
      }
    } catch (e) { console.warn('Supabase saveDutyStaff error:', e); }
  },

  async saveSettings(settings) {
    if (!this.client) return;
    try {
      await this.client.from('settings').upsert({
        key: 'school_settings',
        value: settings,
        updated_at: new Date()
      });
    } catch (e) { console.warn('Supabase saveSettings error:', e); }
  },

  async saveAnnouncementsConfig(cfg) {
    if (!this.client) return;
    try {
      await this.client.from('settings').upsert({
        key: 'announcements_config',
        value: cfg,
        updated_at: new Date()
      });
    } catch (e) { console.warn('Supabase saveAnnouncementsConfig error:', e); }
  },

  // --- Mappers ---
  mapClinicToDb(c) {
    return {
      id: String(c.id),
      subject_id: String(c.subjectId || c.subject_id || ''),
      subject_name: c.subject || c.subjectName || c.subject_name || '',
      teacher_id: String(c.teacherId || c.teacher_id || ''),
      teacher_name: c.teacherName || c.teacher_name || '',
      room: c.room || '',
      grade: Number(c.grade) || 1,
      day_of_week: Number(c.dayOfWeek !== undefined ? c.dayOfWeek : c.day_of_week) || 0,
      date: toYMD(c.date) || '',
      week_id: c.weekId || c.week_id || '',
      status: c.status || 'active',
      time: c.time || '18:30–20:30',
      notes: c.notes || '',
      topic: c.topic || '',
      student_count: Number(c.studentCount || (c.studentList && c.studentList.length) || 0),
      student_list: c.studentList || []
    };
  },

  mapClinicFromDb(row) {
    return {
      id: row.id,
      subject: row.subject_name || row.subject || '',
      subjectName: row.subject_name || row.subject || '',
      subjectId: row.subject_id || '',
      teacherId: row.teacher_id || '',
      teacherName: row.teacher_name || '',
      room: row.room || '',
      grade: Number(row.grade) || 1,
      dayOfWeek: Number(row.day_of_week !== undefined ? row.day_of_week : row.dayOfWeek) || 0,
      date: toYMD(row.date) || '',
      weekId: row.week_id || row.weekId || '',
      status: row.status || 'active',
      time: row.time || '',
      notes: row.notes || '',
      topic: row.topic || '',
      studentCount: Number(row.student_count || (row.student_list && row.student_list.length) || 0),
      studentList: row.student_list || []
    };
  },

  mapWeekToDb(w) {
    return {
      id: String(w.id || w.weekId),
      week_id: String(w.weekId || w.id),
      week_num: Number(w.weekNum || w.week_num) || 1,
      start_date: toYMD(w.startDate || w.start_date),
      end_date: toYMD(w.endDate || w.end_date),
      label: w.label || '',
      no_classes: Boolean(w.noClasses || w.no_classes),
      duty_staff: w.dutyStaff || w.duty_staff || {}
    };
  },

  mapWeekFromDb(row) {
    return {
      id: row.id,
      weekId: row.week_id || row.id,
      weekNum: Number(row.week_num) || 1,
      startDate: toYMD(row.start_date),
      endDate: toYMD(row.end_date),
      label: row.label || '',
      noClasses: Boolean(row.no_classes),
      dutyStaff: row.duty_staff || {}
    };
  },

  mapTeacherToDb(t) {
    return {
      id: String(t.id),
      name: t.name || '',
      subject_group: t.subject_group || t.department || 'วิทยาศาสตร์และเทคโนโลยี',
      department: t.department || '',
      room: t.room || ''
    };
  },

  mapTeacherFromDb(row) {
    return {
      id: row.id,
      name: row.name || '',
      subject_group: row.subject_group || row.department || 'วิทยาศาสตร์และเทคโนโลยี',
      department: row.department || '',
      room: row.room || ''
    };
  },

  mapStudentToDb(s) {
    return {
      id: String(s.id),
      student_code: String(s.studentCode || s.student_code || ''),
      name: s.name || '',
      grade: Number(s.grade) || 1,
      room: Number(s.room) || 1,
      number: Number(s.number) || 1,
      dormitory: s.dormitory || 'D1'
    };
  },

  mapStudentFromDb(row) {
    return {
      id: row.id,
      studentCode: row.student_code || '',
      name: row.name || '',
      grade: Number(row.grade) || 1,
      room: Number(row.room) || 1,
      number: Number(row.number) || 1,
      dormitory: row.dormitory || 'D1'
    };
  },

  mapStaffToDb(s) {
    return {
      id: String(s.id),
      name: s.name || ''
    };
  },

  mapStaffFromDb(row) {
    return {
      id: row.id,
      name: row.name || ''
    };
  },

  mapAttendanceToDb(a) {
    return {
      id: String(a.id || `att_${a.clinicId || a.clinic_id}_${a.studentId || a.student_id}`),
      clinic_id: String(a.clinicId || a.clinic_id || ''),
      student_id: String(a.studentId || a.student_id || ''),
      student_code: String(a.studentCode || a.student_code || ''),
      date: toYMD(a.date),
      status: a.status || 'present',
      note: a.note || ''
    };
  },

  mapAttendanceFromDb(row) {
    return {
      id: row.id,
      clinicId: row.clinic_id,
      studentId: row.student_id,
      studentCode: row.student_code || '',
      date: toYMD(row.date),
      status: row.status || 'present',
      note: row.note || ''
    };
  },

  async setAttendanceForClinic(clinicId, records) {
    if (!this.client) return;
    try {
      await this.client.from('attendance').delete().eq('clinic_id', String(clinicId));
      if (records && records.length) {
        const rows = records.map(r => this.mapAttendanceToDb(r));
        await this.client.from('attendance').upsert(rows);
      }
    } catch (e) {
      console.warn('Supabase setAttendanceForClinic error:', e);
    }
  }
};
