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

interface Account {
  id: string;
  name: string;
  type: string;
  bank_name?: string;
  balance?: { realized: number; projected: number };
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

const typeLabel: Record<string, string> = {
  CHECKING: 'Corrente',
  SAVINGS: 'Poupança',
  WALLET: 'Carteira',
};

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<{ data: Account[] }>('/accounts');
      setAccounts(res.data.filter((a) => a.type !== 'INTERNAL'));
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
        data={accounts}
        keyExtractor={(a) => a.id}
        ListHeaderComponent={<Text style={styles.header}>Contas</Text>}
        renderItem={({ item: acc }) => (
          <View style={styles.card}>
            <View style={styles.cardLeft}>
              <Text style={styles.name}>{acc.name}</Text>
              <Text style={styles.meta}>
                {typeLabel[acc.type] ?? acc.type}
                {acc.bank_name ? ` · ${acc.bank_name}` : ''}
              </Text>
            </View>
            <View style={styles.cardRight}>
              <Text
                style={[
                  styles.balance,
                  (acc.balance?.realized ?? 0) >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {formatCurrency(acc.balance?.realized ?? 0)}
              </Text>
              <Text style={styles.projected}>
                Proj: {formatCurrency(acc.balance?.projected ?? 0)}
              </Text>
            </View>
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor="#E11D48"
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma conta cadastrada.</Text>}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  cardLeft: { flex: 1 },
  cardRight: { alignItems: 'flex-end' },
  name: { color: '#F9FAFB', fontSize: 15, fontWeight: '500' },
  meta: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  balance: { fontSize: 16, fontWeight: '700' },
  positive: { color: '#22C55E' },
  negative: { color: '#EF4444' },
  projected: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 48 },
});
