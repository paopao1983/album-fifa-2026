import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

// 🟢 Asegúrate de que tenga "export function" aquí arriba
export function SearchView({ session }) {
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    const buscarCromos = async () => {
      if (query.trim().length < 2) {
        setResultados([]);
        return;
      }

      try {
        setLoading(true);

        let cromosEncontrados = [];
        const { data, error } = await supabase
          .rpc('buscar_stickers_unaccent', { search_query: query });

        if (error) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('stickers')
            .select(`
              id, name, sticker_number, is_special,
              teams ( name, code, flag_url )
            `)
            .ilike('name', `%${query}%`)
            .limit(15);
            
          if (fallbackError) throw fallbackError;
          cromosEncontrados = fallbackData || [];
        } else {
          cromosEncontrados = data || [];
        }

        const { data: miColeccion, error: errCol } = await supabase
          .from('user_collection')
          .select('sticker_id, quantity')
          .eq('user_id', session.user.id);

        if (errCol) throw errCol;

        const resultadosConCantidad = cromosEncontrados.map(cromo => {
          const cromoIdReal = cromo.id || cromo.sticker_id;
          const registroUsuario = miColeccion.find(
            item => String(item.sticker_id) === String(cromoIdReal)
          );
          
          return {
            ...cromo,
            id: cromoIdReal,
            quantity: registroUsuario ? registroUsuario.quantity : 0
          };
        });

        setResultados(resultadosConCantidad);

      } catch (error) {
        console.error('Error en el buscador:', error.message);
      } finally {
        setLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      buscarCromos();
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [query, session.user.id]);

  const cambiarCantidad = async (stickerId, cantidadActual, cambio) => {
    const nuevaCantidad = cantidadActual + cambio;
    if (nuevaCantidad < 0) return;

    try {
      const { data: existe } = await supabase
        .from('user_collection')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('sticker_id', stickerId)
        .maybeSingle();

      if (existe) {
        await supabase
          .from('user_collection')
          .update({ quantity: nuevaCantidad })
          .eq('id', existe.id);
      } else if (nuevaCantidad > 0) {
        await supabase
          .from('user_collection')
          .insert({ user_id: session.user.id, sticker_id: stickerId, quantity: nuevaCantidad });
      }

      setResultados(prev =>
        prev.map(item => String(item.id) === String(stickerId) ? { ...item, quantity: nuevaCantidad } : item)
      );
    } catch (error) {
      console.error('Error actualizando cantidad:', error.message);
    }
  };

  const handleLimpiarBuscador = () => {
    setQuery('');
    setResultados([]);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="w-full max-w-md px-4 pt-6 flex flex-col gap-4 select-none">
      <h2 className="text-xl font-black tracking-wide text-slate-100">Buscador Global</h2>

      <div className="relative w-full">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca por apellido (ej: Lamine, Messi)..."
          className="w-full bg-[#161f30] text-slate-200 placeholder-slate-500 text-xs font-semibold px-4 py-3.5 rounded-2xl border border-slate-800/80 focus:outline-none focus:border-sky-500/50 transition-all pr-12 shadow-inner"
        />

        {query && (
          <div className="absolute inset-y-0 right-3.5 flex items-center justify-center">
            <button
              onClick={handleLimpiarBuscador}
              className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-800/95 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all active:scale-90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-2.5 h-2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 mt-1 overflow-y-auto max-h-[calc(100vh-220px)] pb-6 scrollbar-none">
        {loading && <p className="text-center text-slate-500 text-xs py-4 animate-pulse">Escaneando catálogo...</p>}

        {!loading && resultados.length === 0 && query.trim().length >= 2 && (
          <p className="text-center text-slate-500 text-xs py-4">No se encontró ningún cromo con ese nombre.</p>
        )}

        {resultados.map(cromo => {
          const pais = cromo.teams || cromo; 
          const cantidad = cromo.quantity || 0;
          const loTiene = cantidad > 0;

          return (
            <div
              key={cromo.id}
              className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                loTiene ? 'bg-[#161f30] border-slate-850' : 'bg-[#131c2e]/30 border-slate-900 text-slate-500'
              }`}
            >
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {pais?.flag_url && (
                    <img src={pais.flag_url} alt="" className="w-4 h-2.5 object-cover rounded-sm shrink-0" />
                  )}
                  <span className="font-mono text-[10px] font-black text-sky-400 tracking-wider">
                    #{cromo.sticker_number} {pais?.code}
                  </span>
                  {cromo.is_special && (
                    <span className="text-[8px] font-black tracking-widest text-purple-400 uppercase border border-purple-500/20 px-1 rounded bg-purple-500/5">FOIL</span>
                  )}
                </div>
                <p className={`text-xs font-bold truncate ${loTiene ? 'text-slate-200' : 'text-slate-600'}`}>
                  {cromo.name}
                </p>
              </div>

              <div className="flex items-center bg-[#0d131f]/60 rounded-xl p-1 border border-slate-800/40 shrink-0">
                <button onClick={() => cambiarCantidad(cromo.id, cantidad, -1)} className="w-7 h-7 text-slate-400 rounded-lg text-xs font-black">-</button>
                <span className={`w-6 text-center text-xs font-black ${loTiene ? 'text-white' : 'text-slate-600'}`}>{cantidad}</span>
                <button onClick={() => cambiarCantidad(cromo.id, cantidad, 1)} className="w-7 h-7 text-sky-400 rounded-lg text-xs font-black">+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}