// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

// 1. Crear el contexto
const AuthContext = createContext()

// 2. Proveedor — envuelve toda la app y comparte el estado
export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  // Al arrancar la app, revisa si ya hay un token guardado
  useEffect(() => {
    const token = localStorage.getItem('token')
    const usuarioGuardado = localStorage.getItem('usuario')
    if (token && usuarioGuardado) {
      setUsuario(JSON.parse(usuarioGuardado))
    }
    setCargando(false)
  }, [])

  // Si el backend responde 401 (token vencido, invalidado o de otro deploy),
  // cierro la sesión y vuelvo al login. Antes la app se quedaba "logueada"
  // con un token que ya no servía y mostraba solo "Error al cargar las
  // unidades de lectura", sin forma de salir.
  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        const esLogin = err.config?.url?.includes('/auth/login')
        if (err.response?.status === 401 && !esLogin) {
          localStorage.removeItem('token')
          localStorage.removeItem('usuario')
          setUsuario(null)
        }
        return Promise.reject(err)
      }
    )
    return () => api.interceptors.response.eject(id)
  }, [])

  // Login: llama al backend, guarda token y usuario
  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('usuario', JSON.stringify(data.usuario))
    setUsuario(data.usuario)
    return data
  }

  // Logout: limpia todo
  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, cargando }}>
      {children}
    </AuthContext.Provider>
  )
}

// 3. Hook personalizado para usar el contexto fácilmente
export function useAuth() {
  return useContext(AuthContext)
}