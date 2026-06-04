import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  Modal, Pressable, ScrollView,
} from 'react-native';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../theme';

// Tab order. 'pending' is the approval inbox for new signups.
const TABS = ['pending', 'inPerson', 'online', 'inactive'];

// Stored category values are kept terse; this maps them to display labels.
const CATEGORY_LABELS = { pending: 'Pending', inPerson: 'In-Person', online: 'Online', inactive: 'Inactive' };

function getCategory(u) {
  if (
    u.category === 'pending' || u.category === 'inactive'
    || u.category === 'online' || u.category === 'inPerson'
  ) {
    return u.category;
  }
  // Legacy users (and any stale 'active' values) default to In-Person.
  return 'inPerson';
}

function formatSignupDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminScreen() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('inPerson'); // 'inPerson' | 'online' | 'inactive'
  const [moveMenu, setMoveMenu] = useState(null); // { userId, email, currentCategory }

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.id !== user.uid);
      list.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      setUsers(list);
      setLoading(false);
    });
  }, []);

  async function moveTo(userId, newCategory) {
    setMoveMenu(null);
    try {
      // Also clear legacy status so a legacy 'closed' doesn't perpetually block login
      await updateDoc(doc(db, 'users', userId), {
        category: newCategory,
        status: newCategory === 'inactive' ? 'inactive' : 'active',
      });
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  async function dismissNew(userId) {
    try {
      await updateDoc(doc(db, 'users', userId), { isNew: false });
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  function confirmReject(item) {
    Alert.alert(
      'Reject signup?',
      `${item.email} will be moved to Inactive and won't be able to use the app. You can approve them later from the Inactive tab.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => moveTo(item.id, 'inactive') },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  const counts = { pending: 0, inPerson: 0, online: 0, inactive: 0 };
  users.forEach(u => { counts[getCategory(u)]++; });
  const visible = users.filter(u => getCategory(u) === tab);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabBar}
      >
        {TABS.map(t => {
          const active = tab === t;
          const pendingAlert = t === 'pending' && counts.pending > 0 && !active;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.tab, active && styles.tabActive, pendingAlert && styles.tabAlert]}
              onPress={() => setTab(t)}
            >
              <Text style={[
                styles.tabText,
                active && styles.tabTextActive,
                pendingAlert && styles.tabTextAlert,
              ]}>
                {CATEGORY_LABELS[t]} ({counts[t]})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={visible}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isPending = getCategory(item) === 'pending';
          return (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <View style={styles.emailRow}>
                  <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                  {item.isNew && !isPending && (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>NEW</Text>
                    </View>
                  )}
                </View>
                {isPending && !!formatSignupDate(item.createdAt) && (
                  <Text style={styles.signupDate}>Signed up {formatSignupDate(item.createdAt)}</Text>
                )}
              </View>
              <View style={styles.actions}>
                {isPending ? (
                  <>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => confirmReject(item)}
                    >
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => setMoveMenu({
                        userId: item.id,
                        email: item.email,
                        currentCategory: 'pending',
                        mode: 'approve',
                      })}
                    >
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {item.isNew && (
                      <TouchableOpacity
                        style={styles.dismissBtn}
                        onPress={() => dismissNew(item.id)}
                      >
                        <Text style={styles.dismissBtnText}>Dismiss</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.moveBtn}
                      onPress={() => setMoveMenu({
                        userId: item.id,
                        email: item.email,
                        currentCategory: getCategory(item),
                        mode: 'move',
                      })}
                    >
                      <Text style={styles.moveBtnText}>Move</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No accounts in {CATEGORY_LABELS[tab]}.
          </Text>
        }
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      />

      <Modal visible={moveMenu !== null} transparent animationType="fade" onRequestClose={() => setMoveMenu(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMoveMenu(null)}>
          <View style={styles.menuCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.menuTitle} numberOfLines={1}>
              {moveMenu?.mode === 'approve' ? 'Approve' : 'Move'} {moveMenu?.email}
            </Text>
            {moveMenu?.mode === 'approve' && (
              <Text style={styles.menuSubtitle}>Choose a category to grant access.</Text>
            )}
            {(moveMenu?.mode === 'approve'
              ? ['inPerson', 'online']
              : ['inPerson', 'online', 'inactive']
            ).map(c => {
              const disabled = c === moveMenu?.currentCategory;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.menuOption, disabled && styles.menuOptionDisabled]}
                  disabled={disabled}
                  onPress={() => moveTo(moveMenu.userId, c)}
                >
                  <Text style={[styles.menuOptionText, disabled && styles.menuOptionTextDisabled]}>
                    {CATEGORY_LABELS[c]}{disabled ? '  (current)' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Tabs
  tabScroll: {
    flexGrow: 0,
  },
  tabBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  tabAlert: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '1A',
  },
  tabText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  tabTextActive: {
    color: '#000',
    fontFamily: FONTS.bold,
  },
  tabTextAlert: {
    color: COLORS.accent,
    fontFamily: FONTS.bold,
  },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  email: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    flexShrink: 1,
  },
  newBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newBadgeText: {
    color: '#000',
    fontSize: 10,
    fontFamily: FONTS.extraBold,
    letterSpacing: 0.5,
  },
  signupDate: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 4,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  dismissBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dismissBtnText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.semiBold,
  },
  moveBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.accent + '1A',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  moveBtnText: {
    color: COLORS.accent,
    fontSize: 13,
    fontFamily: FONTS.bold,
  },
  approveBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  approveBtnText: {
    color: '#000',
    fontSize: 13,
    fontFamily: FONTS.bold,
  },
  rejectBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rejectBtnText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },

  empty: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 60,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },

  // Move menu
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.bold,
    marginBottom: 12,
    textAlign: 'center',
  },
  menuSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: -6,
    marginBottom: 12,
    textAlign: 'center',
  },
  menuOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  menuOptionDisabled: {
    opacity: 0.4,
  },
  menuOptionText: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  menuOptionTextDisabled: {
    color: COLORS.textMuted,
  },
});
