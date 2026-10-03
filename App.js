import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SMS from 'expo-sms';

export default function App() {
  const [logs, setLogs] = useState([]);
  const [currentCountry, setCurrentCountry] = useState('CZ');

  // Načtení dat při spuštění
  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const saved = await AsyncStorage.getItem('diety_logs');
      if (saved) setLogs(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
  };

  const saveLogs = async (newLogs) => {
    setLogs(newLogs);
    await AsyncStorage.setItem('diety_logs', JSON.stringify(newLogs));
  };

  // Přidání události
  const addLog = (type, country, note) => {
    const newEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      type, // 'START', 'END', 'BORDER'
      country,
      note
    };
    const updated = [newEntry, ...logs];
    saveLogs(updated);
    if (country) setCurrentCountry(country);
  };

  // 🧪 TESTOVACÍ TLAČÍTKO: Simulace přechodu hranic
  const handleTestBorder = () => {
    const nextCountry = currentCountry === 'CZ' ? 'DE' : 'CZ';
    addLog('BORDER', nextCountry, `Překročení hranic (${nextCountry}) - Test`);
    Alert.alert("🧪 Test přechodu", `Nasimulován přechod hranice do ${nextCountry}`);
  };

  // Generování strukturovaného výkazu s výpočtem diet
  const generateReport = () => {
    const sorted = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let lines = [];
    let borderTimes = [];

    sorted.forEach((item) => {
      const timeStr = new Date(item.timestamp).toLocaleString('cs-CZ', {
        day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      if (item.type === 'START') lines.push(`🚩 Odjezd z firmy (CZ): ${timeStr}`);
      else if (item.type === 'END') lines.push(`🏁 Příjezd na firmu (CZ): ${timeStr}`);
      else if (item.type === 'BORDER') {
        borderTimes.push(new Date(item.timestamp));
        lines.push(`🌐 Překročení hranic (${item.country}): ${timeStr}`);
      }
    });

    // Výpočet času v zahraničí (od 1. do posledního přechodu)
    let foreignText = "0 hod 0 min";
    if (borderTimes.length >= 2) {
      const diffMs = borderTimes[borderTimes.length - 1] - borderTimes[0];
      const totalMins = Math.round(diffMs / (1000 * 60));
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      foreignText = `${hours} hod ${mins} min`;
    }

    return `=== VÝKAZ JÍZDY A DIET ===\n\n${lines.join('\n')}\n\n⏱ Celkový čas v zahraničí: ${foreignText}`;
  };

  // Odeslání šéfovi
  const handleSendReport = async () => {
    const isAvailable = await SMS.isAvailableAsync();
    if (isAvailable) {
      await SMS.sendSMSAsync([], generateReport());
    } else {
      Alert.alert("Chyba", "SMS služby nejsou dostupné.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚛 Diety & GPS</Text>
      <Text style={styles.subtitle}>Aktuální stav: <Text style={styles.bold}>{currentCountry}</Text></Text>

      {/* Tlačítka Start / Konec */}
      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, styles.btnStart]} onPress={() => addLog('START', 'CZ', 'Start trasu (Ručně)')}>
          <Text style={styles.btnText}>🏁 Start trasu</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnEnd]} onPress={() => addLog('END', 'CZ', 'Konec trasu (Ručně)')}>
          <Text style={styles.btnText}>🏠 Konec trasu</Text>
        </TouchableOpacity>
      </View>

      {/* 🧪 Testovací tlačítko pro simulaci hranice */}
      <TouchableOpacity style={styles.btnTest} onPress={handleTestBorder}>
        <Text style={styles.btnTextTest}>🧪 Test: Simulovat přechod (DE/CZ)</Text>
      </TouchableOpacity>

      {/* Odeslat výkaz */}
      <TouchableOpacity style={styles.btnSend} onPress={handleSendReport}>
        <Text style={styles.btnText}>📱 Odeslat výkaz šéfovi</Text>
      </TouchableOpacity>

      {/* Deník */}
      <Text style={styles.sectionTitle}>Deník přejezdů a událostí:</Text>
      <ScrollView style={styles.logsContainer}>
        {logs.map((item) => (
          <View key={item.id} style={styles.logCard}>
            <Text style={styles.logText}>
              {new Date(item.timestamp).toLocaleString('cs-CZ')} - {item.note}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: 60, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#94a3b8', textAlign: 'center', marginBottom: 20 },
  bold: { color: '#22c55e', fontWeight: 'bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  btn: { flex: 0.48, padding: 16, borderRadius: 12, alignItems: 'center' },
  btnStart: { backgroundColor: '#15803d' },
  btnEnd: { backgroundColor: '#b91c1c' },
  btnTest: { backgroundColor: '#334155', padding: 12, borderRadius: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#64748b' },
  btnSend: { backgroundColor: '#0284c7', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnTextTest: { color: '#cbd5e1', fontWeight: '600', fontSize: 14 },
  sectionTitle: { color: '#cbd5e1', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  logsContainer: { flex: 1 },
  logCard: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  logText: { color: '#f1f5f9', fontSize: 13 }
});
