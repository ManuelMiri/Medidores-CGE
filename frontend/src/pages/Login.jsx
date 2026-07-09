// src/pages/Login.jsx
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Container, Card, Form, Button, Alert, Spinner } from 'react-bootstrap'

export default function Login({ onLogin }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setCargando(true)

    try {
      await login(email, password)
      onLogin()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setCargando(false)
    }
  }

  return (
    <Container
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: '100vh', backgroundColor: '#f0f4f8' }}
    >
      <Card style={{ width: '100%', maxWidth: '400px' }} className="shadow-sm p-3">
        <Card.Body>

          {/* Encabezado */}
          <div className="text-center mb-4">
            <h2 className="fw-bold">⚡ Medidores CGE</h2>
            <p className="text-muted mb-0">Zona Maule — Acceso al sistema</p>
          </div>

          {/* Error */}
          {error && <Alert variant="danger">{error}</Alert>}

          {/* Formulario */}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Correo electrónico</Form.Label>
              <Form.Control
                type="email"
                placeholder="usuario@cge.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Form.Group>

            <Form.Group className="mb-4">
              <Form.Label>Contraseña</Form.Label>
              <Form.Control
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Form.Group>

            <Button
              variant="primary"
              type="submit"
              className="w-100"
              disabled={cargando}
            >
              {cargando
                ? <><Spinner size="sm" className="me-2" />Iniciando sesión...</>
                : 'Iniciar sesión'
              }
            </Button>
          </Form>

        </Card.Body>
      </Card>
    </Container>
  )
}