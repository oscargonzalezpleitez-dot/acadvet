// Mismas cuentas fijas que js/auth.js (FB_EMAIL_DOCENTE / FB_EMAIL_EPS) y las
// reglas de database.rules.json — el proyecto no usa roles por uid ni claims.
const DOCENTE = 'docente@acadvet-usam.edu.sv';
const EPS     = 'eps@acadvet-usam.edu.sv';

function isDocenteOEps(email) {
  return email === DOCENTE || email === EPS;
}

module.exports = { isDocenteOEps };
