import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

export function AlbumView({ session, initialTeamId }) {
    const [loading, setLoading] = useState(true);
    const [paises, setPaises] = useState([]);
    const [paisSeleccionado, setPaisSeleccionado] = useState('');
    const [cromosDelPais, setCromosDelPais] = useState([]);
    const [touchStartX, setTouchStartX] = useState(null);
    const [subiendoFotoId, setSubiendoFotoId] = useState(null);
    const [cromoPreview, setCromoPreview] = useState(null);

    // 📸 Estados para tu Modal de Recorte por Esquinas
    const [imagenPreviewUrl, setImagenPreviewUrl] = useState(null);
    const [cromoParaFoto, setCromoParaFoto] = useState(null);
    const [guardandoProceso, setGuardandoProceso] = useState(false);

    // Posición y tamaño del cuadro de recorte en porcentajes (%)
    const [boxStyle, setBoxStyle] = useState({ top: 10, left: 10, width: 80, height: 80 });

    const tabsContainerRef = useRef(null);
    const cropContainerRef = useRef(null);
    const dragInfo = useRef({ handle: null, rect: null, startX: 0, startY: 0, top: 0, left: 0, width: 0, height: 0 });

    // 1. Cargar países ordenados por tu orden oficial de grupos
    useEffect(() => {
        async function cargarPaises() {
            try {
                const { data, error } = await supabase
                    .from('teams')
                    .select('id, name, code, flag_url')
                    .order('order_index', { ascending: true });

                if (error) throw error;
                setPaises(data || []);

                if (initialTeamId) {
                    setPaisSeleccionado(initialTeamId);
                } else if (data && data.length > 0) {
                    setPaisSeleccionado(data[0].id);
                }
            } catch (error) {
                console.error('Error cargando países:', error.message);
            }
        }
        cargarPaises();
    }, [initialTeamId]);

    // 2. Cargar los cromos con sus fotos reales
    useEffect(() => {
        if (paisSeleccionado) {
            cargarCromosDelPais();
        }
    }, [paisSeleccionado]);

    // Auto-centrar pestañas superiores
    useEffect(() => {
        if (paisSeleccionado && tabsContainerRef.current) {
            const botonActivo = tabsContainerRef.current.querySelector('[data-active="true"]');
            if (botonActivo) {
                botonActivo.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [paisSeleccionado]);

    async function cargarCromosDelPais() {
        try {
            setLoading(true);

            const { data: todosLosCromos, error: errStickers } = await supabase
                .from('stickers')
                .select('id, name, sticker_number, is_special')
                .eq('team_id', paisSeleccionado);

            if (errStickers) throw errStickers;

            const cromosOrdenados = (todosLosCromos || []).sort((a, b) => {
                return parseInt(a.sticker_number, 10) - parseInt(b.sticker_number, 10);
            });

            const { data: miColeccion, error: errCol } = await supabase
                .from('user_collection')
                .select('sticker_id, quantity, photo_url')
                .eq('user_id', session.user.id);

            if (errCol) throw errCol;

            const mapeado = cromosOrdenados.map(cromo => {
                const registroUsuario = miColeccion.find(item => item.sticker_id === cromo.id);
                return {
                    ...cromo,
                    quantity: registroUsuario ? registroUsuario.quantity : 0,
                    photo_url: registroUsuario ? registroUsuario.photo_url : null
                };
            });

            setCromosDelPais(mapeado);
        } catch (error) {
            console.error('Error cargando cromos del país:', error.message);
        } finally {
            setLoading(false);
        }
    }

    // CONTROL DE CANTIDAD CON LIMPIEZA TOTAL AL LLEGAR A 0
    async function actualizarCantidadCromo(cromo, cambio) {
        const nuevaCantidad = cromo.quantity + cambio;
        if (nuevaCantidad < 0) return;

        try {
            const { data: existeDB, error: errorBuscar } = await supabase
                .from('user_collection')
                .select('id, photo_url')
                .eq('user_id', session.user.id)
                .eq('sticker_id', cromo.id)
                .maybeSingle();

            if (errorBuscar) throw errorBuscar;

            if (nuevaCantidad === 0) {
                if (existeDB) {
                    if (existeDB.photo_url) {
                        const oldPath = existeDB.photo_url.split('/').pop();
                        if (oldPath) {
                            await supabase.storage.from('fotos_cromos').remove([oldPath]);
                        }
                    }
                    const { error: errorBorrar } = await supabase
                        .from('user_collection')
                        .delete()
                        .eq('id', existeDB.id);

                    if (errorBorrar) throw errorBorrar;
                }
            } else {
                if (existeDB) {
                    const { error: errorActualizar } = await supabase
                        .from('user_collection')
                        .update({ quantity: nuevaCantidad })
                        .eq('id', existeDB.id);

                    if (errorActualizar) throw errorActualizar;
                } else {
                    const { error: errorInsertar } = await supabase
                        .from('user_collection')
                        .insert({ user_id: session.user.id, sticker_id: cromo.id, quantity: nuevaCantidad });

                    if (errorInsertar) throw errorInsertar;
                }
            }

            setCromosDelPais(prev =>
                prev.map(c => c.id === cromo.id ? { ...c, quantity: nuevaCantidad, photo_url: nuevaCantidad === 0 ? null : c.photo_url } : c)
            );
        } catch (error) {
            console.error('Error modificando cantidad:', error.message);
        }
    }

    // PAPELERA INDEPENDIENTE DE FOTOS
    async function handleBorrarFoto(e, cromo) {
        e.stopPropagation();

        if (!cromo.photo_url) return;

        try {
            const oldPath = cromo.photo_url.split('/').pop();
            if (oldPath) {
                await supabase.storage.from('fotos_cromos').remove([oldPath]);
            }

            await supabase
                .from('user_collection')
                .update({ photo_url: null })
                .eq('user_id', session.user.id)
                .eq('sticker_id', cromo.id);

            setCromosDelPais(prev =>
                prev.map(c => c.id === cromo.id ? { ...c, photo_url: null } : c)
            );
        } catch (error) {
            console.error('Error eliminando la foto:', error.message);
            alert('No se pudo borrar la foto.');
        }
    }

    // 📸 PASO 1: Capturar foto directa del dispositivo
    async function handleSubirFoto(e, cromoActual) {
        const file = e.target.files[0];
        if (!file) return;

        e.target.value = '';
        setCromoParaFoto(cromoActual);

        const urlLocal = URL.createObjectURL(file);
        setImagenPreviewUrl(urlLocal);
        setBoxStyle({ top: 10, left: 10, width: 80, height: 80 }); // Reset centrado proporcional
    }

    // 🔥 CAPTURA GESTUAL: Activa los movimientos al tocar las esquinas o el centro
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

        // Convertimos el movimiento de píxeles a porcentaje (%) basado estrictamente en el tamaño real de la foto pintada
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

    // ✂️ PASO 2: Procesar recorte milimétrico por porcentajes reales e inmunes a estiramientos
    async function handleAplicarRecorte() {
        if (!cromoParaFoto || !imagenPreviewUrl || !cropContainerRef.current) return;

        setGuardandoProceso(true);
        setSubiendoFotoId(cromoParaFoto.id);

        const imgEl = cropContainerRef.current.querySelector('img');
        const img = new Image();
        img.src = imagenPreviewUrl;

        img.onload = async () => {
            try {
                const canvas = document.createElement('canvas');

                // 💡 CLAVE DEL ÉXITO: Usamos las dimensiones reales de renderizado de la imagen en el móvil
                const trueWidth = imgEl.naturalWidth || img.width;
                const trueHeight = imgEl.naturalHeight || img.height;

                const sx = (boxStyle.left / 100) * trueWidth;
                const sy = (boxStyle.top / 100) * trueHeight;
                const sWidth = (boxStyle.width / 100) * trueWidth;
                const sHeight = (boxStyle.height / 100) * trueHeight;

                canvas.width = sWidth;
                canvas.height = sHeight;

                // Reducción proporcional inteligente para no saturar internet
                if (canvas.width > 750) {
                    const escala = 750 / canvas.width;
                    canvas.width = 750;
                    canvas.height = sHeight * escala;
                }

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
                if (!blob) throw new Error('Error al recortar lienzo');

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

                let cantidadFinal = cromoParaFoto.quantity;

                if (existeDB) {
                    if (cantidadFinal === 0) cantidadFinal = 1;
                    await supabase
                        .from('user_collection')
                        .update({ photo_url: publicUrl, quantity: cantidadFinal })
                        .eq('id', existeDB.id);
                } else {
                    cantidadFinal = 1;
                    await supabase
                        .from('user_collection')
                        .insert({ user_id: session.user.id, sticker_id: cromoParaFoto.id, quantity: 1, photo_url: publicUrl });
                }

                setCromosDelPais(prev =>
                    prev.map(c => c.id === cromoParaFoto.id ? { ...c, photo_url: publicUrl, quantity: cantidadFinal } : c)
                );

                cerrarModalPreview();

            } catch (error) {
                console.error('Error al guardar el cromo:', error.message);
                alert('Error al procesar el recorte.');
            } finally {
                setGuardandoProceso(false);
                setSubiendoFotoId(null);
            }
        };
    }

    function cerrarModalPreview() {
        setImagenPreviewUrl(null);
        setCromoParaFoto(null);
    }

    // GESTOS SWIPE ENTRE PÁGINAS DEL ÁLBUM
    const handleTouchStart = (e) => setTouchStartX(e.touches[0].clientX);
    const handleTouchEnd = (e) => {
        if (touchStartX === null) return;
        const touchEndX = e.changedTouches[0].clientX;
        const diffX = touchStartX - touchEndX;
        if (Math.abs(diffX) > 60) {
            const currentIndex = paises.findIndex(p => p.id === paisSeleccionado);
            if (currentIndex === -1) return;
            if (diffX > 60 && currentIndex < paises.length - 1) {
                setPaisSeleccionado(paises[currentIndex + 1].id);
            } else if (diffX < -60 && currentIndex > 0) {
                setPaisSeleccionado(paises[currentIndex - 1].id);
            }
        }
        setTouchStartX(null);
    };

    const paisActual = paises.find(p => p.id === paisSeleccionado);

    return (
        <div className="w-full max-w-md px-4 pt-6 flex flex-col gap-3 select-none pb-24">
            <h2 className="text-xl font-black tracking-wide text-slate-100">Mi Álbum</h2>

            {/* Selector de Países */}
            <div ref={tabsContainerRef} className="flex gap-2.5 overflow-x-auto pb-3 scrollbar-none snap-x">
                {paises.map(pais => (
                    <button
                        key={pais.id}
                        onClick={() => setPaisSeleccionado(pais.id)}
                        data-active={paisSeleccionado === pais.id ? "true" : "false"}
                        className={`px-4 py-2 rounded-xl text-[11px] font-black tracking-wider whitespace-nowrap transition-all border flex items-center justify-center gap-2 min-w-[85px] shrink-0 snap-mini ${paisSeleccionado === pais.id ? 'bg-sky-400 text-slate-950 border-sky-400 shadow-md' : 'bg-[#161f30] text-slate-400 border-slate-800/80'
                            }`}
                    >
                        {pais.flag_url && <img src={pais.flag_url} alt="" className="w-5 h-3.5 object-cover rounded-sm shrink-0" />}
                        <span className="shrink-0">{pais.code}</span>
                    </button>
                ))}
            </div>

            {/* Cabecera del país */}
            {paisActual && (
                <div className="flex items-center gap-2.5 bg-[#161f30]/40 border border-slate-800/40 p-3 rounded-2xl mt-1 shadow-inner">
                    {paisActual.flag_url && <img src={paisActual.flag_url} alt="" className="w-8 h-5.5 object-cover rounded shadow-md border border-slate-700/50" />}
                    <h3 className="text-base font-extrabold text-slate-200 tracking-wide">{paisActual.name}</h3>
                </div>
            )}

            {/* Grid de cartas */}
            <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="grid grid-cols-2 gap-3 mt-1 min-h-[400px]">
                {loading ? (
                    <p className="col-span-2 text-center text-slate-500 text-xs py-16 animate-pulse">Abriendo la página del álbum...</p>
                ) : (
                    cromosDelPais.map(cromo => {
                        const loTiene = cromo.quantity > 0;
                        const esRepetida = cromo.quantity > 1;
                        const tieneFoto = cromo.photo_url !== null;
                        const estaEscaneando = subiendoFotoId === cromo.id;

                        return (
                            <div
                                key={cromo.id}
                                className={`p-2.5 rounded-2xl border transition-all flex flex-col gap-2 h-auto shadow-sm bg-[#131c2e]/40 border-slate-800/80 ${tieneFoto ? 'border-sky-400/40 bg-[#111827]/60' : loTiene ? 'bg-[#161f30] border-emerald-500/30' : 'text-slate-500'
                                    }`}
                            >
                                {/* Recuadro de la Casilla */}
                                <div
                                    className={`w-full aspect-[4/3] rounded-xl relative overflow-hidden transition-all border flex items-center justify-center ${estaEscaneando
                                            ? 'border-sky-400 bg-sky-950/40 animate-pulse'
                                            : tieneFoto
                                                ? 'border-sky-500/20 bg-slate-950/50 cursor-pointer active:opacity-90'
                                                : 'border-slate-800/60 bg-slate-950/40 border-dashed'
                                        }`}
                                    onClick={() => tieneFoto && !estaEscaneando && setCromoPreview(cromo)}
                                >
                                    {tieneFoto && !estaEscaneando && <img src={cromo.photo_url} alt="" className="w-full h-full object-contain" />}
                                    {estaEscaneando && (
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                                            <span className="text-[8px] font-black text-sky-400 uppercase">Guardando</span>
                                        </div>
                                    )}
                                    {!tieneFoto && !estaEscaneando && <span className="text-[9px] font-mono text-slate-700 font-bold">VACÍO</span>}
                                </div>

                                {/* Encabezado de Datos */}
                                <div className="flex justify-between items-center px-0.5 select-none pointer-events-none">
                                    <span className={`font-mono text-[11px] font-bold ${tieneFoto ? 'text-white' : loTiene ? 'text-slate-300' : 'text-slate-600'}`}>
                                        #{cromo.sticker_number}
                                    </span>
                                    <div className="flex gap-1 items-center">
                                        {esRepetida && <span className="bg-yellow-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded-md shadow-md">x{cromo.quantity}</span>}
                                        {cromo.is_special && <span className="text-purple-400 text-[8px] font-black tracking-wider border border-purple-500/30 px-1 py-0.5 rounded bg-purple-500/5">FOIL</span>}
                                    </div>
                                </div>

                                {/* Nombre del jugador */}
                                <p className={`text-[11px] font-bold truncate tracking-wide px-0.5 select-none pointer-events-none -mt-1 ${tieneFoto || loTiene ? 'text-slate-200' : 'text-slate-600/80'}`}>
                                    {cromo.name}
                                </p>

                                {/* Controles de Botones */}
                                <div className="flex items-center justify-between bg-[#0d131f]/80 rounded-xl p-1 border border-slate-800/40 backdrop-blur-sm mt-auto">
                                    <button
                                        onClick={() => actualizarCantidadCromo(cromo, -1)}
                                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white text-xs font-black"
                                    >
                                        -
                                    </button>

                                    {tieneFoto ? (
                                        <button
                                            onClick={(e) => handleBorrarFoto(e, cromo)}
                                            className="w-8 h-7 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 border border-red-500/20 active:scale-90 transition-all"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.72 0-.34-9m9.96-3.244l-.62 10.602a2.25 2.25 0 0 1-2.247 2.114H8.916a2.25 2.25 0 0 1-2.247-2.114l-.62-10.602m10.828 0a1.745 1.745 0 0 0-1.323-.623H14.81c-.453-1.125-1.578-1.99-2.812-1.99-1.234 0-2.359.865-2.812 1.99H7.096a1.745 1.745 0 0 0-1.323.623m1 .457l1.042 16.666" />
                                            </svg>
                                        </button>
                                    ) : (
                                        <label className="w-8 h-7 flex items-center justify-center rounded-lg bg-slate-800/80 text-sky-400 hover:text-sky-300 cursor-pointer active:scale-90 transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
                                                <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z" />
                                                <path fillRule="evenodd" d="M9.344 3.071a2.25 2.25 0 0 1 2.238-1.94h2.836a2.25 2.25 0 0 1 2.237 1.94l.512 2.985h1.964a3 3 0 0 1 3 3v9.502a3 3 0 0 1-3 3H4.868a3 3 0 0 1-3-3V9.056a3 3 0 0 1 3-3h1.964l.512-2.985ZM12 7.5a5.25 5.25 0 1 0 0 10.5 5.25 5.25 0 0 0 0-10.5ZM18.375 9.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                                            </svg>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                onChange={(e) => handleSubirFoto(e, cromo)}
                                                className="hidden"
                                            />
                                        </label>
                                    )}

                                    <button
                                        onClick={() => actualizarCantidadCromo(cromo, 1)}
                                        className="w-7 h-7 flex items-center justify-center text-sky-400 hover:text-sky-300 text-xs font-black"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* 🔥 MODAL DE RECORTE PREMIUM: SE ADAPTA INLINE AL TAMAÑO Y ORIENTACIÓN DE LA FOTO REAL */}
            {imagenPreviewUrl && cromoParaFoto && (
                <div
                    onContextmenu={(e) => e.preventDefault()}
                    onTouchMove={handleTouchMoveBox}
                    onTouchEnd={handleTouchEndBox}
                    className="fixed inset-0 bg-[#060a12] z-[300] flex flex-col p-5 overflow-y-auto select-none"
                >
                    {/* Cabecera */}
                    <div className="flex justify-between items-center mb-5 shrink-0">
                        <div>
                            <span className="text-[10px] font-mono text-sky-400 font-bold tracking-widest">Recortar #{cromoParaFoto.sticker_number}</span>
                            <h4 className="text-slate-100 text-sm font-black tracking-wide truncate max-w-[180px]">{cromoParaFoto.name}</h4>
                        </div>
                        <button
                            onClick={cerrarModalPreview}
                            className="text-xs font-bold text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20"
                            disabled={guardandoProceso}
                        >
                            Cancelar
                        </button>
                    </div>

                    {/* Centrador General */}
                    <div className="w-full flex-1 flex items-center justify-center min-h-[320px] p-2 bg-[#090d16] rounded-3xl border border-slate-900 shadow-inner mb-5 relative overflow-hidden">

                        {/* 🔳 CONTENEDOR INLINE-BLOCK: Se encoge y calza EXACTO con los píxeles de la foto */}
                        <div
                            ref={cropContainerRef}
                            className="relative inline-block max-w-full max-h-[60vh] rounded-xl overflow-hidden shadow-2xl bg-slate-950 border border-slate-800"
                        >
                            {/* Foto Original fija en el fondo */}
                            <img
                                src={imagenPreviewUrl}
                                alt=""
                                className="max-w-full max-h-[60vh] object-contain block select-none pointer-events-none opacity-45"
                            />

                            {/* 🔳 CUADRO BLANCO INTERACTIVO: Flota estrictamente sobre la foto, sin barras muertas */}
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
                                {/* Cuadrícula interna de tercios limpia */}
                                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-25 pointer-events-none">
                                    <div className="border-r border-b border-white"></div>
                                    <div className="border-r border-b border-white"></div>
                                    <div className="border-b border-white"></div>
                                    <div className="border-r border-b border-white"></div>
                                    <div className="border-r border-b border-white"></div>
                                    <div className="border-b border-white"></div>
                                    <div className="border-r border-white"></div>
                                    <div className="border-r border-white"></div>
                                    <div></div>
                                </div>

                                {/* ⚪ LOS 4 CÍRCULOS DE CONTROL TÁCTIL */}
                                {/* Top Left */}
                                <div onTouchStart={(e) => handleTouchStartBox('tl', e)} className="w-8 h-8 flex items-center justify-center absolute -top-4 -left-4 z-20 touch-none">
                                    <div className="w-3.5 h-3.5 bg-white rounded-full border-2 border-sky-400 shadow-md" />
                                </div>

                                {/* Top Right */}
                                <div onTouchStart={(e) => handleTouchStartBox('tr', e)} className="w-8 h-8 flex items-center justify-center absolute -top-4 -right-4 z-20 touch-none">
                                    <div className="w-3.5 h-3.5 bg-white rounded-full border-2 border-sky-400 shadow-md" />
                                </div>

                                {/* Bottom Left */}
                                <div onTouchStart={(e) => handleTouchStartBox('bl', e)} className="w-8 h-8 flex items-center justify-center absolute -bottom-4 -left-4 z-20 touch-none">
                                    <div className="w-3.5 h-3.5 bg-white rounded-full border-2 border-sky-400 shadow-md" />
                                </div>

                                {/* Bottom Right */}
                                <div onTouchStart={(e) => handleTouchStartBox('br', e)} className="w-8 h-8 flex items-center justify-center absolute -bottom-4 -right-4 z-20 touch-none">
                                    <div className="w-3.5 h-3.5 bg-white rounded-full border-2 border-sky-400 shadow-md" />
                                </div>
                            </div>
                        </div>

                        {guardandoProceso && (
                            <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-2 z-40">
                                <span className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Generando Recorte...</span>
                            </div>
                        )}
                    </div>

                    <p className="text-[11px] text-center text-slate-500 font-bold mb-4 leading-relaxed max-w-xs mx-auto shrink-0">
                        📸 <b>Mueve el cuadro blanco</b> del centro para ubicarlo, o <b>estira los círculos de las esquinas</b> para fijar el tamaño deseado.
                    </p>

                    {/* Botón de Guardado */}
                    <button
                        onClick={handleAplicarRecorte}
                        className="w-full flex items-center justify-center gap-2 bg-sky-400 hover:bg-sky-300 text-slate-950 py-3.5 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-md shrink-0"
                        disabled={guardandoProceso}
                    >
                        Confirmar y Guardar Cromo
                    </button>
                </div>
            )}

            {/* CARD PREVIEW MODAL PREMIUM */}
            {cromoPreview && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/85 backdrop-blur-sm"
                    onClick={() => setCromoPreview(null)}
                >
                    <div
                        className="relative w-full max-w-xs bg-[#161f30] rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-full aspect-[3/4] bg-[#0d131f]">
                            <img src={cromoPreview.photo_url} alt={cromoPreview.name} className="w-full h-full object-contain" />
                        </div>
                        <div className="p-4 bg-[#0d131f]/90 border-t border-slate-800/60 flex flex-col gap-0.5">
                            <span className="font-mono text-[10px] font-black text-sky-400 tracking-wider">#{cromoPreview.sticker_number}</span>
                            <h4 className="text-slate-100 text-sm font-black tracking-wide truncate">{cromoPreview.name}</h4>
                        </div>
                        <button
                            onClick={() => setCromoPreview(null)}
                            className="absolute top-3 right-3 w-7 h-7 bg-slate-950/70 hover:bg-slate-900 text-slate-300 rounded-full flex items-center justify-center text-[10px] font-bold border border-slate-800/50 backdrop-blur-sm"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}