import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Login } from './components/Login'
import { Dashboard } from './components/Dashboard'
import { AlbumView } from './components/AlbumView'
import { SearchView } from './components/SearchView'
import { DuplicatesView } from './components/DuplicatesView'
import { StatsView } from './components/StatsView'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('inicio')
  const [preselectedTeamId, setPreselectedTeamId] = useState(null) // 🔥 Estado para recordar el país del acceso directo

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 🔥 Función puente: El Dashboard la llamará para mandar al usuario directo a un país del álbum
  const irAlPaisEnAlbum = (teamId) => {
    setPreselectedTeamId(teamId);
    setActiveTab('album');
  }

  // 🔥 Modificación al cambiar manualmente de pestaña desde el menú inferior
  const cambiarTabManual = (tabName) => {
    if (tabName !== 'album') {
      setPreselectedTeamId(null); // Limpiamos el filtro si va a otra sección
    }
    setActiveTab(tabName);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-white flex items-center justify-center font-semibold">
        Cargando álbum...
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-[#0d131f] text-white flex justify-center pb-24 font-sans">

      {activeTab === 'inicio' && (
        <Dashboard
          session={session}
          onSignOut={() => supabase.auth.signOut()}
          onNavigateToTeam={irAlPaisEnAlbum} // 🔥 Pasamos la función al Dashboard
        />
      )}

      {activeTab === 'album' && (
        <AlbumView
          session={session}
          initialTeamId={preselectedTeamId} // 🔥 Le inyectamos el país preseleccionado al Álbum
        />
      )}

      {activeTab === 'buscar' && (
        <SearchView session={session} />
      )}

      {activeTab === 'repetidas' && (
        <DuplicatesView session={session} />
      )}

      {activeTab === 'estadisticas' && (
        <StatsView session={session} />
      )}

      {/* MENÚ INFERIOR */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#161f30] border-t border-slate-800/80 p-3 flex justify-around shadow-2xl text-[10px] text-gray-400 max-w-md mx-auto rounded-t-2xl z-40">
        <button
          onClick={() => cambiarTabManual('inicio')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'inicio' ? 'text-sky-400 font-bold' : ''}`}
        >
          <span className="text-sm">🏠</span> <span>Inicio</span>
        </button>

        <button
          onClick={() => cambiarTabManual('album')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'album' ? 'text-sky-400 font-bold' : ''}`}
        >
          <span className="text-sm">📖</span> <span>Álbum</span>
        </button>

        <button
          onClick={() => cambiarTabManual('buscar')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'buscar' ? 'text-sky-400 font-bold' : ''}`}
        >
          <span className="text-sm">🔍</span> <span>Buscar</span>
        </button>

        <button
          onClick={() => cambiarTabManual('repetidas')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'repetidas' ? 'text-sky-400 font-bold' : ''}`}
        >
          <span className="text-sm">🃏</span> <span>Repetidas</span>
        </button>

        <button
          onClick={() => cambiarTabManual('estadisticas')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'estadisticas' ? 'text-sky-400 font-bold' : ''}`}
        >
          <span className="text-sm">📊</span> <span>Estadísticas</span>
        </button>
      </div>

    </div>
  )
}

export default App