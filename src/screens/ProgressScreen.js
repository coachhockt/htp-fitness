import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, TextInput,
  Modal, StatusBar, useWindowDimensions, BackHandler, ActivityIndicator,
} from 'react-native';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, FONTS, TYPE, RADIUS } from '../theme';
import { exerciseKey, titleCaseExercise } from '../utils';

const CHART_WIDTH = Dimensions.get('window').width - 72;

// Epley formula: 1RM = weight × (1 + reps / 30)
function estimate1RM(weight, reps) {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export default function ProgressScreen({ route, navigation }) {
  const { clientId } = route.params;
  const [sessions, setSessions] = useState([]);
  const [exerciseNames, setExerciseNames] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [fullscreenChart, setFullscreenChart] = useState(null);
  const [bodyHistory, setBodyHistory] = useState([]);
  const [mode, setMode] = useState('exercise'); // 'exercise', 'bodyWeight', 'bodyFat'
  const [loading, setLoading] = useState(true);
  const { width: winWidth, height: winHeight } = useWindowDimensions();

  useEffect(() => {
    if (mode !== 'exercise') {
      const onBack = () => {
        setMode('exercise');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      navigation.setOptions({
        headerLeft: () => (
          <TouchableOpacity onPress={() => setMode('exercise')} style={{ paddingRight: 16 }}>
            <Text style={{ color: COLORS.textBright, fontSize: TYPE.heading }}>‹ Back</Text>
          </TouchableOpacity>
        ),
      });
      return () => {
        sub.remove();
        navigation.setOptions({ headerLeft: undefined });
      };
    } else {
      navigation.setOptions({ headerLeft: undefined });
    }
  }, [mode]);

  useEffect(() => {
    async function load() {
      try {
        const q = query(
          collection(db, 'sessions'),
          where('clientId', '==', clientId)
        );
        const snap = await getDocs(q);
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
            const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
            return da - db2;
          });
        setSessions(data);

        // Collapse name variants onto one entry per lift. Sessions logged
        // before names were title-cased on save (2026-04-26) hold the raw
        // typed text, so matching on the exact string would list "bench press"
        // and "Bench Press" separately and hide the older history behind a
        // second pill. Display is title-cased so the list reads consistently
        // however it was typed.
        const byKey = new Map();
        data.forEach(s => s.exercises?.forEach(ex => {
          const key = exerciseKey(ex.name);
          if (key && !byKey.has(key)) byKey.set(key, titleCaseExercise(ex.name));
        }));
        const names = [...byKey.entries()]
          .map(([key, label]) => ({ key, label }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setExerciseNames(names);
        if (names.length > 0) setSelected(names[0].key);
      } catch (e) {
        console.warn('Progress load error:', e);
      }
    }
    // Load body history from client or user doc
    async function loadBody() {
      try {
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        if (clientDoc.exists() && clientDoc.data().bodyHistory) {
          setBodyHistory(clientDoc.data().bodyHistory);
          return;
        }
        const userDoc = await getDoc(doc(db, 'users', clientId));
        if (userDoc.exists() && userDoc.data().profile?.bodyHistory) {
          setBodyHistory(userDoc.data().profile.bodyHistory);
        }
      } catch (e) {}
    }
    Promise.all([load(), loadBody()]).finally(() => setLoading(false));
  }, [clientId]);

  const filteredNames = exerciseNames.filter(ex =>
    ex.label.toLowerCase().includes(searchText.toLowerCase())
  );
  // `selected` holds the match key; this is the name to show for it.
  const selectedName = exerciseNames.find(ex => ex.key === selected)?.label || '';

  function parseDate(str) {
    if (!str.trim()) return null;
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    return isNaN(d.getTime()) ? null : d;
  }

  function getDataPoints() {
    if (!selected) return [];
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (end) end.setHours(23, 59, 59, 999);

    return sessions
      .filter(s => s.exercises?.some(ex => exerciseKey(ex.name) === selected))
      .map(s => {
        const ex = s.exercises.find(e => exerciseKey(e.name) === selected);
        const sets = ex.sets || [];
        const maxWeight = Math.max(...sets.map(set => set.weight || 0), 0);
        const totalVol = sets.reduce((sum, set) => sum + (set.weight || 0) * (set.reps || 0), 0);
        const best1RM = Math.max(...sets.map(set => estimate1RM(set.weight, set.reps)), 0);
        const d = s.date?.toDate ? s.date.toDate() : new Date(s.date);
        return { date: d, maxWeight, totalVol, best1RM: Math.round(best1RM) };
      })
      .filter(p => {
        if (start && p.date < start) return false;
        if (end && p.date > end) return false;
        return true;
      });
  }

  const points = getDataPoints();

  function buildChart(key, color) {
    if (points.length < 2) return null;
    return {
      data: {
        labels: points.map(p => {
          const currentYear = new Date().getFullYear();
          const label = `${p.date.getMonth() + 1}/${p.date.getDate()}`;
          return p.date.getFullYear() < currentYear
            ? `${label}/${String(p.date.getFullYear()).slice(-2)}`
            : label;
        }),
        datasets: [{ data: points.map(p => p[key]) }],
      },
      color,
    };
  }

  function getBodyPoints(key) {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (end) end.setHours(23, 59, 59, 999);

    return bodyHistory
      .filter(e => e[key] != null)
      .map(e => ({ date: new Date(e.date), value: e[key] }))
      .filter(p => {
        if (start && p.date < start) return false;
        if (end && p.date > end) return false;
        return true;
      })
      .sort((a, b) => a.date - b.date);
  }

  function buildBodyChart(key, color) {
    const pts = getBodyPoints(key);
    if (pts.length < 2) return null;
    const currentYear = new Date().getFullYear();
    return {
      data: {
        labels: pts.map(p => {
          const label = `${p.date.getMonth() + 1}/${p.date.getDate()}`;
          return p.date.getFullYear() < currentYear
            ? `${label}/${String(p.date.getFullYear()).slice(-2)}`
            : label;
        }),
        datasets: [{ data: pts.map(p => p.value) }],
      },
      color,
      points: pts,
    };
  }

  const oneRMChart = buildChart('best1RM', (o = 1) => `rgba(212, 135, 42, ${o})`);
  const maxWeightChart = buildChart('maxWeight', (o = 1) => `rgba(200, 255, 87, ${o})`);
  const volumeChart = buildChart('totalVol', (o = 1) => `rgba(100, 180, 255, ${o})`);

  function baseConfig(colorFn, dotColor) {
    return {
      backgroundColor: COLORS.card,
      backgroundGradientFrom: COLORS.card,
      backgroundGradientTo: COLORS.card,
      decimalPlaces: 0,
      color: colorFn,
      labelColor: (o = 1) => `rgba(136, 136, 136, ${o})`,
      propsForDots: { r: '5', strokeWidth: '2', stroke: dotColor },
      propsForBackgroundLines: { stroke: COLORS.border },
    };
  }

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
      <ActivityIndicator size="large" color={COLORS.accent} />
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'bodyWeight' && styles.modeBtnActive]}
          onPress={() => setMode(mode === 'bodyWeight' ? 'exercise' : 'bodyWeight')}
        >
          <Text style={[styles.modeBtnText, mode === 'bodyWeight' && styles.modeBtnTextActive]}>Body Weight</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'bodyFat' && styles.modeBtnActive]}
          onPress={() => setMode(mode === 'bodyFat' ? 'exercise' : 'bodyFat')}
        >
          <Text style={[styles.modeBtnText, mode === 'bodyFat' && styles.modeBtnTextActive]}>Body Fat %</Text>
        </TouchableOpacity>
      </View>

      {mode === 'exercise' && (
        <>
          <Text style={styles.sectionLabel}>Search Exercise</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Type exercise name..."
            placeholderTextColor={COLORS.textMuted}
            value={searchText}
            onChangeText={(text) => {
              setSearchText(text);
              if (!text.trim()) {
                if (exerciseNames.length > 0) setSelected(exerciseNames[0].key);
                return;
              }
              const matches = exerciseNames.filter(n =>
                n.label.toLowerCase().includes(text.toLowerCase())
              );
              if (matches.length > 0) {
                setSelected(matches[0].key);
              } else {
                setSelected(null);
              }
            }}
          />

          {filteredNames.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pills}>
              {filteredNames.map(ex => (
                <TouchableOpacity
                  key={ex.key}
                  style={[styles.pill, selected === ex.key && styles.pillActive]}
                  onPress={() => {
                    setSelected(ex.key);
                    setSearchText(ex.label);
                  }}
                >
                  <Text style={[styles.pillText, selected === ex.key && styles.pillTextActive]}>{ex.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {searchText.trim() !== '' && filteredNames.length === 0 && (
            <Text style={styles.notice}>No logged exercises match "{searchText}"</Text>
          )}

          {selected && (
            <Text style={styles.selectedLabel}>Showing: {selectedName}</Text>
          )}
        </>
      )}

      <Text style={styles.sectionLabel}>Date Range</Text>
      <View style={styles.dateRow}>
        <TextInput
          style={styles.dateInput}
          placeholder="M/D/YYYY"
          placeholderTextColor={COLORS.textMuted}
          value={startDate}
          onChangeText={setStartDate}
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.dateTo}>to</Text>
        <TextInput
          style={styles.dateInput}
          placeholder="M/D/YYYY"
          placeholderTextColor={COLORS.textMuted}
          value={endDate}
          onChangeText={setEndDate}
          keyboardType="numbers-and-punctuation"
        />
      </View>
      {(startDate.trim() || endDate.trim()) && (
        <TouchableOpacity onPress={() => { setStartDate(''); setEndDate(''); }}>
          <Text style={styles.clearDates}>Clear dates (show all)</Text>
        </TouchableOpacity>
      )}

      {mode === 'bodyWeight' && (() => {
        const chart = buildBodyChart('bodyWeight', (o = 1) => `rgba(100, 200, 150, ${o})`);
        const pts = getBodyPoints('bodyWeight');
        if (pts.length < 2) return <Text style={styles.notice}>Need at least 2 body weight entries to show chart.</Text>;
        return (
          <TouchableOpacity
            style={styles.chartCard}
            activeOpacity={0.8}
            onPress={() => setFullscreenChart({ title: 'Body Weight (lbs)', data: chart.data, config: baseConfig(chart.color, '#64C896') })}
          >
            <Text style={styles.chartTitle}>Body Weight (lbs)</Text>
            <Text style={styles.chartSubtitle}>Tap to expand</Text>
            <LineChart
              data={chart.data}
              width={CHART_WIDTH}
              height={200}
              chartConfig={baseConfig(chart.color, '#64C896')}
              bezier
              style={styles.chart}
            />
            <Text style={[styles.delta, { color: '#64C896' }]}>
              {(() => {
                const diff = (pts[pts.length - 1].value - pts[0].value).toFixed(1);
                if (diff > 0) return `+${diff} lbs`;
                if (diff < 0) return `${diff} lbs`;
                return 'No change';
              })()}
            </Text>
          </TouchableOpacity>
        );
      })()}

      {mode === 'bodyFat' && (() => {
        const chart = buildBodyChart('bodyFat', (o = 1) => `rgba(255, 130, 130, ${o})`);
        const pts = getBodyPoints('bodyFat');
        if (pts.length < 2) return <Text style={styles.notice}>Need at least 2 body fat entries to show chart.</Text>;
        return (
          <TouchableOpacity
            style={styles.chartCard}
            activeOpacity={0.8}
            onPress={() => setFullscreenChart({ title: 'Body Fat %', data: chart.data, config: baseConfig(chart.color, '#FF8282') })}
          >
            <Text style={styles.chartTitle}>Body Fat %</Text>
            <Text style={styles.chartSubtitle}>Tap to expand</Text>
            <LineChart
              data={chart.data}
              width={CHART_WIDTH}
              height={200}
              chartConfig={baseConfig(chart.color, '#FF8282')}
              bezier
              style={styles.chart}
            />
            <Text style={[styles.delta, { color: '#FF8282' }]}>
              {(() => {
                const diff = (pts[pts.length - 1].value - pts[0].value).toFixed(1);
                if (diff > 0) return `+${diff}%`;
                if (diff < 0) return `${diff}%`;
                return 'No change';
              })()}
            </Text>
          </TouchableOpacity>
        );
      })()}

      {mode === 'exercise' && exerciseNames.length === 0 && (
        <Text style={styles.empty}>No sessions logged yet.</Text>
      )}

      {mode === 'exercise' && selected && points.length === 1 && (
        <Text style={styles.notice}>
          Log at least 2 sessions with {selectedName} to see progress charts.
        </Text>
      )}

      {mode === 'exercise' && oneRMChart && (
        <TouchableOpacity
          style={styles.chartCard}
          activeOpacity={0.8}
          onPress={() => setFullscreenChart({ title: 'Estimated 1RM (lbs)', data: oneRMChart.data, config: baseConfig(oneRMChart.color, '#D4872A') })}
        >
          <Text style={styles.chartTitle}>Estimated 1RM (lbs)</Text>
          <Text style={styles.chartSubtitle}>Tap to expand · Epley formula</Text>
          <LineChart
            data={oneRMChart.data}
            width={CHART_WIDTH}
            height={200}
            chartConfig={baseConfig(oneRMChart.color, '#D4872A')}
            bezier
            style={styles.chart}
          />
          <View style={styles.chartFooter}>
            <Text style={styles.mostRecent}>
              <Text style={{ fontWeight: '600' }}>Most recent: </Text>
              {points[points.length - 1].best1RM} lbs
              <Text style={{ fontWeight: '400' }}>
                {`  ·  ${points[points.length - 1].date.getMonth() + 1}/${points[points.length - 1].date.getDate()}/${String(points[points.length - 1].date.getFullYear()).slice(-2)}`}
              </Text>
            </Text>
            <Text style={[styles.delta, { color: '#D4872A', marginTop: 0 }]}>
              {(() => {
                const diff = points[points.length - 1].best1RM - points[0].best1RM;
                if (diff > 0) return `+${diff} lbs since first session`;
                if (diff < 0) return `${diff} lbs since first session`;
                return 'Same as first session';
              })()}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {mode === 'exercise' && maxWeightChart && (
        <TouchableOpacity
          style={styles.chartCard}
          activeOpacity={0.8}
          onPress={() => setFullscreenChart({ title: 'Max Weight (lbs)', data: maxWeightChart.data, config: baseConfig(maxWeightChart.color, COLORS.accent) })}
        >
          <Text style={styles.chartTitle}>Max Weight (lbs)</Text>
          <Text style={styles.chartSubtitle}>Tap to expand</Text>
          <LineChart
            data={maxWeightChart.data}
            width={CHART_WIDTH}
            height={200}
            chartConfig={baseConfig(maxWeightChart.color, COLORS.accent)}
            bezier
            style={styles.chart}
          />
        </TouchableOpacity>
      )}

      {mode === 'exercise' && volumeChart && (
        <TouchableOpacity
          style={styles.chartCard}
          activeOpacity={0.8}
          onPress={() => setFullscreenChart({ title: 'Session Volume (lbs)', data: volumeChart.data, config: baseConfig(volumeChart.color, '#64B4FF') })}
        >
          <Text style={styles.chartTitle}>Session Volume (lbs)</Text>
          <Text style={styles.chartSubtitle}>Tap to expand</Text>
          <LineChart
            data={volumeChart.data}
            width={CHART_WIDTH}
            height={200}
            chartConfig={baseConfig(volumeChart.color, '#64B4FF')}
            bezier
            style={styles.chart}
          />
        </TouchableOpacity>
      )}

      {/* Fullscreen Chart Modal */}
      <Modal
        visible={!!fullscreenChart}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setFullscreenChart(null)}
      >
        <View style={styles.fullscreenContainer}>
          <StatusBar hidden={!!fullscreenChart} />
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenChart(null)}>
            <Text style={styles.fullscreenCloseText}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={styles.fullscreenTitle}>
            {fullscreenChart?.title} — {selectedName}
          </Text>
          {fullscreenChart && (
            <LineChart
              data={fullscreenChart.data}
              width={winWidth - 60}
              height={winHeight > winWidth ? winHeight * 0.35 : winHeight - 120}
              chartConfig={fullscreenChart.config}
              bezier
              style={styles.fullscreenChart}
            />
          )}
        </View>
      </Modal>

      {mode === 'exercise' && selected && points.length >= 2 && (
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>All-Time — {selectedName}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: '#D4872A' }]}>
                {Math.max(...points.map(p => p.best1RM))}
              </Text>
              <Text style={styles.statLabel}>1RM (lbs)</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{Math.max(...points.map(p => p.maxWeight))}</Text>
              <Text style={styles.statLabel}>PR (lbs)</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{points.length}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  modeBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  modeBtnText: { color: COLORS.textMuted, fontSize: TYPE.body, fontFamily: FONTS.semiBold },
  modeBtnTextActive: { color: '#000' },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    fontFamily: FONTS.bold,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 13,
    color: COLORS.textBright,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: TYPE.body,
    fontFamily: FONTS.regular,
  },
  pills: { marginBottom: 24, maxHeight: 40 },
  pill: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: COLORS.card,
  },
  pillActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  pillText: { color: COLORS.textMuted, fontSize: TYPE.body, fontWeight: '600', fontFamily: FONTS.semiBold },
  pillTextActive: { color: '#000' },
  chartCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartTitle: { color: COLORS.textBright, fontWeight: '700', fontSize: TYPE.body, marginBottom: 4, fontFamily: FONTS.bold },
  chartSubtitle: { color: COLORS.textMuted, fontSize: TYPE.caption, marginBottom: 14, fontFamily: FONTS.regular },
  chart: { borderRadius: 10 },
  delta: { color: COLORS.accent, fontSize: TYPE.label, fontWeight: '600', marginTop: 10, textAlign: 'right', fontFamily: FONTS.semiBold },
  chartFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 },
  mostRecent: { color: '#D4872A', fontSize: TYPE.label, fontWeight: '700', fontFamily: FONTS.bold, flexShrink: 1 },
  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statsTitle: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
    fontFamily: FONTS.bold,
  },
  statsRow: { flexDirection: 'row' },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { color: COLORS.accent, fontSize: TYPE.display, fontWeight: '800', fontFamily: FONTS.extraBold },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: TYPE.caption,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    fontFamily: FONTS.semiBold,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dateInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    color: COLORS.textBright,
    fontSize: TYPE.body,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlign: 'center',
    fontFamily: FONTS.regular,
  },
  dateTo: { color: COLORS.textMuted, fontSize: TYPE.label, fontFamily: FONTS.regular },
  clearDates: { color: COLORS.accent, fontSize: TYPE.label, fontWeight: '600', marginBottom: 16, fontFamily: FONTS.semiBold },
  selectedLabel: {
    color: COLORS.accent,
    fontSize: TYPE.label,
    fontWeight: '700',
    marginBottom: 16,
    fontFamily: FONTS.bold,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fullscreenCloseText: { color: COLORS.textBright, fontSize: TYPE.body, fontWeight: '600', fontFamily: FONTS.semiBold },
  fullscreenTitle: { color: COLORS.textBright, fontSize: TYPE.heading, fontWeight: '700', marginBottom: 20, fontFamily: FONTS.bold },
  fullscreenChart: { borderRadius: 12 },
  empty: { color: COLORS.textMuted, textAlign: 'center', marginTop: 60, fontSize: TYPE.body, fontFamily: FONTS.regular },
  notice: { color: COLORS.textMuted, textAlign: 'center', marginTop: 20, marginBottom: 20, fontSize: TYPE.body, lineHeight: 22, fontFamily: FONTS.regular },
});
