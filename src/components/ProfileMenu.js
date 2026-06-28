import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, TYPE, RADIUS } from '../theme';

function getInitials(user) {
  if (user?.profile) {
    const first = user.profile.firstName?.[0] || '';
    const last = user.profile.lastName?.[0] || '';
    return (first + last).toUpperCase() || '?';
  }
  // Fallback to email initial for admin without profile
  return user?.email?.[0]?.toUpperCase() || '?';
}

export default function ProfileMenu({ user, onProfile, onSettings, onLogout, topOffset = 100, profileLabel = 'Profile', extraItems = [] }) {
  const [open, setOpen] = useState(false);
  const initials = getInitials(user);

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)}>
        <View style={styles.bubble}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
        <Ionicons name="settings-outline" size={14} color={COLORS.textMuted} style={styles.gearIcon} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={[styles.menu, { top: topOffset }]} onStartShouldSetResponder={() => true}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setOpen(false); onProfile?.(); }}
            >
              <Ionicons name={profileLabel === 'Admin' ? 'shield-outline' : 'person-outline'} size={18} color={COLORS.textBright} />
              <Text style={styles.menuText}>{profileLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setOpen(false); onSettings?.(); }}
            >
              <Ionicons name="settings-outline" size={18} color={COLORS.textBright} />
              <Text style={styles.menuText}>Settings</Text>
            </TouchableOpacity>
            {extraItems.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.menuItem}
                onPress={() => { setOpen(false); item.onPress?.(); }}
              >
                <Ionicons name={item.icon} size={18} color={COLORS.textBright} />
                <Text style={styles.menuText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setOpen(false); onLogout?.(); }}
            >
              <Ionicons name="log-out-outline" size={18} color={COLORS.danger} />
              <Text style={[styles.menuText, { color: COLORS.danger }]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: '#000',
    fontSize: TYPE.body,
    fontWeight: '800',
    fontFamily: FONTS.extraBold,
  },
  gearIcon: {
    marginLeft: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  menu: {
    position: 'absolute',
    right: 20,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    width: 200,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuText: {
    color: COLORS.textBright,
    fontSize: TYPE.body,
    fontFamily: FONTS.semiBold,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },
});
