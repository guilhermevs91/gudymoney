import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

interface CreditCard {
  id: string;
  name: string;
  brand?: string;
  last_four?: string;
  limit_total: number;
  limit_used: number;
  limit_available: number;
  closing_day: number;
  due_day: number;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export default function CardsScreen() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<{ data: CreditCard[] }>('/credit-cards');
      setCards(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#E11D48" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<Text style={styles.header}>Cartões</Text>}
        renderItem={({ item: c }) => {
          const usedPct = c.limit_total > 0 ? (c.limit_used / c.limit_total) * 100 : 0;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.name}>{c.name}</Text>
                {c.last_four && <Text style={styles.lastFour}>*{c.last_four}</Text>}
              </View>
              {c.brand && <Text style={styles.brand}>{c.brand}</Text>}
              <View style={styles.limits}>
                <Text style={styles.limitLabel}>Limite: {formatCurrency(c.limit_total)}</Text>
                <Text style={styles.limitLabel}>Disponível: {formatCurrency(c.limit_available)}</Text>
              </View>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(usedPct, 100)}%` as any,
                      backgroundColor: usedPct >= 90 ? '#EF4444' : usedPct >= 70 ? '#EAB308' : '#E11D48',
                    },
                  ]}
                />
              </View>
              <Text style={styles.days}>
                Fecha dia {c.closing_day} · Vence dia {c.due_day}
              </Text>
            </View>
          );
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor="#E11D48"
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>Nenhum cartão cadastrado.</Text>}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' },
  header: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 16 },
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name: { color: '#F9FAFB', fontSize: 16, fontWeight: '600' },
  lastFour: { color: '#9CA3AF', fontSize: 14 },
  brand: { color: '#6B7280', fontSize: 12, marginBottom: 8 },
  limits: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  limitLabel: { color: '#D1D5DB', fontSize: 13 },
  progressBg: {
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  days: { color: '#6B7280', fontSize: 12 },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 48 },
});
