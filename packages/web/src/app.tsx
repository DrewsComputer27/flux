import { useState, useEffect } from 'preact/hooks'
import Router from 'preact-router'
import { ProjectCreate, ProjectList, Board, Webhooks, Auth } from './pages'
import { BuildInfoFooter, ThemeProvider } from './components'
import { initAuth } from './stores/auth'

export function App() {
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    initAuth().then(() => setAuthReady(true))
  }, [])

  if (!authReady) {
    return (
      <ThemeProvider>
        <div class="min-h-screen bg-base-200 flex items-center justify-center">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <Router>
        <ProjectList path="/" />
        <ProjectCreate path="/new" />
        <Board path="/board/:projectId" />
        <Webhooks path="/webhooks" />
        <Auth path="/auth" />
      </Router>
      <BuildInfoFooter />
    </ThemeProvider>
  )
}
