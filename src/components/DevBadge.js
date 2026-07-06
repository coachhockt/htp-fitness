import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, TYPE } from '../theme';
import { IS_DEV_BACKEND } from '../../firebase';

// Small pill shown only when the app is pointed at the dev Firebase project
// (Expo Go / development bundles). Makes it impossible to confuse dev vs the
// real production app. Renders nothing in production builds.
export default function DevBadge() {
  const insets = useSafeAreaInsets();
  if (!IS_DEV_BACKEND) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 2 }]}>
      <View style={styles.badge}>
        <Text style={styles.text}>DEV DATA</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 8, zIndex: 1000, alignItems: 'flex-end' },
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: { color: '#000', fontSize: TYPE.caption, fontFamily: FONTS.extraBold, letterSpacing: 1 },
});
