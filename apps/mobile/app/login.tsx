import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/contexts/auth-context';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

// Build a discovery document using Google's OpenID configuration
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, googleLogin } = useAuth();

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'gudy-money' });

  // PKCE request for Google
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      extraParams: { access_type: 'online' },
    },
    discovery,
  );

  // Handle Google OAuth response
  useEffect(() => {
    if (response?.type !== 'success' || !response.params.code) return;

    (async () => {
      setLoading(true);
      try {
        // Exchange code for tokens
        const tokenRes = await AuthSession.exchangeCodeAsync(
          {
            clientId: GOOGLE_CLIENT_ID,
            code: response.params.code!,
            redirectUri,
            extraParams: { code_verifier: request?.codeVerifier ?? '' },
          },
          discovery,
        );

        const idToken = tokenRes.idToken;
        if (!idToken) throw new Error('ID token not received from Google.');

        await googleLogin(idToken);
        router.replace('/(tabs)/dashboard');
      } catch (err) {
        Alert.alert('Erro', err instanceof Error ? err.message : 'Falha no login com Google.');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  useEffect(() => {
    tryBiometric();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryBiometric = async () => {
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Entre com biometria no Gudy Money',
      cancelLabel: 'Usar senha',
    });

    if (result.success) {
      router.replace('/(tabs)/dashboard');
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)/dashboard');
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert('Aviso', 'Login com Google não está configurado.');
      return;
    }
    await promptAsync();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>G</Text>
        </View>
        <Text style={styles.title}>Gudy Money</Text>
        <Text style={styles.subtitle}>Gestão financeira pessoal e familiar</Text>

        {GOOGLE_CLIENT_ID ? (
          <>
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogleLogin}
              disabled={loading || !request}
            >
              <Text style={styles.googleText}>Entrar com Google</Text>
            </TouchableOpacity>

            <View style={styles.separator}>
              <View style={styles.separatorLine} />
              <Text style={styles.separatorText}>ou</Text>
              <View style={styles.separatorLine} />
            </View>
          </>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor="#9CA3AF"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor="#9CA3AF"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.biometricBtn} onPress={tryBiometric}>
          <Text style={styles.biometricText}>Usar biometria</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    alignSelf: 'center',
  },
  logoText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F9FAFB',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 8,
  },
  googleBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  googleText: { color: '#111827', fontWeight: '600', fontSize: 15 },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#374151' },
  separatorText: { color: '#9CA3AF', fontSize: 13 },
  input: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#374151',
  },
  button: {
    backgroundColor: '#E11D48',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  biometricBtn: { alignItems: 'center', paddingVertical: 8 },
  biometricText: { color: '#E11D48', fontSize: 14 },
});
