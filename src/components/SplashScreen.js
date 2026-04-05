import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';

export default function SplashScreen({ onFinish }) {
  const clipWidth = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(300),
      // Logo reveals from center outward
      Animated.timing(clipWidth, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }),
      Animated.delay(600),
      // Fade out
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start(() => onFinish());
  }, []);

  const revealWidth = clipWidth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, LOGO_WIDTH],
  });

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.center}>
        <Animated.View style={[styles.clip, { width: revealWidth }]}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const LOGO_WIDTH = 280;
const LOGO_HEIGHT = 80;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  center: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
    alignItems: 'center',
  },
  clip: {
    height: LOGO_HEIGHT,
    overflow: 'hidden',
    alignItems: 'center',
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
});
