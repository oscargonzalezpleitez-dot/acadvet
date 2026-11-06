// AcadVet USAM — Cloud Functions (notificaciones push)
exports.onTareaAsignada   = require('./src/triggers/onTareaAsignada').onTareaAsignada;
exports.onParcialWritten  = require('./src/triggers/onParcialWritten').onParcialWritten;
exports.onReminderCreated = require('./src/triggers/onReminderCreated').onReminderCreated;
exports.onParcialRevisionWritten = require('./src/triggers/onParcialRevisionWritten').onParcialRevisionWritten;
exports.onLabReportSubmissionCreated = require('./src/triggers/onLabReportSubmissionCreated').onLabReportSubmissionCreated;
exports.onQRAsistenteCreated = require('./src/triggers/onQRAsistenteCreated').onQRAsistenteCreated;
exports.sendBroadcast     = require('./src/broadcast').sendBroadcast;
exports.verifyAccessCode  = require('./src/accessCode').verifyAccessCode;

// Pendiente de activar: requiere los secretos INFORME_EMAIL_USER e
// INFORME_EMAIL_PASS (cuenta de Outlook del docente) configurados con
// `firebase functions:secrets:set <nombre> --project acadvet-usam`. Hasta que
// ambos existan, este require bloquea el deploy de TODO el codebase (Firebase
// analiza index.js completo antes de filtrar por --only). Descomentar cuando
// estén listos los dos secretos.
// exports.sendInformeSemanalEmail = require('./src/sendInformeEmail').sendInformeSemanalEmail;
