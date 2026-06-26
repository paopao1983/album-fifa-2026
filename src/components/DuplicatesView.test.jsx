import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuplicatesView } from './DuplicatesView';

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
});
