import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  Modal, Pressable,
} from 'react-native';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../theme';

function getCategory(u) {
  if (u.category === 'inactive' || u.category === 'online' || u.category === 'active') {
    return u.category;
  }
  // Legacy users default to active per migration request.
  return 'active';
}

export default function AdminScreen() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active'); // 'active' | 'online' | 'inactive'
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

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  const counts = { active: 0, online: 0, inactive: 0 };
  users.forEach(u => { counts[getCategory(u)]++; });
  const visible = users.filter(u => getCategory(u) === tab);

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {['active', 'online', 'inactive'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <View style={styles.emailRow}>
                <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                {item.isNew && (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>NEW</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.actions}>
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
                })}
              >
                <Text style={styles.moveBtnText}>Move</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No accounts in {tab.charAt(0).toUpperCase() + tab.slice(1)}.
          </Text>
        }
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      />

      <Modal visible={moveMenu !== null} transparent animationType="fade" onRequestClose={() => setMoveMenu(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMoveMenu(null)}>
          <View style={styles.menuCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.menuTitle} numberOfLines={1}>
              Move {moveMenu?.email}
            </Text>
            {['active', 'online', 'inactive'].map(c => {
              const disabled = c === moveMenu?.currentCategory;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.menuOption, disabled && styles.menuOptionDisabled]}
                  disabled={disabled}
                  onPress={() => moveTo(moveMenu.userId, c)}
                >
                  <Text style={[styles.menuOptionText, disabled && styles.menuOptionTextDisabled]}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}{disabled ? '  (current)' : ''}
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
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
