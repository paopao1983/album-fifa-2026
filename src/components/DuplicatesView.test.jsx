import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuplicatesView, buildWhatsAppMessage } from './DuplicatesView';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('../supabaseClient', () => ({
    supabase: {
        from: fromMock
    }
}));

describe('DuplicatesView', () => {
    beforeEach(() => {
        fromMock.mockReset();
    });

    it('debería mostrar un estado vacío cuando no hay repetidas', async () => {
        const selectChain = {
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockResolvedValue({ data: [], error: null })
        };
        fromMock.mockReturnValue(selectChain);

        render(<DuplicatesView session={{ user: { id: 'user-1' } }} />);

        await waitFor(() => {
            expect(screen.getByText(/¡No tienes repetidas aún!/i)).toBeInTheDocument();
        });
    });

    it('debería listar las repetidas cuando existen', async () => {
        const selectMock = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockResolvedValue({
                    data: [
                        {
                            quantity: 2,
                            stickers: {
                                name: 'Messi',
                                sticker_number: 10,
                                teams: { name: 'Argentina' }
                            }
                        }
                    ],
                    error: null
                })
            })
        });
        fromMock.mockReturnValue({ select: selectMock });

        render(<DuplicatesView session={{ user: { id: 'user-1' } }} />);

        await waitFor(() => {
            expect(screen.getByText(/Messi/i)).toBeInTheDocument();
        });
    });

    it('debería devolver un mensaje vacío cuando no hay repetidas', () => {
        expect(buildWhatsAppMessage([])).toBe('');
    });

    it('debería agrupar las repetidas por país y mostrar el sufijo xN para los cromos sobrantes', () => {
        const repetidas = [
            {
                quantity: 2,
                stickers: {
                    sticker_number: 10,
                    teams: { name: 'Argentina' }
                }
            },
            {
                quantity: 3,
                stickers: {
                    sticker_number: 12,
                    teams: { name: 'Argentina' }
                }
            },
            {
                quantity: 2,
                stickers: {
                    sticker_number: 20,
                    teams: { name: 'Brasil' }
                }
            }
        ];

        const mensaje = buildWhatsAppMessage(repetidas);

        expect(mensaje).toContain('📌 *ARGENTINA:* 10 (x1), 12 (x2)');
        expect(mensaje).toContain('📌 *BRASIL:* 20 (x1)');
    });

    it('debería usar el país Especiales cuando no hay equipo asociado', () => {
        const repetidas = [
            {
                quantity: 2,
                stickers: {
                    sticker_number: 99
                }
            }
        ];

        const mensaje = buildWhatsAppMessage(repetidas);

        expect(mensaje).toContain('📌 *ESPECIALES:* 99 (x1)');
    });
});
