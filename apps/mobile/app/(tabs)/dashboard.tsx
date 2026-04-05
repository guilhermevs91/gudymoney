import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

interface LedgerSummary {
  total_realized: number;
  total_projected: number;
  income_this_month: number;
  expense_this_month: number;
}

interface Account {
  id: string;
  name: string;
  type: string;
  balance?: { realized: number; projected: number };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function DashboardScreen() {
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [summaryRes, accountsRes] = await Promise.allSettled([
        api.get<{ data: LedgerSummary }>('/ledger/summary'),
        api.get<{ data: Account[] }>('/accounts'),
      ]);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data);
      if (accountsRes.status === 'fulfilled') {
        setAccounts(accountsRes.value.data.filter((a) => a.type !== 'INTERNAL'));
      }
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
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#E11D48" />}
      >
        <Text style={styles.header}>Dashboard</Text>

        {/* Summary cards */}
        <View style={styles.cardRow}>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>Saldo Realizado</Text>
            <Text style={[styles.cardValue, { color: (summary?.total_realized ?? 0) >= 0 ? '#22C55E' : '#EF4444' }]}>
              {formatCurrency(summary?.total_realized ?? 0)}
            </Text>
          </View>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>Saldo Projetado</Text>
            <Text style={[styles.cardValue, { color: (summary?.total_projected ?? 0) >= 0 ? '#22C55E' : '#EF4444' }]}>
              {formatCurrency(summary?.total_projected ?? 0)}
            </Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>Receitas</Text>
            <Text style={[styles.cardValue, { color: '#22C55E' }]}>
              {formatCurrency(summary?.income_this_month ?? 0)}
            </Text>
          </View>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>Despesas</Text>
            <Text style={[styles.cardValue, { color: '#EF4444' }]}>
              {formatCurrency(summary?.expense_this_month ?? 0)}
            </Text>
          </View>
        </View>

        {/* Accounts */}
        <Text style={styles.sectionTitle}>Contas</Text>
        {accounts.map((acc) => (
          <View key={acc.id} style={styles.accountRow}>
            <Text style={styles.accountName}>{acc.name}</Text>
            <Text style={[styles.accountBalance, { color: (acc.balance?.realized ?? 0) >= 0 ? '#22C55E' : '#EF4444' }]}>
              {formatCurrency(acc.balance?.realized ?? 0)}
            </Text>
          </View>
        ))}

        {accounts.length === 0 && (
          <Text style={styles.empty}>Nenhuma conta cadastrada.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' },
  header: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 16 },
  cardRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
  },
  cardHalf: { flex: 1 },
  cardLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  cardValue: { fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#F9FAFB', marginTop: 8, marginBottom: 8 },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  accountName: { fontSize: 14, color: '#F9FAFB' },
  accountBalance: { fontSize: 14, fontWeight: '600' },
  empty: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 16 },
});
