/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    bg: '#0b0f19',       // Fondo ultra oscuro
                    card: '#131c2e',     // Tarjetas
                    primary: '#5dd3fc',  // Botones celestes
                    success: '#22c55e',  // Barra verde de progreso
                    special: '#c084fc',  // Cromos morados/especiales
                }
            }
        },
    },
    plugins: [],
}