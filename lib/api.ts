import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('userToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // A 401 from the login call itself just means wrong credentials — let the
    // login screen show that error. Redirecting to /login here remounted the
    // screen and wiped the error message before the user could see it.
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      await AsyncStorage.multiRemove(['userToken', 'mustChangePassword']);
      router.replace('/login');
    }
    return Promise.reject(error);
  }
);

export default api;
