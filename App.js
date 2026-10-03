import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Alert, Share } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzY4mbgbZOv1IIRi7Qysl7bQUxx9rlTqfcvwjHylPo9XrBaRN5vBQwQNgNxyNe_LvnZDQ/exec';

export default function App() {
  const [logs, setLogs] = useState([]);
  const [currentCountry, setCurrentCountry] = useState('CZ');
  const [gpsActive, setGpsActive] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);

  // Okamžitá paměť v RAM pro čas vjezdu i aktuální stát (řeší React closures)
  const foreignEntryRef = useRef(null);
  const currentCountryRef = useRef('CZ');

  useEffect(() => {
    initGps();
    loadLogs();
    loadSavedData();
  }, []);

  const loadSavedData = async () => {
    const savedEntry = await AsyncStorage.getItem('foreign_entry_time');
    if (savedEntry) foreignEntryRef.current = savedEntry;
  };

  const loadLogs = async () => {
    const savedLogs = await AsyncStorage.getItem('app_logs');
    if (savedLogs) setLogs(JSON.parse(savedLogs));
  };

  const initGps = async () => {
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert('Oprávnění', 'Přístup k poloze nebyl povolen.');
        return;
      }

      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        console.log('Pozadí nepovoleno, ale lokální sledování poběží.');
      }

      setGpsActive(true);

      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 50 },
        async (location) => {
          const coords = location.coords;
          setCurrentCoords(coords);
          evaluateGlobalCountry(coords);
        }
      );
    } catch (e) {
      console.log('Chyba GPS:', e);
      setGpsActive(false);
    }
  };

  // Detekce státu s RAM pamětí (žádné staré uzavřené proměnné)
  const evaluateGlobalCountry = async (coords) => {
    try {
      const { latitude, longitude } = coords;
      const now = new Date();

      // 1. MATEMATICKÁ POJISTKA PRO ČR (Hranice ČR)
      const isInsideCZ = latitude >= 48.5 && latitude <= 51.1 && longitude >= 12.0 && longitude <= 18.9;

      if (isInsideCZ) {
        // Pokud jsme v CZ a v RAM visí čas, že jsme venku -> OKAMŽITĚ NÁVRAT DO CZ
        if (foreignEntryRef.current && currentCountryRef.current !== 'CZ') {
          const oldCountry = currentCountryRef.current;
          
          currentCountryRef.current = 'CZ';
          setCurrentCountry('CZ');

          const entryTime = new Date(foreignEntryRef.current);
          const diffMins = Math.floor((now - entryTime) / (1000 * 60));
          const hours = (diffMins / 60).toFixed(1);
          const note = `Návrat do CZ z ${oldCountry} (GPS Pojistka) | Stráveno venku: ${hours} h`;

          foreignEntryRef.current = null;
          await AsyncStorage.removeItem('foreign_entry_time');
          await sendLog('Přejezd hranic', 'CZ', note);
          await loadLogs();
          return;
        } else if (currentCountryRef.current === 'CZ') {
          return;
        }
      }

      // 2. PRO CIZÍ STÁTY POUŽIJEME SYSTEMATICKÉ GECÓDOVÁNÍ
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      
      if (results && results.length > 0) {
        let countryCode = results[0].isoCountryCode; 
        if (!countryCode) return;

        // Pojistka, kdyby geokódování hodilo CZ, ale jsme venku
        if (countryCode === 'CZ' && foreignEntryRef.current && currentCountryRef.current !== 'CZ') {
          const oldCountry = currentCountryRef.current;
          
          currentCountryRef.current = 'CZ';
          setCurrentCountry('CZ');

          const entryTime = new Date(foreignEntryRef.current);
          const diffMins = Math.floor((now - entryTime) / (1000 * 60));
          const hours = (diffMins / 60).toFixed(1);
          const note = `Návrat do CZ z ${oldCountry} (Geocode) | Stráveno venku: ${hours} h`;

          foreignEntryRef.current = null;
          await AsyncStorage.removeItem('foreign_entry_time');
          await sendLog('Přejezd hranic', 'CZ', note);
          await loadLogs();
          return;
        }

        // Standardní změna státu
        if (countryCode !== currentCountryRef.current) {
          const oldCountry = currentCountryRef.current;
          
          currentCountryRef.current = countryCode;
          setCurrentCountry(countryCode);

          if (countryCode !== 'CZ' && oldCountry === 'CZ') {
            const timeStr = now.toISOString();
            foreignEntryRef.current = timeStr;
            await AsyncStorage.setItem('foreign_entry_time', timeStr);
            await sendLog('Přejezd hranic', countryCode, `Vjezd do ${countryCode} (Globální GPS)`);
          } else if (countryCode === 'CZ' && oldCountry !== 'CZ') {
            let note = `Návrat do CZ z ${oldCountry} (Globální GPS)`;
            if (foreignEntryRef.current) {
              const entryTime = new Date(foreignEntryRef.current);
              const diffMins = Math.floor((now - entryTime) / (1000 * 60));
              const hours = (diffMins / 60).toFixed(1);
              note += ` | Stráveno venku: ${hours} h`;
              foreignEntryRef.current = null;
              await AsyncStorage.removeItem('foreign_entry_time');
            }
            await sendLog('Přejezd hranic', 'CZ', note);
          } else if (countryCode !== 'CZ' && oldCountry !== 'CZ') {
            await sendLog('Přejezd hranic', countryCode, `Přesun z ${oldCountry} do ${countryCode}`);
          }
          await loadLogs();
        }
      }
    } catch (e) {
      console.log('Chyba geokódování:', e);
    }
  };

  const handleDeparture = async () => {
    await sendLog('Odjezd z firmy', 'CZ', 'Start trasy (Ručně)');
    await loadLogs();
    Alert.alert('Zaznamenáno', 'Odjezd z firmy byl uložen a odeslán.');
  };

  const handleArrival = async () => {
    await sendLog('Příjezd na firmu', currentCountry, 'Konec trasy (Ručně)');
    await loadLogs();
    Alert.alert('Zaznamenáno', 'Příjezd na firmu byl uložen a odeslán.');
  };

  const shareReport = async () => {
    if (logs.length === 0) {
      Alert.alert('Info', 'Zatím nemáš žádné záznamy.');
      return;
    }
    const reportText = logs.join('\n');
    try {
      await Share.share({ message: `Výkaz diet:\n\n${reportText}` });
    } catch (e) {
      Alert.alert('Chyba', 'Nedaří se sdílet.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🚛 Diety & GPS</Text>
        <Text style={styles.status}>
          GPS Sledování: <Text style={{ color: gpsActive ? '#00E676' : '#FF9800' }}>{gpsActive ? 'AKTIVNÍ' : 'NEAKTIVNÍ'}</Text>
        </Text>
        {currentCoords && (
          <Text style={styles.coordsText}>
            Lat: {currentCoords.latitude.toFixed(4)}, Lon: {currentCoords.longitude.toFixed(4)}
          </Text>
        )}
        <Text style={styles.subtitle}>Aktuální stát: <Text style={styles.highlight}>{currentCountry}</Text></Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.btnStart]} onPress={handleDeparture}>
          <Text style={styles.actionBtnText}>🏁 Start trasy</Text>
          <Text style={styles.actionBtnSubtext}>Odjezd z firmy</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.btnStop]} onPress={handleArrival}>
          <Text style={styles.actionBtnText}>🏠 Konec trasy</Text>
          <Text style={styles.actionBtnSubtext}>Příjezd na firmu</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.btnBoss} onPress={shareReport}>
        <Text style={styles.btnText}>📲 Odeslat výkaz šéfovi</Text>
      </TouchableOpacity>

      <Text style={styles.logHeader}>Deník přejezdů a událostí:</Text>
      <ScrollView style={styles.logContainer}>
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>Žádné záznamy. Zkus stisknout tlačítko Start trasy.</Text>
        ) : (
          logs.map((log, index) => (
            <View key={index} style={styles.logItem}>
              <Text style={styles.logText}>{log}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

async function sendLog(type, country, note) {
  const now = new Date();
  const payload = { typ: type, stat: country, poznamka: note, cas: now.toISOString() };

  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const saved = await AsyncStorage.getItem('app_logs');
    const logs = saved ? JSON.parse(saved) : [];
    const timeStr = now.toLocaleDateString('cs-CZ') + ' ' + now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    const newLogs = [`${timeStr} - ${type} (${country}) - ${note}`, ...logs];
    
    await AsyncStorage.setItem('app_logs', JSON.stringify(newLogs));
  } catch (e) {
    console.error(e);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E1A', padding: 20 },
  header: { marginTop: 20, marginBottom: 15, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FFF' },
  status: { fontSize: 14, color: '#AAA', marginTop: 5 },
  coordsText: { fontSize: 12, color: '#4CAF50', marginTop: 4 },
  subtitle: { fontSize: 18, color: '#AAA', marginTop: 10 },
  highlight: { color: '#00E676', fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  actionBtn: { flex: 0.48, padding: 15, borderRadius: 12, alignItems: 'center' },
  btnStart: { backgroundColor: '#2E7D32' },
  btnStop: { backgroundColor: '#C62828' },
  actionBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  actionBtnSubtext: { color: '#DDD', fontSize: 11, marginTop: 3 },
  btnBoss: { backgroundColor: '#0288D1', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  logHeader: { color: '#8E8E93', fontSize: 14, fontWeight: '600', marginBottom: 10 },
  logContainer: { flex: 1 },
  logItem: { backgroundColor: '#1C2333', padding: 12, borderRadius: 10, marginBottom: 8 },
  logText: { color: '#E1E6ED', fontSize: 14 },
  emptyText: { color: '#555', textAlign: 'center', marginTop: 30 }
});
