// src/App.jsx
import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Mapa from './pages/Mapa'

export default function App() {
  const { usuario, cargando } = useAuth()
  const [, setActualizar] = useState(0)

  if (cargando) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Cargando...</p>

  if (!usuario) return <Login onLogin={() => setActualizar(n => n + 1)} />

  return <Mapa />
}