import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  Modal, Pressable, Platform,
} from 'react-native';
import { db } from '../../firebase';
import {
  collection, query, where, orderBy, onSnapshot, doc, deleteDoc,
} from 'firebase/firestore';
import { COLORS, FONTS, TYPE, RADIUS } from '../theme';
import { handledNoAccess } from '../access';
import DateTimePicker from '@react-native-community/datetimepicker';

const PAGE_SIZE = 10;

export default function SessionHistoryScreen({ route, navigation }) {
  const { clientId } = route.params;
  const [sessions, setSessions] = useState([]);
  const [page, setPage] = useState(0);
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [filtering, setFiltering] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'sessions'),
      where('clientId', '==', clientId),
      orderBy('date', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [clientId]);

  function formatDate(ts) {
    if (!ts) return 'In progress';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function totalSets(session) {
    return session.exercises?.reduce((n, ex) => n + (ex.sets?.length || 0), 0) || 0;
  }

  function confirmDelete(session) {
    Alert.alert(
      'Delete Session',
      `Delete the session from ${formatDate(session.date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'sessions', session.id));
            } catch (e) {
              if (!handledNoAccess(e)) Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  }

  function applyDateFilter() {
    if (!fromDate || !toDate) {
      Alert.alert('Select Dates', 'Please select both a start and end date.');
      return;
    }
    if (toDate < fromDate) {
      Alert.alert('Invalid Range', 'End date must be after start date.');
      return;
    }
    const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 14) {
      Alert.alert('Range Too Large', 'Maximum search range is 2 weeks.');
      return;
    }
    setFiltering(true);
    setPage(0);
  }

  function clearFilter() {
    setFromDate(null);
    setToDate(null);
    setFiltering(false);
    setPage(0);
  }

  function formatPickedDate(date) {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const filteredSessions = filtering
    ? sessions.filter(s => {
        if (!s.date) return false;
        const d = s.date.toDate ? s.date.toDate() : new Date(s.date);
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        return d >= fromDate && d <= to;
      })
    : sessions;

  const totalPages = Math.ceil(filteredSessions.length / PAGE_SIZE);
  const pagedSessions = filteredSessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function goToCurrentDate() {
    if (filtering) { clearFilter(); }
    setPage(0);
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={pagedSessions}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* Date Range Search */}
            <View style={styles.dateSearchRow}>
              <TouchableOpacity style={styles.dateInput} onPress={() => setShowFromPicker(true)}>
                <Text style={fromDate ? styles.dateInputText : styles.dateInputPlaceholder}>
                  {formatPickedDate(fromDate)}
                </Text>
              </TouchableOpacity>
              <Text style={styles.dateToText}>to</Text>
              <TouchableOpacity style={styles.dateInput} onPress={() => setShowToPicker(true)}>
                <Text style={toDate ? styles.dateInputText : styles.dateInputPlaceholder}>
                  {formatPickedDate(toDate)}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dateSearchActions}>
              <TouchableOpacity style={styles.searchBtn} onPress={applyDateFilter}>
                <Text style={styles.searchBtnText}>Search</Text>
              </TouchableOpacity>
              {filtering && (
                <TouchableOpacity style={styles.clearBtn} onPress={clearFilter}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            {filtering && (
              <Text style={styles.filterInfo}>
                Showing {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''} from {formatPickedDate(fromDate)} to {formatPickedDate(toDate)}
              </Text>
            )}
            {showFromPicker && (
              Platform.OS === 'ios' ? (
                <Modal transparent animationType="fade">
                  <Pressable style={styles.pickerOverlay} onPress={() => setShowFromPicker(false)}>
                    <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
                      <DateTimePicker
                        maximumDate={new Date()}
                        value={fromDate || new Date()}
                        mode="date"
                        display="inline"
                        onChange={(event, date) => {
                          if (date) setFromDate(date);
                        }}
                        themeVariant="dark"
                      />
                      <TouchableOpacity style={styles.pickerDone} onPress={() => setShowFromPicker(false)}>
                        <Text style={styles.pickerDoneText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Modal>
              ) : (
                <DateTimePicker
                  maximumDate={new Date()}
                  value={fromDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(event, date) => {
                    setShowFromPicker(false);
                    if (date) setFromDate(date);
                  }}
                />
              )
            )}
            {showToPicker && (
              Platform.OS === 'ios' ? (
                <Modal transparent animationType="fade">
                  <Pressable style={styles.pickerOverlay} onPress={() => setShowToPicker(false)}>
                    <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
                      <DateTimePicker
                        maximumDate={new Date()}
                        value={toDate || new Date()}
                        mode="date"
                        display="inline"
                        onChange={(event, date) => {
                          if (date) setToDate(date);
                        }}
                        themeVariant="dark"
                      />
                      <TouchableOpacity style={styles.pickerDone} onPress={() => setShowToPicker(false)}>
                        <Text style={styles.pickerDoneText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Modal>
              ) : (
                <DateTimePicker
                  maximumDate={new Date()}
                  value={toDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(event, date) => {
                    setShowToPicker(false);
                    if (date) setToDate(date);
                  }}
                />
              )
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('SessionDetail', { sessionId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>{formatDate(item.date)}</Text>
              <Text style={styles.meta}>
                {item.exercises?.length || 0} exercise{item.exercises?.length !== 1 ? 's' : ''}
                {'  ·  '}
                {totalSets(item)} set{totalSets(item) !== 1 ? 's' : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => confirmDelete(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          filteredSessions.length > 0 ? (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
                onPress={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <Text style={[styles.pageBtnText, page === 0 && styles.pageBtnTextDisabled]}>‹ Prev</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.currentBtn} onPress={goToCurrentDate}>
                <Text style={styles.currentBtnText}>Latest</Text>
              </TouchableOpacity>
              <Text style={styles.pageInfo}>{page + 1} / {totalPages}</Text>
              <TouchableOpacity
                style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
                onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <Text style={[styles.pageBtnText, page >= totalPages - 1 && styles.pageBtnTextDisabled]}>Next ›</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{filtering ? 'No sessions found in this date range.' : 'No sessions logged yet.'}</Text>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 20, paddingBottom: 40 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 11,
    padding: 14,
    marginBottom: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  date: { color: COLORS.textBright, fontWeight: '600', fontSize: TYPE.body, fontFamily: FONTS.semiBold },
  meta: { color: COLORS.textMuted, fontSize: TYPE.label, marginTop: 3, fontFamily: FONTS.regular },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    padding: 4,
  },
  deleteBtnText: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontFamily: FONTS.semiBold,
  },
  empty: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 48,
    fontSize: TYPE.body,
    lineHeight: 24,
    fontFamily: FONTS.regular,
  },

  // Date search
  dateSearchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  dateToText: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.regular,
    alignSelf: 'center',
  },
  dateInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    color: COLORS.textBright,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: TYPE.label,
    fontFamily: FONTS.regular,
  },
  dateSearchActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  searchBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  searchBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: TYPE.label,
    fontFamily: FONTS.bold,
  },
  clearBtn: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  clearBtnText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
  },
  filterInfo: {
    color: COLORS.accent,
    fontSize: TYPE.caption,
    fontFamily: FONTS.regular,
    marginBottom: 12,
  },
  dateInputText: { color: COLORS.textBright, fontSize: TYPE.label, fontFamily: FONTS.regular },
  dateInputPlaceholder: { color: COLORS.textMuted, fontSize: TYPE.label, fontFamily: FONTS.regular },
  pickerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerContainer: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 16, width: '90%' },
  pickerDone: { alignItems: 'center', padding: 12, marginTop: 8 },
  pickerDoneText: { color: COLORS.accent, fontSize: TYPE.body, fontWeight: '700', fontFamily: FONTS.bold },

  // Pagination
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
  pageBtnDisabled: {
    opacity: 0.3,
  },
  pageBtnText: {
    color: COLORS.textBright,
    fontSize: TYPE.label,
    fontFamily: FONTS.semiBold,
  },
  pageBtnTextDisabled: {
    color: COLORS.textMuted,
  },
  currentBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  currentBtnText: {
    color: '#000',
    fontSize: TYPE.label,
    fontWeight: '700',
    fontFamily: FONTS.bold,
  },
  pageInfo: {
    color: COLORS.textMuted,
    fontSize: TYPE.label,
    fontFamily: FONTS.regular,
  },
});
