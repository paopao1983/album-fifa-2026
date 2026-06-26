import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchView } from './SearchView';

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));

vi.mock('../supabaseClient', () => ({
    supabase: {
        rpc: rpcMock,
        from: fromMock
    }
}));

describe('SearchView', () => {
    beforeEach(() => {
        rpcMock.mockReset();
        fromMock.mockReset();
    });

    it('debería mostrar un mensaje cuando no hay resultados para una búsqueda', async () => {
        rpcMock.mockResolvedValue({ data: [], error: null });
        fromMock.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
        });

        render(<SearchView session={{ user: { id: 'user-1' } }} />);

        const input = screen.getByPlaceholderText(/Busca por apellido/i);
        fireEvent.change(input, { target: { value: 'Messi' } });

        await waitFor(() => {
            expect(screen.getByText(/No se encontró ningún cromo/i)).toBeInTheDocument();
        });
    });
});
