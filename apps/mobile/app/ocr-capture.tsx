import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractedLine {
  text: string;
  amount?: number;
}

type CaptureStep = 'preview' | 'processing' | 'review';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Try to parse a BRL currency string like "R$ 1.234,56" → 1234.56 */
function parseBRL(raw: string): number | undefined {
  const cleaned = raw.replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

/** Extract candidate transaction lines from raw OCR text */
function extractLines(text: string): ExtractedLine[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  const results: ExtractedLine[] = [];

  for (const line of lines) {
    // Look for lines that contain a BRL amount
    const match = line.match(/R\$\s?\d[\d.]*,\d{2}/);
    if (match) {
      results.push({ text: line, amount: parseBRL(match[0]) });
    }
  }

  return results.slice(0, 20); // cap at 20 items
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OcrCaptureScreen() {
  const { account_id } = useLocalSearchParams<{ account_id?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<CaptureStep>('preview');
  const [lines, setLines] = useState<ExtractedLine[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // ---------------------------------------------------------------------------
  // Camera permission
  // ---------------------------------------------------------------------------

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          Precisamos de acesso à câmera para capturar faturas.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Conceder acesso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    setStep('processing');

    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true });
      if (!photo?.base64) throw new Error('Falha ao capturar imagem.');

      // Send to backend for OCR processing
      const res = await api.post<{ data: { text: string } }>('/imports/ocr', {
        image_base64: photo.base64,
      });

      const extracted = extractLines(res.data.text);
      if (extracted.length === 0) {
        Alert.alert('Nenhum item encontrado', 'Tente novamente com uma imagem mais nítida.');
        setStep('preview');
        return;
      }

      setLines(extracted);
      setSelected(new Set(extracted.map((_, i) => i)));
      setStep('review');
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha no processamento.');
      setStep('preview');
    }
  };

  const toggleLine = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleImport = async () => {
    const toImport = lines.filter((_, i) => selected.has(i));
    if (toImport.length === 0) {
      Alert.alert('Selecione ao menos um item.');
      return;
    }

    setImporting(true);
    try {
      await api.post('/transactions/bulk', {
        transactions: toImport.map((line) => ({
          description: line.text,
          amount: line.amount ?? 0,
          type: 'EXPENSE',
          status: 'PREVISTO',
          date: new Date().toISOString(),
          account_id: account_id ?? null,
        })),
      });

      Alert.alert('Importado!', `${toImport.length} transações criadas.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Erro ao importar', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setImporting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (step === 'preview') {
    return (
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.overlay}>
            <View style={styles.frame} />
          </View>
          <View style={styles.cameraControls}>
            <TouchableOpacity style={styles.captureBtn} onPress={handleCapture}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
            <Text style={styles.cameraHint}>
              Enquadre a fatura e pressione o botão
            </Text>
          </View>
        </CameraView>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'processing') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#E11D48" />
        <Text style={styles.processingText}>Processando imagem...</Text>
      </View>
    );
  }

  // step === 'review'
  return (
    <View style={styles.container}>
      <Text style={styles.reviewTitle}>Itens encontrados</Text>
      <Text style={styles.reviewSubtitle}>
        Selecione os itens que deseja importar como transações
      </Text>

      <ScrollView style={styles.lineList}>
        {lines.map((line, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.lineItem, selected.has(i) && styles.lineItemSelected]}
            onPress={() => toggleLine(i)}
          >
            <View style={styles.lineCheck}>
              {selected.has(i) && <View style={styles.lineCheckFill} />}
            </View>
            <View style={styles.lineContent}>
              <Text style={styles.lineText} numberOfLines={2}>
                {line.text}
              </Text>
              {line.amount !== undefined && (
                <Text style={styles.lineAmount}>
                  R$ {line.amount.toFixed(2).replace('.', ',')}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.reviewActions}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => setStep('preview')}
        >
          <Text style={styles.cancelText}>Recapturar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, importing && styles.btnDisabled]}
          onPress={handleImport}
          disabled={importing}
        >
          {importing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              Importar ({selected.size})
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  centered: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frame: {
    width: 300,
    height: 400,
    borderWidth: 2,
    borderColor: '#E11D48',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  cameraControls: {
    paddingBottom: 40,
    alignItems: 'center',
    gap: 12,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  cameraHint: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
  },
  cancelBtn: {
    padding: 16,
    alignItems: 'center',
  },
  cancelText: { color: '#9CA3AF', fontSize: 14 },
  permissionText: {
    color: '#F9FAFB',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  btn: {
    backgroundColor: '#E11D48',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    minWidth: 160,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  processingText: { color: '#9CA3AF', fontSize: 15 },
  reviewTitle: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '700',
    padding: 16,
    paddingBottom: 4,
  },
  reviewSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  lineList: { flex: 1 },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    gap: 12,
  },
  lineItemSelected: { backgroundColor: '#1F1020' },
  lineCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineCheckFill: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E11D48',
  },
  lineContent: { flex: 1 },
  lineText: { color: '#F9FAFB', fontSize: 14 },
  lineAmount: { color: '#E11D48', fontSize: 13, marginTop: 2, fontWeight: '600' },
  reviewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
});
