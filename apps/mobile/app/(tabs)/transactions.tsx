import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

interface Transaction {
  id: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  status: 'PREVISTO' | 'REALIZADO' | 'CANCELADO';
  amount: number;
  description: string;
  date: string;
  category?: { name: string };
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso));
}

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p = 1, reset = false) => {
    try {
      const res = await api.get<{ data: Transaction[]; total: number }>(
        `/transactions?page=${p}&pageSize=20`,
      );
      setTransactions((prev) => (reset ? res.data : [...prev, ...res.data]));
      setTotal(res.total);
      setPage(p);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const loadMore = () => {
    if (transactions.length < total) load(page + 1);
  };

  const confirmTransaction = async (id: string) => {
    try {
      await api.patch(`/transactions/${id}`, { status: 'REALIZADO' });
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'REALIZADO' } : t)),
      );
    } catch { /* ignore */ }
  };

  const renderItem = ({ item: t }: { item: Transaction }) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.desc} numberOfLines={1}>{t.description}</Text>
        <Text style={styles.meta}>
          {formatDate(t.date)}
          {t.category ? ` · ${t.category.name}` : ''}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text
          style={[
            styles.amount,
            t.type === 'INCOME' && styles.income,
            t.type === 'EXPENSE' && styles.expense,
          ]}
        >
          {t.type === 'INCOME' ? '+' : t.type === 'EXPENSE' ? '-' : ''}
          {formatCurrency(t.amount)}
        </Text>
        {t.status === 'PREVISTO' && (
          <TouchableOpacity onPress={() => confirmTransaction(t.id)} style={styles.confirmBtn}>
            <Text style={styles.confirmText}>Confirmar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#E11D48" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Transações</Text>
      </View>
      <FlatList
        data={transactions}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(1, true); }}
            tintColor="#E11D48"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhuma transação encontrada.</Text>
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' },
  headerRow: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  header: { fontSize: 24, fontWeight: '700', color: '#F9FAFB' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  rowLeft: { flex: 1, marginRight: 8 },
  desc: { fontSize: 14, fontWeight: '500', color: '#F9FAFB' },
  meta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  amount: { fontSize: 14, fontWeight: '600', color: '#F9FAFB' },
  income: { color: '#22C55E' },
  expense: { color: '#EF4444' },
  confirmBtn: {
    marginTop: 4,
    backgroundColor: '#E11D4820',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  confirmText: { color: '#E11D48', fontSize: 11 },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 48, fontSize: 14 },
});
