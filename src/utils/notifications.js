import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermissions() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

const DAY_MAP = { sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7 };

export async function scheduleWeeklyReminders(schedule) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!schedule?.days || !schedule?.reminderTime) return;

  const [hours, minutes] = schedule.reminderTime.split(':').map(Number);

  for (const [day, config] of Object.entries(schedule.days)) {
    if (!config.enabled) continue;
    const weekday = DAY_MAP[day];
    if (!weekday) continue;

    const body = config.label
      ? `Time to train ${config.label}!`
      : 'Time to train!';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Workout Reminder',
        body,
        sound: true,
      },
      trigger: {
        type: SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour: hours,
        minute: minutes,
      },
    });
  }
}

export async function scheduleDateReminder(dateStr, reminderTime, label) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hours, minutes] = (reminderTime || '07:00').split(':').map(Number);
  const triggerDate = new Date(y, m - 1, d, hours, minutes);
  if (triggerDate <= new Date()) return;

  const body = label
    ? `Time to train ${label}!`
    : 'Time to train!';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Workout Reminder',
      body,
      sound: true,
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });
}

export async function cancelAllReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
