// src/services/api.js
// Cliente axios preconfigurado con la URL base del backend.
// El token JWT se inyecta automáticamente en cada petición si existe en localStorage.

import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
})

// Interceptor: agrega el token JWT al header de cada petición automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api