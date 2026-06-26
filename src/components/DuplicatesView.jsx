import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function buildWhatsAppMessage(repetidas) {
    if (!repetidas.length) return '';

    const agrupadosPorPais = repetidas.reduce((acc, item) => {
        const pais = item.stickers?.teams?.name || 'Especiales';
        const numero = item.stickers?.sticker_number || '';
        const cantidadSobrante = Math.max(item.quantity - 1, 0);
        const textoCromo = `${numero}${cantidadSobrante > 0 ? ` (x${cantidadSobrante})` : ''}`;

        if (!acc[pais]) acc[pais] = [];
        acc[pais].push(textoCromo);

        return acc;
    }, {});

    let mensaje = `*🃏 MIS REPETIDAS — ÁLBUM FIFA 2026* ⚽\n`;
    mensaje += `_¿Te falta alguno? ¡Cambiemos!_ 🤝\n\n`;

    Object.entries(agrupadosPorPais).forEach(([pais, cromos]) => {
        mensaje += `📌 *${pais.toUpperCase()}:* ${cromos.join(', ')}\n`;
    });

    return mensaje;
}

export function DuplicatesView({ session }) {
    const [loading, setLoading] = useState(true);
    const [repetidas, setRepetidas] = useState([]);

    useEffect(() => {
        const userId = session?.user?.id;
        if (userId) {
            cargarRepetidas(userId);
        } else {
            setRepetidas([]);
            setLoading(false);
        }
    }, [session?.user?.id]);

    async function cargarRepetidas(userId) {
        try {
            setLoading(true);

            const { data, error } = await supabase
                .from('user_collection')
                .select(`
          quantity,
          stickers (
            id,
            name,
            sticker_number,
            teams ( name )
          )
        `)
                .eq('user_id', userId)
                .gt('quantity', 1);

            if (error) throw error;
            setRepetidas(data || []);
        } catch (error) {
            console.error('Error cargando repetidas:', error.message);
        } finally {
            setLoading(false);
        }
    }

    const handleCompartirWhatsApp = () => {
        const mensaje = buildWhatsAppMessage(repetidas);
        if (!mensaje) return;

        const urlWhatsApp = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
        window.open(urlWhatsApp, '_blank');
    };

    return (
        <div className="w-full max-w-md px-4 pt-6 flex flex-col gap-4 select-none pb-24 text-slate-200">

            {/* Encabezado */}
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold tracking-wide text-slate-100">Mis Repetidas</h2>
                <span className="bg-yellow-400/10 text-yellow-400 text-xs font-bold px-3 py-1 rounded-full border border-yellow-400/20">
                    Para Cambiar 🤝
                </span>
            </div>

            {/* 🔥 BOTÓN COMPARTIR: Solo se muestra si el usuario tiene repetidas reales */}
            {!loading && repetidas.length > 0 && (
                <button
                    onClick={handleCompartirWhatsApp}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all border border-emerald-400 mt-1"
                >
                    💬 Compartir Repetidas por WhatsApp
                </button>
            )}

            {loading ? (
                <p className="text-center text-slate-500 text-sm py-12 animate-pulse">Revisando tu fajo de repetidas...</p>
            ) : repetidas.length === 0 ? (
                /* Estado vacío si no hay repetidas */
                <div className="bg-[#131c2e]/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 my-6 flex flex-col gap-2">
                    <span className="text-3xl">🃏</span>
                    <p className="text-sm font-bold text-slate-400">¡No tienes repetidas aún!</p>
                    <p className="text-xs text-slate-500">Cada cromo que tienes es único en tu colección. Sigue agregando para empezar a negociar.</p>
                </div>
            ) : (
                /* Lista de repetidas */
                <div className="flex flex-col gap-3">
                    {repetidas.map((item) => {
                        const disponiblesParaCambio = item.quantity - 1;
                        const stickerId = item.stickers?.id || `${item.stickers?.sticker_number}-${item.stickers?.name}`;

                        return (
                            <div
                                key={stickerId}
                                className="bg-[#161f30] border border-slate-800/60 p-4 rounded-2xl flex items-center justify-between shadow-md"
                            >
                                <div className="flex flex-col gap-0.5 max-w-[70%]">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs font-bold text-sky-400">
                                            #{item.stickers?.sticker_number}
                                        </span>
                                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-medium truncate">
                                            {item.stickers?.teams?.name}
                                        </span>
                                    </div>
                                    <h4 className="text-sm font-bold text-white truncate">
                                        {item.stickers?.name}
                                    </h4>
                                </div>

                                {/* Badge indicador de cuántas te sobran */}
                                <div className="bg-yellow-400 text-slate-950 font-black px-3 py-1.5 rounded-xl shadow-lg flex flex-col items-center min-w-[50px]">
                                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-800 leading-none mb-0.5">Sopla</span>
                                    <span className="text-sm leading-none">+{disponiblesParaCambio}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}