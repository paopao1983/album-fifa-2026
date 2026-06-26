import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatsView } from './StatsView';

const { fromMock, removeChannelMock } = vi.hoisted(() => ({ fromMock: vi.fn(), removeChannelMock: vi.fn() }));

vi.mock('../supabaseClient', () => ({
    supabase: {
        from: fromMock,
        removeChannel: removeChannelMock,
        channel: vi.fn(() => ({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnValue({})
        }))
    }
}));

describe('StatsView', () => {
    beforeEach(() => {
        fromMock.mockReset();
        removeChannelMock.mockReset();
    });

    it('debería mostrar métricas vacías cuando no hay sesión', async () => {
        render(<StatsView session={null} />);

        await waitFor(() => {
            expect(screen.getByText(/Análisis del Álbum/i)).toBeInTheDocument();
        });
    });
});
