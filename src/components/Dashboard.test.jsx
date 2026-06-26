import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { getNextObjectiveData } from './Dashboard';

const ComponenteDeJuguete = () => <h1>Progreso del Álbum: 10%</h1>;

describe('ComponenteDeJuguete', () => {
    it('debería renderizar el componente con el texto correcto', () => {
        render(<ComponenteDeJuguete />);

        const testoProgreso = screen.getByText(/Progreso del Álbum: 10/i);
        expect(testoProgreso).toBeInTheDocument();
    });
});

describe('getNextObjectiveData', () => {
    it('debería elegir un país incompleto en lugar de uno ya completado', () => {
        const teams = [
            { id: 'mex', name: 'MEX' },
            { id: 'rsa', name: 'RSA' },
            { id: 'kor', name: 'KOR' }
        ];
        const collection = [
            ...Array.from({ length: 20 }, () => ({ stickers: { team_id: 'mex' } })),
            ...Array.from({ length: 5 }, () => ({ stickers: { team_id: 'rsa' } }))
        ];
        const teamTotals = { mex: 20, rsa: 20, kor: 20 };

        const objetivo = getNextObjectiveData(teams, collection, teamTotals);

        expect(objetivo.name).toBe('RSA');
        expect(objetivo.obtenidos).toBe(5);
        expect(objetivo.totales).toBe(20);
        expect(objetivo.isComplete).toBe(false);
    });

    it('debería priorizar el país con mayor progreso entre los incompletos', () => {
        const teams = [
            { id: 'arg', name: 'ARG' },
            { id: 'bra', name: 'BRA' },
            { id: 'uru', name: 'URU' }
        ];
        const collection = [
            ...Array.from({ length: 12 }, () => ({ stickers: { team_id: 'arg' } })),
            ...Array.from({ length: 10 }, () => ({ stickers: { team_id: 'bra' } })),
            ...Array.from({ length: 8 }, () => ({ stickers: { team_id: 'uru' } }))
        ];
        const teamTotals = { arg: 20, bra: 20, uru: 20 };

        const objetivo = getNextObjectiveData(teams, collection, teamTotals);

        expect(objetivo.name).toBe('ARG');
        expect(objetivo.obtenidos).toBe(12);
    });

    it('debería resolver empates eligiendo el país con menor total de cromos', () => {
        const teams = [
            { id: 'esp', name: 'ESP' },
            { id: 'fra', name: 'FRA' }
        ];
        const collection = [
            ...Array.from({ length: 10 }, () => ({ stickers: { team_id: 'esp' } })),
            ...Array.from({ length: 10 }, () => ({ stickers: { team_id: 'fra' } }))
        ];
        const teamTotals = { esp: 20, fra: 15 };

        const objetivo = getNextObjectiveData(teams, collection, teamTotals);

        expect(objetivo.name).toBe('FRA');
        expect(objetivo.obtenidos).toBe(10);
        expect(objetivo.totales).toBe(15);
    });

    it('debería marcar el álbum como completo cuando no queden países pendientes', () => {
        const teams = [
            { id: 'mex', name: 'MEX' },
            { id: 'rsa', name: 'RSA' }
        ];
        const collection = [
            ...Array.from({ length: 20 }, () => ({ stickers: { team_id: 'mex' } })),
            ...Array.from({ length: 20 }, () => ({ stickers: { team_id: 'rsa' } }))
        ];
        const teamTotals = { mex: 20, rsa: 20 };

        const objetivo = getNextObjectiveData(teams, collection, teamTotals);

        expect(objetivo.name).toBe('Álbum completo');
        expect(objetivo.isComplete).toBe(true);
        expect(objetivo.teamId).toBeNull();
    });
});