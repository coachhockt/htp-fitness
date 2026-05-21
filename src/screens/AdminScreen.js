import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../theme';

export default function AdminScreen() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

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

  async function updateStatus(userId, email, newStatus, action) {
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} Account`,
      `Are you sure you want to ${action} ${email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          style: newStatus === 'closed' ? 'destructive' : 'default',
          onPress: async () => {
            await updateDoc(doc(db, 'users', userId), { status: newStatus });
          },
        },
      ]
    );
  }

  function getStatusColor(status) {
    if (status === 'active') return '#4CAF50';
    if (status === 'frozen') return '#FF9800';
    return COLORS.danger;
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.email}>{item.email}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                  {item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              {item.status === 'active' && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.freezeBtn]}
                  onPress={() => updateStatus(item.id, item.email, 'frozen', 'freeze')}
                >
                  <Text style={styles.freezeBtnText}>Freeze</Text>
                </TouchableOpacity>
              )}
              {item.status === 'frozen' && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.unfreezeBtn]}
                  onPress={() => updateStatus(item.id, item.email, 'active', 'unfreeze')}
                >
                  <Text style={styles.unfreezeBtnText}>Unfreeze</Text>
                </TouchableOpacity>
              )}
              {item.status === 'closed' && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.reopenBtn]}
                  onPress={() => updateStatus(item.id, item.email, 'active', 'reopen')}
                >
                  <Text style={styles.reopenBtnText}>Reopen</Text>
                </TouchableOpacity>
              )}
              {item.status !== 'closed' && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.closeBtn]}
                  onPress={() => updateStatus(item.id, item.email, 'closed', 'close')}
                >
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No other accounts yet.</Text>
        }
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  email: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: FONTS.semiBold,
    marginBottom: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  freezeBtn: {
    backgroundColor: '#FF98001A',
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  freezeBtnText: {
    color: '#FF9800',
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  unfreezeBtn: {
    backgroundColor: '#4CAF501A',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  unfreezeBtnText: {
    color: '#4CAF50',
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  closeBtn: {
    backgroundColor: COLORS.danger + '1A',
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  closeBtnText: {
    color: COLORS.danger,
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  reopenBtn: {
    backgroundColor: '#4CAF501A',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  reopenBtnText: {
    color: '#4CAF50',
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  empty: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 80,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
});
