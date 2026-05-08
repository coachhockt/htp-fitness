import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, deleteDoc, doc, orderBy,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../theme';

const TABS = ['My Saved', 'From Trainer'];

function totalSets(workout) {
  return (workout.exercises || []).reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);
}

function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SavedWorkoutsScreen({ navigation }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [bookmarks, setBookmarks] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'savedWorkouts'),
      where('clientId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setBookmarks(all.filter(w => w.type === 'bookmark'));
        setAssigned(all.filter(w => w.type === 'assigned'));
        setLoading(false);
      },
      (err) => {
        console.error('[SavedWorkouts]', err);
        Alert.alert('Saved Workouts failed to load', err?.message ?? 'Unknown error');
        setLoading(false);
      },
    );
    return unsub;
  }, [user.uid]);

  function confirmDelete(item) {
    Alert.alert('Remove Saved Workout', `Remove "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => deleteDoc(doc(db, 'savedWorkouts', item.id)),
      },
    ]);
  }

  const data = tab === 0 ? bookmarks : assigned;

  function renderCard({ item }) {
    const exerciseCount = item.exercises?.length || 0;
    const setCount = totalSets(item);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('SessionDetail', { sessionId: item.sessionId || null, savedWorkout: item })}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardMeta}>
            {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
            {'  ·  '}
            {setCount} set{setCount !== 1 ? 's' : ''}
          </Text>
          {item.note ? <Text style={styles.cardNote}>{item.note}</Text> : null}
          <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
        </View>
        {tab === 0 ? (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => confirmDelete(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="barbell-outline" size={20} color={COLORS.accent} />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((label, i) => (
          <TouchableOpacity
            key={label}
            style={[styles.tab, tab === i && styles.tabActive]}
            onPress={() => setTab(i)}
          >
            <Text style={[styles.tabText, tab === i && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name={tab === 0 ? 'bookmark-outline' : 'barbell-outline'}
            size={48}
            color={COLORS.border}
          />
          <Text style={styles.emptyText}>
            {tab === 0
              ? 'No saved workouts yet.\nBookmark sessions you like from Activity History.'
              : 'No assigned workouts yet.\nYour trainer can assign workout plans for you.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
  },
  tabText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  tabTextActive: {
    color: COLORS.accent,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: FONTS.bold,
    marginBottom: 4,
  },
  cardMeta: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginBottom: 2,
  },
  cardNote: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.regular,
    fontStyle: 'italic',
    marginTop: 4,
  },
  cardDate: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: FONTS.regular,
    marginTop: 4,
  },
  deleteBtn: {
    padding: 8,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
  },
});
