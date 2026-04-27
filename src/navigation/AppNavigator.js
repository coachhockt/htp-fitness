import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { COLORS, FONTS } from '../theme';
import { useAuth } from '../context/AuthContext';

import AuthScreen from '../screens/AuthScreen';
import CreateProfileScreen from '../screens/CreateProfileScreen';
import UserDashboardScreen from '../screens/UserDashboardScreen';
import ClientsScreen from '../screens/ClientsScreen';
import ClientDetailScreen from '../screens/ClientDetailScreen';
import NewSessionScreen from '../screens/NewSessionScreen';
import SessionDetailScreen from '../screens/SessionDetailScreen';
import ProgressScreen from '../screens/ProgressScreen';
import AdminScreen from '../screens/AdminScreen';
import ActivityCalendarScreen from '../screens/ActivityCalendarScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  const isAdmin = user?.role === 'admin';
  const hasProfile = !!user?.profile;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontWeight: '700', fontFamily: FONTS.bold },
          contentStyle: { backgroundColor: COLORS.background },
          headerShadowVisible: false,
        }}
      >
        {!user ? (
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ headerShown: false }}
          />
        ) : isAdmin ? (
          <>
            <Stack.Screen
              name="Clients"
              component={ClientsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ClientDetail"
              component={ClientDetailScreen}
              options={({ route }) => ({ title: route.params?.name || 'Client' })}
            />
            <Stack.Screen
              name="NewSession"
              component={NewSessionScreen}
              options={{ title: 'New Session' }}
            />
            <Stack.Screen
              name="SessionDetail"
              component={SessionDetailScreen}
              options={{ title: 'Session' }}
            />
            <Stack.Screen
              name="Progress"
              component={ProgressScreen}
              options={({ route }) => ({ title: `${route.params?.name || 'Client'} Progress` })}
            />
            <Stack.Screen
              name="Admin"
              component={AdminScreen}
              options={{ title: 'Manage Accounts' }}
            />
            <Stack.Screen
              name="ActivityCalendar"
              component={ActivityCalendarScreen}
              options={{ title: 'Activity History' }}
            />
          </>
        ) : !hasProfile ? (
          <Stack.Screen
            name="CreateProfile"
            component={CreateProfileScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Dashboard"
              component={UserDashboardScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="NewSession"
              component={NewSessionScreen}
              options={{ title: 'New Session' }}
            />
            <Stack.Screen
              name="SessionDetail"
              component={SessionDetailScreen}
              options={{ title: 'Session' }}
            />
            <Stack.Screen
              name="Progress"
              component={ProgressScreen}
              options={({ route }) => ({ title: `${route.params?.name || 'My'} Progress` })}
            />
            <Stack.Screen
              name="ActivityCalendar"
              component={ActivityCalendarScreen}
              options={{ title: 'Activity History' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
