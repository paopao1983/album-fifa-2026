import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

export function Dashboard({ session, onSignOut, onNavigateToTeam }) {
    // Estados de datos generales del Inicio
    const [stats, setStats] = useState({ obtenidos: 0, totales: 0, especialesObtenidas: 0, especialesTotales: 68, repetidas: 0 });
    const [ultimosAgregados, setUltimosAgregados] = useState([]);
    const [proximoObjetivo, setProximoObjetivo] = useState({ name: 'Cargando objetivo...', obtenidos: 0, totales: 0, teamId: null });
    const [loading, setLoading] = useState(true);

    // 🔥 Estados para el Buscador Predictivo del Home
    const [modalBuscarActivo, setModalBuscarActivo] = useState(false);
    const [terminoBusqueda, setTerminoBusqueda] = useState('');
    const [resultadosStickers, setResultadosStickers] = useState([]);
    const [buscandoStickers, setBuscandoStickers] = useState(false);

    // 📸 Estados para el Recortador Gestual de Esquinas (¡El que quedó perfecto!)
    const [imagenPreviewUrl, setImagenPreviewUrl] = useState(null);
    const [cromoParaFoto, setCromoParaFoto] = useState(null);
    const [guardandoProceso, setGuardandoProceso] = useState(false);
    const [boxStyle, setBoxStyle] = useState({ top: 10, left: 10, width: 80, height: 80 });

    const cropContainerRef = useRef(null);
    const dragInfo = useRef({ handle: null, rect: null, startX: 0, startY: 0, top: 0, left: 0, width: 0, height: 0 });

    // Cargar estadísticas reales al entrar y refrescar al cambiar la colección
    useEffect(() => {
        cargarDatosDashboard();
    }, [session?.user?.id]);

    useEffect(() => {
        if (!session?.user?.id) return;

        const channel = supabase
            .channel(`dashboard-updates-${session.user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user_collection',
                filter: `user_id=eq.${session.user.id}`
            }, () => {
                cargarDatosDashboard();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [session?.user?.id]);

    // Buscador predictivo en tiempo real
    useEffect(() => {
        if (terminoBusqueda.trim().length > 0) {
            ejecutarBusquedaPredictiva();
        } else {
            setResultadosStickers([]);
        }
    }, [terminoBusqueda]);

    async function cargarDatosDashboard() {
        try {
            setLoading(true);

            const userId = session?.user?.id;
            if (!userId) {
                setUltimosAgregados([]);
                setStats({ obtenidos: 0, totales: 0, especialesObtenidas: 0, especialesTotales: 68, repetidas: 0 });
                setProximoObjetivo({ name: 'Inicia sesión para ver tu objetivo', obtenidos: 0, totales: 0, teamId: null });
                return;
            }

            // 1. Cargar estadísticas de tu colección real en Supabase
            const { data: miColeccion, error: errCol } = await supabase
                .from('user_collection')
                .select('sticker_id, quantity, photo_url, stickers(id, name, sticker_number, is_special, team_id, team_id)')
                .eq('user_id', userId);

            if (errCol) throw errCol;

            const totalObtenidos = miColeccion ? miColeccion.length : 0;
            let totalEspeciales = 0;
            let totalRepetidas = 0;

            miColeccion?.forEach(item => {
                if (item.stickers?.is_special) totalEspeciales++;
                if (item.quantity > 1) totalRepetidas += (item.quantity - 1);
            });

            // 2. Traer los totales globales dinámicos del sistema
            const { count: conteoTotales } = await supabase.from('stickers').select('*', { count: 'exact', head: true });
            const { count: conteoEspeciales } = await supabase.from('stickers').select('*', { count: 'exact', head: true }).eq('is_special', true);
            const { data: teams, error: errTeams } = await supabase
                .from('teams')
                .select('id, name')
                .order('order_index', { ascending: true });

            if (errTeams) throw errTeams;

            setStats({
                obtenidos: totalObtenidos || 0,
                totales: conteoTotales || 0,
                especialesObtenidas: totalEspeciales || 0,
                especialesTotales: conteoEspeciales || 0,
                repetidas: totalRepetidas || 0
            });

            const coleccionActiva = (miColeccion || []).filter(item => (item.quantity || 0) > 0);
            const equiposConProgreso = (teams || [])
                .map(team => {
                    const cromosDelEquipo = coleccionActiva.filter(item => item.stickers?.team_id === team.id);
                    return {
                        id: team.id,
                        name: team.name,
                        obtenidos: cromosDelEquipo.length,
                        totales: 0
                    };
                })
                .filter(equipo => equipo.obtenidos > 0);

            const objetivo = equiposConProgreso.sort((a, b) => b.obtenidos - a.obtenidos)[0];

            setProximoObjetivo({
                name: objetivo ? objetivo.name : 'Completa tu álbum',
                obtenidos: objetivo ? objetivo.obtenidos : 0,
                totales: objetivo ? Math.max(objetivo.obtenidos, 1) : 0,
                teamId: objetivo ? objetivo.id : null
            });

            // 3. Obtener los últimos 3 cromos que siguen presentes en la colección del usuario
            const { data: recientes } = await supabase
                .from('user_collection')
                .select('sticker_id, quantity, stickers(name, sticker_number)')
                .eq('user_id', userId)
                .gt('quantity', 0)
                .order('id', { ascending: false })
                .limit(3);

            if (recientes) {
                setUltimosAgregados(recientes
                    .map(r => ({
                        name: r.stickers?.name,
                        number: r.stickers?.sticker_number
                    }))
                    .filter(item => item.name));
            } else {
                setUltimosAgregados([]);
            }

        } catch (error) {
            console.error('Error cargando Dashboard:', error.message);
        } finally {
            setLoading(false);
        }
    }

    // BÚSQUEDA FILTRADA POR NOMBRE, NÚMERO O PAÍS
    async function ejecutarBusquedaPredictiva() {
        try {
            setBuscandoStickers(true);
            const query = terminoBusqueda.trim();

            const { data, error } = await supabase
                .from('stickers')
                .select(`
          id, name, sticker_number, is_special,
          teams ( id, name, code, flag_url )
        `)
                .or(`name.ilike.%${query}%,sticker_number.ilike.%${query}%`)
                .limit(6);

            if (error) throw error;
            setResultadosStickers(data || []);
        } catch (error) {
            console.error('Error en predictivo:', error.message);
        } finally {
            setBuscandoStickers(false);
        }
    }

    // MANEJADORES GESTUALES DEL RECUADRO BLANCO DE CORTE
    const handleTouchStartBox = (handle, e) => {
        e.stopPropagation();
        if (guardandoProceso || !cropContainerRef.current) return;

        const rect = cropContainerRef.current.getBoundingClientRect();
        dragInfo.current = {
            handle,
            rect,
            startX: e.touches[0].clientX,
            startY: e.touches[0].clientY,
            top: boxStyle.top,
            left: boxStyle.left,
            width: boxStyle.width,
            height: boxStyle.height
        };
    };

    const handleTouchMoveBox = (e) => {
        const info = dragInfo.current;
        if (!info.handle || guardandoProceso) return;

        const deltaX = ((e.touches[0].clientX - info.startX) / info.rect.width) * 100;
        const deltaY = ((e.touches[0].clientY - info.startY) / info.rect.height) * 100;

        let { top, left, width, height } = info;

        if (info.handle === 'br') {
            width = Math.max(15, Math.min(100 - left, width + deltaX));
            height = Math.max(15, Math.min(100 - top, height + deltaY));
        } else if (info.handle === 'tl') {
            const nextLeft = Math.max(0, Math.min(left + width - 15, left + deltaX));
            const nextTop = Math.max(0, Math.min(top + height - 15, top + deltaY));
            width = width - (nextLeft - left);
            height = height - (nextTop - top);
            left = nextLeft;
            top = nextTop;
        } else if (info.handle === 'tr') {
            const nextTop = Math.max(0, Math.min(top + height - 15, top + deltaY));
            height = height - (nextTop - top);
            top = nextTop;
            width = Math.max(15, Math.min(100 - left, width + deltaX));
        } else if (info.handle === 'bl') {
            const nextLeft = Math.max(0, Math.min(left + width - 15, left + deltaX));
            width = width - (nextLeft - left);
            left = nextLeft;
            height = Math.max(15, Math.min(100 - top, height + deltaY));
        } else if (info.handle === 'box') {
            left = Math.max(0, Math.min(100 - width, left + deltaX));
            top = Math.max(0, Math.min(100 - height, top + deltaY));
        }

        setBoxStyle({ top, left, width, height });
    };

    const handleTouchEndBox = () => {
        dragInfo.current.handle = null;
    };

    async function handleCamaraPredictiva(e, cromoTarget) {
        const file = e.target.files[0];
        if (!file) return;

        e.target.value = '';
        setCromoParaFoto(cromoTarget);

        const urlLocal = URL.createObjectURL(file);
        setImagenPreviewUrl(urlLocal);
        setBoxStyle({ top: 10, left: 10, width: 80, height: 80 });
    }

    // PROCESAMIENTO SEGURO DEL CANVAS DE CORTE
    async function handleAplicarRecorteDashboard() {
        if (!cromoParaFoto || !imagenPreviewUrl || !cropContainerRef.current) return;

        setGuardandoProceso(true);

        const imgEl = cropContainerRef.current.querySelector('img');
        const img = new Image();
        img.src = imagenPreviewUrl;

        img.onload = async () => {
            try {
                const canvas = document.createElement('canvas');
                const trueWidth = imgEl.naturalWidth || img.width;
                const trueHeight = imgEl.naturalHeight || img.height;

                const sx = (boxStyle.left / 100) * trueWidth;
                const sy = (boxStyle.top / 100) * trueHeight;
                const sWidth = (boxStyle.width / 100) * trueWidth;
                const sHeight = (boxStyle.height / 100) * trueHeight;

                canvas.width = sWidth;
                canvas.height = sHeight;

                if (canvas.width > 750) {
                    const escala = 750 / canvas.width;
                    canvas.width = 750;
                    canvas.height = sHeight * escala;
                }

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
                if (!blob) throw new Error('Error al procesar recorte');

                const fileFinal = new File([blob], `crop_${cromoParaFoto.id}.jpg`, { type: 'image/jpeg' });

                const { data: existeDB } = await supabase
                    .from('user_collection')
                    .select('id')
                    .eq('user_id', session.user.id)
                    .eq('sticker_id', cromoParaFoto.id)
                    .maybeSingle();

                const fileName = `${session.user.id}_${cromoParaFoto.id}_${Date.now()}.jpg`;

                const { error: uploadError } = await supabase.storage
                    .from('fotos_cromos')
                    .upload(fileName, fileFinal, { cacheControl: '3600', upsert: true });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage.from('fotos_cromos').getPublicUrl(fileName);

                if (existeDB) {
                    await supabase
                        .from('user_collection')
                        .update({ photo_url: publicUrl, quantity: 1 })
                        .eq('id', existeDB.id);
                } else {
                    await supabase
                        .from('user_collection')
                        .insert({ user_id: session.user.id, sticker_id: cromoParaFoto.id, quantity: 1, photo_url: publicUrl });
                }

                // Reseteamos estados y refrescamos los números del dashboard
                setImagenPreviewUrl(null);
                setModalBuscarActivo(false);
                setTerminoBusqueda('');
                cargarDatosDashboard();

            } catch (error) {
                console.error('Error guardando cromo:', error.message);
                alert('No se pudo guardar el cromo.');
            } finally {
                setGuardandoProceso(false);
            }
        };
    }

    const porcentajeProgreso = Math.round((stats.obtenidos / stats.totales) * 100);

    return (
        <div className="w-full max-w-md px-4 pt-6 flex flex-col gap-4 select-none pb-24 text-slate-200">

            {/* 1. Header de Perfil */}
            <div className="flex items-center justify-between bg-[#161f30]/60 p-4 rounded-2xl border border-slate-800/50 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-sky-500/20 border border-sky-400 overflow-hidden shadow-inner">
                        <img src={session.user.user_metadata?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=Pao"} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 tracking-wider">¡Bienvenid@ futboler@!</p>
                        <p className="text-sm font-black text-slate-100 tracking-wide">{session.user.user_metadata?.name || 'Usuario'}</p>
                    </div>
                </div>
                <button onClick={onSignOut} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/40 text-slate-400 hover:text-red-400 border border-slate-800 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
                </button>
            </div>

            {/* 2. Barra de Progreso General */}
            <div className="bg-[#161f30]/60 p-4 rounded-2xl border border-slate-800/50 shadow-sm flex flex-col gap-2">
                <h3 className="text-xs font-black tracking-wider text-slate-400 uppercase">Progreso General</h3>
                <div className="w-full h-5 bg-slate-950/80 rounded-full overflow-hidden border border-slate-900 relative flex items-center justify-center">
                    <div style={{ width: `${porcentajeProgreso || 0}%` }} className="absolute left-0 top-0 bottom-0 bg-emerald-500 shadow-[0_0_12px_#10b981] rounded-full transition-all duration-500" />
                    <span className="z-10 font-mono text-xs font-black text-white drop-shadow">{porcentajeProgreso || 0}%</span>
                </div>
                <p className="text-[10px] font-bold text-slate-500 text-center tracking-wide mt-0.5">{stats.obtenidos} / {stats.totales} cromos</p>
            </div>

            {/* 3. Cajas de Estadísticas */}
            <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-[#161f30]/40 border border-slate-800/50 p-3 rounded-xl text-center">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Especiales</p>
                    <p className="text-xs font-black text-purple-400">{stats.especialesObtenidas} / {stats.especialesTotales}</p>
                </div>
                <div className="bg-[#161f30]/40 border border-slate-800/50 p-3 rounded-xl text-center">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Repetidas</p>
                    <p className="text-xs font-black text-yellow-400">{stats.repetidas}</p>
                </div>
                <div className="bg-[#161f30]/40 border border-slate-800/50 p-3 rounded-xl text-center">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Faltantes</p>
                    <p className="text-xs font-black text-slate-300">{stats.totales - stats.obtenidos}</p>
                </div>
            </div>

            {/* 4. BOTONES CENTRALES DE ACCIÓN ACTUALIZADOS */}
            <div className="grid grid-cols-2 gap-3 mt-1">
                <button
                    onClick={() => setModalBuscarActivo(true)}
                    className="bg-sky-400 text-slate-950 font-black text-xs py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all border border-sky-400"
                >
                    📷 Escanear Cromo
                </button>
                <button
                    onClick={() => onNavigateToTeam(null)}
                    className="bg-[#161f30] text-sky-400 border border-slate-800 hover:border-sky-500/30 font-black text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                    + Agregar Manual
                </button>
            </div>

            {/* 5. Últimos Agregados */}
            <div className="bg-[#161f30]/60 p-4 rounded-2xl border border-slate-800/50 shadow-sm flex flex-col gap-2.5">
                <h3 className="text-xs font-black tracking-wider text-slate-400 uppercase flex items-center gap-1.5">📦 Últimos agregados</h3>
                <div className="flex flex-col gap-2">
                    {ultimosAgregados.length === 0 ? (
                        <div className="text-center text-[11px] font-bold text-slate-500 bg-slate-950/20 p-3 rounded-lg border border-slate-900/40">
                            Aún no has agregado cromos para esta sesión.
                        </div>
                    ) : (
                        ultimosAgregados.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs font-bold text-slate-300 bg-slate-950/20 p-2 rounded-lg border border-slate-900/40">
                                <span className="text-emerald-400">✓ {item.name}</span>
                                <span className="font-mono text-slate-500 text-[11px]">#{item.number}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 6. Próximo Objetivo */}
            <div className="bg-[#161f30]/60 p-4 rounded-2xl border border-slate-800/50 shadow-sm flex flex-col gap-2.5">
                <h3 className="text-xs font-black tracking-wider text-slate-400 uppercase flex items-center gap-1.5">🎯 Próximo objetivo</h3>
                <div className="bg-slate-950/40 border border-slate-900/60 p-3 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl">🏳️</span>
                        <div>
                            <p className="text-xs font-black text-slate-200 tracking-wide">{proximoObjetivo.name}</p>
                            <p className="text-[10px] font-bold text-slate-500 font-mono">{proximoObjetivo.obtenidos} / {proximoObjetivo.totales} cromos</p>
                        </div>
                    </div>
                </div>
                <button onClick={() => onNavigateToTeam(proximoObjetivo.teamId || null)} className="w-full bg-[#111827] border border-slate-800 text-[11px] font-black text-slate-300 py-2.5 rounded-xl hover:text-white transition-colors">
                    Ver colección
                </button>
            </div>

            {/* ========================================================================= */}
            {/* 🔥 MODAL 1: BUSCADOR PREDICTIVO COMPLETO */}
            {modalBuscarActivo && (
                <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[250] flex flex-col p-6">
                    <div className="flex justify-between items-center mb-5">
                        <h4 className="text-slate-100 text-sm font-black tracking-wide">Escanear Cromo</h4>
                        <button
                            onClick={() => { setModalBuscarActivo(false); setTerminoBusqueda(''); }}
                            className="text-xs font-bold text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-800"
                        >
                            Cerrar
                        </button>
                    </div>

                    <div className="relative w-full mb-4">
                        <input
                            type="text"
                            placeholder="Escribe el nombre del jugador o el número..."
                            value={terminoBusqueda}
                            onChange={(e) => setTerminoBusqueda(e.target.value)}
                            className="w-full bg-[#111827] border border-slate-800 focus:border-sky-400 rounded-xl px-4 py-3 text-xs font-bold text-slate-100 outline-none transition-all placeholder-slate-600"
                            autoFocus
                        />
                    </div>

                    <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-0.5">
                        {buscandoStickers && <p className="text-center text-slate-500 text-[11px] py-4 animate-pulse">Filtrando cromos...</p>}

                        {!buscandoStickers && resultadosStickers.length === 0 && terminoBusqueda.trim() !== '' && (
                            <p className="text-center text-slate-600 text-[11px] py-4 font-bold">No se encontró coincidencia exacta.</p>
                        )}

                        {!buscandoStickers && resultadosStickers.map(sticker => (
                            <div key={sticker.id} className="bg-[#161f30]/80 border border-slate-800/60 p-3 rounded-xl flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 overflow-hidden">
                                    {sticker.teams?.flag_url ? (
                                        <img src={sticker.teams.flag_url} alt="" className="w-5 h-3.5 object-cover rounded-sm shrink-0 border border-slate-800/40" />
                                    ) : <span className="text-xs">🏳️</span>}
                                    <div className="overflow-hidden">
                                        <p className="text-xs font-black text-slate-200 truncate tracking-wide">{sticker.name}</p>
                                        <p className="text-[10px] font-bold text-slate-500 font-mono">#{sticker.sticker_number} — {sticker.teams?.code}</p>
                                    </div>
                                </div>

                                <label className="px-3 py-2 rounded-lg bg-sky-400 text-slate-950 font-black text-[10px] uppercase tracking-wide cursor-pointer active:scale-90 transition-all shrink-0 flex items-center gap-1 shadow-sm">
                                    📸 Disparar
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={(e) => handleCamaraPredictiva(e, sticker)}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 🔥 MODAL 2: INTERFAZ DE RECORTE GESTUAL INLINE ADAPTABLE */}
            {imagenPreviewUrl && cromoParaFoto && (
                <div
                    onContextmenu={(e) => e.preventDefault()}
                    onTouchMove={handleTouchMoveBox}
                    onTouchEnd={handleTouchEndBox}
                    className="fixed inset-0 bg-[#060a12] z-[300] flex flex-col p-5 overflow-y-auto select-none"
                >
                    <div className="flex justify-between items-center mb-5 shrink-0">
                        <div>
                            <span className="text-[10px] font-mono text-sky-400 font-bold tracking-widest">Recortar #{cromoParaFoto.sticker_number} ({cromoParaFoto.teams?.code})</span>
                            <h4 className="text-slate-100 text-sm font-black tracking-wide truncate max-w-[180px]">{cromoParaFoto.name}</h4>
                        </div>
                        <button
                            onClick={() => setImagenPreviewUrl(null)}
                            className="text-xs font-bold text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20"
                            disabled={guardandoProceso}
                        >
                            Atrás
                        </button>
                    </div>

                    <div className="w-full max-w-sm mx-auto flex-1 flex items-center justify-center min-h-[320px] p-2 bg-[#090d16] rounded-3xl border border-slate-900 shadow-inner mb-5 relative overflow-hidden">
                        <div
                            ref={cropContainerRef}
                            className="relative inline-block max-w-full max-h-[60vh] rounded-xl overflow-hidden shadow-2xl bg-slate-950 border border-slate-800"
                        >
                            <img src={imagenPreviewUrl} alt="" className="max-w-full max-h-[60vh] object-contain block select-none pointer-events-none opacity-45" />

                            <div
                                style={{
                                    top: `${boxStyle.top}%`,
                                    left: `${boxStyle.left}%`,
                                    width: `${boxStyle.width}%`,
                                    height: `${boxStyle.height}%`
                                }}
                                onTouchStart={(e) => handleTouchStartBox('box', e)}
                                className="absolute border-2 border-white bg-transparent cursor-move touch-none z-10"
                            >
                                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-25 pointer-events-none">
                                    <div className="border-r border-b border-white"></div><div className="border-r border-b border-white"></div><div className="border-b border-white"></div>
                                    <div className="border-r border-b border-white"></div><div className="border-r border-b border-white"></div><div className="border-b border-white"></div>
                                    <div className="border-r border-white"></div><div className="border-r border-white"></div><div></div>
                                </div>

                                {/* Esquinas táctiles de control */}
                                <div onTouchStart={(e) => handleTouchStartBox('tl', e)} className="w-8 h-8 flex items-center justify-center absolute -top-4 -left-4 z-20 touch-none"><div className="w-3.5 h-3.5 bg-white rounded-full border-2 border-sky-400 shadow-md" /></div>
                                <div onTouchStart={(e) => handleTouchStartBox('tr', e)} className="w-8 h-8 flex items-center justify-center absolute -top-4 -right-4 z-20 touch-none"><div className="w-3.5 h-3.5 bg-white rounded-full border-2 border-sky-400 shadow-md" /></div>
                                <div onTouchStart={(e) => handleTouchStartBox('bl', e)} className="w-8 h-8 flex items-center justify-center absolute -bottom-4 -left-4 z-20 touch-none"><div className="w-3.5 h-3.5 bg-white rounded-full border-2 border-sky-400 shadow-md" /></div>
                                <div onTouchStart={(e) => handleTouchStartBox('br', e)} className="w-8 h-8 flex items-center justify-center absolute -bottom-4 -right-4 z-20 touch-none"><div className="w-3.5 h-3.5 bg-white rounded-full border-2 border-sky-400 shadow-md" /></div>
                            </div>
                        </div>

                        {guardandoProceso && (
                            <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-2 z-40">
                                <span className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Guardando Cromo...</span>
                            </div>
                        )}
                    </div>

                    <p className="text-[11px] text-center text-slate-500 font-bold mb-4 max-w-xs mx-auto shrink-0">
                        🔳 Mueve el cuadro blanco del centro o estira los círculos de las esquinas para fijar el corte.
                    </p>

                    <button
                        onClick={handleAplicarRecorteDashboard}
                        className="w-full flex items-center justify-center gap-2 bg-sky-400 hover:bg-sky-300 text-slate-950 py-3.5 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-md shrink-0"
                        disabled={guardandoProceso}
                    >
                        Confirmar y Guardar Cromo
                    </button>
                </div>
            )}

        </div>
    );
}