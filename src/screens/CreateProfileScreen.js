import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ScrollView, Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../theme';

export default function CreateProfileScreen() {
  const { saveProfile } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [saving, setSaving] = useState(false);

  const sexOptions = ['Male', 'Female'];

  async function handleSubmit() {
    if (!firstName.trim()) {
      Alert.alert('Error', 'First name is required');
      return;
    }
    if (!age.trim() || isNaN(parseInt(age.trim()))) {
      Alert.alert('Error', 'Age is required');
      return;
    }
    const fullName = lastName.trim()
      ? `${firstName.trim()} ${lastName.trim()}`
      : firstName.trim();
    setSaving(true);
    try {
      await saveProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        fullName,
        age: parseInt(age.trim()),
        sex: sex || null,
        bodyWeight: bodyWeight.trim() ? parseFloat(bodyWeight.trim()) : null,
        bodyFat: bodyFat.trim() ? parseFloat(bodyFat.trim()) : null,
      });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.title}>Create Your Profile</Text>

        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="First Name *"
            placeholderTextColor={COLORS.textMuted}
            value={firstName}
            onChangeText={setFirstName}
            autoFocus
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Last Name"
            placeholderTextColor={COLORS.textMuted}
            value={lastName}
            onChangeText={setLastName}
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Age *"
          placeholderTextColor={COLORS.textMuted}
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Sex</Text>
        <View style={styles.sexRow}>
          {sexOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.sexBtn, sex === option && styles.sexBtnActive]}
              onPress={() => setSex(sex === option ? '' : option)}
            >
              <Text style={[styles.sexBtnText, sex === option && styles.sexBtnTextActive]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Body Weight (lbs)"
          placeholderTextColor={COLORS.textMuted}
          value={bodyWeight}
          onChangeText={setBodyWeight}
          keyboardType="decimal-pad"
        />

        <TextInput
          style={styles.input}
          placeholder="Body Fat %"
          placeholderTextColor={COLORS.textMuted}
          value={bodyFat}
          onChangeText={setBodyFat}
          keyboardType="decimal-pad"
        />

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Create Profile'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: 32,
    paddingTop: 60,
  },
  logoImage: {
    width: '100%',
    height: 80,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    marginBottom: 32,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 12,
    fontFamily: FONTS.regular,
  },
  nameRow: { flexDirection: 'row', gap: 10 },
  sexRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  sexBtn: {
    flex: 1,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  sexBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '1A',
  },
  sexBtnText: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  sexBtnTextActive: {
    color: COLORS.accent,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
    fontFamily: FONTS.extraBold,
  },
});
