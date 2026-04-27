import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Modal, Pressable, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc, Timestamp, orderBy, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../theme';
import DateTimePicker from '@react-native-community/datetimepicker';
import { requestPermissions, scheduleWeeklyReminders, scheduleDateReminder } from '../utils/notifications';

const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonthData(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // 0=Sun in JS, convert to Mon-based (0=Mon)
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  return { daysInMonth, startDay };
}

function formatMonth(year, month) {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const DEFAULT_SCHEDULE = {
  days: {
    mon: { enabled: false, label: '' },
    tue: { enabled: false, label: '' },
    wed: { enabled: false, label: '' },
    thu: { enabled: false, label: '' },
    fri: { enabled: false, label: '' },
    sat: { enabled: false, label: '' },
    sun: { enabled: false, label: '' },
  },
  specificDates: [],
  reminderTime: '07:00',
};

export default function ActivityCalendarScreen({ navigation }) {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessionDays, setSessionDays] = useState(new Set());
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingDay, setEditingDay] = useState(null);
  const [labelInput, setLabelInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [specificLabelInput, setSpecificLabelInput] = useState('');
  const [showSpecificLabelStep, setShowSpecificLabelStep] = useState(false);
  const [allSessions, setAllSessions] = useState([]);
  const [sessionPage, setSessionPage] = useState(0);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { daysInMonth, startDay } = getMonthData(year, month);
  const today = new Date();

  // Fetch sessions for displayed month
  useEffect(() => {
    async function fetchSessions() {
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
      const q = query(
        collection(db, 'sessions'),
        where('clientId', '==', user.uid),
        where('date', '>=', Timestamp.fromDate(startOfMonth)),
        where('date', '<=', Timestamp.fromDate(endOfMonth))
      );
      const snap = await getDocs(q);
      const days = new Set();
      snap.docs.forEach(d => {
        const date = d.data().date?.toDate?.();
        if (date) days.add(date.getDate());
      });
      setSessionDays(days);
    }
    fetchSessions();
  }, [year, month, user.uid]);

  // Fetch schedule
  useEffect(() => {
    async function fetchSchedule() {
      const docRef = doc(db, 'schedules', user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setSchedule(snap.data());
      }
    }
    fetchSchedule();
  }, [user.uid]);

  // Fetch all sessions for history list
  useEffect(() => {
    const q = query(
      collection(db, 'sessions'),
      where('clientId', '==', user.uid),
      orderBy('date', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setAllSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user.uid]);

  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(allSessions.length / PAGE_SIZE);
  const pagedSessions = allSessions.slice(sessionPage * PAGE_SIZE, (sessionPage + 1) * PAGE_SIZE);

  function formatSessionDate(ts) {
    if (!ts) return 'In progress';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function totalSets(session) {
    return session.exercises?.reduce((n, ex) => n + (ex.sets?.length || 0), 0) || 0;
  }

  function confirmDeleteSession(session) {
    Alert.alert(
      'Delete Session',
      `Delete the session from ${formatSessionDate(session.date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc(db, 'sessions', session.id)) },
      ]
    );
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function toggleDay(day) {
    setSchedule(prev => ({
      ...prev,
      days: {
        ...prev.days,
        [day]: { ...prev.days[day], enabled: !prev.days[day].enabled },
      },
    }));
  }

  function openLabelEdit(day) {
    setEditingDay(day);
    setLabelInput(schedule.days[day]?.label || '');
  }

  function saveLabelEdit() {
    if (editingDay) {
      setSchedule(prev => ({
        ...prev,
        days: {
          ...prev.days,
          [editingDay]: { ...prev.days[editingDay], label: labelInput.trim() },
        },
      }));
    }
    setEditingDay(null);
    setLabelInput('');
  }

  function handleTimeChange(event, date) {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (date) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      setSchedule(prev => ({ ...prev, reminderTime: `${hours}:${minutes}` }));
    }
  }

  function getReminderDate() {
    const [h, m] = (schedule.reminderTime || '07:00').split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      await saveScheduleData(schedule);
      Alert.alert('Saved', 'Your workout schedule has been saved!');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  // Determine which days of week are scheduled for calendar highlighting
  function isScheduledDay(dayNum) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const specific = schedule.specificDates || {};
    // Specific one-off dates always show (even past)
    if (Array.isArray(specific) ? specific.includes(dateStr) : dateStr in specific) return true;
    // Recurring weekly only shows for today and future
    if (isPastDay(dayNum)) return false;
    const date = new Date(year, month, dayNum);
    const jsDay = date.getDay(); // 0=Sun
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][jsDay];
    return schedule.days[dayKey]?.enabled;
  }

  function formatTime(timeStr) {
    const [h, m] = (timeStr || '07:00').split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  function getSelectedDateStr() {
    if (!selectedDay) return '';
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  }

  function getSelectedDayKey() {
    if (!selectedDay) return '';
    const date = new Date(year, month, selectedDay);
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
  }

  function getSelectedDayLabel() {
    if (!selectedDay) return '';
    const date = new Date(year, month, selectedDay);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function isDayCurrentlyScheduled() {
    if (!selectedDay) return false;
    const dateStr = getSelectedDateStr();
    const specific = schedule.specificDates || {};
    if (Array.isArray(specific) ? specific.includes(dateStr) : dateStr in specific) return true;
    const dayKey = getSelectedDayKey();
    return schedule.days[dayKey]?.enabled;
  }

  function startScheduleSpecificDay() {
    setSpecificLabelInput('');
    setShowSpecificLabelStep(true);
  }

  async function confirmScheduleSpecificDay() {
    const dateStr = getSelectedDateStr();
    const oldSpecific = schedule.specificDates || {};
    // Migrate from old array format if needed
    const specificObj = Array.isArray(oldSpecific)
      ? oldSpecific.reduce((acc, d) => ({ ...acc, [d]: '' }), {})
      : { ...oldSpecific };
    specificObj[dateStr] = specificLabelInput.trim();
    const updated = { ...schedule, specificDates: specificObj };
    setSchedule(updated);
    setDayModalVisible(false);
    setShowSpecificLabelStep(false);
    await saveScheduleData(updated);
  }

  async function handleScheduleWeekly() {
    const dayKey = getSelectedDayKey();
    const updated = {
      ...schedule,
      days: { ...schedule.days, [dayKey]: { ...schedule.days[dayKey], enabled: true } },
    };
    setSchedule(updated);
    setDayModalVisible(false);
    await saveScheduleData(updated);
  }

  async function handleRemoveSchedule() {
    const dateStr = getSelectedDateStr();
    const dayKey = getSelectedDayKey();
    const oldSpecific = schedule.specificDates || {};
    const specificObj = Array.isArray(oldSpecific)
      ? oldSpecific.reduce((acc, d) => ({ ...acc, [d]: '' }), {})
      : { ...oldSpecific };
    delete specificObj[dateStr];
    const updated = {
      ...schedule,
      specificDates: specificObj,
      days: { ...schedule.days, [dayKey]: { ...schedule.days[dayKey], enabled: false } },
    };
    setSchedule(updated);
    setDayModalVisible(false);
    await saveScheduleData(updated);
  }

  async function saveScheduleData(data) {
    try {
      const payload = { ...data, updatedAt: new Date().toISOString() };
      await setDoc(doc(db, 'schedules', user.uid), payload);
    } catch (e) {
      Alert.alert('Error', e.message);
      return;
    }
    // Attempt notifications separately — don't block schedule save
    try {
      const hasPermission = await requestPermissions();
      if (hasPermission) {
        await scheduleWeeklyReminders(data);
        const specific = data.specificDates || {};
        const dateKeys = Array.isArray(specific) ? specific : Object.keys(specific);
        for (const dateStr of dateKeys) {
          await scheduleDateReminder(dateStr, data.reminderTime);
        }
      }
    } catch (_) {
      // Notifications not supported in this environment — that's ok
    }
  }

  // Build calendar grid
  const cells = [];
  for (let i = 0; i < startDay; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }

  const isToday = (d) => d && year === today.getFullYear() && month === today.getMonth() && d === today.getDate();

  function isPastDay(d) {
    if (!d) return false;
    const cellDate = new Date(year, month, d);
    cellDate.setHours(0, 0, 0, 0);
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    return cellDate < todayStart;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Calendar Header */}
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.calTitle}>{formatMonth(year, month)}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.weekRow}>
        {DAY_LABELS.map(d => (
          <Text key={d} style={styles.weekLabel}>{d}</Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.grid}>
        {cells.map((day, idx) => (
          <View key={idx} style={styles.cell}>
            {day && (
              <TouchableOpacity
                activeOpacity={isPastDay(day) ? 1 : 0.6}
                onPress={() => {
                  if (!isPastDay(day)) {
                    setSelectedDay(day);
                    setShowSpecificLabelStep(false);
                    setDayModalVisible(true);
                  }
                }}
                style={[
                  styles.dayCircle,
                  isToday(day) && styles.todayCircle,
                  isPastDay(day) && styles.pastDay,
                ]}
              >
                <Text style={[
                  styles.dayText,
                  isToday(day) && styles.todayText,
                  isPastDay(day) && styles.pastDayText,
                ]}>{day}</Text>
                {/* Dots */}
                <View style={styles.dotRow}>
                  {sessionDays.has(day) && <View style={styles.greenDot} />}
                  {isScheduledDay(day) && !sessionDays.has(day) && <View style={styles.goldDot} />}
                </View>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>Trained</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.accent }]} />
          <Text style={styles.legendText}>Scheduled</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.todayLegend]} />
          <Text style={styles.legendText}>Today</Text>
        </View>
      </View>

      {/* Schedule Section */}
      <Text style={styles.sectionTitle}>Workout Schedule</Text>

      <View style={styles.daysRow}>
        {DAYS_OF_WEEK.map((day, i) => (
          <TouchableOpacity
            key={day}
            style={[styles.dayToggle, schedule.days[day]?.enabled && styles.dayToggleActive]}
            onPress={() => toggleDay(day)}
            onLongPress={() => openLabelEdit(day)}
          >
            <Text style={[styles.dayToggleText, schedule.days[day]?.enabled && styles.dayToggleTextActive]}>
              {DAY_LABELS[i]}
            </Text>
            {schedule.days[day]?.label ? (
              <Text style={styles.dayLabelText} numberOfLines={1}>{schedule.days[day].label}</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>Long press a day to add a label</Text>

      {/* Reminder Time */}
      <View style={styles.reminderRow}>
        <View style={styles.reminderLeft}>
          <Ionicons name="notifications-outline" size={18} color={COLORS.textMuted} />
          <Text style={styles.reminderLabel}>Remind me at</Text>
        </View>
        <TouchableOpacity style={styles.timeBtn} onPress={() => setShowTimePicker(true)}>
          <Text style={styles.timeText}>{formatTime(schedule.reminderTime)}</Text>
        </TouchableOpacity>
      </View>

      {showTimePicker && (
        Platform.OS === 'ios' ? (
          <Modal transparent animationType="fade">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowTimePicker(false)}>
              <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
                <DateTimePicker
                  value={getReminderDate()}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange}
                  themeVariant="dark"
                />
                <TouchableOpacity style={styles.pickerDone} onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            value={getReminderDate()}
            mode="time"
            display="default"
            onChange={handleTimeChange}
          />
        )
      )}

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.5 }]}
        onPress={saveSchedule}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Schedule'}</Text>
      </TouchableOpacity>

      {/* Session History */}
      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>
        Session History ({allSessions.length})
      </Text>

      {pagedSessions.length > 0 ? (
        <>
          {pagedSessions.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.sessionCard}
              onPress={() => navigation.navigate('SessionDetail', { sessionId: item.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sessionDate}>{formatSessionDate(item.date)}</Text>
                <Text style={styles.sessionMeta}>
                  {item.exercises?.length || 0} exercise{item.exercises?.length !== 1 ? 's' : ''}
                  {'  ·  '}
                  {totalSets(item)} set{totalSets(item) !== 1 ? 's' : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.sessionDeleteBtn}
                onPress={() => confirmDeleteSession(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.sessionDeleteText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageBtn, sessionPage === 0 && styles.pageBtnDisabled]}
                onPress={() => setSessionPage(p => Math.max(0, p - 1))}
                disabled={sessionPage === 0}
              >
                <Text style={[styles.pageBtnText, sessionPage === 0 && styles.pageBtnTextDisabled]}>‹ Prev</Text>
              </TouchableOpacity>
              <Text style={styles.pageInfo}>{sessionPage + 1} / {totalPages}</Text>
              <TouchableOpacity
                style={[styles.pageBtn, sessionPage >= totalPages - 1 && styles.pageBtnDisabled]}
                onPress={() => setSessionPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={sessionPage >= totalPages - 1}
              >
                <Text style={[styles.pageBtnText, sessionPage >= totalPages - 1 && styles.pageBtnTextDisabled]}>Next ›</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <Text style={styles.emptyHistory}>No sessions logged yet.</Text>
      )}

      {/* Label Edit Modal */}
      <Modal visible={editingDay !== null} transparent animationType="fade">
        <Pressable style={styles.pickerOverlay} onPress={() => setEditingDay(null)}>
          <View style={styles.labelModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.labelTitle}>
              {editingDay ? `${DAY_LABELS[DAYS_OF_WEEK.indexOf(editingDay)]} Label` : ''}
            </Text>
            <TextInput
              style={styles.labelInput}
              placeholder="e.g. Push Day, Leg Day"
              placeholderTextColor={COLORS.textMuted}
              value={labelInput}
              onChangeText={setLabelInput}
              autoFocus
              maxLength={20}
            />
            <TouchableOpacity style={styles.labelSaveBtn} onPress={saveLabelEdit}>
              <Text style={styles.labelSaveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Day Tap Schedule Modal */}
      <Modal visible={dayModalVisible} transparent animationType="fade">
        <Pressable style={styles.pickerOverlay} onPress={() => { setDayModalVisible(false); setShowSpecificLabelStep(false); }}>
          <View style={styles.dayModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.dayModalTitle}>{getSelectedDayLabel()}</Text>

            {showSpecificLabelStep ? (
              <>
                <Text style={styles.dayModalSubtitle}>What type of training?</Text>
                <TextInput
                  style={styles.specificLabelInput}
                  placeholder="e.g. Push Day, Leg Day, Cardio"
                  placeholderTextColor={COLORS.textMuted}
                  value={specificLabelInput}
                  onChangeText={setSpecificLabelInput}
                  autoFocus
                  maxLength={25}
                />
                <TouchableOpacity style={styles.dayModalBtn} onPress={confirmScheduleSpecificDay}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#000" />
                  <Text style={styles.dayModalBtnText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dayModalClose} onPress={() => setShowSpecificLabelStep(false)}>
                  <Text style={styles.dayModalCloseText}>Back</Text>
                </TouchableOpacity>
              </>
            ) : !isDayCurrentlyScheduled() ? (
              <>
                <TouchableOpacity style={styles.dayModalBtn} onPress={startScheduleSpecificDay}>
                  <Ionicons name="calendar-outline" size={18} color="#000" />
                  <Text style={styles.dayModalBtnText}>Schedule this day only</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dayModalBtn} onPress={handleScheduleWeekly}>
                  <Ionicons name="repeat-outline" size={18} color="#000" />
                  <Text style={styles.dayModalBtnText}>
                    Schedule every {selectedDay ? new Date(year, month, selectedDay).toLocaleDateString('en-US', { weekday: 'long' }) : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dayModalClose} onPress={() => setDayModalVisible(false)}>
                  <Text style={styles.dayModalCloseText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={[styles.dayModalBtn, styles.dayModalBtnRemove]} onPress={handleRemoveSchedule}>
                  <Ionicons name="close-circle-outline" size={18} color={COLORS.text} />
                  <Text style={[styles.dayModalBtnText, { color: COLORS.text }]}>Remove schedule</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dayModalClose} onPress={() => setDayModalVisible(false)}>
                  <Text style={styles.dayModalCloseText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20 },

  // Calendar
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  calTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', fontFamily: FONTS.bold },
  navBtn: { padding: 8 },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekLabel: { flex: 1, textAlign: 'center', color: COLORS.textMuted, fontSize: 12, fontWeight: '600', fontFamily: FONTS.semiBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  cell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  todayCircle: { borderWidth: 2, borderColor: COLORS.accent },
  dayText: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.regular },
  todayText: { color: COLORS.accent, fontWeight: '700', fontFamily: FONTS.bold },
  pastDay: { opacity: 0.4 },
  pastDayText: { color: COLORS.textMuted },
  dotRow: { flexDirection: 'row', position: 'absolute', bottom: 2, gap: 2 },
  greenDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#4CAF50' },
  goldDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.accent },

  // Legend
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 28, paddingTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  todayLegend: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.accent },
  legendText: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.regular },

  // Schedule
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', fontFamily: FONTS.bold, marginBottom: 16 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dayToggle: {
    flex: 1,
    marginHorizontal: 2,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  dayToggleActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '20' },
  dayToggleText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', fontFamily: FONTS.semiBold },
  dayToggleTextActive: { color: COLORS.accent },
  dayLabelText: { color: COLORS.accent, fontSize: 8, fontFamily: FONTS.regular, marginTop: 2 },
  hint: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.regular, textAlign: 'center', marginBottom: 20 },

  // Reminder
  reminderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, backgroundColor: COLORS.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  reminderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reminderLabel: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.regular },
  timeBtn: { backgroundColor: COLORS.background, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border },
  timeText: { color: COLORS.accent, fontSize: 14, fontWeight: '700', fontFamily: FONTS.bold },

  // Save
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 14, padding: 18, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 15, fontFamily: FONTS.extraBold },

  // Pickers
  pickerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerContainer: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, width: '90%' },
  pickerDone: { alignItems: 'center', padding: 12, marginTop: 8 },
  pickerDoneText: { color: COLORS.accent, fontSize: 15, fontWeight: '700', fontFamily: FONTS.bold },

  // Label Modal
  labelModal: { backgroundColor: COLORS.card, borderRadius: 14, padding: 24, width: '80%' },
  labelTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', fontFamily: FONTS.bold, marginBottom: 16, textAlign: 'center' },
  labelInput: { backgroundColor: COLORS.background, borderRadius: 10, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, fontFamily: FONTS.regular, marginBottom: 16 },
  labelSaveBtn: { backgroundColor: COLORS.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  labelSaveBtnText: { color: '#000', fontWeight: '700', fontSize: 14, fontFamily: FONTS.bold },

  // Day Tap Modal
  dayModal: { backgroundColor: COLORS.card, borderRadius: 14, padding: 24, width: '80%' },
  dayModalTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', fontFamily: FONTS.bold, marginBottom: 20, textAlign: 'center' },
  dayModalBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.accent, borderRadius: 10, padding: 14, marginBottom: 10 },
  dayModalBtnRemove: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  dayModalBtnText: { color: '#000', fontWeight: '600', fontSize: 14, fontFamily: FONTS.semiBold },
  dayModalSubtitle: { color: COLORS.textMuted, fontSize: 13, fontFamily: FONTS.regular, marginBottom: 12, textAlign: 'center' },
  specificLabelInput: { backgroundColor: COLORS.background, borderRadius: 10, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, fontFamily: FONTS.regular, marginBottom: 14 },
  dayModalClose: { alignItems: 'center', padding: 12, marginTop: 4 },
  dayModalCloseText: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.regular },

  // Session History
  sessionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 11,
    padding: 14,
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sessionDate: { color: COLORS.text, fontWeight: '600', fontSize: 14.5, fontFamily: FONTS.semiBold },
  sessionMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 3, fontFamily: FONTS.regular },
  sessionDeleteBtn: { position: 'absolute', top: 8, right: 10, padding: 4 },
  sessionDeleteText: { color: COLORS.textMuted, fontSize: 10, fontFamily: FONTS.semiBold },
  emptyHistory: { color: COLORS.textMuted, textAlign: 'center', marginTop: 20, fontSize: 13, fontFamily: FONTS.regular },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  pageBtn: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pageBtnDisabled: { opacity: 0.3 },
  pageBtnText: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.semiBold },
  pageBtnTextDisabled: { color: COLORS.textMuted },
  pageInfo: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular },
});
