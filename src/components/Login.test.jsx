import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Login } from './Login';

const { signInWithOAuthMock } = vi.hoisted(() => ({ signInWithOAuthMock: vi.fn() }));

vi.mock('../supabaseClient', () => ({
    supabase: {
        auth: {
            signInWithOAuth: signInWithOAuthMock
        }
    }
}));

describe('Login', () => {
    beforeEach(() => {
        signInWithOAuthMock.mockReset();
    });

    it('debería renderizar el título y el botón de ingreso', () => {
        render(<Login />);

        expect(screen.getByText(/FIFA WORLD CUP 2026/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Ingresar con Google/i })).toBeInTheDocument();
    });
});
