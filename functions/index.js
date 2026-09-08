// AcadVet USAM — Cloud Functions (notificaciones push)
exports.onTareaAsignada   = require('./src/triggers/onTareaAsignada').onTareaAsignada;
exports.onParcialWritten  = require('./src/triggers/onParcialWritten').onParcialWritten;
exports.onReminderCreated = require('./src/triggers/onReminderCreated').onReminderCreated;
exports.onParcialRevisionWritten = require('./src/triggers/onParcialRevisionWritten').onParcialRevisionWritten;
exports.onLabReportSubmissionCreated = require('./src/triggers/onLabReportSubmissionCreated').onLabReportSubmissionCreated;
exports.sendBroadcast     = require('./src/broadcast').sendBroadcast;
exports.sendInformeSemanalEmail = require('./src/sendInformeEmail').sendInformeSemanalEmail;
