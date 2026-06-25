import { supabase } from '../supabaseClient'

export function Login() {
    const handleGoogleLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        })
        if (error) console.error('Error al conectar con Google:', error.message)
    }

    return (
        // bg-[#0b0f19] fuerza el color azul nocturno directo en el navegador
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0b0f19] text-white px-6">
            <div className="w-full max-w-md bg-[#131c2e] p-8 rounded-2xl border border-slate-800 text-center shadow-2xl">

                {/* Icono de Balón */}
                <div className="text-5xl mb-4 animate-bounce">⚽</div>

                <h1 className="text-2xl font-bold tracking-tight mb-2 text-white">
                    FIFA WORLD CUP 2026
                </h1>
                <p className="text-sm text-slate-400 mb-8">
                    Gestiona tus cromos, controla tus repetidas y completa tu álbum sin costo.
                </p>

                {/* Botón de Google */}
                <button
                    onClick={handleGoogleLogin}
                    className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-bold py-3.5 px-4 rounded-xl hover:bg-slate-100 transition-all shadow-lg active:scale-[0.98]"
                >
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                        <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.11C18.243 1.157 15.5 0 12.24 0 5.58 0 0 5.37 0 12s5.58 12 12.24 12c6.96 0 11.57-4.854 11.57-11.77 0-.795-.085-1.405-.19-1.945H12.24z" />
                    </svg>
                    <span className="truncate">Ingresar con Google</span>
                </button>

                <div className="mt-6 text-xs text-slate-500">
                    Aplicación de libre uso de la comunidad para fans del fútbol.
                </div>
            </div>
        </div>
    )
}