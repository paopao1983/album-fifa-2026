import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function StatsView({ session }) {
    const [loading, setLoading] = useState(true);
    const [metricas, setMetricas] = useState({ totalManejados: 0, ratioExito: 0 });
    const [progresoPaginas, setProgresoPaginas] = useState([]);

    useEffect(() => {
        async function calcularEstadisticas() {
            try {
                setLoading(true);

                const userId = session?.user?.id;
                if (!userId) {
                    setMetricas({ totalManejados: 0, ratioExito: 0 });
                    setProgresoPaginas([]);
                    return;
                }

                // 1. Obtener los países ordenados por tu orden oficial del álbum
                const { data: teams, error: errTeams } = await supabase
                    .from('teams')
                    .select('id, name, code')
                    .order('order_index', { ascending: true });

                if (errTeams) throw errTeams;

                // 2. Obtener el catálogo completo de cromos para saber los topes (ej: Austria 20, Coca-Cola 14)
                const { data: stickers, error: errStickers } = await supabase
                    .from('stickers')
                    .select('id, team_id');

                if (errStickers) throw errStickers;

                // 3. Obtener solo la colección activa del usuario logueado
                const { data: miColeccion, error: errCol } = await supabase
                    .from('user_collection')
                    .select('sticker_id, quantity')
                    .eq('user_id', userId)
                    .gt('quantity', 0);

                if (errCol) throw errCol;

                const coleccion = (miColeccion || []).filter(item => (item.quantity || 0) > 0);
                const listaStickers = stickers || [];
                const listaTeams = teams || [];

                // 📊 MATEMÁTICAS DE APERTURA GLOBAL
                // Total Manejados = Suma física de todas las láminas que han pasado por tus manos
                const totalManejados = coleccion.reduce((acc, item) => acc + (item.quantity || 0), 0);

                // Cromos Útiles = Cuántos cromos únicos del álbum ya están llenos (quantity > 0)
                const cromosUtiles = coleccion.length;

                // Ratio de Éxito = (Útiles / Total Manejados) * 100
                const ratioExito = totalManejados > 0 ? Math.round((cromosUtiles / totalManejados) * 100) : 0;

                // 📈 PROGRESO GRUPO POR GRUPO
                const progreso = listaTeams.map(team => {
                    // Filtrar qué cromos le pertenecen a este país en la base de datos
                    const cromosDelPais = listaStickers.filter(s => s.team_id === team.id);
                    const totalCromosPais = cromosDelPais.length;

                    // Contar cuántos de esos cromos específicos ya tienes registrados (> 0)
                    const idsCromosPais = cromosDelPais.map(s => s.id);
                    const obtenidos = coleccion.filter(
                        item => idsCromosPais.includes(item.sticker_id)
                    ).length;

                    const porcentaje = totalCromosPais > 0 ? Math.round((obtenidos / totalCromosPais) * 100) : 0;

                    return {
                        id: team.id,
                        name: team.name,
                        code: team.code,
                        obtenidos,
                        total: totalCromosPais,
                        porcentaje
                    };
                });

                setMetricas({ totalManejados, ratioExito });
                setProgresoPaginas(progreso);

            } catch (error) {
                console.error('Error calculando estadísticas:', error.message);
            } finally {
                setLoading(false);
            }
        }

        calcularEstadisticas();

        if (!session?.user?.id) return;

        const channel = supabase
            .channel(`stats-view-${session.user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user_collection',
                filter: `user_id=eq.${session.user.id}`
            }, () => {
                calcularEstadisticas();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [session?.user?.id]);

    if (loading) {
        return (
            <div className="w-full max-w-md px-4 pt-6 text-center text-slate-500 text-xs py-16 animate-pulse">
                Sincronizando métricas con tu álbum físico...
            </div>
        );
    }

    return (
        <div className="w-full max-w-md px-4 pt-6 flex flex-col gap-4 select-none pb-24 text-slate-200">
            <h2 className="text-xl font-black tracking-wide text-slate-100">Análisis del Álbum</h2>

            {/* Tarjeta Contenedora de Métricas Globales */}
            <div className="bg-[#161f30]/60 border border-slate-800/60 rounded-3xl p-5 flex flex-col gap-4 shadow-inner">
                <h4 className="text-[10px] font-black tracking-widest text-slate-500 uppercase">Métricas de Apertura</h4>

                <div className="grid grid-cols-2 gap-4">
                    {/* Ratio de Éxito */}
                    <div className="bg-[#0d131f]/40 p-4 rounded-2xl border border-slate-900 flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400">Ratio de Éxito</span>
                        <span className="text-2xl font-black text-emerald-400">{metricas.ratioExito}%</span>
                        <span className="text-[9px] text-slate-500 font-medium">de cromos nuevos</span>
                    </div>

                    {/* Total Manejados */}
                    <div className="bg-[#0d131f]/40 p-4 rounded-2xl border border-slate-900 flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400">Total Manejados</span>
                        <span className="text-2xl font-black text-sky-400">{metricas.totalManejados}</span>
                        <span className="text-[9px] text-slate-500 font-medium">láminas en total</span>
                    </div>
                </div>
            </div>

            {/* Listado de Progreso por Páginas */}
            <h3 className="text-sm font-black tracking-wide text-slate-300 mt-2">Progreso por Páginas</h3>

            <div className="flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-280px)] pr-1 scrollbar-none">
                {progresoPaginas.map(p => (
                    <div key={p.id} className="bg-[#161f30]/40 border border-slate-800/40 rounded-2xl p-4 flex flex-col gap-2.5 shadow-sm">

                        {/* Cabecera del país */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="bg-slate-800 text-slate-300 font-mono text-[9px] font-black px-1.5 py-0.5 rounded tracking-wider shrink-0">
                                    {p.code}
                                </span>
                                <span className="text-xs font-bold text-slate-200 truncate">
                                    {p.name}
                                </span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 shrink-0 font-mono">
                                <strong className="text-slate-300">{p.obtenidos}</strong> / {p.total} <span className="text-[9px] text-slate-600 font-sans">cromos</span>
                            </span>
                        </div>

                        {/* Barra de Progreso Fluida */}
                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800/20 relative">
                            <div
                                className="bg-sky-400 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(56,189,248,0.3)]"
                                style={{ width: `${p.porcentaje}%` }}
                            />
                        </div>

                        {/* Porcentaje numérico */}
                        <div className="flex justify-end">
                            <span className="text-[10px] font-black tracking-wide text-sky-400 font-mono">
                                {p.porcentaje}% completado
                            </span>
                        </div>

                    </div>
                ))}
            </div>

        </div>
    );
}