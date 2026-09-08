// =============================================================================
// AcadVet USAM — Envío del Informe Semanal por correo (callable)
//
// El PDF se genera en el navegador (js/informe-semanal-export.js) y llega acá
// como base64 — esta función solo lo reenvía por SMTP. Remitente: una cuenta
// de Hotmail/Outlook del docente, vía contraseña de aplicación guardada como
// secreto de Firebase (nunca en el código ni en el repo).
// =============================================================================

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const nodemailer = require('nodemailer');
const { isDocenteOEps } = require('./email');

const INFORME_EMAIL_USER = defineSecret('INFORME_EMAIL_USER');
const INFORME_EMAIL_PASS = defineSecret('INFORME_EMAIL_PASS');

exports.sendInformeSemanalEmail = onCall(
  { secrets: [INFORME_EMAIL_USER, INFORME_EMAIL_PASS] },
  async (request) => {
    const callerEmail = request.auth?.token?.email;
    if (!callerEmail || !isDocenteOEps(callerEmail)) {
      throw new HttpsError('permission-denied', 'Solo el docente/EPS puede enviar informes por correo.');
    }

    const { to, subject, body, pdfBase64, filename } = request.data || {};
    if (!to || !pdfBase64 || !filename) {
      throw new HttpsError('invalid-argument', 'Falta el destinatario o el archivo adjunto.');
    }

    const user = INFORME_EMAIL_USER.value();
    const pass = INFORME_EMAIL_PASS.value();
    if (!user || !pass) {
      throw new HttpsError('failed-precondition', 'El envío de correo no está configurado todavía (faltan las credenciales SMTP).');
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      auth: { user, pass },
    });

    try {
      await transporter.sendMail({
        from: user,
        to,
        subject: subject || 'Informe Semanal — AcadVet USAM',
        text: body || 'Se adjunta el Informe Semanal por Grupo de Clase generado desde AcadVet USAM.',
        attachments: [{
          filename,
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        }],
      });
    } catch (err) {
      console.error('[AcadVet] Error enviando informe por correo:', err);
      throw new HttpsError('internal', 'No se pudo enviar el correo. Verificá la contraseña de aplicación configurada.');
    }

    return { sent: true };
  }
);
