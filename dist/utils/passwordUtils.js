"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarPasswordAleatoria = void 0;
const generarPasswordAleatoria = () => {
    const longitud = 10;
    const mayusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const minusculas = 'abcdefghijkmnopqrstuvwxyz';
    const numeros = '23456789';
    const caracteresDisponibles = mayusculas + minusculas + numeros;
    let password = '';
    password += mayusculas.charAt(Math.floor(Math.random() * mayusculas.length));
    password += minusculas.charAt(Math.floor(Math.random() * minusculas.length));
    password += numeros.charAt(Math.floor(Math.random() * numeros.length));
    for (let i = 3; i < longitud; i++) {
        password += caracteresDisponibles.charAt(Math.floor(Math.random() * caracteresDisponibles.length));
    }
    return password
        .split('')
        .sort(() => 0.5 - Math.random())
        .join('');
};
exports.generarPasswordAleatoria = generarPasswordAleatoria;
//# sourceMappingURL=passwordUtils.js.map